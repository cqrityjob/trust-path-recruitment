// Security Passport — a credential's versions, oldest facts preserved.
//
// Corrections never delete: the superseded version stays, marked as what
// it is, and this list shows the whole chain newest-first. The current
// version is named as current; every older one carries the superseded
// treatment, so a reader can see what changed and when without any version
// ever looking like the live record.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatDate, formatExpiry } from "@/lib/security-passport/format";
import { credentialPresentationOf } from "@/lib/security-passport/trust-presentation";
import type { AssertionLevel, LifecycleState } from "@/lib/security-passport/types";
import { AssertionChip } from "./AssertionChip";
import { CredentialSymbol } from "./CredentialSymbol";
import { LifecycleChip } from "./LifecycleChip";

export interface VersionEntry {
  readonly id: string;
  readonly versionNo: number;
  readonly credentialCode: string | null;
  readonly title: string;
  readonly issuerName: string | null;
  readonly issuedOn: string | null;
  readonly validUntil: string | null;
  readonly assertionLevel: string;
  readonly lifecycleState: string;
  /** Who decided this version, and how. Optional so the fixture prototype
   *  can omit them; absent reads as a credential nobody has attributed,
   *  which is the fail-closed answer. */
  readonly verifierName?: string | null;
  readonly verificationMethod?: string | null;
  readonly updatedAt: string;
}

export function CredentialVersionHistory({
  versions,
  currentId,
}: {
  versions: readonly VersionEntry[];
  currentId: string;
}) {
  const { pt, lang } = usePassportCopy();
  if (versions.length <= 1) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold tracking-tight text-foreground">
        {pt("cred.versions.title")}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {pt("cred.versions.lead")}
      </p>

      <ol className="mt-4 space-y-3">
        {versions.map((v) => {
          const isCurrent = v.id === currentId && v.lifecycleState !== "superseded";
          return (
            <li
              key={v.id}
              aria-current={isCurrent ? "true" : undefined}
              className={
                isCurrent
                  ? "rounded-lg border border-accent/60 bg-accent/5 p-4"
                  : "rounded-lg border border-border p-4"
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <span className="flex min-w-0 items-center gap-3">
                  <CredentialSymbol
                    code={v.credentialCode}
                    state={credentialPresentationOf(v, v.lifecycleState as LifecycleState)}
                    name={v.title}
                    size={36}
                    className="shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {pt("claims.version")} {v.versionNo}
                      {isCurrent ? (
                        <span className="ml-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
                          {pt("cred.versions.current")}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-foreground">{v.title}</span>
                    {v.issuerName ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {v.issuerName}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  {/* The lifecycle AND the provenance: a superseded version is
                      past, and a version CQrityjob reviewed is documented. Without
                      both, this list printed the present-tense VERIFIERAD beside
                      "Ersatt" and beside a header that said Dokumenterad. */}
                  <AssertionChip
                    level={v.assertionLevel as AssertionLevel}
                    lifecycleState={v.lifecycleState}
                    provenance={v}
                    size="sm"
                  />
                  <LifecycleChip state={v.lifecycleState as LifecycleState} />
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {pt("claims.issuedOn")}
                  </dt>
                  <dd className="text-sm tabular-nums text-foreground">
                    {formatDate(v.issuedOn, lang)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {pt("claims.validUntil")}
                  </dt>
                  <dd className="text-sm tabular-nums text-foreground">
                    {formatExpiry(v.validUntil, lang)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {pt("cred.versions.recordedAt")}
                  </dt>
                  <dd className="text-sm tabular-nums text-foreground">
                    {v.updatedAt.slice(0, 10)}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
