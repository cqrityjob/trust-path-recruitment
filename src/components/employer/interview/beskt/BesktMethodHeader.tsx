// What this conversation is bound to, and what BESKT is not.
//
// Both belong at the top, and for the same reason: an interviewer reading a
// candidate's own words needs to know, without hunting, WHICH governed
// document those words were given against and WHAT the tool in front of them
// does and does not claim.
//
// The digests are collapsed because they are an auditor's fact, not an
// interviewer's. They are one disclosure away rather than absent, because a
// binding nobody can check is not a binding.

import { useT } from "@/i18n/context";
import { Panel, ValidationChip } from "@/components/employer/interview/InterviewUi";
import {
  Digest,
  Fact,
  METHOD_MODE_LABEL,
  RELEASE_SCOPE_LABEL,
  governedText,
} from "./BesktConductUi";

export interface BesktMethodBinding {
  readonly nameSv: string | null;
  readonly nameEn: string | null;
  readonly versionNumber: number | null;
  readonly mode: string | null;
  readonly validationLabel: string | null;
  readonly releaseScope: string | null;
  readonly methodVersionId: string;
  readonly contentHash: string;
  readonly answersContentHash: string;
  readonly responseVersion: number | null;
  readonly linkedAt: string | null;
}

export function BesktMethodHeader({ binding }: { binding: BesktMethodBinding }) {
  const { t, lang } = useT();
  const name = governedText(lang, binding.nameSv, binding.nameEn);
  const modeKey = binding.mode ? METHOD_MODE_LABEL[binding.mode] : undefined;
  const scopeKey = binding.releaseScope ? RELEASE_SCOPE_LABEL[binding.releaseScope] : undefined;

  return (
    <section
      data-testid="beskt-method-header"
      className="rounded-lg border border-border p-4"
      aria-labelledby="beskt-method-h"
    >
      <h2 id="beskt-method-h" className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.method.heading")}
      </h2>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t("beskt.conduct.method.name")}>{name}</Fact>
        <Fact label={t("beskt.conduct.method.version")}>
          {binding.versionNumber === null ? "—" : String(binding.versionNumber)}
        </Fact>
        <Fact label={t("beskt.conduct.method.mode")}>
          {modeKey ? t(modeKey) : (binding.mode ?? "—")}
        </Fact>
        <Fact label={t("beskt.conduct.method.releaseScope")}>
          {scopeKey ? t(scopeKey) : (binding.releaseScope ?? "—")}
        </Fact>
      </dl>

      {/* The validation claim, in the product's own governed wording. A method
          may be published and still be an unvalidated hypothesis, and a
          recruiter is entitled to know which this one is. */}
      {binding.validationLabel && (
        <p className="mt-3">
          <ValidationChip label={binding.validationLabel} />
        </p>
      )}

      <details className="mt-4 rounded-md border border-border p-3">
        <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-medium text-foreground">
          {t("beskt.conduct.method.binding")}
        </summary>
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
          {t("beskt.conduct.method.bindingNote")}
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Fact label={t("beskt.conduct.method.contentHash")}>
            <Digest value={binding.contentHash} />
          </Fact>
          <Fact label={t("beskt.conduct.method.answersHash")}>
            <Digest value={binding.answersContentHash} />
          </Fact>
          <Fact label={t("beskt.conduct.method.methodVersionId")}>
            <Digest value={binding.methodVersionId} />
          </Fact>
          <Fact label={t("beskt.conduct.method.responseVersion")}>
            {binding.responseVersion === null ? "—" : String(binding.responseVersion)}
          </Fact>
          {binding.linkedAt && (
            <Fact label={t("beskt.conduct.method.linkedAt")}>
              {new Date(binding.linkedAt).toISOString().slice(0, 10)}
            </Fact>
          )}
        </dl>
      </details>
    </section>
  );
}

/**
 * What BESKT is, and the list of things it is not.
 *
 * Said in full, on the working surface, rather than buried in a help page:
 * every item in the second sentence is something a structured interview tool
 * is routinely assumed to do, and the assumption is what this product exists
 * to refuse.
 */
export function BesktLimitsPanel() {
  const { t } = useT();
  return (
    <Panel tone="neutral" title={t("beskt.conduct.limits.heading")}>
      <p>{t("beskt.conduct.limits.is")}</p>
      <p>{t("beskt.conduct.limits.isNot")}</p>
    </Panel>
  );
}
