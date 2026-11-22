// The pinned HTTPS transport over a REAL TLS connection (Node connector).
// A throwaway certificate for feeds.example.test is generated, a local HTTPS
// server answers on 127.0.0.1, and the transport connects to that address for
// a name that has no DNS at all. TLS must verify the certificate against the
// hostname: a different name or an untrusted certificate is refused. Nothing
// leaves this machine.
//
// Cancellation over real sockets: a server that accepts TCP and never
// completes TLS, a server that closes before the handshake, a body that
// stalls, and a signal that is already aborted. Each must end promptly with a
// clear code, release the socket and leave no abort listener behind; the
// whole fetch must end within its deadline.
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fetchFeed } from "../src/lib/security-work/connectors/fetch.server";
import {
  nodeConnector,
  pinnedTransport,
  type PinnedTransport,
} from "../src/lib/security-work/connectors/pinned-https.server";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-pinned-"));
const key = path.join(dir, "key.pem");
const cert = path.join(dir, "cert.pem");
cp.execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=feeds.example.test",
    "-addext",
    "subjectAltName=DNS:feeds.example.test",
  ],
  { stdio: "ignore" },
);
const ca = fs.readFileSync(cert, "utf8");
const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><item><title>Pinned</title><guid>p1</guid></item></channel></rss>`;
const seenHosts: string[] = [];
const server = https.createServer({ key: fs.readFileSync(key), cert: ca }, (req, res) => {
  seenHosts.push(String(req.headers.host));
  if (req.url === "/stall-body") {
    res.writeHead(200, { "content-length": 1000 });
    res.write("abc"); // and nothing more
    return;
  }
  if (req.url === "/chunked") {
    res.writeHead(200, { "content-type": "application/rss+xml" });
    res.write(body.slice(0, 40));
    res.end(body.slice(40));
    return;
  }
  res.writeHead(200, {
    "content-type": "application/rss+xml",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
const request = (host: string, route: string, trust: boolean) =>
  pinnedTransport(nodeConnector(trust ? { ca } : {}))({
    url: new URL(`https://${host}:${port}${route}`),
    address: "127.0.0.1",
    family: 4,
    headers: { accept: "application/rss+xml" },
    signal: AbortSignal.timeout(5000),
    maxBytes: 2 * 1024 * 1024,
  });
const refusal = async (run: Promise<unknown>) => {
  try {
    await run;
    return "accepted";
  } catch (error) {
    return String((error as { code?: string }).code ?? error);
  }
};
let checks = 0;
try {
  const ok = await request("feeds.example.test", "/rss", true);
  assert.equal(ok.status, 200);
  assert.match(new TextDecoder().decode(ok.body), /<title>Pinned<\/title>/);
  assert.equal(seenHosts[0], `feeds.example.test:${port}`);
  checks++;
  const chunked = await request("feeds.example.test", "/chunked", true);
  assert.equal(new TextDecoder().decode(chunked.body), body, "a chunked body over real TLS");
  checks++;
  const wrongName = await refusal(request("other.example.test", "/rss", true));
  assert.equal(
    wrongName,
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "the certificate is checked against the hostname",
  );
  checks++;
  const untrusted = await refusal(request("feeds.example.test", "/rss", false));
  assert.match(
    untrusted,
    /SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/,
    "an untrusted certificate is refused",
  );
  checks++;
  // ── Cancellation over real sockets ───────────────────────────────────────
  const sockets = new Set<net.Socket>();
  const stalled = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
  });
  const closing = net.createServer((socket) => socket.destroy());
  const listen = (srv: net.Server) =>
    new Promise<number>((resolve) =>
      srv.listen(0, "127.0.0.1", () => resolve((srv.address() as net.AddressInfo).port)),
    );
  const stalledPort = await listen(stalled);
  const closingPort = await listen(closing);
  // A deadline like fetchFeed's own (controller + timer). Bun does not always
  // fire AbortSignal.timeout for an otherwise idle request.
  const deadline = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms).unref?.();
    return controller.signal;
  };
  /**
   * A signal that tracks its abort listeners. A leak only matters while the
   * signal can still fire, so it is asserted where the request ended without
   * an abort (success, early close).
   */
  const counted = (signal: AbortSignal) => {
    const live = new Set<unknown>();
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = ((type: string, fn: EventListener, opts?: unknown) => {
      if (type === "abort") live.add(fn);
      add(type, fn, opts as AddEventListenerOptions);
    }) as typeof signal.addEventListener;
    signal.removeEventListener = ((type: string, fn: EventListener) => {
      if (type === "abort") live.delete(fn);
      remove(type, fn);
    }) as typeof signal.removeEventListener;
    return { signal, live: () => live.size };
  };
  const timed = async (run: () => Promise<unknown>) => {
    const started = performance.now();
    const code = await refusal(run());
    return { code, ms: performance.now() - started };
  };
  const via = (port: number, route: string, signal: AbortSignal) =>
    pinnedTransport(nodeConnector({ ca }))({
      url: new URL(`https://feeds.example.test:${port}${route}`),
      address: "127.0.0.1",
      family: 4,
      headers: {},
      signal,
      maxBytes: 2 * 1024 * 1024,
    });

  const handshake = counted(deadline(300));
  const stall = await timed(() => via(stalledPort, "/rss", handshake.signal));
  assert.equal(stall.code, "egress_timeout", "a stalled TLS handshake ends at the deadline");
  assert.ok(stall.ms < 1500, `promptly (${Math.round(stall.ms)} ms)`);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(sockets.size, 0, "the stalled socket is closed");
  checks++;

  const already = new AbortController();
  already.abort();
  const before = sockets.size;
  const pre = await timed(() => via(stalledPort, "/rss", already.signal));
  assert.equal(pre.code, "egress_timeout", "an already-aborted request is refused");
  assert.ok(pre.ms < 100, "at once");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sockets.size, before, "without opening a connection");
  checks++;

  const early = counted(deadline(5000));
  const closed = await timed(() => via(closingPort, "/rss", early.signal));
  assert.match(
    closed.code,
    /egress_connection_closed|ECONNRESET/,
    "a close before the handshake is a clear failure",
  );
  assert.ok(closed.ms < 1000, "promptly, not at the deadline");
  assert.equal(early.live(), 0, "no abort listener is left behind");
  checks++;

  const stallSignal = counted(deadline(300));
  const midway = await timed(() => via(port, "/stall-body", stallSignal.signal));
  assert.equal(midway.code, "egress_timeout", "a body that stalls ends at the deadline");
  assert.ok(midway.ms < 1500, "promptly");
  const ok2 = counted(deadline(5000));
  await via(port, "/rss", ok2.signal);
  assert.equal(ok2.live(), 0, "a successful request leaves no abort listener either");
  checks++;

  // The whole fetch: DNS, connection, TLS and body under one deadline. The
  // feed URL is the production shape (port 443); the test transport sends the
  // real pinned connection to the stalled local server instead.
  const toStalled: PinnedTransport = (request) =>
    pinnedTransport(nodeConnector({ ca }))({
      ...request,
      url: new URL(`https://feeds.example.test:${stalledPort}/rss`),
      address: "127.0.0.1",
    });
  const started = performance.now();
  const run = await fetchFeed(
    { feedUrl: "https://feeds.example.test/rss", etag: null, lastModified: null },
    ["feeds.example.test"],
    { resolve: async () => ["93.184.216.34"], transport: toStalled, timeoutMs: 400 },
  );
  assert.deepEqual([run.status, run.errorCode], ["failed", "egress_timeout"]);
  assert.ok(performance.now() - started < 1500, '"Fetch now" ends with a clear failure');
  checks++;

  stalled.close();
  closing.close();
  for (const socket of sockets) socket.destroy();
} finally {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(
  `Security Work pinned HTTPS: ${checks} checks over real TLS on 127.0.0.1 passed; hostname verified, address pinned, cancellation and deadline proven.`,
);
