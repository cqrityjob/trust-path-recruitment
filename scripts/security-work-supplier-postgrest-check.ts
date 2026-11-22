// The supplier cycle's application services over real PostgreSQL and
// PostgREST 14.15, with minted JWTs for real roles: the plan's synthetic pilot
// from the warning to a verified action and a follow-up review, plus the
// boundaries (viewer, another customer, a restricted mission).
//
// Usage: TEST_DB=<*ci_test database with the current schema> PGHOST/PGPORT/PGUSER
//        [DOCKER_HOST_GATEWAY=192.168.5.2 under colima] [SW_PGRST_IMAGE=...:v14.15]
import assert from "node:assert/strict";
import crypto from "node:crypto";
import * as suppliers from "../src/lib/security-work/suppliers/services";
import {
  asUser,
  failureCode,
  psqlFor,
  requireDisposableDb,
  startPostgrest,
} from "./lib/sw-postgrest-harness";

const db = requireDisposableDb();
const psql = psqlFor(db);
const id = (n: number) => `5f000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [OWNER, CHIEF, CISO, CLERK, VIEWER, OTHER, OUTSIDE] = [1, 2, 3, 4, 5, 6, 7].map(id);
psql(`INSERT INTO auth.users(id,email,email_confirmed_at) SELECT ('5f000000-0000-4000-8000-00000000000'||n)::uuid,'sup-pgrst-'||n||'@example.test',now() FROM generate_series(1,7) n;
 INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '5f000000-%';`);
const ws = psql(
  `${asUser(OWNER)} SET ROLE authenticated; SELECT sw_create_personal_workspace('Supplier pilot (synthetic)');`,
)
  .split("\n")
  .pop()!;
const other = psql(
  `${asUser(OTHER)} SET ROLE authenticated; SELECT sw_create_personal_workspace('Other customer (synthetic)');`,
)
  .split("\n")
  .pop()!;
psql(`${asUser(OWNER)} INSERT INTO sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES
 ('${ws}','${CHIEF}','editor',false),('${ws}','${CISO}','editor',true),('${ws}','${CLERK}','editor',false),('${ws}','${VIEWER}','viewer',false),('${ws}','${OUTSIDE}','editor',false);`);

const stack = await startPostgrest(db);
console.log(`    ..  PostgREST image ${stack.image}`);
const { caller } = stack;
let checks = 0;
const check = async (label: string, run: () => Promise<void>) => {
  await run();
  checks += 1;
  console.log(`    ok  SW-SUP-PGRST ${label}`);
};
const op = () => crypto.randomUUID();
const due = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
try {
  let supplier = "";
  let acs = "";
  let action = "";
  let obligation = "";
  let request = "";
  let version = 0;
  const fields = () => ({
    workspaceId: ws,
    actionId: action,
    supplierAssetId: supplier,
    basisKind: "contract_obligation" as const,
    obligationId: obligation,
    basisNote: "",
    changeDecisionId: null,
    internalOwnerId: CHIEF,
    title: "Impact of firmware advisory on our access control",
    task: "Confirm whether firmware 4.2 at our two offices is affected and provide a remediation plan.",
    expectedResult: "Written impact statement and dated plan",
    responseInstruction: "Reply quoting the reference.",
    verificationCriteria: "INTERNAL: versions listed; plan dated; compare with asset register",
    requestedDue: due(5),
    requiresSeparateVerifier: false,
  });

  await check("a supplier, its system and offices, with an unconfirmed impact", async () => {
    const profile = await suppliers.saveProfile(caller(CHIEF), {
      workspaceId: ws,
      assetId: null,
      name: "Passage Systems AB",
      internalOwnerId: CHIEF,
      contactRoute: "support@passage.example.test",
      services: "Access control",
      status: "active",
    });
    supplier = profile.asset_id;
    acs = psql(
      `${asUser(CISO)} SET ROLE authenticated; INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES('${ws}','Access control system','systems') RETURNING id;`,
    )
      .split("\n")
      .pop()!;
    await suppliers.addDependency(caller(CISO), {
      workspaceId: ws,
      fromAssetId: acs,
      toAssetId: supplier,
      relation: "supplied_by",
      sourceNote: "Purchase order 2024",
      confirmed: true,
    });
    const risk = psql(
      `${asUser(CISO)} SET ROLE authenticated; INSERT INTO sw_risks(workspace_id,title) VALUES('${ws}','Firmware flaw in access control') RETURNING id;`,
    )
      .split("\n")
      .pop()!;
    psql(
      `${asUser(CISO)} SET ROLE authenticated; INSERT INTO sw_risk_assets(workspace_id,risk_id,asset_id,impact_status) VALUES('${ws}','${risk}','${acs}','unconfirmed');`,
    );
    action = psql(
      `${asUser(CHIEF)} SET ROLE authenticated; INSERT INTO sw_actions(workspace_id,risk_id,source_kind,title,asset_id) VALUES('${ws}','${risk}','risk','Secure the access control system','${acs}') RETURNING id;`,
    )
      .split("\n")
      .pop()!;
    const detail = await suppliers.getSupplier(caller(VIEWER), {
      workspaceId: ws,
      assetId: supplier,
    });
    assert.equal(
      detail.dependencies[0].confirmed_by,
      CISO,
      "the database stamps who confirmed the relation",
    );
  });
  await check(
    "a contract version and a requirement bind only once an approver confirms them",
    async () => {
      const contract = await suppliers.addContract(caller(CHIEF), {
        workspaceId: ws,
        supplierAssetId: supplier,
        contractKey: "PS-2024-01",
        title: "Service agreement",
        validFrom: null,
        validTo: null,
        documentRef: "DMS 4411",
        summary: "",
      });
      const o = await suppliers.addObligation(caller(CHIEF), {
        workspaceId: ws,
        supplierAssetId: supplier,
        contractId: contract!.id,
        clause: "7.2",
        basisNote: "",
        scope: "Firmware vulnerabilities",
        expectedResult: "Impact statement and plan",
        verificationMethod: "Written statement",
        timeRule: "5 calendar days",
        responseDays: 5,
        completionDays: null,
      });
      obligation = o!.id;
      assert.equal(
        await failureCode(
          suppliers.createRequest(caller(CHIEF), { ...fields(), operationId: op() }),
        ),
        "CONFIRMED_OBLIGATION_REQUIRED",
      );
      assert.equal(
        await failureCode(
          suppliers.verifyContract(caller(CHIEF), { workspaceId: ws, contractId: contract!.id }),
        ),
        "APPROVER_REQUIRED",
        "an editor cannot verify a contract",
      );
      await suppliers.verifyContract(caller(CISO), { workspaceId: ws, contractId: contract!.id });
      await suppliers.changeObligation(caller(CISO), {
        workspaceId: ws,
        obligationId: obligation,
        change: "confirm",
      });
    },
  );
  await check(
    "a draft request on the existing action; a retry creates nothing more; a viewer cannot",
    async () => {
      const operationId = op();
      const created = await suppliers.createRequest(caller(CHIEF), { ...fields(), operationId });
      const again = await suppliers.createRequest(caller(CHIEF), { ...fields(), operationId });
      assert.equal(again.id, created.id);
      request = created.id;
      version = created.version;
      assert.equal(
        psql(`SELECT count(*) FROM sw_supplier_requests WHERE workspace_id='${ws}'`),
        "1",
      );
      assert.equal(
        psql(`SELECT count(*) FROM sw_actions WHERE workspace_id='${ws}'`),
        "1",
        "no second action",
      );
      assert.equal(
        await failureCode(
          suppliers.createRequest(caller(VIEWER), { ...fields(), operationId: op() }),
        ),
        "ACCESS_DENIED",
      );
    },
  );
  await check("only the external sharing right releases an exact, minimised version", async () => {
    assert.equal(
      await failureCode(
        suppliers.approveShare(caller(CHIEF), {
          workspaceId: ws,
          operationId: op(),
          requestId: request,
          version,
          recipient: "Passage support",
          purpose: "Impact statement",
        }),
      ),
      "SHARE_RIGHT_REQUIRED",
    );
    assert.equal(
      await failureCode(
        suppliers.recordDispatch(caller(CLERK), {
          workspaceId: ws,
          operationId: op(),
          requestId: request,
          version,
          channel: "email",
          recipient: "support@passage.example.test",
          sentAt: new Date().toISOString(),
        }),
      ),
      "APPROVED_SHARE_REQUIRED",
    );
    assert.equal(
      await failureCode(
        suppliers.setSharing(caller(CHIEF), { workspaceId: ws, userId: CHIEF, allowed: true }),
      ),
      "OWNER_REQUIRED",
    );
    await suppliers.setSharing(caller(OWNER), { workspaceId: ws, userId: OWNER, allowed: true });
    version = (
      await suppliers.approveShare(caller(OWNER), {
        workspaceId: ws,
        operationId: op(),
        requestId: request,
        version,
        recipient: "Passage support",
        purpose: "Impact statement",
      })
    ).version;
    const detail = await suppliers.getRequest(caller(CLERK), {
      workspaceId: ws,
      requestId: request,
    });
    const content = JSON.stringify(detail.shares[0].content);
    assert.ok(content.includes("LB-") && content.includes("7.2"));
    assert.ok(
      !content.includes("INTERNAL") && !content.toLowerCase().includes("risk"),
      "no internal criteria or risk leave the platform",
    );
  });
  await check(
    "a recorded dispatch, an insufficient answer, a revision and an objection",
    async () => {
      version = (
        await suppliers.recordDispatch(caller(CLERK), {
          workspaceId: ws,
          operationId: op(),
          requestId: request,
          version,
          channel: "email",
          recipient: "support@passage.example.test",
          sentAt: new Date(Date.now() - 864e5).toISOString(),
        })
      ).version;
      let r = await suppliers.recordResponse(caller(CLERK), {
        workspaceId: ws,
        operationId: op(),
        requestId: request,
        version,
        kind: "done",
        authorName: "J. Berg",
        origin: "email",
        body: "We have upgraded.",
        claimedDoneAt: null,
        receivedAt: new Date().toISOString(),
        proposedDue: null,
        evidenceSourceIds: [],
      });
      assert.equal(r.status, "awaiting_verification");
      const first = (
        await suppliers.getRequest(caller(CISO), { workspaceId: ws, requestId: request })
      ).responses[0];
      assert.equal(
        await failureCode(
          suppliers.verifyResponse(caller(CHIEF), {
            workspaceId: ws,
            operationId: op(),
            requestId: request,
            version: r.version,
            responseId: first.id,
            outcome: "accepted",
            criteriaChecked: "x",
            checkedEvidence: "",
            remainingDeviation: "",
          }),
        ),
        "APPROVER_REQUIRED",
      );
      r = await suppliers.verifyResponse(caller(CISO), {
        workspaceId: ws,
        operationId: op(),
        requestId: request,
        version: r.version,
        responseId: first.id,
        outcome: "needs_revision",
        criteriaChecked: "No versions, no dates",
        checkedEvidence: "Mail",
        remainingDeviation: "Impact unknown",
      });
      r = await suppliers.recordResponse(caller(CLERK), {
        workspaceId: ws,
        operationId: op(),
        requestId: request,
        version: r.version,
        kind: "objection",
        authorName: "J. Berg",
        origin: "phone",
        body: "The upgrade is not in the agreement.",
        claimedDoneAt: null,
        receivedAt: new Date().toISOString(),
        proposedDue: due(20),
        evidenceSourceIds: [],
      });
      assert.deepEqual(
        [r.status, r.supplier_proposed_due, r.requested_due],
        ["needs_revision", due(20), due(5)],
      );
      version = r.version;
      const queue = await suppliers.readWorkQueue(caller(CHIEF), ws);
      assert.ok(
        queue.items.some((i) => i.kind === "awaiting_decision" && i.id === request),
        "an objection waits for a decision",
      );
    },
  );
  await check(
    "a scope and cost decision backs a separate order; the action cannot close early",
    async () => {
      assert.equal(
        await failureCode(
          suppliers.recordDecision(caller(CHIEF), {
            workspaceId: ws,
            subjectKind: "supplier_request",
            subjectId: request,
            decision: "scope_cost",
            rationale: "Order it",
            reviewAt: null,
            amount: 48000,
            currency: "SEK",
            costScope: "Upgrade 4.3",
            mandate: "CFO",
          }),
        ),
        "APPROVER_REQUIRED",
      );
      const cost = await suppliers.recordDecision(caller(CISO), {
        workspaceId: ws,
        subjectKind: "supplier_request",
        subjectId: request,
        decision: "scope_cost",
        rationale: "Outside the agreement; order separately",
        reviewAt: null,
        amount: 48000,
        currency: "SEK",
        costScope: "Upgrade 4.3, both offices",
        mandate: "CFO mandate 2026-11",
      });
      await suppliers.recordDecision(caller(CHIEF), {
        workspaceId: ws,
        subjectKind: "action",
        subjectId: action,
        decision: "temporary_protection",
        rationale: "Guards at entrances until verified",
        reviewAt: null,
        amount: null,
        currency: null,
        costScope: null,
        mandate: null,
      });
      const order = await suppliers.createRequest(caller(CHIEF), {
        ...fields(),
        operationId: op(),
        basisKind: "change_order",
        obligationId: null,
        changeDecisionId: cost.id,
        title: "Upgrade order 4.3",
      });
      version = (
        await suppliers.changeDue(caller(CHIEF), {
          workspaceId: ws,
          operationId: op(),
          requestId: request,
          version,
          which: "agreed",
          due: due(15),
          reason: "Agreed by phone",
        })
      ).version;
      const done = await suppliers.recordResponse(caller(CLERK), {
        workspaceId: ws,
        operationId: op(),
        requestId: request,
        version,
        kind: "done",
        authorName: "J. Berg",
        origin: "email",
        body: "4.2 affected at both offices; patched to 4.2.7; report attached.",
        claimedDoneAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        proposedDue: null,
        evidenceSourceIds: [],
      });
      const latest = (
        await suppliers.getRequest(caller(CISO), { workspaceId: ws, requestId: request })
      ).responses.at(-1)!;
      version = (
        await suppliers.verifyResponse(caller(CISO), {
          workspaceId: ws,
          operationId: op(),
          requestId: request,
          version: done.version,
          responseId: latest.id,
          outcome: "accepted",
          criteriaChecked: "Versions listed; patch verified on site",
          checkedEvidence: "Supplier statement; site check",
          remainingDeviation: "",
        })
      ).version;
      const complete = () =>
        psql(
          `${asUser(CISO)} SET ROLE authenticated; UPDATE sw_actions SET status='completed', decision_rationale='Patched and verified', completion_evidence='Verified request' WHERE id='${action}' RETURNING status;`,
        );
      assert.throws(
        complete,
        /SW_SUPPLIER_VERIFICATION_REQUIRED/,
        "the open order blocks completion",
      );
      await suppliers.withdrawRequest(caller(CHIEF), {
        workspaceId: ws,
        operationId: op(),
        requestId: order.id,
        version: order.version,
        reason: "Patch made the upgrade unnecessary",
      });
      assert.equal(complete().split("\n").pop(), "completed");
    },
  );
  await check("figures and a review come from what the reader may see", async () => {
    const detail = await suppliers.getSupplier(caller(CHIEF), {
      workspaceId: ws,
      assetId: supplier,
    });
    assert.equal(detail.verifications.length, 2);
    const review = await suppliers.saveReview(caller(CHIEF), {
      workspaceId: ws,
      supplierAssetId: supplier,
      reviewId: null,
      periodStart: due(-90),
      periodEnd: due(0),
      findings: "First answer lacked evidence",
      decisionsText: "",
      requirementChanges: "Add firmware notification duty",
      nextReviewAt: due(90),
      approve: false,
    });
    assert.equal(
      await failureCode(
        suppliers.saveReview(caller(CHIEF), {
          workspaceId: ws,
          supplierAssetId: supplier,
          reviewId: review.id,
          periodStart: review.period_start,
          periodEnd: review.period_end,
          findings: review.findings,
          decisionsText: "",
          requirementChanges: review.requirement_changes,
          nextReviewAt: review.next_review_at,
          approve: true,
        }),
      ),
      "APPROVER_REQUIRED",
    );
    const approved = await suppliers.saveReview(caller(CISO), {
      workspaceId: ws,
      supplierAssetId: supplier,
      reviewId: review.id,
      periodStart: review.period_start,
      periodEnd: review.period_end,
      findings: review.findings,
      decisionsText: "",
      requirementChanges: review.requirement_changes,
      nextReviewAt: review.next_review_at,
      approve: true,
    });
    assert.equal(approved.approved_by, CISO);
  });
  await check(
    "another customer and an outsider of a restricted mission reach nothing",
    async () => {
      assert.equal(
        await failureCode(
          suppliers.getRequest(caller(OTHER), { workspaceId: ws, requestId: request }),
        ),
        "ACCESS_DENIED",
      );
      assert.equal(
        await failureCode(
          suppliers.getRequest(caller(OTHER), { workspaceId: other, requestId: request }),
        ),
        "NOT_FOUND",
      );
      const direct = caller(OTHER).supabase;
      for (const table of [
        "sw_supplier_requests",
        "sw_supplier_responses",
        "sw_supplier_request_shares",
        "sw_decisions",
        "sw_supplier_contracts",
      ] as const)
        assert.deepEqual(
          (await direct.from(table).select("id").eq("workspace_id", ws)).data,
          [],
          `${table} reaches another customer`,
        );
      const mission = psql(
        `${asUser(CISO)} SET ROLE authenticated; INSERT INTO sw_missions(workspace_id,kind,title,restricted) VALUES('${ws}','monitoring_impact','Board-only dispute',true) RETURNING id;`,
      )
        .split("\n")
        .pop()!;
      const secret = psql(
        `${asUser(CISO)} SET ROLE authenticated; INSERT INTO sw_actions(workspace_id,source_kind,title,access_mission_id) VALUES('${ws}','manual','Confidential escalation','${mission}') RETURNING id;`,
      )
        .split("\n")
        .pop()!;
      const hidden = await suppliers.createRequest(caller(CISO), {
        ...fields(),
        operationId: op(),
        actionId: secret,
        basisKind: "information",
        obligationId: null,
        title: "CONFIDENTIAL escalation",
      });
      assert.equal(
        await failureCode(
          suppliers.getRequest(caller(OUTSIDE), { workspaceId: ws, requestId: hidden.id }),
        ),
        "NOT_FOUND",
      );
      const overview = await suppliers.readSuppliers(caller(OUTSIDE), ws);
      assert.ok(
        !overview.requests.some((r) => r.id === hidden.id),
        "the outsider's lists and counts exclude it",
      );
      assert.ok(
        !(await suppliers.readWorkQueue(caller(OUTSIDE), ws)).items.some((i) => i.id === hidden.id),
      );
      assert.equal(
        await failureCode(
          suppliers.withdrawRequest(caller(OUTSIDE), {
            workspaceId: ws,
            operationId: op(),
            requestId: hidden.id,
            version: 1,
            reason: "x",
          }),
        ),
        "ACCESS_DENIED",
      );
    },
  );
} finally {
  stack.stop();
}
console.log(
  `    ok  ${checks} supplier-cycle checks over real PostgreSQL and PostgREST ${stack.tag}`,
);
