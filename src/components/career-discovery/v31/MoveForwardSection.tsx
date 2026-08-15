// "What could help you move forward?" — a top-level section (Owner Review
// UX pass §1.5), promoted out of the per-profession accordion where the same
// facts were previously buried three interactions deep.
//
// ── PRESENTATION ONLY ────────────────────────────────────────────────────
//
// Every row here comes from getProfessionDetails — the SAME live CIG read
// the profession cards already use, with the SAME server-side classification
// (see profession-detail.functions.ts). This file decides nothing about what
// is "really" required: it groups already-classified rows into the five
// candidate-facing headings, de-duplicates identical titles across
// professions, and records which directions each one applies to. No new
// facts, no new scoring, no re-ranking.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { translateFor } from "@/i18n/context";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  getProfessionDetails,
  type ProfessionDetail,
} from "@/lib/career-discovery/profession-detail.functions";
import type { ProfessionMatch } from "@/lib/career-discovery/v31/professions";

type Locale = "sv" | "en";

type CategoryId = "formal" | "employer" | "education" | "experience" | "certifications";

const CATEGORY_ORDER: readonly CategoryId[] = [
  "formal",
  "employer",
  "education",
  "experience",
  "certifications",
];

const CATEGORY_KEY = {
  formal: "careerDiscovery.report.v31.moveForward.formal",
  employer: "careerDiscovery.report.v31.moveForward.employer",
  education: "careerDiscovery.report.v31.moveForward.education",
  experience: "careerDiscovery.report.v31.moveForward.experience",
  certifications: "careerDiscovery.report.v31.moveForward.certifications",
} as const satisfies Record<CategoryId, string>;

interface Entry {
  readonly title: string;
  /** Titles of the recommended directions this row was recorded for. */
  readonly professions: string[];
}

function push(bucket: Map<string, Entry>, title: string, professionTitle: string) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const existing = bucket.get(trimmed);
  if (existing) {
    if (!existing.professions.includes(professionTitle)) existing.professions.push(professionTitle);
    return;
  }
  bucket.set(trimmed, { title: trimmed, professions: [professionTitle] });
}

function group(
  matches: readonly ProfessionMatch[],
  detailsBySlug: Record<string, ProfessionDetail>,
  locale: Locale,
): Record<CategoryId, Entry[]> {
  const buckets: Record<CategoryId, Map<string, Entry>> = {
    formal: new Map(),
    employer: new Map(),
    education: new Map(),
    experience: new Map(),
    certifications: new Map(),
  };

  for (const match of matches) {
    const slug = match.cigProfessionSlug;
    const detail = slug ? detailsBySlug[slug] : undefined;
    if (!detail) continue;
    const professionTitle = locale === "sv" ? match.titleSv : match.titleEn;
    const label = (item: { titleSv: string; titleEn: string }) =>
      locale === "sv" ? item.titleSv : item.titleEn;

    for (const req of detail.requirements) {
      if (req.level === "formally_required") push(buckets.formal, label(req), professionTitle);
      else if (req.level === "employer_requirement")
        push(buckets.employer, label(req), professionTitle);
      else push(buckets.experience, label(req), professionTitle);
    }
    for (const edu of detail.education) {
      // A formally-required training programme is a formal requirement, not
      // an optional course — it is classified that way server-side already.
      if (edu.level === "formally_required") push(buckets.formal, label(edu), professionTitle);
      else push(buckets.education, label(edu), professionTitle);
    }
    for (const cert of detail.certifications) {
      push(buckets.certifications, label(cert), professionTitle);
    }
  }

  return {
    formal: [...buckets.formal.values()],
    employer: [...buckets.employer.values()],
    education: [...buckets.education.values()],
    experience: [...buckets.experience.values()],
    certifications: [...buckets.certifications.values()],
  };
}

export function MoveForwardSection({
  matches,
  locale,
}: {
  /** The directions actually shown to this candidate, strongest first. */
  matches: readonly ProfessionMatch[];
  locale: Locale;
}) {
  // Bound to the `locale` prop, not the live site toggle — frozen report
  // content, same rule as ProfessionRecommendations.
  const t = translateFor(locale);

  const slugs = [
    ...new Set(matches.map((m) => m.cigProfessionSlug).filter((s): s is string => Boolean(s))),
  ].slice(0, 20);

  const load = useServerFn(getProfessionDetails);
  const query = useQuery({
    queryKey: ["v31", "profession-details", slugs],
    queryFn: () => load({ data: { slugs } }),
    enabled: slugs.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (slugs.length === 0) return null;

  const grouped = group(matches, query.data ?? {}, locale);
  const present = CATEGORY_ORDER.filter((c) => grouped[c].length > 0);

  return (
    <section className="mt-16">
      <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
        {t("careerDiscovery.report.v31.moveForward.title")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t("careerDiscovery.report.v31.moveForward.intro")}
      </p>

      {query.isLoading && (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("careerDiscovery.report.v31.professionDetailLoading")}
        </p>
      )}

      {!query.isLoading && present.length === 0 && (
        <p className="mt-6 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
          {t("careerDiscovery.report.v31.moveForward.empty")}
        </p>
      )}

      {present.length > 0 && (
        <Accordion
          type="multiple"
          defaultValue={present.slice(0, 1)}
          className="mt-6 space-y-3"
        >
          {present.map((category) => (
            <AccordionItem
              key={category}
              value={category}
              className="overflow-hidden rounded-xl border border-border bg-card last:border-b"
            >
              <AccordionTrigger className="px-5 py-4 text-left hover:no-underline">
                <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-3">
                  <span className="text-sm font-semibold text-foreground">
                    {t(CATEGORY_KEY[category])}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {grouped[category].length}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                <ul className="space-y-2">
                  {grouped[category].map((entry) => (
                    <li
                      key={entry.title}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <p className="text-sm text-foreground">{entry.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t("careerDiscovery.report.v31.moveForward.appliesTo")}:{" "}
                        {entry.professions.join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  );
}
