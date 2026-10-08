import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidencePanel } from "../src/components/security-passport/live/EvidencePanel";
import { I18nProvider } from "../src/i18n/context";
import { withdrawAndDeleteEvidence } from "../src/lib/security-passport/evidence-withdrawal";

describe("durable withdrawal and retryable Storage deletion", () => {
  test("a withdrawal rejection never calls Storage or claims success", async () => {
    let removals = 0;
    await assert.rejects(
      withdrawAndDeleteEvidence({
        withdraw: async () => {
          throw new Error("SP_EVIDENCE_UNDER_REVIEW");
        },
        remove: async () => {
          removals++;
          return { failed: false, deleted: true };
        },
        confirmMissing: async () => true,
      }),
      /SP_EVIDENCE_UNDER_REVIEW/,
    );
    assert.equal(removals, 0);
  });

  for (const failure of ["storage-error", "network-error", "unconfirmed-no-op"]) {
    test(`${failure} keeps access withdrawn and exposes pending deletion`, async () => {
      let withdrawn = false;
      const result = await withdrawAndDeleteEvidence({
        withdraw: async () => {
          withdrawn = true;
        },
        remove: async () => {
          if (failure === "network-error") throw new Error("offline");
          return { failed: failure === "storage-error", deleted: false };
        },
        confirmMissing: async () => false,
      });
      assert.equal(withdrawn, true);
      assert.deepEqual(result, { accessWithdrawn: true, fileDeletion: "pending" });
    });
  }

  test("safe retries confirm a deletion or a verified already-missing object", async () => {
    let withdrawn = false;
    let bytes = true;
    const withdraw = async () => {
      withdrawn = true;
    };
    const first = await withdrawAndDeleteEvidence({
      withdraw,
      remove: async () => ({ failed: true, deleted: false }),
      confirmMissing: async () => false,
    });
    assert.equal(first.fileDeletion, "pending");
    const retry = await withdrawAndDeleteEvidence({
      withdraw,
      remove: async () => {
        bytes = false;
        return { failed: false, deleted: true };
      },
      confirmMissing: async () => !bytes,
    });
    const repeated = await withdrawAndDeleteEvidence({
      withdraw,
      remove: async () => ({ failed: false, deleted: false }),
      confirmMissing: async () => !bytes,
    });
    assert.equal(withdrawn, true);
    assert.equal(retry.fileDeletion, "confirmed");
    assert.equal(repeated.fileDeletion, "confirmed");
  });

  test("a failed absence check does not turn a no-op into confirmed deletion", async () => {
    assert.deepEqual(
      await withdrawAndDeleteEvidence({
        withdraw: async () => {},
        remove: async () => ({ failed: false, deleted: false }),
        confirmMissing: async () => {
          throw new Error("permission denied");
        },
      }),
      { accessWithdrawn: true, fileDeletion: "pending" },
    );
  });

  test("withdrawn rows retain a retry after reload and never offer a new view link, SV/EN", () => {
    for (const lang of ["sv", "en"] as const) {
      const html = renderToStaticMarkup(
        <I18nProvider initialLang={lang}>
          <EvidencePanel
            evidence={[
              {
                id: "withdrawn",
                claimId: "claim",
                periodId: null,
                fileName: "synthetic.pdf",
                mimeType: "application/pdf",
                sizeBytes: 25,
                uploadedAt: "2026-10-08",
                lifecycleState: "withdrawn",
              },
            ]}
            canAdd={false}
            canRemove={false}
            onOpen={async () => {}}
            onUpload={async () => {}}
            onWithdraw={async () => ({ accessWithdrawn: true, fileDeletion: "pending" })}
          />
        </I18nProvider>,
      );
      assert.ok(html.includes(lang === "sv" ? "Försök radera filen igen" : "Retry file deletion"));
      assert.ok(html.includes(lang === "sv" ? "ännu inte bekräftad" : "not yet confirmed"));
      assert.ok(!html.includes(lang === "sv" ? ">Öppna<" : ">Open<"));
    }
  });
});
