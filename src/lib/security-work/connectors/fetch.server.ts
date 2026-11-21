import "@tanstack/react-start/server-only";
import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { AnalysisFailure, checked } from "../analysis-services";
import {
  assertWorkerSigningConfigured,
  signProcessingReceipt,
} from "../processing/attestation.server";
import { requireWorkspace, type SecurityWorkCaller } from "../services";
import { EgressError, checkFeedUrl, checkResolved } from "./egress";
import { FeedError, parseFeed } from "./feed";

type Env = Readonly<Record<string, string | undefined>>;
export interface FetchDeps {
  /** Every address the host resolves to (default: DNS, all families). */
  resolve?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
export interface FetchPayload {
  status: "succeeded" | "not_modified" | "failed";
  httpStatus: number | null;
  etag?: string | null;
  lastModified?: string | null;
  errorCode?: string;
  items?: {
    guid: string;
    title: string;
    url: string | null;
    publishedAt: string | null;
    text: string;
    contentHash: string;
  }[];
}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

// The fixed resolver used only where the runtime has no working dns.lookup
// (some Cloudflare Workers configurations). It is never taken from a feed,
// a source or user input.
const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const isUnsupported = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    code === "ENOTIMP" ||
    code === "ERR_METHOD_NOT_IMPLEMENTED" ||
    code === "ERR_NOT_IMPLEMENTED" ||
    error instanceof TypeError
  );
};

/** Answers of one DNS-over-HTTPS query; a non-zero DNS status yields none. */
export async function resolveOverHttps(
  host: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const addresses: string[] = [];
  for (const [type, code] of [
    ["A", 1],
    ["AAAA", 28],
  ] as const) {
    const response = await fetchImpl(
      `${DOH_ENDPOINT}?name=${encodeURIComponent(host)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, redirect: "error" },
    );
    if (!response.ok) throw new EgressError("egress_unresolved");
    const body = (await response.json()) as {
      Status?: number;
      Answer?: { type?: number; data?: string }[];
    };
    if (body.Status !== 0) continue;
    for (const answer of body.Answer ?? [])
      if (answer.type === code && typeof answer.data === "string") addresses.push(answer.data);
  }
  return addresses;
}

export async function resolveAll(
  host: string,
  deps: { lookupImpl?: typeof lookup; fetchImpl?: typeof fetch } = {},
): Promise<string[]> {
  try {
    const answers = await (deps.lookupImpl ?? lookup)(host, { all: true, verbatim: true });
    return answers.map((answer) => answer.address);
  } catch (error) {
    // A real DNS error (no such host, timeout) stays an error; only a runtime
    // without a working lookup falls back to the fixed DoH resolver.
    if (!isUnsupported(error)) throw error;
    return resolveOverHttps(host, deps.fetchImpl);
  }
}

async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > MAX_BYTES) throw new FeedError("feed_too_large");
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * One conditional GET of an approved feed. Never throws for network or feed
 * problems: they become a failed payload, which is a coverage fact. Redirects
 * are followed by hand so each hop is checked against the allowlist and DNS.
 * Residual risk (stated, not hidden): the platform fetch resolves the host
 * again after our check; the host allowlist limits that to approved official
 * hosts.
 */
export async function fetchFeed(
  source: { feedUrl: string; etag: string | null; lastModified: string | null },
  approvedHosts: readonly string[],
  deps: FetchDeps = {},
): Promise<FetchPayload> {
  const resolve = deps.resolve ?? resolveAll;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10_000);
  try {
    let url = checkFeedUrl(source.feedUrl, approvedHosts);
    for (let hop = 0; ; hop++) {
      checkResolved(await resolve(url.hostname));
      const headers: Record<string, string> = {
        accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8",
        "user-agent": "CQrityjob-SecurityWork-FeedConnector/1.0",
      };
      if (hop === 0 && source.etag) headers["if-none-match"] = source.etag;
      if (hop === 0 && source.lastModified) headers["if-modified-since"] = source.lastModified;
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        void response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || hop >= MAX_REDIRECTS)
          return { status: "failed", httpStatus: response.status, errorCode: "redirect_refused" };
        url = checkFeedUrl(new URL(location, url).toString(), approvedHosts);
        continue;
      }
      if (response.status === 304) return { status: "not_modified", httpStatus: 304 };
      if (!response.ok) {
        void response.body?.cancel();
        return {
          status: "failed",
          httpStatus: response.status,
          errorCode: `http_${response.status}`,
        };
      }
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > MAX_BYTES) {
        void response.body?.cancel();
        return { status: "failed", httpStatus: response.status, errorCode: "feed_too_large" };
      }
      const items = parseFeed(await boundedText(response, controller.signal)).map((item) => ({
        ...item,
        contentHash: createHash("sha256").update(item.text, "utf8").digest("hex"),
      }));
      return {
        status: "succeeded",
        httpStatus: response.status,
        etag: response.headers.get("etag")?.slice(0, 500) ?? null,
        lastModified: response.headers.get("last-modified")?.slice(0, 100) ?? null,
        items,
      };
    }
  } catch (error) {
    const code =
      error instanceof EgressError || error instanceof FeedError
        ? error.code
        : controller.signal.aborted
          ? "timeout"
          : "network_error";
    return { status: "failed", httpStatus: null, errorCode: code };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches one official feed source now and records the signed run. */
export async function fetchSourceNow(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; sourceId: string; runId?: string },
  env: Env = process.env,
  deps: FetchDeps = {},
) {
  await requireWorkspace(caller, data.workspaceId, true);
  try {
    assertWorkerSigningConfigured(env);
  } catch {
    throw new AnalysisFailure("FETCH_NOT_CONFIGURED");
  }
  const source = checked(
    await caller.supabase
      .from("sw_sources")
      .select("id,source_type,active,feed_url,feed_etag,feed_last_modified")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.sourceId)
      .maybeSingle(),
  );
  if (!source) throw new AnalysisFailure("ACCESS_DENIED");
  if (source.source_type !== "official_feed" || !source.active || !source.feed_url)
    throw new AnalysisFailure("INVALID_INPUT");
  const hosts = (
    checked(await caller.supabase.from("sw_feed_hosts").select("host").eq("active", true)) ?? []
  ).map((row) => row.host);
  const payload = JSON.stringify(
    await fetchFeed(
      { feedUrl: source.feed_url, etag: source.feed_etag, lastModified: source.feed_last_modified },
      hosts,
      deps,
    ),
  );
  const runId = data.runId ?? randomUUID();
  const signature = signProcessingReceipt("fetch", runId, source.id, payload, env);
  const run = checked(
    await caller.supabase.rpc("sw_record_fetch", {
      _workspace_id: data.workspaceId,
      _run_id: runId,
      _source_id: source.id,
      _key_id: signature.keyId,
      _payload: payload,
      _signature: signature.signature,
    }),
  );
  if (!run) throw new AnalysisFailure("SAVE_FAILED");
  return run;
}
