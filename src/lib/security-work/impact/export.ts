/**
 * A reviewed impact brief as a portable Markdown document. Pure. The export
 * says what the brief is (its status, who approved it and when, which
 * operating-profile version it was judged against) and cites every source as
 * retrieved, so a copy read outside the product cannot be mistaken for a
 * finished assessment when it is a draft, or for a claim without evidence.
 */
import type { BriefDetail } from "./services";

export interface BriefEvidence {
  sourceItemId?: string;
  title?: string;
  publisher?: string;
  url?: string | null;
  publishedAt?: string | null;
  retrievedAt?: string | null;
  retrievalStatus?: string;
}
export interface ProposedAction {
  title: string;
  description?: string;
}

const STATUS: Record<string, [string, string]> = {
  draft: ["Utkast – inte granskat", "Draft – not reviewed"],
  in_review: ["Under granskning – inte godkänt", "In review – not approved"],
  approved: ["Godkänt", "Approved"],
  rejected: ["Avslaget", "Rejected"],
  superseded: ["Ersatt av en senare version", "Superseded by a later version"],
};

const FOLLOW_UP: Record<string, [string, string]> = {
  proposed: ["föreslagen", "proposed"],
  accepted: ["accepterad", "accepted"],
  closed: ["stängd", "closed"],
  open: ["öppen", "open"],
  in_progress: ["pågår", "in progress"],
  blocked: ["blockerad", "blocked"],
  completed: ["klar", "completed"],
  cancelled: ["avbruten", "cancelled"],
};
/** Risk and action statuses as the person reads them. */
export const followUpStatusLabel = (status: string, lang: "sv" | "en") =>
  (FOLLOW_UP[status] ?? [status, status])[lang === "sv" ? 0 : 1];

export const briefStatusLabel = (status: string, lang: "sv" | "en") =>
  (STATUS[status] ?? [status, status])[lang === "sv" ? 0 : 1];

export const briefEvidence = (value: unknown): BriefEvidence[] =>
  Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as BriefEvidence[]) : [];
export const proposedActions = (value: unknown): ProposedAction[] =>
  Array.isArray(value)
    ? (value.filter(
        (v) => v && typeof v === "object" && typeof (v as ProposedAction).title === "string",
      ) as ProposedAction[])
    : [];

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : "—");
const block = (text: string) => (text.trim() ? text.trim() : "—");

export function briefToMarkdown(
  detail: Pick<BriefDetail, "brief" | "followUp" | "flags">,
  lang: "sv" | "en",
): string {
  const l = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const { brief, followUp, flags } = detail;
  const lines = [
    `# ${brief.title}`,
    "",
    `- ${l("Status", "Status")}: ${briefStatusLabel(brief.status, lang)}`,
    `- ${l("Version", "Version")}: ${brief.version}`,
    `- ${l("Verksamhetsprofil", "Operating profile")}: ${
      brief.operating_profile_version === null
        ? l("ingen profil", "no profile")
        : `v${brief.operating_profile_version}`
    }`,
  ];
  if (brief.status === "approved" || brief.status === "superseded")
    lines.push(`- ${l("Godkänt", "Approved")}: ${day(brief.approved_at)}`);
  const open = flags.filter((flag) => flag.status === "open").length;
  if (open)
    lines.push(
      `- ${l("Ny information sedan godkännandet", "New information since approval")}: ${open}`,
    );
  lines.push(
    "",
    `## ${l("Vad har förändrats", "What changed")}`,
    block(brief.what_changed),
    "",
    `## ${l("Vad vet vi", "What is known")}`,
    block(brief.known),
    "",
    `## ${l("Varför det spelar roll för er", "Why it matters to you")}`,
    block(brief.why_it_matters),
    "",
    `## ${l("Vad är osäkert", "What is uncertain")}`,
    block(brief.uncertain),
    "",
    `## ${l("Föreslagna åtgärder", "Proposed actions")}`,
  );
  const proposed = proposedActions(brief.proposed_actions);
  if (!proposed.length) lines.push("—");
  for (const action of proposed)
    lines.push(`- ${action.title}${action.description ? ` – ${action.description}` : ""}`);
  if (followUp.risk || followUp.actions.length) {
    lines.push("", `## ${l("Uppföljning", "Follow-up")}`);
    if (followUp.risk)
      lines.push(
        `- ${l("Risk", "Risk")}: ${followUp.risk.title} (${followUpStatusLabel(followUp.risk.status, lang)})`,
      );
    for (const action of followUp.actions)
      lines.push(
        `- ${l("Åtgärd", "Action")}: ${action.title} (${followUpStatusLabel(action.status, lang)}, ${l("senast", "due")} ${day(action.due_date)})`,
      );
  }
  lines.push("", `## ${l("Källor", "Sources")}`);
  const evidence = briefEvidence(brief.evidence);
  evidence.forEach((item, index) =>
    lines.push(
      `${index + 1}. ${item.publisher ?? "—"}: ${item.title ?? "—"}${item.url ? ` <${item.url}>` : ""} (${l("publicerad", "published")} ${day(item.publishedAt)}, ${l("hämtad", "retrieved")} ${day(item.retrievedAt)})`,
    ),
  );
  if (!evidence.length) lines.push("—");
  lines.push(
    "",
    l(
      "Bedömningen är gjord av människor utifrån källorna ovan. Den täcker bara de källor som var anslutna.",
      "The assessment was made by people from the sources above. It covers only the sources that were connected.",
    ),
    "",
  );
  return lines.join("\n");
}
