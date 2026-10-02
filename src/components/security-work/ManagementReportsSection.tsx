import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useT } from "@/i18n/context";
import { createSecurityManagementReport } from "@/lib/security-work/programme/programme.functions";
import { useSecurityWorkspace } from "./context";
import { SaveStatus, WorkStatus, useSavedOperation, useWorkText } from "./analysis-ui";
import { programmeKey, useProgramme } from "./programme-ui";
import { TextField, WorkButton, WorkError, formatDate, panelClass } from "./ui";

/** Management status reports: generated from the programme's facts and
 * system-calculated values, narrated by a human (or an AI draft the human
 * approved), approved by an approver. */
export function ManagementReportsSection() {
  const { lang } = useT();
  const l = useWorkText();
  const { workspace, user, canEdit } = useSecurityWorkspace();
  const programme = useProgramme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useServerFn(createSecurityManagementReport);
  const op = useSavedOperation();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const reports = programme.data?.managementReports ?? [];
  return (
    <section className="space-y-3" data-testid="sw-management-reports">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          {l("Ledningsrapporter", "Management reports")}
        </h2>
        {canEdit && !creating && (
          <WorkButton onClick={() => setCreating(true)} data-testid="sw-new-management-report">
            <Plus aria-hidden="true" />
            {l("Ny ledningsrapport", "New management report")}
          </WorkButton>
        )}
      </div>
      {creating && (
        <form
          className={`${panelClass} space-y-3`}
          onSubmit={async (e) => {
            e.preventDefault();
            const id = crypto.randomUUID();
            const saved = await op.run(() =>
              create({
                data: {
                  workspaceId: workspace.id,
                  id,
                  title: title || (lang === "sv" ? "Säkerhetsläget" : "Security position"),
                  language: lang,
                  period_start: null,
                  period_end: null,
                },
              }),
            );
            if (saved) {
              await queryClient.invalidateQueries({
                queryKey: programmeKey(user.id, workspace.id),
              });
              await navigate({
                to: "/security-work/$workspaceId/reports/management/$reportId",
                params: { workspaceId: workspace.id, reportId: saved.id },
              });
            }
          }}
        >
          <TextField
            label={l("Titel", "Title")}
            value={title}
            maxLength={500}
            placeholder={lang === "sv" ? "Säkerhetsläget Q4 2026" : "Security position Q4 2026"}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {l(
              "Fakta och beräknade värden hämtas från programmet när rapporten skapas. Berättelsen skriver du – eller godkänner ett AI-utkast.",
              "Facts and calculated values are taken from the programme when the report is created. You write the narrative, or approve an AI draft.",
            )}
          </p>
          <WorkError code={op.error} />
          <div className="flex flex-wrap items-center gap-2">
            <WorkButton type="submit" disabled={op.state === "saving"}>
              {l("Skapa utkast", "Create draft")}
            </WorkButton>
            <WorkButton type="button" variant="ghost" onClick={() => setCreating(false)}>
              {l("Avbryt", "Cancel")}
            </WorkButton>
            <SaveStatus state={op.state} />
          </div>
        </form>
      )}
      {reports.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {reports.map((report) => (
            <li key={report.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link
                  to="/security-work/$workspaceId/reports/management/$reportId"
                  params={{ workspaceId: workspace.id, reportId: report.id }}
                  className="inline-flex min-h-11 items-center font-semibold text-accent"
                >
                  {report.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  v{report.version} · {formatDate(report.approved_at ?? report.updated_at, lang)}
                </p>
              </div>
              <WorkStatus status={report.status} />
            </li>
          ))}
        </ul>
      )}
      {reports.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground">
          {l(
            "Ingen ledningsrapport har skapats ännu.",
            "No management report has been created yet.",
          )}
        </p>
      )}
    </section>
  );
}
