import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, CircleAlert, CircleDashed, Link2, X } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  getSecurityProgramme,
  linkSecurityEvidence,
} from "@/lib/security-work/programme/programme.functions";
import type { ProgrammeSnapshot } from "@/lib/security-work/programme/services";
import type { ProgrammeAreaId, ProgrammeAreaStatus } from "@/lib/security-work/programme/types";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { cn } from "@/lib/utils";
import { useSecurityWorkspace } from "./context";
import { useWorkText } from "./analysis-ui";
import { Field, WorkButton, selectClass } from "./ui";

export const programmeKey = (userId: string, workspaceId: string) =>
  [...securityWorkKeys.workspace(userId, workspaceId), "programme"] as const;

/** The programme snapshot: every record the deterministic rules need, read
 * once per page through the caller's RLS client. */
export function useProgramme() {
  const { user, workspace, deny } = useSecurityWorkspace();
  const read = useServerFn(getSecurityProgramme);
  const query = useQuery({
    queryKey: programmeKey(user.id, workspace.id),
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data as ProgrammeSnapshot;
    },
  });
  useEffect(() => {
    if (query.error?.message === "ACCESS_DENIED") deny();
  }, [query.error, deny]);
  return query;
}

/** Where each programme area lives. Existing routes are reused as they are. */
export const AREA_ROUTES: Record<ProgrammeAreaId, string> = {
  mandate: "/security-work/$workspaceId/mandate",
  assets: "/security-work/$workspaceId/assets",
  risks: "/security-work/$workspaceId/risks",
  baseline: "/security-work/$workspaceId/baseline",
  actions: "/security-work/$workspaceId/gaps",
  reporting: "/security-work/$workspaceId/reports",
};

export function AreaStatus({
  status,
  compact = false,
}: {
  status: ProgrammeAreaStatus;
  compact?: boolean;
}) {
  const { t } = useT();
  const icons = {
    not_started: Circle,
    in_progress: CircleDashed,
    needs_attention: CircleAlert,
    complete: CheckCircle2,
  } as const;
  const styles = {
    not_started: "text-muted-foreground",
    in_progress: "text-sky-800",
    needs_attention: "text-amber-800",
    complete: "text-emerald-800",
  } as const;
  const Icon = icons[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", styles[status])}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!compact && t(`sw.prog.status.${status}`)}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warn" | "good" | "bad";
}) {
  const tones = {
    neutral: "bg-secondary text-foreground",
    warn: "bg-amber-100 text-amber-950",
    good: "bg-emerald-100 text-emerald-950",
    bad: "bg-red-100 text-red-950",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

/** Owner choice: a workspace member, or free text for someone outside it.
 * Nothing here is ever filled in by AI. */
export function OwnerSelect({
  value,
  onChange,
  members,
  label,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  members: { user_id: string; role: string }[];
  label: string;
}) {
  const { t } = useT();
  const { user } = useSecurityWorkspace();
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          className={selectClass}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">{t("sw.prog.owner.unassigned")}</option>
          <option value={user.id}>{t("sw.prog.owner.me")}</option>
          {members
            .filter((member) => member.user_id !== user.id)
            .map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {t("sw.prog.owner.member")} · {member.user_id.slice(0, 8)}
              </option>
            ))}
        </select>
      )}
    </Field>
  );
}
export function ownerName(
  ownerId: string | null,
  label: string | undefined,
  userId: string,
  t: (key: "sw.prog.owner.unassigned" | "sw.prog.owner.me" | "sw.prog.owner.member") => string,
) {
  if (ownerId === userId) return t("sw.prog.owner.me");
  if (ownerId) return `${t("sw.prog.owner.member")} · ${ownerId.slice(0, 8)}`;
  if (label?.trim()) return label;
  return t("sw.prog.owner.unassigned");
}

/** Evidence links to the shared library (sw_sources). Reused by mandate,
 * assets, risks, gaps, actions and management reports. */
export function EvidenceLinks({
  targetKind,
  targetId,
  links,
  onChanged,
}: {
  targetKind:
    | "mandate"
    | "asset"
    | "risk"
    | "baseline_answer"
    | "gap"
    | "action"
    | "report"
    | "management_report";
  targetId: string;
  links: { source_id: string; target_kind: string; target_id: string }[];
  onChanged: () => void;
}) {
  const { t } = useT();
  const l = useWorkText();
  const { workspace, sources, canEdit } = useSecurityWorkspace();
  const link = useServerFn(linkSecurityEvidence);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const own = links.filter((row) => row.target_kind === targetKind && row.target_id === targetId);
  const run = async (sourceId: string, linked: boolean) => {
    setBusy(true);
    try {
      await link({
        data: { workspaceId: workspace.id, sourceId, targetKind, targetId, note: "", linked },
      });
      onChanged();
    } finally {
      setBusy(false);
      setChoice("");
    }
  };
  return (
    <div className="space-y-2" data-testid="sw-evidence-links">
      <p className="text-sm font-semibold">{t("sw.prog.evidence.linked")}</p>
      {own.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sw.prog.evidence.none")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {own.map((row) => {
            const source = sources.find((candidate) => candidate.id === row.source_id);
            return (
              <li
                key={row.source_id}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs"
              >
                <Link2 className="size-3" aria-hidden="true" />
                <Link
                  to="/security-work/$workspaceId/sources/$sourceId"
                  params={{ workspaceId: workspace.id, sourceId: row.source_id }}
                  className="underline-offset-4 hover:underline"
                >
                  {source?.name ?? l("Underlag", "Evidence")}
                </Link>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={t("sw.prog.evidence.remove")}
                    className="ml-1 inline-flex size-6 items-center justify-center rounded-full hover:bg-secondary"
                    disabled={busy}
                    onClick={() => void run(row.source_id, false)}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && sources.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <select
            aria-label={t("sw.prog.evidence.link")}
            className={cn(selectClass, "max-w-xs")}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={busy}
          >
            <option value="">{t("sw.prog.evidence.link")}…</option>
            {sources
              .filter((source) => !own.some((row) => row.source_id === source.id))
              .map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
          </select>
          <WorkButton
            variant="outline"
            disabled={!choice || busy}
            onClick={() => void run(choice, true)}
          >
            {t("sw.prog.evidence.link")}
          </WorkButton>
        </div>
      )}
    </div>
  );
}

export function Explain({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-border bg-secondary/30 px-4 py-2 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">{title}</summary>
      <div className="space-y-2 pb-3 leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}
