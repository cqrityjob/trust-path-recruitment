// A test Worker that runs the production feed transport inside workerd, the
// runtime the app is deployed to. Used by scripts/security-work-pinned-https-workerd.ts.
import { checkResolved } from "../../src/lib/security-work/connectors/egress";
import { resolveAll } from "../../src/lib/security-work/connectors/fetch.server";
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
        headers: { accept: "text/html,application/xml" },
        signal: AbortSignal.timeout(10_000),
        maxBytes: 2 * 1024 * 1024,
      });
      report.status = response.status;
      report.bytes = response.body.length;
    } catch (error) {
      report.error = String((error as Error)?.message ?? error);
    }
    return Response.json(report);
  },
};
