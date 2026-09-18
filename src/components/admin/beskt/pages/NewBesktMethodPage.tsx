// Creating a BESKT method: the identity, then its first version.
//
// ── TWO CALLS, NOT ONE, AND THAT IS THE CONTRACT ────────────────────────
//
// `beskt_create_method` mints the identity in `scp_interview_packs` with
// `pack_kind = 'beskt_method'` and no role, and its slug, names and purpose
// are immutable from that moment. `beskt_create_method_version` then opens
// the first draft, and refuses a second open version for the same method.
//
// The form runs both, in order, with two operation ids — so a retry after a
// dropped response replays rather than minting a second identity. If the
// second call fails the first is NOT rolled back, because it cannot be: the
// identity exists and the screen says so, sends the reader to the list, and
// the method is picked up from there rather than created twice.
//
// ── WHY THE IMMUTABLE FIELDS ARE SPELLED OUT BEFORE THE FORM ────────────
//
// An editor who discovers after publishing that a typo in a slug is
// permanent has been failed by the screen, not by the contract.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useT } from "@/i18n/context";
import { BesktSurfaceShell, type BesktSurface } from "@/components/admin/beskt/surface";
import { useBesktVersionNavigate } from "@/components/admin/beskt/surface-navigation";
import type { TranslationKey } from "@/i18n/dictionaries";
import { NoticePanel } from "@/components/admin/interview/PackGovernanceUi";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  BESKT_MODES,
  BESKT_PROVENANCE,
  createBesktMethod,
  createBesktMethodVersion,
  type BesktMode,
  type BesktProvenance,
} from "@/lib/beskt/governance.functions";

const INPUT =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const PRIMARY =
  "inline-flex min-h-[44px] items-center rounded-md border border-transparent bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";

export function NewBesktMethodPage({ surface }: { readonly surface: BesktSurface }) {
  const { t } = useT();
  const goToVersion = useBesktVersionNavigate(surface);

  const [slug, setSlug] = useState("");
  const [nameSv, setNameSv] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [purposeSv, setPurposeSv] = useState("");
  const [mode, setMode] = useState<BesktMode>("recruitment_support");
  const [sourceReference, setSourceReference] = useState("");
  const [sourceDocumentVersion, setSourceDocumentVersion] = useState("");
  const [provenance, setProvenance] = useState<BesktProvenance>("cqrity_design_hypothesis");
  const [summarySv, setSummarySv] = useState("");
  const [summaryEn, setSummaryEn] = useState("");

  // Held rather than regenerated, so a retry after a dropped response is
  // answered as a replay instead of minting a second identity.
  const [methodOp] = useState(() => crypto.randomUUID());
  const [versionOp] = useState(() => crypto.randomUUID());
  const [identityCreated, setIdentityCreated] = useState(false);

  const createMethodFn = useServerFn(createBesktMethod);
  const createVersionFn = useServerFn(createBesktMethodVersion);

  const create = useMutation({
    mutationFn: async () => {
      const method = await createMethodFn({
        data: {
          operationId: methodOp,
          slug: slug.trim(),
          nameSv: nameSv.trim(),
          purposeSv: purposeSv.trim(),
          nameEn: nameEn.trim() === "" ? null : nameEn.trim(),
        },
      });
      setIdentityCreated(true);
      return createVersionFn({
        data: {
          operationId: versionOp,
          packId: method.packId,
          mode,
          sourceReference: sourceReference.trim(),
          sourceDocumentVersion: sourceDocumentVersion.trim(),
          contentProvenance: provenance,
          summarySv: summarySv.trim() === "" ? null : summarySv.trim(),
          summaryEn: summaryEn.trim() === "" ? null : summaryEn.trim(),
        },
      });
    },
    onSuccess: (version) => {
      void goToVersion(version.methodVersionId);
    },
  });

  return (
    <BesktSurfaceShell surface={surface}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("beskt.admin.new.heading")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("beskt.admin.new.intro")}
        </p>
      </header>

      <div className="mt-6 space-y-3">
        <NoticePanel tone="attention" title={t("beskt.admin.new.immutableTitle")}>
          <p>{t("beskt.admin.new.immutableBody")}</p>
        </NoticePanel>
        {create.isError && (
          <NoticePanel tone="governance" role="alert" title={t("beskt.admin.actionRefused")}>
            <p>{t(besktErrorKey(create.error))}</p>
            {identityCreated && <p>{t("beskt.admin.new.identityAlreadyCreated")}</p>}
          </NoticePanel>
        )}
      </div>

      <form
        className="mt-6 max-w-3xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <fieldset className="space-y-4 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            {t("beskt.admin.new.identityLegend")}
          </legend>

          <div>
            <label htmlFor="beskt-new-slug" className="text-sm font-medium text-foreground">
              {t("beskt.admin.new.slug")}
              <span className="text-destructive"> *</span>
            </label>
            <input
              id="beskt-new-slug"
              className={INPUT}
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t("beskt.admin.new.slugHelp")}
            </p>
          </div>

          <div>
            <label htmlFor="beskt-new-name-sv" className="text-sm font-medium text-foreground">
              {t("beskt.admin.new.nameSv")}
              <span className="text-destructive"> *</span>
            </label>
            <input
              id="beskt-new-name-sv"
              className={INPUT}
              required
              value={nameSv}
              onChange={(e) => setNameSv(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="beskt-new-name-en" className="text-sm font-medium text-foreground">
              {t("beskt.admin.new.nameEn")}
            </label>
            <input
              id="beskt-new-name-en"
              className={INPUT}
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="beskt-new-purpose" className="text-sm font-medium text-foreground">
              {t("beskt.admin.new.purposeSv")}
              <span className="text-destructive"> *</span>
            </label>
            <textarea
              id="beskt-new-purpose"
              className={INPUT}
              rows={3}
              required
              value={purposeSv}
              onChange={(e) => setPurposeSv(e.target.value)}
            />
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t("beskt.admin.new.purposeHelp")}
            </p>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            {t("beskt.admin.new.versionLegend")}
          </legend>

          <div>
            <label htmlFor="beskt-new-mode" className="text-sm font-medium text-foreground">
              {t("beskt.admin.field.mode")}
            </label>
            <select
              id="beskt-new-mode"
              className={INPUT}
              value={mode}
              onChange={(e) => setMode(e.target.value as BesktMode)}
            >
              {BESKT_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`beskt.admin.value.${m}` as TranslationKey)}
                </option>
              ))}
            </select>
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t("beskt.admin.new.modeHelp")}
            </p>
          </div>

          <div>
            <label htmlFor="beskt-new-source" className="text-sm font-medium text-foreground">
              {t("beskt.admin.field.source_reference")}
              <span className="text-destructive"> *</span>
            </label>
            <input
              id="beskt-new-source"
              className={INPUT}
              required
              value={sourceReference}
              onChange={(e) => setSourceReference(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="beskt-new-docver" className="text-sm font-medium text-foreground">
              {t("beskt.admin.field.source_document_version")}
              <span className="text-destructive"> *</span>
            </label>
            <input
              id="beskt-new-docver"
              className={INPUT}
              required
              value={sourceDocumentVersion}
              onChange={(e) => setSourceDocumentVersion(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="beskt-new-prov" className="text-sm font-medium text-foreground">
              {t("beskt.admin.field.content_provenance")}
            </label>
            <select
              id="beskt-new-prov"
              className={INPUT}
              value={provenance}
              onChange={(e) => setProvenance(e.target.value as BesktProvenance)}
            >
              {BESKT_PROVENANCE.map((p) => (
                <option key={p} value={p}>
                  {t(`beskt.admin.value.${p}` as TranslationKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="beskt-new-sum-sv" className="text-sm font-medium text-foreground">
              {t("beskt.admin.field.summary_sv")}
            </label>
            <textarea
              id="beskt-new-sum-sv"
              className={INPUT}
              rows={2}
              value={summarySv}
              onChange={(e) => setSummarySv(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="beskt-new-sum-en" className="text-sm font-medium text-foreground">
              {t("beskt.admin.field.summary_en")}
            </label>
            <textarea
              id="beskt-new-sum-en"
              className={INPUT}
              rows={2}
              value={summaryEn}
              onChange={(e) => setSummaryEn(e.target.value)}
            />
          </div>
        </fieldset>

        <button type="submit" className={PRIMARY} disabled={create.isPending}>
          {create.isPending ? t("beskt.admin.lifecycle.working") : t("beskt.admin.new.create")}
        </button>
      </form>
    </BesktSurfaceShell>
  );
}
