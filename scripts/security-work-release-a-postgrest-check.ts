// Security Work Release A over a REAL database and REAL PostgREST 14.15:
// operating profile, role focus, missions (need-to-know, lifecycle, links,
// ownership), collaboration (invitations, roles). The application's own
// services run unchanged against PostgREST with locally minted user JWTs.
// Synthetic data only; nothing external is contacted.
//
// Usage: TEST_DB=<*ci_test database with the current schema> PGHOST/PGPORT/PGUSER
//        [DOCKER_HOST_GATEWAY=192.168.5.2 under colima] [SW_PGRST_IMAGE=...:v14.15]
//        bun run <this file>
import assert from "node:assert/strict";
import cp from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { PostgrestClient } from "@supabase/postgrest-js";
import * as collaboration from "../src/lib/security-work/collaboration/services";
import * as missions from "../src/lib/security-work/missions/services";
import * as context from "../src/lib/security-work/operating-context/services";
import { emptyProfile } from "../src/lib/security-work/operating-context/schema";
import type { SecurityWorkCaller } from "../src/lib/security-work/services";
import { POSTGREST_14_IMAGE, ensurePinnedImage } from "./registry-image-retry.mjs";

const db = process.env.TEST_DB ?? "";
if (!/ci_test/.test(db)) throw new Error("TEST_DB must name a disposable *ci_test database");
if (!["127.0.0.1", "localhost", undefined].includes(process.env.PGHOST))
  throw new Error("REFUSING: local disposable database only");

const ids = Array.from(
  { length: 12 },
  (_, i) => `59000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const [OWNER, EDITOR, VIEWER, INVITEE, OUTSIDER, CIRCLE] = ids;
const psql = (sql: string) =>
  cp
    .execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-d", db, "-c", sql], {
      encoding: "utf8",
    })
    .trim();
const as = (uid: string) =>
  `SET request.jwt.claim.sub='${uid}'; SET request.jwt.claims='{"sub":"${uid}","role":"authenticated","is_anonymous":false}';`;

psql(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('${OWNER}','ra-owner@example.test',now()),('${EDITOR}','ra-editor@example.test',now()),('${VIEWER}','ra-viewer@example.test',now()),
 ('${INVITEE}','ra-invitee@example.test',now()),('${OUTSIDER}','ra-outsider@example.test',now()),('${CIRCLE}','ra-circle@example.test',now());
 INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '59000000-%';`);
const workspace = psql(
  `${as(OWNER)} SET ROLE authenticated; SELECT sw_create_personal_workspace('Release A PostgREST workspace');`,
)
  .split("\n")
  .pop()!;
psql(`${as(OWNER)}
 INSERT INTO sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES
  ('${workspace}','${EDITOR}','editor',false),('${workspace}','${VIEWER}','viewer',false),('${workspace}','${CIRCLE}','editor',false);
 SET ROLE authenticated;
 INSERT INTO sw_security_mandates(workspace_id,organisation_description) VALUES('${workspace}','Synthetic logistics company');
 INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES('${workspace}','Terminal Gothenburg','operations');`);
const asset = psql(`SELECT id FROM sw_protected_assets WHERE workspace_id='${workspace}'`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sw-ra-pgrst-"));
const jwtSecret = crypto.randomBytes(48).toString("hex");
psql(
  `CREATE OR REPLACE FUNCTION public.sw_pgrst_test_request() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub',coalesce(current_setting('request.jwt.claims',true)::jsonb->>'sub',''),true) $$;`,
);
const envfile = path.join(tmp, "postgrest.env");
fs.writeFileSync(
  envfile,
  `PGRST_DB_URI=postgresql://${encodeURIComponent(process.env.PGUSER ?? "postgres")}:${encodeURIComponent(process.env.PGPASSWORD ?? "")}@host.docker.internal:${process.env.PGPORT ?? 5432}/${db}\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_DB_PRE_REQUEST=public.sw_pgrst_test_request\nPGRST_JWT_SECRET=${jwtSecret}\nPGRST_SERVER_PORT=3000\nPGRST_LOG_LEVEL=error\n`,
  { mode: 0o600 },
);
// CI (linux/amd64) runs the pinned digest; a local arm64 machine may name the same tag.
const image = process.env.SW_PGRST_IMAGE?.endsWith(`:${POSTGREST_14_IMAGE.tag}`)
  ? { ref: process.env.SW_PGRST_IMAGE }
  : await ensurePinnedImage(POSTGREST_14_IMAGE);
console.log(`    ..  PostgREST image ${image.ref}`);
const port = await new Promise<number>((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const value = (server.address() as net.AddressInfo).port;
    server.close(() => resolve(value));
  });
});
const container = `sw-release-a-pgrst-${process.pid}`;
cp.execFileSync(
  "docker",
  [
    "run",
    "-d",
    "--rm",
    "--name",
    container,
    "--env-file",
    envfile,
    "--add-host",
    `host.docker.internal:${process.env.DOCKER_HOST_GATEWAY ?? "host-gateway"}`,
    "-p",
    `127.0.0.1:${port}:3000`,
    image.ref,
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
const origin = `http://127.0.0.1:${port}`;
let checks = 0;
try {
  for (let n = 0; ; n++) {
    try {
      if ((await fetch(origin)).status === 200) break;
    } catch {
      /* not up yet */
    }
    if (n > 150) throw new Error("PostgREST did not start");
    await new Promise((r) => setTimeout(r, 200));
  }
  const token = (uid: string) => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: uid, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 })}`;
    return `${body}.${crypto.createHmac("sha256", jwtSecret).update(body).digest("base64url")}`;
  };
  const caller = (uid: string) =>
    ({
      supabase: new PostgrestClient(origin, { headers: { Authorization: `Bearer ${token(uid)}` } }),
      userId: uid,
    }) as unknown as SecurityWorkCaller;
  const code = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return "OK";
    } catch (error) {
      return (error as { code?: string }).code ?? String(error);
    }
  };
  const check = async (label: string, run: () => Promise<void>) => {
    await run();
    checks += 1;
    console.log(`    ok  SW-RA-PGRST ${label}`);
  };

  // ---- operating profile -------------------------------------------------
  await check("prefill is offered from the mandate and asset register, unconfirmed", async () => {
    const read = await context.readOperatingContext(caller(EDITOR), workspace);
    assert.equal(read.current, null);
    assert.equal(read.prefill.profile.organisationDescription, "Synthetic logistics company");
    assert.deepEqual(read.prefill.profile.criticalServices, ["Terminal Gothenburg"]);
    assert.equal(read.prefill.provenance.organisationDescription?.confirmed, false);
  });
  await check("saving keeps only confirmed prefill and stamps who confirmed it", async () => {
    const read = await context.readOperatingContext(caller(EDITOR), workspace);
    const profile = { ...emptyProfile(), ...read.prefill.profile, countries: ["SE"] };
    const provenance = {
      ...read.prefill.provenance,
      organisationDescription: { origin: "mandate" as const, confirmed: true },
      countries: { origin: "user" as const, confirmed: true },
    };
    const saved = await context.saveOperatingProfile(caller(EDITOR), {
      workspaceId: workspace,
      expectedVersion: 0,
      profile,
      provenance,
      changeNote: "",
    });
    assert.equal(saved.version, 1);
    const stored = JSON.parse(
      psql(
        `SELECT json_build_object('p',profile,'v',provenance) FROM sw_operating_profiles WHERE workspace_id='${workspace}' AND profile_version=1`,
      ),
    );
    assert.equal(stored.p.organisationDescription, "Synthetic logistics company");
    assert.deepEqual(stored.p.criticalServices, [], "unconfirmed prefill was dropped");
    assert.equal(stored.v.organisationDescription.confirmedBy, EDITOR);
  });
  await check("a stale starting version is CONFLICT; a viewer cannot save", async () => {
    const input = {
      workspaceId: workspace,
      expectedVersion: 0,
      profile: emptyProfile(),
      provenance: {},
      changeNote: "",
    };
    assert.equal(await code(context.saveOperatingProfile(caller(EDITOR), input)), "CONFLICT");
    assert.equal(
      await code(context.saveOperatingProfile(caller(VIEWER), { ...input, expectedVersion: 1 })),
      "ACCESS_DENIED",
    );
    assert.equal(
      psql(`SELECT count(*) FROM sw_operating_profiles WHERE workspace_id='${workspace}'`),
      "1",
    );
  });
  await check(
    "role focus is one's own row: insert, then update, under the column grant",
    async () => {
      await context.savePreference(caller(VIEWER), { workspaceId: workspace, roleFocus: "ciso" });
      await context.savePreference(caller(VIEWER), {
        workspaceId: workspace,
        roleFocus: "coordinator",
      });
      assert.equal(
        (await context.readOperatingContext(caller(VIEWER), workspace)).roleFocus,
        "coordinator",
      );
      assert.equal(
        (await context.readOperatingContext(caller(EDITOR), workspace)).roleFocus,
        "combined",
      );
    },
  );

  // ---- missions -----------------------------------------------------------
  let restricted = "";
  await check("an editor creates a restricted mission recording the profile version", async () => {
    const mission = await missions.createMission(caller(EDITOR), {
      workspaceId: workspace,
      kind: "risk_assessment",
      title: "Restricted site risk",
      restricted: true,
      brief: { decision: "Budget", scope: "Terminal" },
    });
    restricted = mission.id;
    assert.equal(mission.operating_profile_version, 1);
    assert.equal(mission.owner_id, EDITOR);
  });
  await check(
    "need-to-know: absent from the list and unavailable for non-members, owner included",
    async () => {
      for (const uid of [VIEWER, OWNER, CIRCLE]) {
        assert.equal(
          (await missions.listMissions(caller(uid), workspace)).some((m) => m.id === restricted),
          false,
        );
        assert.equal(
          await code(
            missions.getMission(caller(uid), { workspaceId: workspace, missionId: restricted }),
          ),
          "ACCESS_DENIED",
        );
      }
    },
  );
  await check("links resolve through the caller's RLS; history records each change", async () => {
    await missions.addMissionLink(caller(EDITOR), {
      workspaceId: workspace,
      missionId: restricted,
      targetKind: "asset",
      targetId: asset,
      note: "",
    });
    const detail = await missions.getMission(caller(EDITOR), {
      workspaceId: workspace,
      missionId: restricted,
    });
    assert.equal(detail.links[0]?.title, "Terminal Gothenburg");
    assert.ok(detail.events.some((e) => e.event === "link_added"));
  });
  await check(
    "ready needs a complete brief; a stale version is CONFLICT; running is not a human step",
    async () => {
      let mission = (
        await missions.getMission(caller(EDITOR), { workspaceId: workspace, missionId: restricted })
      ).mission;
      assert.equal(
        await code(
          missions.transitionMission(caller(EDITOR), {
            workspaceId: workspace,
            missionId: restricted,
            version: mission.version,
            executionState: "running",
          }),
        ),
        "INVALID_INPUT",
      );
      mission = await missions.updateMission(caller(EDITOR), {
        workspaceId: workspace,
        missionId: restricted,
        version: mission.version,
        brief: { decision: "Budget", scope: "Terminal", horizon: "12 months" },
      });
      assert.equal(
        await code(
          missions.updateMission(caller(EDITOR), {
            workspaceId: workspace,
            missionId: restricted,
            version: mission.version - 1,
            nextAction: "x",
          }),
        ),
        "CONFLICT",
      );
      mission = await missions.transitionMission(caller(EDITOR), {
        workspaceId: workspace,
        missionId: restricted,
        version: mission.version,
        executionState: "ready",
      });
      mission = await missions.transitionMission(caller(EDITOR), {
        workspaceId: workspace,
        missionId: restricted,
        version: mission.version,
        executionState: "needs_review",
        reviewState: "in_review",
      });
      assert.equal(
        await code(
          missions.transitionMission(caller(EDITOR), {
            workspaceId: workspace,
            missionId: restricted,
            version: mission.version,
            executionState: "completed",
          }),
        ),
        "INVALID_INPUT",
      );
      // Accepting a review is an approval (20270329090000): the editor, who
      // may not approve, is refused; an approver admitted to the circle accepts.
      assert.equal(
        await code(
          missions.transitionMission(caller(EDITOR), {
            workspaceId: workspace,
            missionId: restricted,
            version: mission.version,
            reviewState: "accepted",
          }),
        ),
        "ACCESS_DENIED",
      );
      await missions.setMissionMember(caller(EDITOR), {
        workspaceId: workspace,
        missionId: restricted,
        userId: OWNER,
        member: true,
      });
      mission = await missions.transitionMission(caller(OWNER), {
        workspaceId: workspace,
        missionId: restricted,
        version: mission.version,
        reviewState: "accepted",
      });
      mission = await missions.transitionMission(caller(EDITOR), {
        workspaceId: workspace,
        missionId: restricted,
        version: mission.version,
        executionState: "completed",
      });
      assert.equal(mission.execution_state, "completed");
    },
  );
  await check(
    "a circle member cannot take ownership or admit others; the owner can transfer",
    async () => {
      const open = await missions.createMission(caller(EDITOR), {
        workspaceId: workspace,
        kind: "monitoring_impact",
        title: "Circle test",
        restricted: true,
        brief: {},
      });
      await missions.setMissionMember(caller(EDITOR), {
        workspaceId: workspace,
        missionId: open.id,
        userId: CIRCLE,
        member: true,
      });
      const seen = (
        await missions.getMission(caller(CIRCLE), { workspaceId: workspace, missionId: open.id })
      ).mission;
      assert.equal(
        await code(
          missions.updateMission(caller(CIRCLE), {
            workspaceId: workspace,
            missionId: open.id,
            version: seen.version,
            ownerId: CIRCLE,
          }),
        ),
        "ACCESS_DENIED",
      );
      assert.equal(
        await code(
          missions.setMissionMember(caller(CIRCLE), {
            workspaceId: workspace,
            missionId: open.id,
            userId: VIEWER,
            member: true,
          }),
        ),
        "ACCESS_DENIED",
      );
      const transferred = await missions.updateMission(caller(EDITOR), {
        workspaceId: workspace,
        missionId: open.id,
        version: seen.version,
        ownerId: CIRCLE,
      });
      assert.equal(transferred.owner_id, CIRCLE);
      await missions.setMissionMember(caller(CIRCLE), {
        workspaceId: workspace,
        missionId: open.id,
        userId: VIEWER,
        member: true,
      });
      assert.ok(
        (await missions.listMissions(caller(VIEWER), workspace)).some((m) => m.id === open.id),
      );
    },
  );

  // ---- collaboration -------------------------------------------------------
  let code64 = "";
  await check("an owner invites; the code is returned once; an editor cannot invite", async () => {
    const requestId = crypto.randomUUID();
    const created = await collaboration.createInvitation(caller(OWNER), {
      workspaceId: workspace,
      requestId,
      email: "RA-Invitee@Example.test",
      role: "editor",
      canApprove: false,
    });
    assert.match(created.code ?? "", /^[0-9a-f]{64}$/);
    code64 = created.code!;
    const retry = await collaboration.createInvitation(caller(OWNER), {
      workspaceId: workspace,
      requestId,
      email: "ra-invitee@example.test",
      role: "editor",
      canApprove: false,
    });
    assert.equal(retry.code, null);
    assert.equal(
      await code(
        collaboration.createInvitation(caller(EDITOR), {
          workspaceId: workspace,
          requestId: crypto.randomUUID(),
          email: "x@example.test",
          role: "viewer",
          canApprove: false,
        }),
      ),
      "ACCESS_DENIED",
    );
    const team = await collaboration.readTeam(caller(OWNER), workspace);
    assert.equal(team.invitations?.length, 1);
    assert.equal((await collaboration.readTeam(caller(EDITOR), workspace)).invitations, null);
  });
  await check(
    "only the invited account can accept; it becomes exactly what was offered",
    async () => {
      assert.equal(
        await code(collaboration.acceptInvitation(caller(OUTSIDER), { code: code64 })),
        "ACCESS_DENIED",
      );
      assert.equal(
        (await collaboration.acceptInvitation(caller(INVITEE), { code: code64 })).workspaceId,
        workspace,
      );
      assert.equal(
        psql(
          `SELECT role||'|'||active||'|'||can_approve FROM sw_workspace_memberships WHERE workspace_id='${workspace}' AND user_id='${INVITEE}'`,
        ),
        "editor|true|false",
      );
      assert.equal(
        (await missions.listMissions(caller(INVITEE), workspace)).some((m) => m.restricted),
        false,
      );
    },
  );
  await check("deactivation ends access at once; the last owner cannot step down", async () => {
    await collaboration.setMemberRole(caller(OWNER), {
      workspaceId: workspace,
      userId: VIEWER,
      role: "viewer",
      canApprove: false,
      active: false,
    });
    assert.equal(await code(missions.listMissions(caller(VIEWER), workspace)), "ACCESS_DENIED");
    assert.equal(
      await code(
        collaboration.setMemberRole(caller(OWNER), {
          workspaceId: workspace,
          userId: OWNER,
          role: "editor",
          canApprove: true,
          active: true,
        }),
      ),
      "INVALID_INPUT",
    );
    assert.equal(
      await code(
        collaboration.setMemberRole(caller(EDITOR), {
          workspaceId: workspace,
          userId: EDITOR,
          role: "owner",
          canApprove: true,
          active: true,
        }),
      ),
      "ACCESS_DENIED",
    );
  });
} finally {
  try {
    cp.execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  } catch {
    /* already gone */
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
assert.ok(checks >= 12, `only ${checks} checks ran`);
console.log(
  `    ok  ${checks} Release A checks over real PostgreSQL and PostgREST ${POSTGREST_14_IMAGE.tag}`,
);
