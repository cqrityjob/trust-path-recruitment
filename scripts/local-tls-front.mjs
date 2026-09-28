// A loopback-only HTTPS front for the application's dev server, for the
// routed evidence workflows.
//
// The share function (supabase/functions/passport-share) redirects a gateway
// link only to an https application origin -- on anything else it falls back
// to the production site -- so a walk that opens a share needs the application
// on https. The dev server speaks http, and no Vite flag serves https without
// a plugin, so this terminates TLS in front of it:
//
//   TLS_FRONT_CERT=… TLS_FRONT_KEY=… node scripts/local-tls-front.mjs 3121 3120
//
// Listens on 127.0.0.1 and forwards to 127.0.0.1 only, websocket upgrades
// included (Vite's HMR). The certificate is a throwaway the job generates.
//
// ── THE HOST'S ANALYTICS, EMULATED (TLS_FRONT_HOST_ANALYTICS=1) ─────────
//
// The published site's host injects
//
//     <script defer src="/~flock.js" data-proxy-url="/~api/analytics"></script>
//
// into every HTML page, and that script posts the page's full address 300 ms
// after it runs (src/lib/security-passport/share-transport.ts). With this set,
// the front does the same: it adds that tag to every text/html response, serves
// a /~flock.js that posts `location.href` and `location.pathname`, and answers
// /~api/analytics with 204. A walk can then prove that the script cannot run on
// the share entry page, and that no event it sends elsewhere carries a token.
// It never logs what it receives.

import http from "node:http";
import https from "node:https";
import net from "node:net";
import { readFileSync } from "node:fs";

const [listen, target] = process.argv.slice(2).map(Number);
const cert = process.env.TLS_FRONT_CERT;
const key = process.env.TLS_FRONT_KEY;
const hostAnalytics = process.env.TLS_FRONT_HOST_ANALYTICS === "1";
if (!listen || !target || !cert || !key) {
  console.error(
    "usage: TLS_FRONT_CERT=… TLS_FRONT_KEY=… node scripts/local-tls-front.mjs <listen> <target>",
  );
  process.exit(2);
}

const HOST_TAG = '<script defer src="/~flock.js" data-proxy-url="/~api/analytics"></script>';
const FLOCK = `(function(){
  var s=document.currentScript;
  var to=(s&&s.getAttribute("data-proxy-url"))||"/~api/analytics";
  setTimeout(function(){
    fetch(to,{method:"POST",keepalive:true,headers:{"content-type":"application/json"},
      body:JSON.stringify({event:"page_hit",href:location.href,pathname:location.pathname})
    }).catch(function(){});
  },300);
})();`;

/** The host's own paths, answered here and never forwarded. */
function answerHostPath(req, res) {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/~flock.js") {
    res.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(FLOCK);
    return true;
  }
  if (path === "/~api/analytics") {
    req.resume();
    req.on("end", () => {
      res.writeHead(204);
      res.end();
    });
    return true;
  }
  return false;
}

function withHostTag(html) {
  const at = html.indexOf("</head>");
  return at >= 0 ? `${html.slice(0, at)}${HOST_TAG}${html.slice(at)}` : `${HOST_TAG}${html}`;
}

const server = https.createServer(
  { cert: readFileSync(cert), key: readFileSync(key) },
  (req, res) => {
    if (hostAnalytics && answerHostPath(req, res)) return;
    const headers = { ...req.headers, "x-forwarded-proto": "https" };
    // Uncompressed, so the tag can be added to a page as the host adds it.
    if (hostAnalytics) delete headers["accept-encoding"];
    const upstream = http.request(
      { host: "127.0.0.1", port: target, method: req.method, path: req.url, headers },
      (answer) => {
        const type = String(answer.headers["content-type"] ?? "").toLowerCase();
        if (!hostAnalytics || req.method === "HEAD" || !type.startsWith("text/html")) {
          res.writeHead(answer.statusCode ?? 502, answer.headers);
          answer.pipe(res);
          return;
        }
        const chunks = [];
        answer.on("data", (chunk) => chunks.push(chunk));
        answer.on("end", () => {
          const body = Buffer.from(withHostTag(Buffer.concat(chunks).toString("utf8")), "utf8");
          const out = { ...answer.headers, "content-length": String(body.byteLength) };
          delete out["transfer-encoding"];
          res.writeHead(answer.statusCode ?? 502, out);
          res.end(body);
        });
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
  console.log(
    `local-tls-front: https://127.0.0.1:${listen} -> http://127.0.0.1:${target}${hostAnalytics ? ", host analytics emulated" : ""}`,
  );
});
