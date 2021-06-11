import type { EventEmitter } from "events";
import * as net from "net";
import pEvent from "p-event";
import { tmpNameSync } from "tmp";

export abstract class NetServerBase<Server extends EventEmitter, Client> {
  public get clients() { return this.clients_; }
  private readonly clients_ = new Set<Client>();

  constructor(public readonly server: Server) {}

  /** Start listening. */
  public abstract open(): Promise<void>;

  /** Shutdown the server. */
  public abstract close(): Promise<void>;

  /** Wait until at least n clients are connected. */
  public readonly waitNClients = async (n: number): Promise<Client[]> => {
    if (this.clients.size < n) {
      // eslint-disable-next-line no-empty-pattern
      for await (const {} of pEvent.iterator(this.server, "connection", { rejectionEvents: [] })) {
        if (this.clients.size >= n) {
          break;
        }
      }
    }
    return Array.from(this.clients).slice(0, n);
  };
}

/** Socket test server. */
export abstract class NetServer extends NetServerBase<net.Server, net.Socket> {
  /** If set to true, server periodically sends NDNLPv2 IDLE frames to new clients. */
  public sendToClients = false;

  constructor() {
    super(net.createServer());
    this.server.on("error", () => undefined);
    this.server.on("connection", this.handleNewClient);
  }

  public override async open(): Promise<void> {
    this.listenBegin();
    await pEvent(this.server, "listening");
    this.listenEnd();
  }

  protected abstract listenBegin(): void;
  protected listenEnd(): void {
    //
  }

  public override async close(): Promise<void> {
    this.server.off("connection", this.handleNewClient);
    this.server.close();
    await pEvent(this.server, "close");

    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
  }

  private readonly handleNewClient = (sock: net.Socket) => {
    this.clients.add(sock);

    let interval: NodeJS.Timeout | undefined;
    if (this.sendToClients) {
      interval = setInterval(() => {
        try {
          sock.write(Uint8Array.of(0x64, 0x00)); // NDNLPv2 IDLE packet
        } catch {
          sock.destroy();
        }
      }, 10);
    }

    const close = () => {
      if (interval) { clearInterval(interval); }
      sock.destroy();
      this.clients.delete(sock);
    };
    sock.on("error", close);
    sock.once("end", close);
    sock.once("close", close);
  };
}

/** TCP socket test server. */
export class TcpServer extends NetServer {
  /** TCP server port. */
  public port = 0;

  protected override listenBegin(): void {
    this.server.listen();
  }

  protected override listenEnd(): void {
    const { port } = this.server.address() as net.AddressInfo;
    this.port = port;
  }
}

/** Unix socket test server. */
export class IpcServer extends NetServer {
  /** Unix/IPC server path. */
  public path = this.makePath();

  private makePath(): string {
    return process.platform === "win32" ?
      `//./pipe/2a8370be-8abc-448f-bb09-54d8b243cf7a/${Math.floor(Math.random() * 0xFFFFFFFF)}` :
      tmpNameSync();
  }

  protected override listenBegin(): void {
    this.server.listen(this.path);
  }
}
