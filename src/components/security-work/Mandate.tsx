import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  saveSecurityMandate,
  saveSecurityMandateDocument,
} from "@/lib/security-work/programme/programme.functions";
import type { Mandate } from "@/lib/security-work/programme/types";
import { mandateComplete } from "@/lib/security-work/programme/rules";
import { useSecurityWorkspace } from "./context";
import { SaveStatus, useSavedOperation, useWorkText } from "./analysis-ui";
import { EvidenceLinks, Explain, Tag, programmeKey, useProgramme } from "./programme-ui";
import { AssistantButton, useAssistantContext } from "./SecurityAssistant";
import {
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  panelClass,
  useUnsavedWarning,
} from "./ui";

type Form = {
  organisation_description: string;
  security_mission: string;
  reporting_line: string;
  key_stakeholders: string;
  decision_authority: string;
  risk_acceptance_authority: string;
  geographic_scope: string;
  key_requirements: string;
  review_date: string;
};
const empty: Form = {
  organisation_description: "",
  security_mission: "",
  reporting_line: "",
  key_stakeholders: "",
  decision_authority: "",
  risk_acceptance_authority: "",
  geographic_scope: "",
  key_requirements: "",
  review_date: "",
};
const fromRow = (mandate: Mandate | null): Form =>
  mandate
    ? {
        organisation_description: mandate.organisation_description,
        security_mission: mandate.security_mission,
        reporting_line: mandate.reporting_line,
        key_stakeholders: mandate.key_stakeholders,
        decision_authority: mandate.decision_authority,
        risk_acceptance_authority: mandate.risk_acceptance_authority,
        geographic_scope: mandate.geographic_scope,
        key_requirements: mandate.key_requirements,
        review_date: mandate.review_date ?? "",
      }
    : empty;

/** Mission & Mandate: five to ten minutes, essential fields only. The
 * summary ("Your Security Mandate") is shown once the essentials exist. */
export function SecurityMandatePage() {
  const { t, lang } = useT();
  const l = useWorkText();
  const { workspace, user, canEdit } = useSecurityWorkspace();
  const programme = useProgramme();
  const queryClient = useQueryClient();
  const save = useServerFn(saveSecurityMandate);
  const saveDocument = useServerFn(saveSecurityMandateDocument);
  const op = useSavedOperation();
  const mandate = programme.data?.mandate ?? null;
  const [form, setForm] = useState<Form>(empty);
  const [document, setDocument] = useState("");
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const clearWarning = useUnsavedWarning(dirty);
  useEffect(() => {
    if (programme.data && mandate?.version !== loadedVersion && !dirty) {
      setForm(fromRow(mandate));
      setDocument(mandate?.mandate_document ?? "");
      setLoadedVersion(mandate?.version ?? null);
    }
  }, [programme.data, mandate, loadedVersion, dirty]);
  useAssistantContext({
    kind: "mandate",
    id: mandate?.id ?? null,
    title: t("sw.prog.nav.mandate"),
    apply: mandate ? { mandateVersion: mandate.version } : undefined,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: programmeKey(user.id, workspace.id) });
  const patch = (value: Partial<Form>) => {
    setForm((old) => ({ ...old, ...value }));
    setDirty(true);
    op.clear();
  };
  const persist = async (status: "draft" | "confirmed") => {
    const saved = await op.run(() =>
      save({
        data: {
          workspaceId: workspace.id,
          version: mandate?.version ?? null,
          ...form,
          review_date: form.review_date || null,
          status,
        },
      }),
    );
    if (saved) {
      setDirty(false);
      clearWarning();
      setLoadedVersion(saved.version);
      await refresh();
    }
  };
  if (programme.isPending) return <LoadingState />;
  if (programme.isError)
    return <WorkError code={programme.error.message} onRetry={() => void programme.refetch()} />;
  const complete = mandateComplete(mandate);
  const fields: [keyof Form, string, string, number][] = [
    [
      "organisation_description",
      l("Verksamheten", "The organisation"),
      l(
        "Vad gör organisationen, var och för vem? Två–fyra meningar räcker.",
        "What does the organisation do, where and for whom? Two to four sentences.",
      ),
      8000,
    ],
    [
      "security_mission",
      l("Säkerhetsuppdraget", "Security mission"),
      l(
        "Vad förväntas säkerhetsfunktionen skydda eller möjliggöra?",
        "What is the security function expected to protect or enable?",
      ),
      8000,
    ],
    [
      "reporting_line",
      l("Rapporteringsväg", "Reporting line"),
      l("Till vem rapporterar säkerhetsfunktionen?", "Whom does the security function report to?"),
      2000,
    ],
    [
      "key_stakeholders",
      l("Nyckelintressenter", "Key stakeholders"),
      l(
        "HR, IT/CISO, fastighet, juridik, inköp, verksamhetschefer …",
        "HR, IT/CISO, facilities, legal, procurement, line managers …",
      ),
      4000,
    ],
    [
      "decision_authority",
      l("Beslutsmandat", "Decision authority"),
      l(
        "Vilka beslut får säkerhetsfunktionen fatta själv?",
        "Which decisions may the security function take on its own?",
      ),
      4000,
    ],
    [
      "risk_acceptance_authority",
      l("Riskacceptans", "Risk acceptance authority"),
      l(
        "Vem får acceptera risk, och på vilka nivåer?",
        "Who may accept risk, and at which levels?",
      ),
      4000,
    ],
    [
      "geographic_scope",
      l("Geografiskt omfång", "Geographic scope"),
      l(
        "Länder, orter eller anläggningar som omfattas.",
        "Countries, sites or facilities in scope.",
      ),
      2000,
    ],
    [
      "key_requirements",
      l("Viktiga krav från kunder och myndigheter", "Key regulatory and customer requirements"),
      l(
        "Krav som ni själva vet påverkar säkerhetsarbetet. Inga automatiska slutsatser görs.",
        "Requirements you know affect the security work. Nothing is concluded automatically.",
      ),
      8000,
    ],
  ];
  return (
    <>
      <PageHeading
        title={t("sw.prog.nav.mandate")}
        body={l(
          "Fem till tio minuter. Skriv kort; det här är grunden som allt annat bygger på.",
          "Five to ten minutes. Keep it short; this is the foundation everything else builds on.",
        )}
        action={<AssistantButton />}
      />
      {complete && mandate && (
        <section className={`${panelClass} space-y-3`} data-testid="sw-mandate-summary">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">
              {l("Ert säkerhetsuppdrag", "Your Security Mandate")}
            </h2>
            <Tag tone={mandate.status === "confirmed" ? "good" : "neutral"}>
              {mandate.status === "confirmed" ? l("Bekräftat", "Confirmed") : l("Utkast", "Draft")}
            </Tag>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {fields.slice(1, 7).map(([key, label]) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words">{form[key] || "—"}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {l("Granskas", "Review date")}
              </dt>
              <dd className="mt-0.5">{form.review_date || "—"}</dd>
            </div>
          </dl>
          {mandate.mandate_document && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {l("Uppdragstext", "Mandate text")}{" "}
                {(mandate.document_provenance as { origin?: string }).origin === "ai_suggestion"
                  ? `· ${l("AI-utkast godkänt av dig", "AI draft approved by you")}`
                  : `· ${l("Skriven av er", "Written by you")}`}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {mandate.mandate_document}
              </p>
            </div>
          )}
          <EvidenceLinks
            targetKind="mandate"
            targetId={mandate.id}
            links={programme.data.evidenceLinks}
            onChanged={() => void refresh()}
          />
        </section>
      )}
      <form
        className={`${panelClass} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          if (canEdit && op.state !== "saving")
            void persist(mandate?.status === "confirmed" ? "confirmed" : "draft");
        }}
      >
        <fieldset disabled={!canEdit || op.state === "saving"} className="space-y-4">
          {fields.map(([key, label, hint, max]) =>
            key === "reporting_line" || key === "geographic_scope" ? (
              <TextField
                key={key}
                label={label}
                hint={hint}
                value={form[key]}
                maxLength={max}
                onChange={(e) => patch({ [key]: e.target.value })}
              />
            ) : (
              <TextAreaField
                key={key}
                label={label}
                hint={hint}
                value={form[key]}
                maxLength={max}
                onChange={(e) => patch({ [key]: e.target.value })}
              />
            ),
          )}
          <TextField
            type="date"
            label={l("Granskningsdatum", "Review date")}
            hint={l(
              "När ska uppdraget ses över nästa gång?",
              "When should the mandate be reviewed next?",
            )}
            value={form.review_date}
            onChange={(e) => patch({ review_date: e.target.value })}
          />
        </fieldset>
        <WorkError
          code={op.error}
          onRetry={op.error === "CONFLICT" ? () => window.location.reload() : undefined}
        />
        <div className="flex flex-wrap items-center gap-3">
          <WorkButton type="submit" disabled={!canEdit || op.state === "saving"}>
            {l("Spara", "Save")}
          </WorkButton>
          {canEdit && mandate && complete && mandate.status !== "confirmed" && (
            <WorkButton
              type="button"
              variant="outline"
              disabled={op.state === "saving"}
              onClick={() => void persist("confirmed")}
            >
              {l("Spara och bekräfta uppdraget", "Save and confirm the mandate")}
            </WorkButton>
          )}
          <SaveStatus state={op.state} />
        </div>
      </form>
      {mandate && (
        <section className={`${panelClass} space-y-3`}>
          <h2 className="font-display text-lg font-semibold">
            {l("Uppdragstext", "Mandate text")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {l(
              "Skriv själv, eller be Security AI om ett utkast. Ett AI-utkast blir uppdragstext först när du godkänner det.",
              "Write it yourself, or ask Security AI for a draft. An AI draft becomes mandate text only when you approve it.",
            )}
          </p>
          <TextAreaField
            label={l("Text", "Text")}
            value={document}
            maxLength={32000}
            disabled={!canEdit}
            className="min-h-40"
            onChange={(e) => setDocument(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <WorkButton
              variant="outline"
              disabled={!canEdit || op.state === "saving" || document === mandate.mandate_document}
              onClick={async () => {
                const saved = await op.run(() =>
                  saveDocument({
                    data: {
                      workspaceId: workspace.id,
                      version: mandate.version,
                      mandate_document: document,
                      suggestionId: null,
                    },
                  }),
                );
                if (saved) await refresh();
              }}
            >
              {l("Spara uppdragstext", "Save mandate text")}
            </WorkButton>
            <AssistantButton
              label={lang === "sv" ? "Skriv utkast med Security AI" : "Draft with Security AI"}
            />
          </div>
        </section>
      )}
      <Explain title={l("Varför ett uppdrag?", "Why a mandate?")}>
        <p>
          {l(
            "Ett beslutat uppdrag gör säkerhetsarbetet oberoende av personer: alla vet vad funktionen ska skydda, vem den rapporterar till och vem som får acceptera risk.",
            "An agreed mandate makes security work independent of individuals: everyone knows what the function protects, whom it reports to and who may accept risk.",
          )}
        </p>
        <p>
          {l(
            "Fälten ovan räcker för de flesta organisationer. En längre policy kan länkas som underlag.",
            "The fields above are enough for most organisations. A longer policy can be linked as evidence.",
          )}
        </p>
      </Explain>
    </>
  );
}
