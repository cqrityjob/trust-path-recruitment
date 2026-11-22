// Security Work Release B end to end over a REAL database and REAL PostgREST
// 14.15: an approved official feed -> signed fetch (controlled DNS and HTTP,
// real HMAC, real RPC) -> developments with relevance and coverage -> impact
// brief -> review by an approver -> risk and actions -> follow-up -> new
// evidence raises a review flag -> revision supersedes. The application's
// services run unchanged. Synthetic data; no network beyond localhost.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fetchSourceNow } from "../src/lib/security-work/connectors/fetch.server";
import * as impact from "../src/lib/security-work/impact/services";
import * as missions from "../src/lib/security-work/missions/services";
import * as programme from "../src/lib/security-work/programme/services";
import * as context from "../src/lib/security-work/operating-context/services";
import { emptyProfile } from "../src/lib/security-work/operating-context/schema";
import {
  asUser,
  failureCode,
  psqlFor,
  requireDisposableDb,
  startPostgrest,
} from "./lib/sw-postgrest-harness";

const db = requireDisposableDb();
const psql = psqlFor(db);
const ids = Array.from(
  { length: 6 },
  (_, i) => `5b000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const [APPROVER, EDITOR, VIEWER, OUTSIDE] = ids;
const secret = crypto.randomBytes(32).toString("hex");
const env = { SW_WORKER_KEY_ID: "synthetic-feed-key", SW_WORKER_SECRET: secret };

psql(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('${APPROVER}','rb-approver@example.test',now()),('${EDITOR}','rb-editor@example.test',now()),('${VIEWER}','rb-viewer@example.test',now()),('${OUTSIDE}','rb-outside@example.test',now());
 INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '5b000000-%';
 INSERT INTO sw_private.worker_keys(key_id,secret) VALUES('synthetic-feed-key','${secret}');
 INSERT INTO sw_feed_hosts(host,publisher,terms_reference,approval_note) VALUES('feeds.example.test','Synthetic Road Authority','Synthetic open licence','Synthetic approval for tests');`);
const workspace = psql(
  `${asUser(APPROVER)} SET ROLE authenticated; SELECT sw_create_personal_workspace('Release B PostgREST workspace');`,
)
  .split("\n")
  .pop()!;
psql(`${asUser(APPROVER)} INSERT INTO sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES ('${workspace}','${EDITOR}','editor',false),('${workspace}','${VIEWER}','viewer',false),('${workspace}','${OUTSIDE}','editor',false);
 SET ROLE authenticated; INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES('${workspace}','Terminal Gothenburg','operations');`);

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Roads</title>${items}</channel></rss>`;
const item = (guid: string, title: string, text: string) =>
  `<item><guid>${guid}</guid><title>${title}</title><link>https://feeds.example.test/${guid}</link><pubDate>Thu, 20 Nov 2026 10:00:00 GMT</pubDate><description>${text}</description></item>`;
let feed = {
  status: 200,
  body: rss(
    item("g1", "E6 closed near Terminal Gothenburg", "The E6 is closed near the terminal.") +
      item("g2", "Football fixtures", "Weekend matches."),
  ),
  etag: '"v1"',
};
const seen: Record<string, string>[] = [];
const deps = {
  resolve: async () => ["93.184.216.34"],
  // Controlled network at the pinned-transport seam (HTTP itself is proven in
  // scripts/security-work-release-b-check.ts and the TLS/workerd checks).
  transport: async (request: { address: string; headers: Record<string, string> }) => {
    assert.equal(request.address, "93.184.216.34", "the request is pinned to the checked address");
    seen.push(request.headers);
    return {
      status: feed.status,
      headers: new Headers({ etag: feed.etag }),
      body: new TextEncoder().encode(feed.status === 304 ? "" : feed.body),
    };
  },
};

const stack = await startPostgrest(db);
console.log(`    ..  PostgREST image ${stack.image}`);
let checks = 0;
const check = async (label: string, run: () => Promise<void>) => {
  await run();
  checks += 1;
  console.log(`    ok  SW-RB-PGRST ${label}`);
};
try {
  const { caller } = stack;
  await context.saveOperatingProfile(caller(EDITOR), {
    workspaceId: workspace,
    expectedVersion: 0,
    profile: {
      ...emptyProfile(),
      criticalServices: ["Terminal Gothenburg"],
      countries: ["SE"],
      monitoring: {
        topics: ["closure"],
        places: ["E6"],
        exclusions: ["football"],
        coverageExpectation: "",
      },
    },
    provenance: {},
    changeNote: "",
  });
  let sourceId = "";
  await check("a feed on an unapproved host is refused; an approved one is added", async () => {
    assert.equal(
      await failureCode(
        impact.createFeedSource(caller(EDITOR), {
          workspaceId: workspace,
          name: "X",
          feedUrl: "https://evil.example.test/rss",
          pollTargetMinutes: 60,
        }),
      ),
      "FEED_HOST_NOT_APPROVED",
    );
    sourceId = (
      await impact.createFeedSource(caller(EDITOR), {
        workspaceId: workspace,
        name: "Road authority",
        feedUrl: "https://feeds.example.test/rss",
        pollTargetMinutes: 60,
      })
    ).id;
    assert.equal(
      (await impact.readImpact(caller(EDITOR), workspace)).coverage.state,
      "never_checked",
    );
  });
  await check("without the worker key nothing is fetched", async () => {
    assert.equal(
      await failureCode(
        fetchSourceNow(caller(EDITOR), { workspaceId: workspace, sourceId }, {}, deps),
      ),
      "FETCH_NOT_CONFIGURED",
    );
    assert.equal(seen.length, 0);
  });
  await check(
    "a signed fetch stores the items; coverage becomes current; relevance is explained",
    async () => {
      const run = await fetchSourceNow(
        caller(EDITOR),
        { workspaceId: workspace, sourceId },
        env,
        deps,
      );
      assert.deepEqual([run.status, run.items_new], ["succeeded", 2]);
      const overview = await impact.readImpact(caller(EDITOR), workspace);
      assert.equal(overview.coverage.state, "current");
      const road = overview.developments.find((d) => d.title.startsWith("E6"))!;
      assert.ok(
        road.relevance.score >= 2 &&
          road.relevance.matches.some((m) => m.kind === "critical_service"),
      );
      assert.equal(
        overview.developments.find((d) => d.title.startsWith("Football"))?.relevance.excludedBy,
        "football",
      );
    },
  );
  await check("the next fetch is conditional and a 304 adds nothing", async () => {
    feed = { ...feed, status: 304 };
    const run = await fetchSourceNow(
      caller(EDITOR),
      { workspaceId: workspace, sourceId },
      env,
      deps,
    );
    assert.equal(run.status, "not_modified");
    assert.equal(seen.at(-1)?.["if-none-match"], '"v1"');
  });
  let briefId = "";
  let mission = "";
  await check("an editor drafts an impact brief whose evidence the database builds", async () => {
    mission = (
      await missions.createMission(caller(EDITOR), {
        workspaceId: workspace,
        kind: "monitoring_impact",
        title: "Road access",
        restricted: false,
        brief: {},
      })
    ).id;
    const road = (await impact.readImpact(caller(EDITOR), workspace)).developments.find((d) =>
      d.title.startsWith("E6"),
    )!;
    const brief = await impact.createBrief(caller(EDITOR), {
      workspaceId: workspace,
      missionId: mission,
      clusterId: road.clusterId,
      title: "E6 closure affects the Gothenburg terminal",
      whatChanged: "The E6 is closed near the terminal.",
      known: "Closure confirmed by the road authority.",
      whyItMatters: "Departures depend on the E6.",
      uncertain: "Duration unknown.",
      proposedActions: [{ title: "Re-route departures", description: "" }],
      evidenceItemIds: [road.itemId],
      relevance: { score: road.relevance.score },
    });
    briefId = brief.id;
    assert.equal(brief.operating_profile_version, 1);
    const evidence = brief.evidence as {
      publisher: string;
      retrievalStatus: string;
      url: string;
    }[];
    assert.deepEqual(
      [evidence[0].publisher, evidence[0].retrievalStatus, evidence[0].url],
      ["Synthetic Road Authority", "fetched", "https://feeds.example.test/g1"],
    );
  });
  await check(
    "review: an editor submits, cannot approve; a viewer cannot draft; the approver approves",
    async () => {
      let brief = (await impact.getBrief(caller(EDITOR), { workspaceId: workspace, briefId }))
        .brief;
      brief = await impact.transitionBrief(caller(EDITOR), {
        workspaceId: workspace,
        briefId,
        version: brief.version,
        status: "in_review",
        decisionNote: "",
      });
      assert.equal(
        await failureCode(
          impact.transitionBrief(caller(EDITOR), {
            workspaceId: workspace,
            briefId,
            version: brief.version,
            status: "approved",
            decisionNote: "",
          }),
        ),
        "APPROVER_REQUIRED",
        "an editor without approval rights is told an approver must decide",
      );
      assert.equal(
        await failureCode(
          impact.createBrief(caller(VIEWER), {
            workspaceId: workspace,
            missionId: null,
            clusterId: null,
            title: "x",
            whatChanged: "",
            known: "",
            whyItMatters: "",
            uncertain: "",
            proposedActions: [],
            evidenceItemIds: [brief.evidence_item_ids[0]],
            relevance: {},
          }),
        ),
        "ACCESS_DENIED",
      );
      brief = await impact.transitionBrief(caller(APPROVER), {
        workspaceId: workspace,
        briefId,
        version: brief.version,
        status: "approved",
        decisionNote: "Reviewed",
      });
      assert.deepEqual([brief.status, brief.approved_by], ["approved", APPROVER]);
    },
  );
  await check(
    "the approved brief becomes a risk and actions, once; follow-up shows them",
    async () => {
      const brief = (await impact.getBrief(caller(APPROVER), { workspaceId: workspace, briefId }))
        .brief;
      const requestId = crypto.randomUUID();
      const input = {
        workspaceId: workspace,
        briefId,
        version: brief.version,
        requestId,
        risk: {
          title: "Transport disruption",
          description: "E6 closure",
          threatScenario: "Prolonged closure",
        },
        actions: [
          {
            title: "Re-route departures",
            description: "",
            priority: "high" as const,
            dueDate: "2026-12-01",
          },
        ],
      };
      const applied = await impact.applyBrief(caller(APPROVER), input);
      assert.equal(
        (await impact.applyBrief(caller(APPROVER), input)).id,
        applied.id,
        "a retry returns the receipt",
      );
      assert.equal(
        await failureCode(
          impact.applyBrief(caller(APPROVER), { ...input, requestId: crypto.randomUUID() }),
        ),
        "CONFLICT",
      );
      const detail = await impact.getBrief(caller(EDITOR), { workspaceId: workspace, briefId });
      assert.equal(detail.followUp.risk?.title, "Transport disruption");
      assert.deepEqual(
        detail.followUp.actions.map((a) => [a.title, a.status, a.due_date]),
        [["Re-route departures", "open", "2026-12-01"]],
      );
      assert.ok(
        (
          await missions.getMission(caller(EDITOR), { workspaceId: workspace, missionId: mission })
        ).links.some((l) => l.link.target_kind === "risk"),
      );
    },
  );
  await check(
    "new evidence raises a flag only the circle can see or resolve; the revision supersedes",
    async () => {
      feed = {
        status: 200,
        etag: '"v2"',
        body: rss(
          item("g3", "E6 closed near Terminal Gothenburg update", "Reopening expected tomorrow."),
        ),
      };
      await fetchSourceNow(caller(EDITOR), { workspaceId: workspace, sourceId }, env, deps);
      const flags = (await impact.readImpact(caller(EDITOR), workspace)).openFlags;
      assert.equal(flags.filter((f) => f.brief_id === briefId).length, 1);
      // Need-to-know over the API: once the mission is restricted, an editor
      // outside its circle reaches neither the brief, its flag nor its
      // receipt, through the services or PostgREST directly, and resolves
      // nothing.
      const flagId = flags.find((f) => f.brief_id === briefId)!.id;
      // While the mission is open its risk is ordinary work: a management
      // report built by an editor outside any circle includes it, and the
      // database records the mission the report drew on.
      const openRisk = psql(
        `SELECT risk_id FROM sw_change_brief_applications WHERE brief_id='${briefId}'`,
      );
      const reportId = crypto.randomUUID();
      const report = await programme.createManagementReport(caller(OUTSIDE), {
        workspaceId: workspace,
        id: reportId,
        title: "Weekly status",
        language: "en",
        period_start: "2026-11-01",
        period_end: "2026-11-30",
      });
      const facts = report.facts as { risks: { id: string; title: string }[] };
      assert.ok(
        facts.risks.some((r) => r.id === openRisk),
        "an open mission's risk is in the workspace report",
      );
      assert.equal(
        psql(`SELECT mission_scope::text FROM sw_management_reports WHERE id='${reportId}'`),
        `{${mission}}`,
      );
      psql(
        `${asUser(EDITOR)} SET ROLE authenticated; UPDATE sw_missions SET restricted=true WHERE id='${mission}';`,
      );
      const outside = await impact.readImpact(caller(OUTSIDE), workspace);
      assert.ok(!outside.briefs.some((b) => b.id === briefId) && outside.openFlags.length === 0);
      assert.equal(
        await failureCode(impact.getBrief(caller(OUTSIDE), { workspaceId: workspace, briefId })),
        "ACCESS_DENIED",
      );
      const direct = caller(OUTSIDE).supabase;
      assert.deepEqual(
        (await direct.from("sw_review_flags").select("id").eq("id", flagId)).data,
        [],
      );
      assert.deepEqual(
        (await direct.from("sw_change_brief_applications").select("id").eq("brief_id", briefId))
          .data,
        [],
      );
      assert.notEqual(
        await failureCode(
          impact.resolveFlag(caller(OUTSIDE), {
            workspaceId: workspace,
            flagId,
            note: "From outside",
          }),
        ),
        "OK",
      );
      assert.equal(
        (await impact.readImpact(caller(EDITOR), workspace)).openFlags.filter(
          (f) => f.id === flagId,
        ).length,
        1,
        "the outsider resolved nothing",
      );
      // The risk and actions derived from the brief carry the mission's scope
      // (20270329090000): nothing of them reaches the outsider through
      // PostgREST, directly or through what points at them, and nothing can
      // be changed; the circle still works with them.
      const riskId = psql(
        `SELECT risk_id FROM sw_change_brief_applications WHERE brief_id='${briefId}'`,
      );
      for (const [table, column] of [
        ["sw_risks", "id"],
        ["sw_actions", "risk_id"],
        ["sw_evidence_links", "target_id"],
        ["sw_audit_events", "entity_id"],
        ["sw_record_versions", "risk_id"],
      ] as const)
        assert.deepEqual(
          (await direct.from(table).select("id").eq(column, riskId)).data,
          [],
          `${table} reaches the outsider`,
        );
      assert.deepEqual(
        (await direct.from("sw_risks").update({ title: "Outsider" }).eq("id", riskId).select("id"))
          .data,
        [],
        "the outsider changes nothing",
      );
      // Its history stays with it, the links' history included, and the report
      // that drew on it while it was open follows the restriction.
      const linkIds = psql(
        `SELECT string_agg(id::text, ',') FROM sw_evidence_links WHERE target_id='${riskId}' OR target_id IN (SELECT id FROM sw_actions WHERE risk_id='${riskId}')`,
      ).split(",");
      assert.ok(
        linkIds.length > 0 && linkIds[0],
        "fixture: the derived records have evidence links",
      );
      assert.deepEqual(
        (await direct.from("sw_audit_events").select("id").in("entity_id", linkIds)).data,
        [],
        "the evidence links' history does not reach the outsider",
      );
      assert.deepEqual(
        (await direct.from("sw_management_reports").select("id").eq("id", reportId)).data,
        [],
        "the report that drew on the now-restricted mission leaves the outsider",
      );
      assert.equal(
        (
          await caller(EDITOR)
            .supabase.from("sw_management_reports")
            .select("id")
            .eq("id", reportId)
        ).data?.length,
        1,
        "the circle keeps it",
      );
      const later = await programme.createManagementReport(caller(EDITOR), {
        workspaceId: workspace,
        id: crypto.randomUUID(),
        title: "Status after restriction",
        language: "en",
        period_start: "2026-11-01",
        period_end: "2026-11-30",
      });
      assert.ok(
        !(later.facts as { risks: { id: string }[] }).risks.some((r) => r.id === riskId),
        "a new workspace report built inside the circle leaves the restricted risk out",
      );
      assert.equal(
        (await caller(EDITOR).supabase.from("sw_risks").select("title").eq("id", riskId)).data?.[0]
          ?.title,
        "Transport disruption",
        "the circle still reads the derived risk, unchanged",
      );
      psql(
        `${asUser(EDITOR)} SET ROLE authenticated; UPDATE sw_missions SET restricted=false WHERE id='${mission}';`,
      );
      let revision = await impact.reviseBrief(caller(EDITOR), { workspaceId: workspace, briefId });
      assert.equal(revision.evidence_item_ids.length, 2);
      revision = await impact.transitionBrief(caller(EDITOR), {
        workspaceId: workspace,
        briefId: revision.id,
        version: revision.version,
        status: "in_review",
        decisionNote: "",
      });
      await impact.transitionBrief(caller(APPROVER), {
        workspaceId: workspace,
        briefId: revision.id,
        version: revision.version,
        status: "approved",
        decisionNote: "",
      });
      const old = await impact.getBrief(caller(EDITOR), { workspaceId: workspace, briefId });
      assert.equal(old.brief.status, "superseded");
      assert.ok(old.flags.every((f) => f.status === "resolved"));
      assert.equal(old.application?.risk_id !== null, true, "the old application stays on record");
    },
  );
} finally {
  stack.stop();
}
assert.ok(checks >= 8, `only ${checks} checks ran`);
console.log(
  `    ok  ${checks} Release B checks over real PostgreSQL and PostgREST ${stack.tag}; feed transport controlled`,
);
