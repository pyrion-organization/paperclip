import { ImapFlow } from "imapflow";

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
};

const SOCKET_TIMEOUT_MS = 60_000;

function buildClient(config: ImapMailboxConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.tls,
    auth: { user: config.username, pass: config.password },
    logger: false,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
}

export async function testImapConnection(config: ImapMailboxConfig): Promise<void> {
  const client = buildClient(config);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.folder);
    try {
      // Opening the folder confirms read access.
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore — connection may already be torn down
    }
  }
}

export type FetchUnreadResult = {
  messages: FetchedImapMessage[];
  close: () => Promise<void>;
};

export async function fetchUnreadMessages(
  config: ImapMailboxConfig,
  limit: number,
): Promise<FetchUnreadResult> {
  const client = buildClient(config);
  await client.connect();
  const lock = await client.getMailboxLock(config.folder);
  const messages: FetchedImapMessage[] = [];
  const close = async () => {
    try {
      lock.release();
    } catch {
      // ignore
    }
    try {
      await client.logout();
    } catch {
      // ignore
    }
  };
  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    const selected = uids.slice(0, limit);
    if (selected.length > 0) {
      for await (const msg of client.fetch(selected, { uid: true, source: true }, { uid: true })) {
        if (!msg.source) continue;
        const uid = String(msg.uid);
        messages.push({ providerUid: uid, raw: msg.source });
      }
    }
  } catch (error) {
    await close();
    throw error;
  }
  return { messages, close };
}

export async function deleteMessageFromMailbox(config: ImapMailboxConfig, providerUid: string): Promise<void> {
  const client = buildClient(config);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.folder);
    try {
      await client.messageDelete(providerUid, { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore — connection may already be torn down
    }
  }
}

export async function markMessageSeenInMailbox(config: ImapMailboxConfig, providerUid: string): Promise<void> {
  const client = buildClient(config);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.folder);
    try {
      await client.messageFlagsAdd(providerUid, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore — connection may already be torn down
    }
  }
}
