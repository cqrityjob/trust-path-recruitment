// The feed transport inside workerd, the Cloudflare Workers runtime the app is
// deployed to (nodejs_compat, as the bundle's wrangler.json). CONTROLLED AND
// LOCAL ONLY: throwaway certificates, servers on 127.0.0.1, names that never
// reach DNS. This is runtime evidence, not hosted-deployment evidence: it does
// not show that the hosted Worker reaches any real publisher.
//
//   SW_WRANGLER=<path to the pinned wrangler 4.147.0> bun run scripts/security-work-pinned-https-workerd.ts
//
// A throwaway CA is trusted by workerd for this run only (NODE_EXTRA_CA_CERTS),
// so a real pinned HTTPS exchange can succeed. Proves in workerd:
//  1. the cloudflare:sockets connector is chosen;
//  2. a pinned request to the checked address succeeds for the right name and
//     the feed parses (Content-Length and chunked bodies);
//  3. a wrong hostname and an untrusted certificate are refused at TLS;
//  4. a stalled TLS handshake and a stalled body end at the deadline;
//  5. hostile chunk framing and a malformed feed are refused quickly;
//  6. a mixed DNS answer with mapped loopback is refused before connecting.
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";

const wrangler = process.env.SW_WRANGLER;
if (!wrangler) throw new Error("SW_WRANGLER must point at the pinned wrangler binary");
const root = path.resolve(import.meta.dir, "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-workerd-"));
const file = (name: string) => path.join(dir, name);
const openssl = (...args: string[]) => cp.execFileSync("openssl", args, { stdio: "ignore" });

// A throwaway CA, a leaf for feeds.example.test signed by it, and a rogue
// self-signed certificate for the same name that nothing trusts.
openssl(
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-keyout",
  file("ca.key"),
  "-out",
  file("ca.pem"),
  "-days",
  "1",
  "-subj",
  "/CN=Security Work test CA",
  "-addext",
  "basicConstraints=critical,CA:TRUE",
  "-addext",
  "keyUsage=critical,keyCertSign",
);
openssl(
  "req",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-keyout",
  file("leaf.key"),
  "-out",
  file("leaf.csr"),
  "-subj",
  "/CN=feeds.example.test",
);
fs.writeFileSync(
  file("leaf.ext"),
  "subjectAltName=DNS:feeds.example.test\nextendedKeyUsage=serverAuth\n",
);
openssl(
  "x509",
  "-req",
  "-in",
  file("leaf.csr"),
  "-CA",
  file("ca.pem"),
  "-CAkey",
  file("ca.key"),
  "-CAcreateserial",
  "-out",
  file("leaf.pem"),
  "-days",
  "1",
  "-extfile",
  file("leaf.ext"),
);
openssl(
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-keyout",
  file("rogue.key"),
  "-out",
  file("rogue.pem"),
  "-days",
  "1",
  "-subj",
  "/CN=feeds.example.test",
  "-addext",
  "subjectAltName=DNS:feeds.example.test",
);

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><item><title>Pinned</title><guid>p1</guid></item></channel></rss>`;
const respond = (socket: tls.TLSSocket, route: string) => {
  if (route === "/rss")
    return socket.end(
      `HTTP/1.1 200 OK\r\ncontent-type: application/rss+xml\r\ncontent-length: ${Buffer.byteLength(FEED)}\r\nconnection: close\r\n\r\n${FEED}`,
    );
  if (route === "/chunked") {
    const a = FEED.slice(0, 40);
    const b = FEED.slice(40);
    return socket.end(
      `HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n${a.length.toString(16)}\r\n${a}\r\n${Buffer.byteLength(b).toString(16)}\r\n${b}\r\n0\r\n\r\n`,
    );
  }
  if (route === "/evil-chunk") {
    // "0;" followed by 1 MiB of chunk extension, sent in pieces.
    socket.write("HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n0;");
    const piece = "x".repeat(4096);
    for (let i = 0; i < 256 && !socket.destroyed; i++) socket.write(piece);
    return socket.end("\r\n\r\n");
  }
  if (route === "/malformed")
    return socket.end(
      `HTTP/1.1 200 OK\r\nconnection: close\r\n\r\n<rss>${"<item>".repeat(80000)}</rss>`,
    );
  if (route === "/stall-body")
    return socket.write("HTTP/1.1 200 OK\r\ncontent-length: 1000\r\n\r\nabc");
  socket.end("HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\n\r\n");
};
const tlsServer = (key: string, cert: string) =>
  tls.createServer(
    { key: fs.readFileSync(file(key)), cert: fs.readFileSync(file(cert)) },
    (socket) => {
      socket.on("error", () => undefined);
      let head = "";
      socket.on("data", (chunk) => {
        if (head.includes("\r\n\r\n")) return;
        head += chunk.toString("latin1");
        if (head.includes("\r\n\r\n")) respond(socket, head.split(" ")[1] ?? "/");
      });
    },
  );
const listen = (server: net.Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port)),
  );
const good = tlsServer("leaf.key", "leaf.pem");
const rogue = tlsServer("rogue.key", "rogue.pem");
// Accepts TCP and never answers the TLS handshake.
const stalled = net.createServer((socket) => socket.on("error", () => undefined));
const goodPort = await listen(good);
const roguePort = await listen(rogue);
const stalledPort = await listen(stalled);
// A free port for workerd: bind, read, release.
const probeServer = net.createServer();
const workerPort = await listen(probeServer);
await new Promise((resolve) => probeServer.close(resolve));

fs.writeFileSync(
  file("wrangler.toml"),
  `name = "sw-pinned-probe"\nmain = ${JSON.stringify(path.join(root, "scripts/workerd/pinned-https-probe.ts"))}\ncompatibility_date = "2026-09-01"\ncompatibility_flags = ["nodejs_compat"]\n`,
);
const dev = cp.spawn(
  wrangler,
  [
    "dev",
    "--config",
    file("wrangler.toml"),
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(workerPort),
  ],
  {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NODE_EXTRA_CA_CERTS: file("ca.pem") },
  },
);
let log = "";
dev.stdout.on("data", (chunk) => (log += chunk));
dev.stderr.on("data", (chunk) => (log += chunk));
type Report = {
  runtimeUsesSockets: boolean;
  status?: number;
  items?: string[];
  code?: string | null;
  error?: string;
  elapsedMs: number;
};
const probe = async (query: Record<string, string>) =>
  (await (
    await fetch(`http://127.0.0.1:${workerPort}/?${new URLSearchParams(query)}`)
  ).json()) as Report;
const at = (port: number, route: string, host = "feeds.example.test") =>
  `https://${host}:${port}${route}`;
// workerd reports TLS refusals to the script only as an opaque internal error,
// so the reason is shown differentially: the same server, address and request
// succeed, and only the hostname (or only the certificate) differs.
const tlsRefusal = (report: Report) =>
  report.status === undefined && report.code === null && typeof report.error === "string";
let checks = 0;
const check = (condition: boolean, label: string, report: unknown) => {
  assert.ok(condition, `${label}: ${JSON.stringify(report)}`);
  checks++;
  console.log(`    ok  ${label}`);
};
try {
  for (let i = 0; ; i++) {
    try {
      await fetch(`http://127.0.0.1:${workerPort}/`);
      break;
    } catch {
      if (i > 120) throw new Error(`workerd did not start:\n${log}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const ok = await probe({ url: at(goodPort, "/rss"), address: "127.0.0.1", parse: "1" });
  check(ok.runtimeUsesSockets === true, "workerd uses the cloudflare:sockets connector", ok);
  check(
    ok.status === 200 && ok.items?.[0] === "Pinned",
    "a pinned HTTPS request to the checked address succeeds and the feed parses",
    ok,
  );
  const chunked = await probe({ url: at(goodPort, "/chunked"), address: "127.0.0.1", parse: "1" });
  check(
    chunked.status === 200 && chunked.items?.[0] === "Pinned",
    "a chunked feed parses",
    chunked,
  );
  const wrongName = await probe({
    url: at(goodPort, "/rss", "other.example.test"),
    address: "127.0.0.1",
  });
  check(
    ok.status === 200 && tlsRefusal(wrongName),
    "the same server and address are refused when the expected hostname differs (hostname verification)",
    wrongName,
  );
  const untrusted = await probe({ url: at(roguePort, "/rss"), address: "127.0.0.1" });
  check(
    ok.status === 200 && tlsRefusal(untrusted),
    "the right hostname with a certificate from an untrusted issuer is refused (chain verification)",
    untrusted,
  );
  const handshake = await probe({
    url: at(stalledPort, "/rss"),
    address: "127.0.0.1",
    timeoutMs: "800",
  });
  check(
    handshake.code === "egress_timeout" && handshake.elapsedMs < 3000,
    "a stalled TLS handshake ends at the deadline",
    handshake,
  );
  const body = await probe({
    url: at(goodPort, "/stall-body"),
    address: "127.0.0.1",
    timeoutMs: "800",
  });
  check(
    body.code === "egress_timeout" && body.elapsedMs < 3000,
    "a stalled body ends at the deadline",
    body,
  );
  const framing = await probe({
    url: at(goodPort, "/evil-chunk"),
    address: "127.0.0.1",
    maxBytes: "16",
  });
  check(
    framing.code === "feed_unparseable" && framing.elapsedMs < 3000,
    "1 MiB of chunk extension is refused, not accepted under a 16-byte limit",
    framing,
  );
  const malformed = await probe({
    url: at(goodPort, "/malformed"),
    address: "127.0.0.1",
    parse: "1",
  });
  check(
    malformed.code === "feed_unparseable" && malformed.elapsedMs < 3000,
    "a malformed repeated-item feed is refused quickly, never read as empty",
    malformed,
  );
  const loopback = await probe({
    url: at(goodPort, "/rss"),
    answers: "93.184.216.34,::ffff:7f00:1",
  });
  check(
    loopback.code === "egress_private_address",
    "a mixed answer with mapped loopback is refused before any connection",
    loopback,
  );
} catch (error) {
  console.log(`workerd log:\n${log}`);
  throw error;
} finally {
  dev.kill("SIGTERM");
  for (const server of [good, rogue, stalled]) server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(
  `Security Work pinned HTTPS in workerd: ${checks} checks passed (controlled, localhost only).`,
);
process.exit(0);
