/** Private test TLS proxy + actual packaged Node processor. Not a production launcher. */
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { request as requestHttp, type Server } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";

const state = resolve(process.argv[2]);
const config = JSON.parse(readFileSync(join(state, "fixture.json"), "utf8")) as {
  token: string;
  httpPort: number;
  httpsPort: number;
  upstreamPort?: number;
};
const module = (await import(pathToFileURL(join(state, "artifact/server.mjs")).href)) as {
  createSecurityWorkProcessor(token: string): Server;
  checkProcessorEngine(): Promise<void>;
};
if (!config.upstreamPort) await module.checkProcessorEngine();
const http = config.upstreamPort ? null : module.createSecurityWorkProcessor(config.token);
const listen = (server: Server, port: number) =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
const httpPort = config.upstreamPort || (await listen(http!, config.httpPort));
if (config.upstreamPort) {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${httpPort}/healthz`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* The owned container may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Synthetic upstream did not become ready.");
}
const https = createHttpsServer(
  {
    key: readFileSync(join(state, "key.pem")),
    cert: readFileSync(join(state, "cert.pem")),
    maxHeaderSize: 8192,
  },
  (request, response) => {
    if (
      !(
        (request.method === "POST" && request.url === "/v1/extract") ||
        (request.method === "GET" && request.url === "/healthz")
      )
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    const headers: Record<string, string> = {
      authorization: request.headers.authorization ?? "",
      "content-type": request.headers["content-type"] ?? "",
    };
    if (request.headers["content-length"])
      headers["content-length"] = request.headers["content-length"];
    const upstream = requestHttp(
      {
        hostname: "127.0.0.1",
        port: httpPort,
        path: request.url,
        method: request.method,
        headers,
        timeout: 15_000,
      },
      (result) => {
        if (response.headersSent || response.destroyed) {
          result.resume();
          return;
        }
        response.writeHead(result.statusCode ?? 502, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        result.pipe(response);
      },
    );
    let length = 0;
    request.on("data", (chunk) => {
      length += chunk.length;
      if (length > 10 * 1024 * 1024) {
        upstream.destroy();
        if (!response.headersSent) response.writeHead(413);
        response.end();
        request.destroy();
      }
    });
    request.once("aborted", () => upstream.destroy());
    response.once("close", () => {
      if (!response.writableEnded) upstream.destroy();
    });
    upstream.once("timeout", () => upstream.destroy());
    upstream.once("error", () => {
      if (!response.headersSent && !response.destroyed) response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  },
);
https.headersTimeout = 5000;
https.requestTimeout = 15_000;
https.keepAliveTimeout = 1000;
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  rmSync(join(state, "ready.json"), { force: true });
  https.closeAllConnections();
  http?.closeAllConnections();
  https.close();
  http?.close();
  setTimeout(() => process.exit(0), 2000).unref();
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
let httpsPort: number;
try {
  httpsPort = await listen(https, config.httpsPort);
} catch (error) {
  stop();
  throw error;
}
const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
const appEnv = {
  NODE_EXTRA_CA_CERTS: join(state, "cert.pem"),
  SW_PROCESSOR_ENABLED: "true",
  SW_PROCESSOR_URL: `https://127.0.0.1:${httpsPort}/v1/extract`,
  SW_PROCESSOR_EXPECTED_ORIGIN: `https://127.0.0.1:${httpsPort}`,
  SW_PROCESSOR_AUTH_TOKEN: config.token,
  SW_PROCESSOR_DATA_PROCESSING_APPROVAL: "synthetic-local-only",
  SW_PROCESSOR_TEST_HTTP_ORIGIN: `http://127.0.0.1:${httpPort}`,
};
writeFileSync(
  join(state, "app.env.tmp"),
  Object.entries(appEnv)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
renameSync(join(state, "app.env.tmp"), join(state, "app.env"));
writeFileSync(
  join(state, "ready.json.tmp"),
  JSON.stringify({ pid: process.pid, httpPort, httpsPort, appEnv: join(state, "app.env") }) + "\n",
  { mode: 0o600 },
);
renameSync(join(state, "ready.json.tmp"), join(state, "ready.json"));
console.log(
  `Synthetic processor fixture ready; source ${join(state, "app.env")} before starting the app.`,
);
