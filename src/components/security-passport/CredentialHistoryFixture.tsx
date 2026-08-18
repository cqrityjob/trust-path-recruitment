// Dev-harness host for the correction form and version history.
//
// Uses the cred-corrected persona's chain (v1 superseded, v2 current) so a
// reviewer can see exactly what a holder sees after a correction: both
// versions preserved, the current one named, the superseded one visibly
// not current — and the correction form with its trust warning, offline.

import { useState } from "react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { personaById } from "@/lib/security-passport/fixtures/personas";
import type { Claim } from "@/lib/security-passport/types";
import { CredentialCorrectionForm, type CorrectionValues } from "./CredentialCorrectionForm";
import { CredentialVersionHistory, type VersionEntry } from "./CredentialVersionHistory";

export function CredentialHistoryFixture() {
  const { pt } = usePassportCopy();
  const persona = personaById("cred-corrected");
  const [submitted, setSubmitted] = useState<CorrectionValues | null>(null);

  const current = persona.claims.find((c) => c.lifecycleState === "active") as Claim;

  const versions: readonly VersionEntry[] = [...persona.claims]
    .sort((a, b) => b.versionNo - a.versionNo)
    .map((c) => ({
      id: c.id,
      versionNo: c.versionNo,
      credentialCode: c.credentialCode,
      title: c.titleSv,
      issuerName: c.issuerName,
      issuedOn: c.issuedOn,
      validUntil: c.validUntil,
      assertionLevel: c.assertionLevel,
      lifecycleState: c.lifecycleState,
      updatedAt: "2024-01-22T09:00:00Z",
    }));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <CredentialVersionHistory versions={versions} currentId={current.id} />

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {pt("cred.correct.title")}
        </h3>
        <div className="mt-3">
          <CredentialCorrectionForm
            claim={current}
            privateFields={{ credentialReference: "VS-2024-117 (fiktiv)", holderNote: null }}
            busy={false}
            serverError={null}
            onSubmit={setSubmitted}
            onCancel={() => setSubmitted(null)}
          />
        </div>
      </section>

      {submitted ? (
        <section className="rounded-xl border border-border bg-secondary/40 p-5">
          <p role="status" className="text-sm font-medium text-foreground">
            {pt("cred.correct.submit")} ✓
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            {JSON.stringify(submitted, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
