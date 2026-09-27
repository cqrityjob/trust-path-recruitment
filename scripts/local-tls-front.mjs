// A loopback-only HTTPS front for the application's dev server, for the
// routed evidence workflows.
//
// The share gateway (supabase/functions/passport-share) hands a recipient
// only to an https application origin -- on anything else it falls back to
// the production site -- so a walk that opens a share needs the application on
// https. The dev server speaks http, and no Vite flag serves https without a
// plugin, so this terminates TLS in front of it:
//
//   TLS_FRONT_CERT=… TLS_FRONT_KEY=… node scripts/local-tls-front.mjs 3121 3120
//
// Listens on 127.0.0.1 and forwards to 127.0.0.1 only, websocket upgrades
// included (Vite's HMR). The certificate is a throwaway the job generates.

import http from "node:http";
import https from "node:https";
import net from "node:net";
import { readFileSync } from "node:fs";

const [listen, target] = process.argv.slice(2).map(Number);
const cert = process.env.TLS_FRONT_CERT;
const key = process.env.TLS_FRONT_KEY;
if (!listen || !target || !cert || !key) {
  console.error(
    "usage: TLS_FRONT_CERT=… TLS_FRONT_KEY=… node scripts/local-tls-front.mjs <listen> <target>",
  );
  process.exit(2);
}

const server = https.createServer(
  { cert: readFileSync(cert), key: readFileSync(key) },
  (req, res) => {
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: target,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, "x-forwarded-proto": "https" },
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(`local-tls-front: ${e.message}`);
    });
    req.pipe(upstream);
  },
);

server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(target, "127.0.0.1", () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(listen, "127.0.0.1", () => {
  console.log(`local-tls-front: https://127.0.0.1:${listen} -> http://127.0.0.1:${target}`);
});
