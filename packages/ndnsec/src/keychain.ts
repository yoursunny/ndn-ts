import { Certificate, CertNaming, CryptoAlgorithm, KeyChain, KeyChainImplWebCrypto as crypto, KeyStore, ValidityPeriod } from "@ndn/keychain";
import { Component, Data, Name } from "@ndn/packet";
import { Decodable, Decoder, Encoder } from "@ndn/tlv";
import execa from "execa";
import throat from "throat";

import { SafeBag } from "./safe-bag";

const IMPORTING_ISSUER = Component.from("08c5a687-7be5-43ee-a966-2683fb339c1d");
const PASSPHRASE = "PASSPHRASE";

/** Access ndn-cxx KeyChain. */
export class NdnsecKeyChain extends KeyChain {
  constructor();

  constructor(home: string);

  constructor(pibLocator: string, tpmLocator: string);

  constructor(arg1?: string, arg2?: string) {
    super();
    if (arg2) {
      this.env.NDN_CLIENT_PIB = arg1;
      this.env.NDN_CLIENT_TPM = arg2;
    } else if (arg1) {
      this.env.HOME = arg1;
    }
    this.env.NDN_NAME_ALT_URI = "0";
  }

  private readonly env: NodeJS.ProcessEnv = {};

  private async invokeNdnsec(argv: string[], input?: Uint8Array): Promise<{
    lines: string[];
    decode: <R>(d: Decodable<R>) => R;
  }> {
    const { stdout } = await execa("ndnsec", argv, {
      input: input ? Buffer.from(input).toString("base64") : undefined,
      stderr: "inherit",
      env: this.env,
    });
    return {
      get lines() { return stdout.split("\n"); },
      decode<R>(d: Decodable<R>): R {
        const wire = Buffer.from(stdout, "base64");
        return new Decoder(wire).decode(d);
      },
    };
  }

  /** Copy keys and certificates to another keychain. */
  public async copyTo(dest: KeyChain): Promise<KeyChain> {
    const { lines } = await this.invokeNdnsec(["list", "-c"]);
    const keyCerts = new Map<string, string[]>();
    for (const line of lines) {
      if (line.startsWith("  +->*")) {
        const keyName = line.split(" ").pop()!;
        keyCerts.set(keyName, []);
      } else if (line.startsWith("       +->")) {
        const certName = new Name(line.split(" ").pop());
        const { issuerId, keyName } = CertNaming.parseCertName(certName);
        const certList = keyCerts.get(keyName.toString());
        if (typeof certList !== "undefined" && !issuerId.equals(IMPORTING_ISSUER)) {
          certList.push(certName.toString());
        }
      }
    }

    for (const keyName of keyCerts.keys()) {
      const { subjectName } = CertNaming.parseKeyName(new Name(keyName));
      const exported = await this.invokeNdnsec(["export", "-P", PASSPHRASE, "-i", `${subjectName}`]);
      const safeBag = exported.decode(SafeBag);
      await safeBag.saveKeyPair(PASSPHRASE, dest);
    }

    for (const certList of keyCerts.values()) {
      for (const certName of certList) {
        const certdump = await this.invokeNdnsec(["cert-dump", "-n", certName]);
        const data = certdump.decode(Data);
        await dest.insertCert(Certificate.fromData(data));
      }
    }

    return dest;
  }

  private mutex = throat(1);
  private cached?: KeyChain;
  private async load() {
    if (!this.cached) {
      this.cached = await this.copyTo(KeyChain.createTemp());
    }
    return this.cached;
  }

  public readonly needJwk = true;
  private readonly insertKeyLoader = new KeyStore.Loader(true);

  public async listKeys(prefix = new Name()): Promise<Name[]> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.listKeys(prefix);
    });
  }

  public async getKeyPair(name: Name): Promise<KeyChain.KeyPair> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.getKeyPair(name);
    });
  }

  public async insertKey(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    return this.mutex(async () => {
      const keyPair = await this.insertKeyLoader.loadKey(name, stored);

      const selfSigned = await Certificate.issue({
        publicKey: keyPair.publicKey,
        validity: ValidityPeriod.MAX,
        issuerPrivateKey: keyPair.signer,
        issuerId: IMPORTING_ISSUER,
      });
      const pkcs8 = new Uint8Array(await crypto.subtle.exportKey(
        "pkcs8", (keyPair.pvt as CryptoAlgorithm.PrivateKey<any>).privateKey));

      const safeBag = SafeBag.create(selfSigned, pkcs8, PASSPHRASE);
      await this.invokeNdnsec(["import", "-P", PASSPHRASE, "-i-"], Encoder.encode(safeBag));
      this.cached = undefined;
    });
  }

  public async deleteKey(name: Name): Promise<void> {
    return this.mutex(async () => {
      await this.invokeNdnsec(["delete", "-k", name.toString()]);
      this.cached = undefined;
    });
  }

  public async listCerts(prefix = new Name()): Promise<Name[]> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.listCerts(prefix);
    });
  }

  public async getCert(name: Name): Promise<Certificate> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.getCert(name);
    });
  }

  public async insertCert(cert: Certificate): Promise<void> {
    return this.mutex(async () => {
      await this.invokeNdnsec(["cert-install", "-K", "-f-"], Encoder.encode(cert.data));
      this.cached = undefined;
    });
  }

  public async deleteCert(name: Name): Promise<void> {
    return this.mutex(async () => {
      await this.invokeNdnsec(["delete", "-c", name.toString()]);
      this.cached = undefined;
    });
  }
}
