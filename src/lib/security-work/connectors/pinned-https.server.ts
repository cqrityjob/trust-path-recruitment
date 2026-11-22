import "@tanstack/react-start/server-only";
/**
 * HTTPS GET to an address that was already checked, never to a name that the
 * platform resolves again. That closes the gap between the DNS check and the
 * connection (DNS rebinding): the socket goes to the validated IP, and TLS
 * still verifies the certificate against the feed's hostname.
 *
 * Two connectors, chosen by the runtime:
 * - Cloudflare Workers (production): cloudflare:sockets connect() to the IP,
 *   then startTls({ expectedServerHostname }) for SNI and certificate checks.
 *   That option is accepted by workerd but not publicly documented, and
 *   Cloudflare can switch the runtime to reject it; the connector then
 *   refuses (egress_transport_unavailable). Workers sockets also cannot reach
 *   Cloudflare's own addresses, so a Cloudflare-served feed host fails closed.
 * - Node (dev server, CI): tls.connect() to the IP with servername = host,
 *   which Node also uses for certificate identity.
 * Any other runtime refuses with egress_transport_unavailable instead of
 * falling back to an unpinned fetch.
 *
 * Every step honours the caller's abort signal: an aborted signal rejects at
 * once, a stalled handshake or read rejects when the signal fires, and the
 * socket and every listener are released on success, failure and abort.
 *
 * The HTTP layer is deliberately small and strict: one GET, Connection:
 * close, identity encoding; Content-Length, chunked or read-to-close bodies.
 * Framing is bounded as well as the decoded body: the head, each chunk-size
 * line (extensions included) and the total bytes on the wire have limits, and
 * the buffer is scanned once, so hostile framing costs linear time and bounded
 * memory.
 */
import { EgressError } from "./egress";
import { FeedError } from "./feed";

export interface PinnedTarget {
  address: string;
  family: 4 | 6;
  hostname: string;
  port: number;
}
export interface Duplex {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => void;
}
export type Connector = (target: PinnedTarget, signal: AbortSignal) => Promise<Duplex>;
export interface PinnedResponse {
  status: number;
  headers: Headers;
  body: Uint8Array;
}
export interface PinnedRequest {
  url: URL;
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  signal: AbortSignal;
  maxBytes: number;
}
export type PinnedTransport = (request: PinnedRequest) => Promise<PinnedResponse>;

export const MAX_HEADER_BYTES = 64 * 1024;
export const MAX_HEADER_COUNT = 100;
export const MAX_CHUNK_LINE = 1024;
const MAX_INFORMATIONAL = 5;

const timedOut = () => new EgressError("egress_timeout");
const closedEarly = () => new EgressError("egress_connection_closed");

const isWorkers = () =>
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * Settles with `work`, or rejects when the signal fires first (or has already
 * fired); `onAbort` releases whatever `work` is waiting on. The listener is
 * always removed.
 */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal, onAbort: () => void): Promise<T> {
  const release = () => {
    try {
      onAbort();
    } catch {
      // Releasing is best effort; the refusal below stands regardless.
    }
  };
  work.catch(() => undefined);
  if (signal.aborted) {
    release();
    return Promise.reject(timedOut());
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      reject(timedOut());
      release();
    };
    signal.addEventListener("abort", abort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** Closes the connection when the signal fires; `release` detaches that. */
function closeOnAbort(signal: AbortSignal, close: () => void) {
  const abort = () => close();
  signal.addEventListener("abort", abort, { once: true });
  return () => {
    signal.removeEventListener("abort", abort);
    close();
  };
}

interface WorkersSocket {
  opened: Promise<unknown>;
  closed: Promise<unknown>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => Promise<void>;
}

/** Cloudflare Workers: TCP to the checked IP, TLS verified for the hostname. */
export const workersConnector: Connector = async (target, signal) => {
  if (signal.aborted) throw timedOut();
  // A non-literal specifier so the Node dev server does not try to resolve it.
  const specifier = "cloudflare:sockets";
  const { connect } = (await import(/* @vite-ignore */ specifier)) as {
    connect: (
      address: { hostname: string; port: number },
      options: { secureTransport: "starttls"; allowHalfOpen: boolean },
    ) => WorkersSocket & {
      startTls: (options: { expectedServerHostname: string }) => WorkersSocket;
    };
  };
  if (signal.aborted) throw timedOut();
  const plain = connect(
    { hostname: target.address, port: target.port },
    { secureTransport: "starttls", allowHalfOpen: false },
  );
  let secure: WorkersSocket;
  try {
    // expectedServerHostname is not in Cloudflare's public documentation;
    // workerd can be switched to reject it. Then nothing is fetched: the
    // connection never falls back to verifying the bare IP.
    secure = plain.startTls({ expectedServerHostname: target.hostname });
  } catch {
    void plain.close().catch(() => undefined);
    throw new EgressError("egress_transport_unavailable");
  }
  // Rejections after a close are expected; never leave them unhandled.
  plain.closed.catch(() => undefined);
  secure.closed.catch(() => undefined);
  const shut = () => void secure.close().catch(() => undefined);
  try {
    await untilAborted(secure.opened, signal, shut);
  } catch (error) {
    shut();
    throw error;
  }
  const close = closeOnAbort(signal, shut);
  return { readable: secure.readable, writable: secure.writable, close };
};

/** Node: TLS to the checked IP; servername drives SNI and certificate identity. */
export function nodeConnector(extra: { ca?: string } = {}): Connector {
  return async (target, signal) => {
    if (signal.aborted) throw timedOut();
    const tls = await import("node:tls");
    const { Readable, Writable } = await import("node:stream");
    if (signal.aborted) throw timedOut();
    const socket = tls.connect({
      host: target.address,
      port: target.port,
      servername: target.hostname,
      ALPNProtocols: ["http/1.1"],
      rejectUnauthorized: true,
      ...(extra.ca ? { ca: extra.ca } : {}),
    });
    await new Promise<void>((resolve, reject) => {
      const settle = (error?: Error) => {
        socket.off("secureConnect", onSecure);
        socket.off("error", onError);
        socket.off("close", onClose);
        signal.removeEventListener("abort", onAbort);
        if (!error) return resolve();
        socket.destroy();
        reject(error);
      };
      const onSecure = () => settle();
      const onError = (error: Error) => settle(error);
      const onClose = () => settle(closedEarly());
      const onAbort = () => settle(timedOut());
      socket.once("secureConnect", onSecure);
      socket.once("error", onError);
      socket.once("close", onClose);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    // From here errors surface through the streams; never as an unhandled event.
    socket.on("error", () => undefined);
    const close = closeOnAbort(signal, () => socket.destroy());
    return {
      readable: Readable.toWeb(socket) as unknown as ReadableStream<Uint8Array>,
      writable: Writable.toWeb(socket) as unknown as WritableStream<Uint8Array>,
      close,
    };
  };
}

/** The connector for this runtime, or a refusal: never an unpinned fallback. */
export function runtimeConnector(): Connector {
  if (isWorkers()) return workersConnector;
  if (typeof process !== "undefined" && typeof process.versions?.node === "string")
    return nodeConnector();
  throw new EgressError("egress_transport_unavailable");
}

const encoder = new TextEncoder();
/** Protocol text is bytes; one character per byte, in bounded pieces. */
function latin1(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return text;
}

/**
 * The bytes received and not yet consumed. Appending grows the store
 * geometrically and drops consumed bytes, so the total copying is linear;
 * line searches resume where the previous search stopped.
 */
class Inbox {
  private store = new Uint8Array(16 * 1024);
  private start = 0;
  private end = 0;
  private scanned = 0;
  received = 0;
  get length() {
    return this.end - this.start;
  }
  append(bytes: Uint8Array) {
    this.received += bytes.length;
    if (this.end + bytes.length > this.store.length) {
      const live = this.length;
      // Compact in place only when that frees at least half; otherwise grow.
      if (live + bytes.length <= this.store.length / 2) {
        this.store.copyWithin(0, this.start, this.end);
      } else {
        const next = new Uint8Array(Math.max(this.store.length * 2, (live + bytes.length) * 2));
        next.set(this.store.subarray(this.start, this.end));
        this.store = next;
      }
      this.scanned -= this.start;
      this.start = 0;
      this.end = live;
    }
    this.store.set(bytes, this.end);
    this.end += bytes.length;
  }
  /** Offset of the first CRLF (or CRLFCRLF) from the front, or -1 after `limit` bytes. */
  find(terminator: "line" | "head", limit: number): number {
    const width = terminator === "line" ? 2 : 4;
    let i = Math.max(this.start, this.scanned);
    const stop = Math.min(this.end, this.start + limit + width);
    for (; i + width <= stop; i++) {
      if (this.store[i] !== 13 || this.store[i + 1] !== 10) continue;
      if (width === 2 || (this.store[i + 2] === 13 && this.store[i + 3] === 10)) {
        this.scanned = this.start;
        return i - this.start;
      }
    }
    this.scanned = i;
    return -1;
  }
  take(count: number): Uint8Array {
    const out = this.store.slice(this.start, this.start + count);
    this.start += count;
    this.scanned = Math.max(this.scanned, this.start);
    return out;
  }
  skip(count: number) {
    this.start += count;
    this.scanned = Math.max(this.scanned, this.start);
  }
  peek(count: number): Uint8Array {
    return this.store.subarray(this.start, this.start + count);
  }
}

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function parseHead(text: string): { status: number; headers: Headers } {
  const lines = text.split("\r\n");
  const status = /^HTTP\/1\.[01] ([1-5]\d\d)(?: [^\r\n]*)?$/.exec(lines[0] ?? "");
  if (!status) throw new FeedError("feed_unparseable");
  if (lines.length - 1 > MAX_HEADER_COUNT) throw new FeedError("feed_unparseable");
  const headers = new Headers();
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    // No obsolete line folding, no nameless or malformed fields.
    if (colon <= 0 || !TOKEN.test(line.slice(0, colon))) throw new FeedError("feed_unparseable");
    headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return { status: Number(status[1]), headers };
}

/** One GET over an open duplex. Exported for tests with a controlled duplex. */
export async function httpGet(
  conn: Duplex,
  request: { hostname: string; path: string; headers: Record<string, string> },
  limits: { maxBytes: number; signal: AbortSignal },
): Promise<PinnedResponse> {
  const { signal, maxBytes } = limits;
  // Bytes on the wire: the body plus generous room for framing, never unbounded.
  const wireLimit = maxBytes * 2 + MAX_HEADER_BYTES * 2;
  const lines = [`GET ${request.path} HTTP/1.1`, `Host: ${request.hostname}`];
  for (const [name, value] of Object.entries({
    ...request.headers,
    connection: "close",
    "accept-encoding": "identity",
  })) {
    if (!TOKEN.test(name) || /[\r\n]/.test(value)) throw new FeedError("feed_unparseable");
    lines.push(`${name}: ${value}`);
  }
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    const writer = conn.writable.getWriter();
    try {
      await untilAborted(
        writer.write(encoder.encode(`${lines.join("\r\n")}\r\n\r\n`)),
        signal,
        conn.close,
      );
    } finally {
      writer.releaseLock();
    }
    const input = conn.readable.getReader();
    reader = input;
    const inbox = new Inbox();
    let done = false;
    const pull = async () => {
      const chunk = await untilAborted(input.read(), signal, () => {
        input.cancel().catch(() => undefined);
        conn.close();
      });
      if (chunk.done) {
        done = true;
        return;
      }
      if (inbox.received + chunk.value.length > wireLimit) throw new FeedError("feed_too_large");
      inbox.append(chunk.value);
    };
    /** The next CRLF-terminated line (without CRLF), within `limit` bytes. */
    const line = async (limit: number) => {
      for (;;) {
        const at = inbox.find("line", limit);
        if (at >= 0) {
          const text = latin1(inbox.take(at));
          inbox.skip(2);
          return text;
        }
        if (inbox.length > limit) throw new FeedError("feed_unparseable");
        if (done) throw new FeedError("feed_unparseable");
        await pull();
      }
    };

    let head: { status: number; headers: Headers };
    for (let informational = 0; ; informational++) {
      let end: number;
      while ((end = inbox.find("head", MAX_HEADER_BYTES)) < 0) {
        if (inbox.length > MAX_HEADER_BYTES || done) throw new FeedError("feed_unparseable");
        await pull();
      }
      head = parseHead(latin1(inbox.take(end)));
      inbox.skip(4);
      if (head.status >= 200) break;
      // 1xx: an interim response; the real one follows. Never a protocol switch.
      if (head.status === 101 || informational >= MAX_INFORMATIONAL)
        throw new FeedError("feed_unparseable");
    }
    const { status, headers } = head;
    if (status === 204 || status === 304) return { status, headers, body: new Uint8Array(0) };

    const encoding = (headers.get("content-encoding") ?? "identity").trim().toLowerCase();
    if (encoding !== "identity") throw new FeedError("feed_unparseable");
    const transfer = headers.get("transfer-encoding");
    const length = headers.get("content-length");
    if (transfer !== null && length !== null) throw new FeedError("feed_unparseable");

    const parts: Uint8Array[] = [];
    let size = 0;
    const keep = (bytes: Uint8Array) => {
      size += bytes.length;
      if (size > maxBytes) throw new FeedError("feed_too_large");
      parts.push(bytes);
    };
    if (transfer !== null) {
      if (transfer.trim().toLowerCase() !== "chunked") throw new FeedError("feed_unparseable");
      for (;;) {
        const sizeLine = /^([0-9A-Fa-f]{1,8})[ \t]*(?:;[^\r\n]*)?$/.exec(
          await line(MAX_CHUNK_LINE),
        );
        if (!sizeLine) throw new FeedError("feed_unparseable");
        const chunk = parseInt(sizeLine[1], 16);
        if (chunk === 0) break; // Trailers, if any, are not needed: the connection closes.
        if (size + chunk > maxBytes) throw new FeedError("feed_too_large");
        while (inbox.length < chunk + 2) {
          if (done) throw new FeedError("feed_unparseable");
          await pull();
        }
        keep(inbox.take(chunk));
        const tail = inbox.peek(2);
        if (tail[0] !== 13 || tail[1] !== 10) throw new FeedError("feed_unparseable");
        inbox.skip(2);
      }
    } else if (length !== null) {
      if (!/^\d{1,15}$/.test(length)) throw new FeedError("feed_unparseable");
      const expected = Number(length);
      if (expected > maxBytes) throw new FeedError("feed_too_large");
      while (inbox.length < expected) {
        if (done) throw new FeedError("feed_unparseable");
        await pull();
      }
      keep(inbox.take(expected));
    } else {
      for (;;) {
        if (inbox.length) keep(inbox.take(inbox.length));
        if (done) break;
        await pull();
      }
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.length;
    }
    return { status, headers, body };
  } finally {
    try {
      reader?.releaseLock();
    } catch {
      // A read still settling after an abort; the connection closes below.
    }
    conn.close();
  }
}

/** The production transport: connect to the checked address, then one GET. */
export function pinnedTransport(connector: Connector = runtimeConnector()): PinnedTransport {
  return async (request) => {
    const conn = await connector(
      {
        address: request.address,
        family: request.family,
        hostname: request.url.hostname,
        port: Number(request.url.port || 443),
      },
      request.signal,
    );
    return httpGet(
      conn,
      {
        // The Host header names the authority, port included when not 443.
        hostname: request.url.host,
        path: `${request.url.pathname || "/"}${request.url.search}`,
        headers: request.headers,
      },
      { maxBytes: request.maxBytes, signal: request.signal },
    );
  };
}
