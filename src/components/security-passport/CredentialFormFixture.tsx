// Dev-harness host for the credential form. Scaffolding, not product.
//
// Wires the pure CredentialForm to fixture taxonomy rows and local state,
// so every behaviour — progressive disclosure, validation, draft save,
// resume, discard — can be exercised and reviewed in a browser with no
// account, no database and no network. What the live route wires to the
// server, this wires to component state and prints back for inspection.

import { useState } from "react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { CredentialDraft } from "@/lib/security-passport/credentials";
import { FIXTURE_CREDENTIAL_TYPES } from "@/lib/security-passport/fixtures/credential-types";
import { CredentialForm } from "./CredentialForm";

export function CredentialFormFixture() {
  const { pt } = usePassportCopy();
  const [saved, setSaved] = useState<(CredentialDraft & { id: string }) | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activated, setActivated] = useState<CredentialDraft | null>(null);
  const [formKey, setFormKey] = useState(0);

  function reset() {
    setSaved(null);
    setSavedAt(null);
    setActivated(null);
    setFormKey((k) => k + 1);
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("cred.add.title")}
        </h2>
        <div className="mt-4">
          <CredentialForm
            key={formKey}
            types={FIXTURE_CREDENTIAL_TYPES}
            initial={saved}
            busy={false}
            serverError={null}
            savedAt={savedAt}
            onSaveDraft={(d) => {
              setSaved({ ...d, id: "fixture-draft" });
              setSavedAt(new Date().toISOString());
              setActivated(null);
            }}
            onActivate={(d) => {
              setActivated(d);
              setSaved(null);
              setSavedAt(null);
            }}
            onDiscard={saved ? reset : undefined}
            onCancel={reset}
          />
        </div>
      </section>

      {activated ? (
        <section className="rounded-xl border border-border bg-secondary/40 p-5">
          <p role="status" className="text-sm font-medium text-foreground">
            {pt("cred.added")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{pt("cred.evidenceNext")}</p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            {JSON.stringify(activated, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
