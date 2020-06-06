import { Name, Signer } from "@ndn/packet";

import { Certificate } from "../cert/mod";
import { PrivateKey, PublicKey } from "../key/mod";
import * as CertNaming from "../naming";
import { CertStore, KeyStore, SCloneCertStore } from "./mod";
import { openStores } from "./platform/mod";
import { MemoryStoreImpl } from "./store-impl";

/** Storage of own private keys and certificates. */
export abstract class KeyChain {
  /**
   * Return whether KeyStore supports structured clone of CryptoKey.
   * If this returns false, StoredKey must contain JsonWebKey instead of CryptoKey.
   */
  abstract readonly canSCloneKeys: boolean;

  /** List keys, filtered by name prefix. */
  abstract listKeys(prefix?: Name): Promise<Name[]>;

  /** Retrieve key pair by key name. */
  abstract getKeyPair(name: Name): Promise<[PrivateKey, PublicKey]>;

  /** Retrieve private key by key name. */
  public async getPrivateKey(name: Name): Promise<PrivateKey> {
    return (await this.getKeyPair(name))[0];
  }

  /** Retrieve public key by key name. */
  public async getPublicKey(name: Name): Promise<PublicKey> {
    return (await this.getKeyPair(name))[1];
  }

  /** Insert key pair. */
  abstract insertKey(name: Name, stored: KeyStore.StoredKey): Promise<void>;

  /** Delete key pair and associated certificates. */
  abstract deleteKey(name: Name): Promise<void>;

  /** List certificates, filtered by name prefix. */
  abstract listCerts(prefix?: Name): Promise<Name[]>;

  /** Retrieve certificate by cert name. */
  abstract getCert(name: Name): Promise<Certificate>;

  /** Insert certificate; key must exist. */
  abstract insertCert(cert: Certificate): Promise<void>;

  /** Delete certificate. */
  abstract deleteCert(name: Name): Promise<void>;

  /**
   * Create a signer from keys and certificates in the KeyChain.
   * @param name subject name, key name, or certificate name.
   * @param fallback invoked when no matching key or certificate is found.
   *
   * @li If name is a certificate name, sign with the corresponding private key,
   *     and use the specified certificate name as KeyLocator.
   * @li If name is a key name, sign with the specified private key.
   *     If a non-self-signed certificate exists for this key, use the certificate name as KeyLocator.
   *     Otherwise, use the key name as KeyLocator.
   * @li If name is neither certificate name nor key name, it is interpreted as a subject name.
   *     A non-self-signed certificate of this subject name is preferred.
   *     If such a certificate does not exist, use any key of this subject name.
   * @li If prefixMatch is true, name can also be interpreted as a prefix of the subject name.
   */
  public async getSigner(
      name: Name,
      {
        prefixMatch = false,
        fallback = (name, keyChain, err) => Promise.reject(new Error(`signer ${name} not found ${err}`)),
      }: {
        prefixMatch?: boolean;
        fallback?: Signer | ((name: Name, keyChain: KeyChain, err?: Error) => Promise<Signer>);
      } = {},
  ): Promise<Signer> {
    const useFallback = (err?: Error) => {
      if (typeof fallback === "function") {
        return fallback(name, this, err);
      }
      return fallback;
    };

    if (CertNaming.isCertName(name)) {
      let key: PrivateKey;
      try {
        key = await this.getPrivateKey(CertNaming.toKeyName(name));
      } catch (err) {
        return useFallback(err);
      }
      return key.withKeyLocator(name);
    }

    if (CertNaming.isKeyName(name)) {
      let key: PrivateKey;
      let certName: Name|undefined;
      try {
        [key, certName] = await Promise.all([
          this.getPrivateKey(name),
          this.findSignerCertName(name, ({ keyName }) => name.equals(keyName)),
        ]);
      } catch (err) { return useFallback(err); }
      return certName ? key.withKeyLocator(certName) : key;
    }

    const certName = await this.findSignerCertName(name,
      ({ subjectName }) => prefixMatch || name.equals(subjectName));
    if (certName) {
      const key = await this.getPrivateKey(CertNaming.toKeyName(certName));
      return key.withKeyLocator(certName);
    }
    let keyNames = await this.listKeys(name);
    if (!prefixMatch) {
      keyNames = keyNames.filter((keyName) => {
        const { subjectName } = CertNaming.parseKeyName(keyName);
        return name.equals(subjectName);
      });
    }
    if (keyNames.length > 0) {
      return this.getPrivateKey(keyNames[0]);
    }
    return useFallback();
  }

  private async findSignerCertName(prefix: Name, filter: (certName: CertNaming.CertNameFields) => boolean): Promise<Name|undefined> {
    const certNames = (await this.listCerts(prefix)).filter((certName) => {
      const parsed = CertNaming.parseCertName(certName);
      return !parsed.issuerId.equals(CertNaming.ISSUER_SELF) && filter(parsed);
    });
    return certNames.length === 0 ? undefined : certNames[0];
  }
}

class KeyChainImpl extends KeyChain {
  constructor(private readonly keys: KeyStore, private readonly certs: CertStore) {
    super();
  }

  public get canSCloneKeys() { return this.keys.canSClone; }

  public async listKeys(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.keys.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getKeyPair(name: Name): Promise<[PrivateKey, PublicKey]> {
    return this.keys.get(name);
  }

  public async insertKey(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    await this.keys.insert(name, stored);
  }

  public async deleteKey(name: Name): Promise<void> {
    const certs = await this.listCerts(name);
    await Promise.all(certs.map((cert) => this.certs.erase(cert)));
    await this.keys.erase(name);
  }

  public async listCerts(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.certs.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getCert(name: Name): Promise<Certificate> {
    return this.certs.get(name);
  }

  public async insertCert(cert: Certificate): Promise<void> {
    await this.getKeyPair(CertNaming.toKeyName(cert.name)); // ensure key exists
    await this.certs.insert(cert);
  }

  public async deleteCert(name: Name): Promise<void> {
    await this.certs.erase(name);
  }
}

export namespace KeyChain {
  /**
   * Open a persistent keychain.
   * @param locator in Node.js, a filesystem directory; in browser, a database name.
   */
  export function open(locator: string): KeyChain;

  /** Open a keychain from given KeyStore and CertStore. */
  export function open(keys: KeyStore, certs: CertStore): KeyChain;

  export function open(arg1: string|KeyStore, arg2?: CertStore): KeyChain {
    if (typeof arg1 === "string") {
      const [pvts, certs] = openStores(arg1);
      return new KeyChainImpl(pvts, certs);
    }
    return new KeyChainImpl(arg1, arg2!);
  }

  /** Create an in-memory ephemeral keychain. */
  export function createTemp(): KeyChain {
    return new KeyChainImpl(
      new KeyStore(new MemoryStoreImpl()),
      new SCloneCertStore(new MemoryStoreImpl()),
    );
  }
}
