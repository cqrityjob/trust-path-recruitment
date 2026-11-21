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
 * - Node (dev server, CI): tls.connect() to the IP with servername = host,
 *   which Node also uses for certificate identity.
 * Any other runtime refuses with egress_transport_unavailable instead of
 * falling back to an unpinned fetch.
 *
 * The HTTP layer is deliberately small: one GET, Connection: close, identity
 * encoding, Content-Length or chunked or read-to-close bodies, a header and a
 * body size limit, and the caller's abort signal.
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

const MAX_HEADER_BYTES = 64 * 1024;

const isWorkers = () =>
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/** Cloudflare Workers: TCP to the checked IP, TLS verified for the hostname. */
export const workersConnector: Connector = async (target, signal) => {
  // A non-literal specifier so the Node dev server does not try to resolve it.
  const specifier = "cloudflare:sockets";
  const { connect } = (await import(/* @vite-ignore */ specifier)) as {
    connect: (
      address: { hostname: string; port: number },
      options: { secureTransport: "starttls"; allowHalfOpen: boolean },
    ) => {
      startTls: (options: { expectedServerHostname: string }) => {
        opened: Promise<unknown>;
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;
        close: () => Promise<void>;
      };
      close: () => Promise<void>;
    };
  };
  const plain = connect(
    { hostname: target.address, port: target.port },
    { secureTransport: "starttls", allowHalfOpen: false },
  );
  const secure = plain.startTls({ expectedServerHostname: target.hostname });
  const close = () => void secure.close().catch(() => undefined);
  signal.addEventListener("abort", close, { once: true });
  await secure.opened;
  return { readable: secure.readable, writable: secure.writable, close };
};

/** Node: TLS to the checked IP; servername drives SNI and certificate identity. */
export function nodeConnector(extra: { ca?: string } = {}): Connector {
  return async (target, signal) => {
    const tls = await import("node:tls");
    const { Readable, Writable } = await import("node:stream");
    const socket = tls.connect({
      host: target.address,
      port: target.port,
      servername: target.hostname,
      ALPNProtocols: ["http/1.1"],
      rejectUnauthorized: true,
      ...(extra.ca ? { ca: extra.ca } : {}),
    });
    const close = () => socket.destroy();
    signal.addEventListener("abort", close, { once: true });
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", () => resolve());
      socket.once("error", reject);
    });
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
const decoder = new TextDecoder();

function concat(parts: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

const CRLF = encoder.encode("\r\n");
const HEADER_END = encoder.encode("\r\n\r\n");

/** One GET over an open duplex. Exported for tests with a controlled duplex. */
export async function httpGet(
  conn: Duplex,
  request: { hostname: string; path: string; headers: Record<string, string> },
  limits: { maxBytes: number; signal: AbortSignal },
): Promise<PinnedResponse> {
  const lines = [`GET ${request.path} HTTP/1.1`, `Host: ${request.hostname}`];
  for (const [name, value] of Object.entries({
    ...request.headers,
    connection: "close",
    "accept-encoding": "identity",
  })) {
    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) throw new FeedError("feed_unparseable");
    lines.push(`${name}: ${value}`);
  }
  const writer = conn.writable.getWriter();
  await writer.write(encoder.encode(`${lines.join("\r\n")}\r\n\r\n`));
  writer.releaseLock();

  const reader = conn.readable.getReader();
  let buffer: Uint8Array = new Uint8Array(0);
  let done = false;
  const pull = async () => {
    limits.signal.throwIfAborted();
    const chunk = await reader.read();
    if (chunk.done) {
      done = true;
      return;
    }
    buffer = concat([buffer, chunk.value], buffer.length + chunk.value.length);
  };
  try {
    let end = -1;
    while ((end = indexOf(buffer, HEADER_END)) < 0) {
      if (buffer.length > MAX_HEADER_BYTES) throw new FeedError("feed_unparseable");
      if (done) throw new FeedError("feed_unparseable");
      await pull();
    }
    const head = decoder.decode(buffer.subarray(0, end)).split("\r\n");
    let rest: Uint8Array = buffer.subarray(end + HEADER_END.length);
    const status = /^HTTP\/1\.[01] (\d{3})/.exec(head[0] ?? "");
    if (!status) throw new FeedError("feed_unparseable");
    const headers = new Headers();
    for (const line of head.slice(1)) {
      const colon = line.indexOf(":");
      if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
    const code = Number(status[1]);
    if (code === 204 || code === 304 || (code >= 100 && code < 200))
      return { status: code, headers, body: new Uint8Array(0) };

    const parts: Uint8Array[] = [];
    let size = 0;
    const take = (bytes: Uint8Array) => {
      size += bytes.length;
      if (size > limits.maxBytes) throw new FeedError("feed_too_large");
      parts.push(bytes);
    };
    const more = async () => {
      buffer = rest;
      await pull();
      rest = buffer;
    };
    if (/chunked/i.test(headers.get("transfer-encoding") ?? "")) {
      for (;;) {
        let lineEnd: number;
        while ((lineEnd = indexOf(rest, CRLF)) < 0) {
          if (done) throw new FeedError("feed_unparseable");
          await more();
        }
        const length = parseInt(decoder.decode(rest.subarray(0, lineEnd)).split(";")[0], 16);
        if (!Number.isFinite(length) || length < 0) throw new FeedError("feed_unparseable");
        rest = rest.subarray(lineEnd + 2);
        if (length === 0) break;
        if (size + length > limits.maxBytes) throw new FeedError("feed_too_large");
        while (rest.length < length + 2) {
          if (done) throw new FeedError("feed_unparseable");
          await more();
        }
        take(rest.slice(0, length));
        rest = rest.subarray(length + 2);
      }
    } else if (headers.has("content-length")) {
      const length = Number(headers.get("content-length"));
      if (!Number.isInteger(length) || length < 0) throw new FeedError("feed_unparseable");
      if (length > limits.maxBytes) throw new FeedError("feed_too_large");
      while (rest.length < length) {
        if (done) throw new FeedError("feed_unparseable");
        await more();
      }
      take(rest.slice(0, length));
    } else {
      take(rest.slice());
      while (!done) {
        buffer = new Uint8Array(0);
        await pull();
        if (buffer.length) take(buffer.slice());
      }
    }
    return { status: code, headers, body: concat(parts, size) };
  } finally {
    reader.releaseLock();
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
