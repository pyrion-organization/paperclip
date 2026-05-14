import net from "node:net";
import tls from "node:tls";

export type ImapMailboxConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  folder: string;
  tls: boolean;
};

export type FetchedImapMessage = {
  providerUid: string;
  raw: Buffer;
  markSeen: () => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 30_000;

function quoteImapString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

export class BasicImapClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer = Buffer.alloc(0);
  private pendingResolvers: Array<() => void> = [];
  private tagCounter = 0;

  constructor(private readonly config: ImapMailboxConfig) {}

  async connect(): Promise<void> {
    this.socket = this.config.tls
      ? tls.connect({ host: this.config.host, port: this.config.port, servername: this.config.host })
      : net.connect({ host: this.config.host, port: this.config.port });
    this.socket.setTimeout(DEFAULT_TIMEOUT_MS);
    this.socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flushResolvers();
    });
    await new Promise<void>((resolve, reject) => {
      const socket = this.requireSocket();
      const cleanup = () => {
        socket.off("connect", onConnect);
        socket.off("secureConnect", onConnect);
        socket.off("error", onError);
        socket.off("timeout", onTimeout);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error("IMAP connection timed out"));
      };
      socket.once(this.config.tls ? "secureConnect" : "connect", onConnect);
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
    });
    await this.readLine();
    await this.command(`LOGIN ${quoteImapString(this.config.username)} ${quoteImapString(this.config.password)}`);
    await this.command(`SELECT ${quoteImapString(this.config.folder)}`);
  }

  async fetchUnread(limit = 20): Promise<FetchedImapMessage[]> {
    const searchLines = await this.command("SEARCH UNSEEN");
    const searchLine = searchLines.find((line) => line.startsWith("* SEARCH")) ?? "";
    const sequenceNumbers = searchLine
      .replace(/^\* SEARCH\s*/i, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, limit);
    const messages: FetchedImapMessage[] = [];
    for (const sequenceNumber of sequenceNumbers) {
      const fetched = await this.fetchMessage(sequenceNumber);
      if (fetched) messages.push(fetched);
    }
    return messages;
  }

  async close(): Promise<void> {
    if (!this.socket) return;
    try {
      await this.command("LOGOUT");
    } catch {
      // Ignore logout errors; the socket is about to be closed anyway.
    }
    this.socket.destroy();
    this.socket = null;
  }

  private async fetchMessage(sequenceNumber: string): Promise<FetchedImapMessage | null> {
    const tag = this.nextTag();
    this.write(`${tag} FETCH ${sequenceNumber} (UID RFC822)\r\n`);
    let uid = sequenceNumber;
    let raw: Buffer | null = null;
    while (true) {
      const line = await this.readLine();
      const uidMatch = line.match(/\bUID\s+(\d+)/i);
      if (uidMatch) uid = uidMatch[1];
      const literalMatch = line.match(/\{(\d+)\}$/);
      if (literalMatch) {
        raw = await this.readBytes(Number(literalMatch[1]));
        await this.consumeOptionalLineBreak();
      }
      if (line.startsWith(`${tag} OK`)) break;
      if (line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
        throw new Error(`IMAP FETCH failed: ${line}`);
      }
    }
    if (!raw) return null;
    return {
      providerUid: uid,
      raw,
      markSeen: async () => {
        await this.command(`STORE ${sequenceNumber} +FLAGS.SILENT (\\Seen)`);
      },
    };
  }

  private async command(command: string): Promise<string[]> {
    const tag = this.nextTag();
    this.write(`${tag} ${command}\r\n`);
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      if (line.startsWith(`${tag} OK`)) return lines;
      if (line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
        throw new Error(`IMAP command failed: ${line}`);
      }
    }
  }

  private nextTag(): string {
    this.tagCounter += 1;
    return `A${String(this.tagCounter).padStart(4, "0")}`;
  }

  private write(value: string): void {
    this.requireSocket().write(value);
  }

  private requireSocket(): net.Socket | tls.TLSSocket {
    if (!this.socket) throw new Error("IMAP socket is not connected");
    return this.socket;
  }

  private async readLine(): Promise<string> {
    while (true) {
      const idx = this.buffer.indexOf("\r\n");
      if (idx >= 0) {
        const line = this.buffer.subarray(0, idx).toString("utf8");
        this.buffer = this.buffer.subarray(idx + 2);
        return line;
      }
      await this.waitForData();
    }
  }

  private async readBytes(length: number): Promise<Buffer> {
    while (this.buffer.length < length) {
      await this.waitForData();
    }
    const value = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return value;
  }

  private async consumeOptionalLineBreak(): Promise<void> {
    if (this.buffer.subarray(0, 2).toString("binary") === "\r\n") {
      this.buffer = this.buffer.subarray(2);
    }
  }

  private waitForData(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.requireSocket();
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for IMAP response"));
      }, DEFAULT_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        socket.off("error", onError);
        socket.off("close", onClose);
        this.pendingResolvers = this.pendingResolvers.filter((entry) => entry !== onData);
      };
      const onData = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => {
        cleanup();
        reject(new Error("IMAP socket closed"));
      };
      socket.once("error", onError);
      socket.once("close", onClose);
      this.pendingResolvers.push(onData);
    });
  }

  private flushResolvers(): void {
    const resolvers = this.pendingResolvers;
    this.pendingResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}

export async function testImapConnection(config: ImapMailboxConfig): Promise<void> {
  const client = new BasicImapClient(config);
  try {
    await client.connect();
  } finally {
    await client.close();
  }
}
