// The feed transport inside workerd, the Cloudflare Workers runtime the app is
// deployed to (nodejs_compat, as the bundle's wrangler.json). Only localhost:
// a throwaway self-signed certificate and a name that resolves to loopback.
//
//   SW_WRANGLER=<path to the pinned wrangler 4.147.0> bun run scripts/security-work-pinned-https-workerd.ts
//
// Proves in the deployed runtime: the cloudflare:sockets connector is chosen;
// a pinned TLS connection to an untrusted certificate is refused; a host that
// resolves to loopback (among public answers) is refused by the address
// policy before any connection.
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const wrangler = process.env.SW_WRANGLER;
if (!wrangler) throw new Error("SW_WRANGLER must point at the pinned wrangler binary");
const root = path.resolve(import.meta.dir, "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-workerd-"));
const free = () =>
  new Promise<number>((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
cp.execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    path.join(dir, "key.pem"),
    "-out",
    path.join(dir, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=feeds.example.test",
    "-addext",
    "subjectAltName=DNS:feeds.example.test",
  ],
  { stdio: "ignore" },
);
const tls = https.createServer(
  {
    key: fs.readFileSync(path.join(dir, "key.pem")),
    cert: fs.readFileSync(path.join(dir, "cert.pem")),
  },
  (_req, res) => res.end("<rss/>"),
);
await new Promise<void>((resolve) => tls.listen(0, "127.0.0.1", resolve));
const tlsPort = (tls.address() as net.AddressInfo).port;
const workerPort = await free();
fs.writeFileSync(
  path.join(dir, "wrangler.toml"),
  `name = "sw-pinned-probe"\nmain = ${JSON.stringify(path.join(root, "scripts/workerd/pinned-https-probe.ts"))}\ncompatibility_date = "2026-09-01"\ncompatibility_flags = ["nodejs_compat"]\n`,
);
const dev = cp.spawn(
  wrangler,
  [
    "dev",
    "--config",
    path.join(dir, "wrangler.toml"),
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(workerPort),
  ],
  {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
let log = "";
dev.stdout.on("data", (chunk) => (log += chunk));
dev.stderr.on("data", (chunk) => (log += chunk));
const probe = async (query: Record<string, string>) =>
  (await (await fetch(`http://127.0.0.1:${workerPort}/?${new URLSearchParams(query)}`)).json()) as {
    runtimeUsesSockets: boolean;
    status?: number;
    error?: string;
  };
let checks = 0;
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
  const untrusted = await probe({
    url: `https://feeds.example.test:${tlsPort}/rss`,
    address: "127.0.0.1",
  });
  assert.equal(untrusted.runtimeUsesSockets, true, "workerd uses the cloudflare:sockets connector");
  checks++;
  assert.ok(
    untrusted.error && untrusted.status === undefined,
    `untrusted TLS must be refused: ${JSON.stringify(untrusted)}`,
  );
  checks++;
  const loopback = await probe({
    url: `https://feeds.example.test:${tlsPort}/rss`,
    answers: "93.184.216.34,::ffff:7f00:1",
  });
  assert.equal(
    loopback.error,
    "egress_private_address",
    "a mixed answer with mapped loopback is refused before any connection",
  );
  checks++;
} finally {
  dev.kill("SIGTERM");
  tls.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`Security Work pinned HTTPS in workerd: ${checks} checks passed (localhost only).`);
