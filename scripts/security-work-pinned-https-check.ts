// The pinned HTTPS transport over a REAL TLS connection (Node connector).
// A throwaway certificate for feeds.example.test is generated, a local HTTPS
// server answers on 127.0.0.1, and the transport connects to that address for
// a name that has no DNS at all. TLS must verify the certificate against the
// hostname: a different name or an untrusted certificate is refused. Nothing
// leaves this machine.
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import {
  nodeConnector,
  pinnedTransport,
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
} finally {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(
  `Security Work pinned HTTPS: ${checks} checks over real TLS on 127.0.0.1 passed; hostname verified, address pinned.`,
);
