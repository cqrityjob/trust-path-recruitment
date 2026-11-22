import { useId, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  createSecurityBrief,
  createSecurityFeedSource,
  fetchSecurityFeedNow,
} from "@/lib/security-work/impact/functions";
import type { ChangeBrief, Development } from "@/lib/security-work/impact/services";
import { DEFAULT_MATERIALITY, isMaterial } from "@/lib/security-work/knowledge/relevance";
import { useSecurityWorkspace } from "../context";
import { useWorkText } from "../analysis-ui";
import {
  EmptyState,
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  formatDate,
  panelClass,
  selectClass,
} from "../ui";
import { useMissions } from "../missions/mission-ui";
import { BriefStatusBadge, useImpact, useImpactMutation, useImpactText } from "./impact-ui";

/**
 * Release B's working surface: which official sources are connected and how
 * current they are, what they reported, why each development may matter to
 * this customer (every point of relevance is named), and the impact briefs
 * people have written about them. Nothing here is judged by a machine: the
 * threshold only filters the list, and a brief exists only when a person
 * writes one.
 */
export function SecurityImpact() {
  const l = useWorkText();
  const { lang } = useT();
  const text = useImpactText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const impact = useImpact();
  const [threshold, setThreshold] = useState(DEFAULT_MATERIALITY);
  const [showAll, setShowAll] = useState(false);
  const [drafting, setDrafting] = useState<Development | null>(null);
  const thresholdId = useId();
  if (impact.isPending) return <LoadingState />;
  if (impact.isError)
    return <WorkError code={impact.error.message} onRetry={() => void impact.refetch()} />;
  const data = impact.data;
  const material = data.developments.filter((d) => isMaterial(d.relevance, threshold));
  const shown = showAll ? data.developments : material;
  const openBriefs = data.briefs.filter((b) => b.status === "draft" || b.status === "in_review");
  const decided = data.briefs.filter((b) => b.status !== "draft" && b.status !== "in_review");
  const flagged = new Set(data.openFlags.map((flag) => flag.brief_id));
  return (
    <div className="space-y-7" data-testid="sw-impact">
      <PageHeading
        title={l("Förändringar som berör er", "Changes that affect you")}
        body={l(
          "Officiella källor ni har anslutit, vad de rapporterat och vilken påverkan ni har bedömt. Relevansen förklaras alltid; en bedömning görs alltid av en människa och granskas innan den blir en risk eller åtgärd.",
          "Official sources you have connected, what they reported and the impact you have assessed. Relevance is always explained; an assessment is always made by a person and reviewed before it becomes a risk or action.",
        )}
      />

      <section
        aria-labelledby="sw-coverage-heading"
        className={`${panelClass} space-y-4`}
        data-testid="sw-coverage"
        data-coverage={data.coverage.state}
      >
        <h2 id="sw-coverage-heading" className="font-display text-lg font-semibold">
          {l("Bevakningens täckning", "Monitoring coverage")}
        </h2>
        <p className="text-sm">{text.coverage(data.coverage.state)}</p>
        {data.coverage.sources.length > 0 && (
          <ul className="divide-y divide-border text-sm">
            {data.coverage.sources.map((source) => (
              <FeedRow key={source.sourceId} source={source} />
            ))}
          </ul>
        )}
        {canEdit && <AddFeed hosts={data.approvedHosts} />}
      </section>

      <section aria-labelledby="sw-developments-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="sw-developments-heading" className="font-display text-lg font-semibold">
              {l("Händelser från källorna", "Developments from the sources")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {l(
                `${material.length} av ${data.developments.length} de senaste 30 dagarna når er relevansgräns.`,
                `${material.length} of ${data.developments.length} in the last 30 days reach your relevance threshold.`,
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor={thresholdId} className="block text-sm font-semibold">
                {l("Relevansgräns", "Relevance threshold")}
              </label>
              <select
                id={thresholdId}
                data-testid="sw-materiality"
                className={selectClass}
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
              >
                {[1, 2, 3, 5, 8].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <WorkButton variant="outline" onClick={() => setShowAll((value) => !value)}>
              {showAll
                ? l("Visa bara relevanta", "Show relevant only")
                : l("Visa alla", "Show all")}
            </WorkButton>
          </div>
        </div>
        {data.profileVersion === null && (
          <p className="text-sm text-muted-foreground" data-testid="sw-no-profile">
            {l(
              "Er verksamhetsprofil är inte ifylld, så relevansen bygger bara på skyddsvärda tillgångar.",
              "Your operating profile is not filled in, so relevance rests only on protected assets.",
            )}{" "}
            <Link
              to="/security-work/$workspaceId/organisation"
              params={{ workspaceId: workspace.id }}
              className="text-accent underline-offset-4 hover:underline"
            >
              {l("Beskriv verksamheten", "Describe the organisation")}
            </Link>
          </p>
        )}
        {drafting && <DraftBrief development={drafting} onCancel={() => setDrafting(null)} />}
        {shown.length === 0 ? (
          <EmptyState
            title={l("Inget att visa", "Nothing to show")}
            body={
              data.coverage.state === "current"
                ? l(
                    "Inget från de anslutna källorna når relevansgränsen. Det gäller bara de källor som är anslutna.",
                    "Nothing from the connected sources reaches the threshold. That holds only for the sources that are connected.",
                  )
                : text.coverage(data.coverage.state)
            }
          />
        ) : (
          <ul className="space-y-3" data-testid="sw-developments">
            {shown.map((development) => (
              <li
                key={development.itemId}
                className={`${panelClass} space-y-2`}
                data-testid="sw-development"
                data-relevance={development.relevance.score}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold break-words">{development.title}</h3>
                  <span className="text-xs text-muted-foreground">
                    {development.publisher} · {formatDate(development.publishedAt, lang)}
                  </span>
                </div>
                {development.excerpt && (
                  <p className="text-sm text-muted-foreground break-words">{development.excerpt}</p>
                )}
                <p className="text-xs" data-testid="sw-relevance">
                  {development.relevance.excludedBy
                    ? l(
                        `Utesluten av er bevakning: ”${development.relevance.excludedBy}”`,
                        `Excluded by your monitoring: “${development.relevance.excludedBy}”`,
                      )
                    : development.relevance.matches.length === 0
                      ? l(
                          "Ingen koppling till er verksamhet hittad.",
                          "No link to your organisation found.",
                        )
                      : `${l("Relevans", "Relevance")} ${development.relevance.score}: ` +
                        development.relevance.matches
                          .map(
                            (match) =>
                              `${text.matchKind(match.kind)} ”${match.term}” (+${match.weight})`,
                          )
                          .join(", ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {development.independentSources > 1
                    ? l(
                        `Bekräftad av ${development.independentSources} oberoende källor`,
                        `Corroborated by ${development.independentSources} independent sources`,
                      )
                    : l(
                        "En källa – inte bekräftad av någon annan",
                        "One source – not corroborated",
                      )}
                  {development.hasCopies
                    ? l(" · kopior av samma text finns", " · copies of the same text exist")
                    : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {development.url && (
                    <a
                      href={development.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
                    >
                      {l("Öppna källan", "Open the source")}
                    </a>
                  )}
                  {canEdit && (
                    <WorkButton
                      variant="outline"
                      data-testid="sw-assess-impact"
                      onClick={() => setDrafting(development)}
                    >
                      {l("Bedöm påverkan", "Assess impact")}
                    </WorkButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sw-briefs-heading" className="space-y-3">
        <h2 id="sw-briefs-heading" className="font-display text-lg font-semibold">
          {l("Påverkansbedömningar", "Impact briefs")}
        </h2>
        {data.briefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {l("Inga bedömningar ännu.", "No briefs yet.")}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <BriefList title={l("Pågående", "In progress")} briefs={openBriefs} flagged={flagged} />
            <BriefList title={l("Beslutade", "Decided")} briefs={decided} flagged={flagged} />
          </div>
        )}
      </section>
    </div>
  );
}

function FeedRow({
  source,
}: {
  source: {
    sourceId: string;
    name: string;
    state: string;
    minutesSinceSuccess: number | null;
    targetMinutes: number;
    failure: string | null;
  };
}) {
  const l = useWorkText();
  const text = useImpactText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const fetchNow = useImpactMutation(useServerFn(fetchSecurityFeedNow));
  const state =
    source.state === "current"
      ? l("aktuell", "current")
      : source.state === "stale"
        ? l("inaktuell", "out of date")
        : source.state === "failing"
          ? l("misslyckas", "failing")
          : l("aldrig kontrollerad", "never checked");
  return (
    <li
      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="sw-feed"
      data-state={source.state}
    >
      <div className="min-w-0">
        <p className="font-medium break-words">{source.name}</p>
        <p className="text-xs text-muted-foreground">
          {state}
          {source.minutesSinceSuccess !== null &&
            l(
              ` · senast lyckad för ${source.minutesSinceSuccess} min sedan`,
              ` · last success ${source.minutesSinceSuccess} min ago`,
            )}
          {l(
            ` · mål var ${source.targetMinutes}:e minut`,
            ` · target every ${source.targetMinutes} min`,
          )}
        </p>
        {source.failure && !fetchNow.data && (
          <p className="text-xs text-destructive" data-testid="sw-feed-failure">
            {text.failure(source.failure)}
          </p>
        )}
        {fetchNow.data &&
          (fetchNow.data.status === "failed" ? (
            <p
              className="text-xs text-destructive"
              role="alert"
              data-testid="sw-fetch-result"
              data-status="failed"
            >
              {text.failure(fetchNow.data.error_code)}
            </p>
          ) : (
            <p
              className="text-xs"
              role="status"
              data-testid="sw-fetch-result"
              data-status={fetchNow.data.status}
            >
              {fetchNow.data.status === "not_modified"
                ? l("Inget nytt sedan förra kontrollen.", "Nothing new since the last check.")
                : fetchNow.data.items_new === 0
                  ? l(
                      "Källan kontrollerades. Inga nya poster.",
                      "The source was checked. No new items.",
                    )
                  : l(
                      `${fetchNow.data.items_new} nya poster hämtade.`,
                      `${fetchNow.data.items_new} new items fetched.`,
                    )}
            </p>
          ))}
        <WorkError code={fetchNow.error?.message} message={text.error(fetchNow.error?.message)} />
      </div>
      {canEdit && (
        <WorkButton
          variant="outline"
          data-testid="sw-fetch-now"
          disabled={fetchNow.isPending}
          onClick={() =>
            fetchNow.mutate({ data: { workspaceId: workspace.id, sourceId: source.sourceId } })
          }
        >
          {fetchNow.isPending ? l("Hämtar…", "Fetching…") : l("Hämta nu", "Fetch now")}
        </WorkButton>
      )}
    </li>
  );
}

function AddFeed({
  hosts,
}: {
  hosts: { host: string; publisher: string; terms_reference: string }[];
}) {
  const l = useWorkText();
  const text = useImpactText();
  const { workspace } = useSecurityWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [every, setEvery] = useState(60);
  const create = useImpactMutation(useServerFn(createSecurityFeedSource));
  if (!open)
    return (
      <WorkButton variant="outline" data-testid="sw-add-feed" onClick={() => setOpen(true)}>
        {l("Anslut officiell källa", "Connect an official source")}
      </WorkButton>
    );
  return (
    <form
      className="space-y-3 rounded-lg border border-border p-4"
      data-testid="sw-add-feed-form"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          {
            data: {
              workspaceId: workspace.id,
              name,
              feedUrl: url,
              pollTargetMinutes: every,
            },
          },
          {
            onSuccess: () => {
              setOpen(false);
              setName("");
              setUrl("");
            },
          },
        );
      }}
    >
      <p className="text-sm text-muted-foreground">
        {hosts.length === 0
          ? l(
              "Inga utgivare är godkända ännu. En källa kan bara anslutas från en godkänd officiell utgivare.",
              "No publishers are approved yet. A source can only be connected from an approved official publisher.",
            )
          : l("Godkända utgivare: ", "Approved publishers: ") +
            hosts.map((host) => `${host.publisher} (${host.host})`).join(", ")}
      </p>
      <TextField
        label={l("Namn", "Name")}
        value={name}
        required
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        label={l("Flödesadress (RSS eller Atom, https)", "Feed address (RSS or Atom, https)")}
        type="url"
        value={url}
        required
        onChange={(event) => setUrl(event.target.value)}
      />
      <TextField
        label={l("Kontrollera var … minut", "Check every … minutes")}
        type="number"
        min={15}
        max={10080}
        value={every}
        onChange={(event) => setEvery(Number(event.target.value) || 60)}
      />
      <WorkError code={create.error?.message} message={text.error(create.error?.message)} />
      <div className="flex flex-wrap gap-2">
        <WorkButton type="submit" disabled={create.isPending}>
          {l("Anslut", "Connect")}
        </WorkButton>
        <WorkButton type="button" variant="ghost" onClick={() => setOpen(false)}>
          {l("Avbryt", "Cancel")}
        </WorkButton>
      </div>
    </form>
  );
}

function DraftBrief({ development, onCancel }: { development: Development; onCancel: () => void }) {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  const navigate = useNavigate();
  const missions = useMissions();
  const create = useImpactMutation(useServerFn(createSecurityBrief));
  const [title, setTitle] = useState(development.title);
  const [whyItMatters, setWhy] = useState("");
  const [missionId, setMissionId] = useState("");
  const candidates = (missions.data ?? []).filter(
    (mission) => mission.kind === "monitoring_impact" && mission.execution_state !== "closed",
  );
  return (
    <form
      className={`${panelClass} space-y-3`}
      data-testid="sw-draft-brief"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          {
            data: {
              workspaceId: workspace.id,
              missionId: missionId || null,
              clusterId: development.clusterId,
              title,
              whatChanged: development.excerpt,
              known: "",
              whyItMatters,
              uncertain: "",
              proposedActions: [],
              evidenceItemIds: [development.itemId],
              relevance: {
                score: development.relevance.score,
                matches: development.relevance.matches,
              },
            },
          },
          {
            onSuccess: (brief) =>
              void navigate({
                to: "/security-work/$workspaceId/impact/$briefId",
                params: { workspaceId: workspace.id, briefId: (brief as ChangeBrief).id },
              }),
          },
        );
      }}
    >
      <h3 className="font-semibold">{l("Ny påverkansbedömning", "New impact brief")}</h3>
      <p className="text-xs text-muted-foreground">
        {l("Underlag: ", "Evidence: ")}
        {development.publisher} – {development.title}
      </p>
      <TextField
        label={l("Rubrik", "Title")}
        value={title}
        required
        onChange={(event) => setTitle(event.target.value)}
      />
      <TextAreaField
        label={l("Varför spelar det roll för er?", "Why does it matter to you?")}
        value={whyItMatters}
        onChange={(event) => setWhy(event.target.value)}
      />
      {candidates.length > 0 && (
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">{l("Koppla till uppdrag", "Link to a mission")}</span>
          <select
            className={selectClass}
            value={missionId}
            onChange={(event) => setMissionId(event.target.value)}
          >
            <option value="">{l("Inget uppdrag", "No mission")}</option>
            {candidates.map((mission) => (
              <option key={mission.id} value={mission.id}>
                {mission.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <WorkError code={create.error?.message} />
      <div className="flex flex-wrap gap-2">
        <WorkButton type="submit" data-testid="sw-create-brief" disabled={create.isPending}>
          {l("Skapa utkast", "Create draft")}
        </WorkButton>
        <WorkButton type="button" variant="ghost" onClick={onCancel}>
          {l("Avbryt", "Cancel")}
        </WorkButton>
      </div>
    </form>
  );
}

function BriefList({
  title,
  briefs,
  flagged,
}: {
  title: string;
  briefs: ChangeBrief[];
  flagged: Set<string>;
}) {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace } = useSecurityWorkspace();
  return (
    <div className={`${panelClass} space-y-2`}>
      <h3 className="font-semibold">{title}</h3>
      {briefs.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-2 text-sm" data-testid="sw-brief-list">
          {briefs.map((brief) => (
            <li key={brief.id} className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/security-work/$workspaceId/impact/$briefId"
                  params={{ workspaceId: workspace.id, briefId: brief.id }}
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {brief.title}
                </Link>
                <BriefStatusBadge status={brief.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDate(brief.updated_at, lang)}
                {flagged.has(brief.id) &&
                  l(" · ny information väntar på granskning", " · new information awaits review")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
