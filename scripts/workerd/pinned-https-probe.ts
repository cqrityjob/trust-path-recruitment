// A worker that runs the production feed transport inside workerd (the
// Cloudflare Workers runtime), for scripts/security-work-pinned-https-workerd.ts.
// Query: url, and address (pin) or answers (controlled DNS answers checked by
// the address policy); optional timeoutMs, maxBytes and parse=1 (run the feed
// parser over the body). Reports status, size, items or the refusal.
import { checkResolved } from "../../src/lib/security-work/connectors/egress";
import { resolveAll } from "../../src/lib/security-work/connectors/fetch.server";
import { parseFeed } from "../../src/lib/security-work/connectors/feed";
import {
  pinnedTransport,
  runtimeConnector,
  workersConnector,
} from "../../src/lib/security-work/connectors/pinned-https.server";

export default {
  async fetch(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const report: Record<string, unknown> = {
      runtimeUsesSockets: runtimeConnector() === workersConnector,
    };
    const started = Date.now();
    try {
      const url = new URL(params.get("url") ?? "");
      let address = params.get("address");
      let family: 4 | 6 = 4;
      if (!address) {
        // Controlled DNS answers (tests), else the runtime's own resolution.
        const answers = params.get("answers");
        const [target] = checkResolved(
          answers ? answers.split(",") : await resolveAll(url.hostname),
        );
        address = target.address;
        family = target.family;
        report.resolvedTo = target;
      }
      const response = await pinnedTransport(workersConnector)({
        url,
        address,
        family,
        headers: { accept: "application/rss+xml, application/xml" },
        signal: AbortSignal.timeout(Number(params.get("timeoutMs") ?? 10_000)),
        maxBytes: Number(params.get("maxBytes") ?? 2 * 1024 * 1024),
      });
      report.status = response.status;
      report.bytes = response.body.length;
      if (params.get("parse"))
        report.items = parseFeed(new TextDecoder().decode(response.body)).map((i) => i.title);
    } catch (error) {
      report.code = (error as { code?: unknown })?.code ?? null;
      report.error = String((error as Error)?.message ?? error);
    }
    report.elapsedMs = Date.now() - started;
    return Response.json(report);
  },
};
