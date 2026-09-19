// The BESKT interview workspace: one area at a time -- B, E, S, K, T, the
// common base and the situations -- with the role's profile always in view.
//
// §4.6: the interviewer gets three lists, each entry saying where it came
// from. Here they are placed in their area: the topics the candidate's own
// explicit answers produced (with the governed rule that fired, or the
// candidate's neutral state), then the method's base questions, and for T
// the role's exposure. Every one of them can be documented with the whole
// FAKTA chain. Nothing is ranked, weighted or summarised into a profile of
// the person; an area is a subject of conversation, not a score.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  BesktConductEntry,
  BesktConductPrompts,
  BesktConductTopic,
} from "@/lib/beskt/interview-conduct.functions";
import { getBesktInterviewPreparation, type BesktPrepEntry } from "@/lib/beskt/complete.functions";
import { BesktThemes, type BesktThemeActions } from "./BesktThemes";
import { TOUCH } from "./BesktConductUi";

const AREAS: ReadonlyArray<{
  id: string;
  match: (sectionKey: string) => boolean;
  title: TranslationKey;
}> = [
  { id: "t", match: (k) => k.startsWith("t_"), title: "beskt.section.t" },
  { id: "base", match: (k) => k.startsWith("bas_"), title: "beskt.section.base" },
  { id: "b", match: (k) => k.startsWith("b_"), title: "beskt.section.b" },
  { id: "e", match: (k) => k.startsWith("e_"), title: "beskt.section.e" },
  { id: "s", match: (k) => k.startsWith("s_"), title: "beskt.section.s" },
  { id: "k", match: (k) => k.startsWith("k_"), title: "beskt.section.k" },
  { id: "situations", match: (k) => k.startsWith("situation"), title: "beskt.section.situations" },
];

function areaOf(sectionKey: string): string {
  return AREAS.find((a) => a.match(sectionKey))?.id ?? "other";
}

function asTopic(e: BesktPrepEntry): BesktConductTopic {
  return {
    topicId: `item:${e.itemKey}`,
    itemKey: e.itemKey,
    reason: e.provenance === "role_exposure" ? "role_exposure" : "base_question",
    triggerRuleKey: null,
    wordingSv: e.wordingSv,
    wordingEn: e.wordingEn,
    purposeSv: e.purposeSv,
    purposeEn: e.purposeEn,
  };
}

export function BesktInterviewWorkspace({
  sessionId,
  methodVersionId,
  topics,
  entries,
  prompts,
  actions,
}: {
  sessionId: string;
  methodVersionId: string;
  topics: readonly BesktConductTopic[];
  entries: readonly BesktConductEntry[];
  prompts: BesktConductPrompts | null;
  actions: BesktThemeActions;
}) {
  const { t, lang } = useT();
  const prepFn = useServerFn(getBesktInterviewPreparation);
  const prep = useQuery({
    queryKey: ["beskt", "conduct", "preparation", sessionId],
    queryFn: () => prepFn({ data: { sessionId } }),
    retry: false,
  });

  const sectionOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of [
      ...(prep.data?.base ?? []),
      ...(prep.data?.candidate ?? []),
      ...(prep.data?.roleExposure ?? []),
    ])
      m.set(e.itemKey, e.sectionKey);
    return m;
  }, [prep.data]);

  const areas = useMemo(() => {
    const present = new Set<string>();
    for (const k of sectionOf.values()) present.add(areaOf(k));
    for (const tp of topics) present.add(areaOf(sectionOf.get(tp.itemKey) ?? ""));
    return AREAS.filter((a) => present.has(a.id));
  }, [sectionOf, topics]);

  const [areaId, setAreaId] = useState<string | null>(null);
  const current =
    areaId ??
    areas.find((a) => topics.some((tp) => areaOf(sectionOf.get(tp.itemKey) ?? "") === a.id))?.id ??
    areas[0]?.id ??
    null;

  if (prep.isError || (!prep.isPending && areas.length === 0)) {
    // The preparation read failed or holds no areas: the plain themes list
    // still shows every derived topic, so nothing the candidate raised is lost.
    return (
      <BesktThemes
        sessionId={sessionId}
        methodVersionId={methodVersionId}
        topics={topics}
        entries={entries}
        prompts={prompts}
        actions={actions}
      />
    );
  }

  const inArea = (itemKey: string) => areaOf(sectionOf.get(itemKey) ?? "") === current;
  const topicKeys = new Set(topics.map((tp) => tp.itemKey));
  const areaTopics = topics.filter((tp) => inArea(tp.itemKey));
  const areaBase = (prep.data?.base ?? [])
    .filter((e) => inArea(e.itemKey) && !topicKeys.has(e.itemKey))
    .map(asTopic);
  const areaRole = (prep.data?.roleExposure ?? [])
    .filter((e) => inArea(e.itemKey) && !topicKeys.has(e.itemKey))
    .map(asTopic);
  const role = prep.data?.role;
  const heading = AREAS.find((a) => a.id === current);

  return (
    <div className="space-y-4" data-testid="beskt-interview-workspace">
      {role ? (
        <section
          className="rounded-lg border border-border bg-muted/20 p-4"
          aria-labelledby="beskt-role-profile-h"
          data-testid="beskt-role-profile"
        >
          <h2 id="beskt-role-profile-h" className="text-sm font-semibold">
            {t("beskt.workspace.roleProfile")}
          </h2>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            {role.roleTitle ? (
              <div>
                <dt className="text-xs text-muted-foreground">{t("beskt.invitation.role")}</dt>
                <dd className="font-medium">{role.roleTitle}</dd>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{t("beskt.workspace.exposure")}</dt>
              <dd>{(lang === "sv" ? role.dutiesSv : (role.dutiesEn ?? role.dutiesSv)) ?? "—"}</dd>
            </div>
            {role.roleSecurityAttestation ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">
                  {t("beskt.workspace.attestation")}
                </dt>
                <dd>{role.roleSecurityAttestation}</dd>
              </div>
            ) : null}
          </dl>
          {(prep.data?.supplements ?? []).length > 0 ? (
            <div className="mt-3" data-testid="beskt-workspace-supplements">
              <h3 className="text-xs font-semibold">{t("beskt.supplement.employerHeading")}</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {prep.data!.supplements.map((x, i) => (
                  <li key={i} className="rounded border p-2">
                    {x.itemKey ? <span className="font-mono text-xs">{x.itemKey}: </span> : null}
                    {x.body}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <div
        role="tablist"
        aria-label={t("beskt.workspace.areas")}
        className="flex flex-wrap gap-2"
        data-testid="beskt-area-tabs"
      >
        {areas.map((a) => {
          const count = topics.filter(
            (tp) => areaOf(sectionOf.get(tp.itemKey) ?? "") === a.id,
          ).length;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={current === a.id}
              className={`${TOUCH} rounded-md border px-3 text-sm ${
                current === a.id ? "border-foreground font-medium" : "border-border"
              }`}
              onClick={() => setAreaId(a.id)}
              data-testid={`beskt-area-tab-${a.id}`}
            >
              {t(a.title)}
              {count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {current && heading ? (
        <BesktThemes
          sessionId={sessionId}
          methodVersionId={methodVersionId}
          topics={[...areaTopics, ...areaRole, ...areaBase]}
          entries={entries}
          prompts={prompts}
          actions={actions}
          area={{
            id: current,
            heading: t(heading.title),
            lede: t("beskt.workspace.areaLede"),
          }}
        />
      ) : null}
    </div>
  );
}
