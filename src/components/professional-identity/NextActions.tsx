// "Continue your career" — the deterministic next best actions, rendered.
//
// ── WHAT THIS COMPONENT IS NOT ALLOWED TO BE ───────────────────────────
//
// Not a nag list, not a checklist with a completion score, not a streak.
// At most three actions, each with an obvious way past it, and no badge for
// an action nobody asked for. A person who came here to read their report
// and leave must be able to.
//
// The decision itself is not made here. `computeNextBestActions` is a pure
// function over eight integers and four booleans, tested against fixed
// inputs, so the same account always sees the same suggestions in the same
// order — and anybody can be told why. This file only draws them.
//
// ── WHY THE COPY LIVES BESIDE THE KINDS ────────────────────────────────
//
// A `Record<ActionKind, ...>` rather than a switch: adding a kind to the
// engine without adding its copy stops compiling, which is the only way to
// be sure a new action can never render as a blank row.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  computeNextBestActions,
  type ActionKind,
} from "@/lib/professional-identity/next-best-action";
import type { ProfessionalIdentityV1 } from "@/lib/professional-identity/types";
import { c, L, Lf, type Copy, type Lang } from "./copy";

const TITLE: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c("Slutför din bedömning", "Complete your assessment"),
  read_released_report: c("Din rapport är tillgänglig", "Your report is available"),
  complete_profile_basics: c("Fyll i din yrkesprofil", "Fill in your professional profile"),
  start_passport: c("Öppna ditt Säkerhetspass", "Open your Security Passport"),
  submit_passport_verification: c("Skicka in för verifiering", "Submit for verification"),
  take_career_discovery: c("Gör karriärutforskningen", "Take Career Discovery"),
  create_career_card: c("Skapa ditt karriärkort", "Create your Career Card"),
  create_cv: c("Skapa ditt CV", "Create your CV"),
  explore_jobs: c("Utforska jobb inom säkerhet", "Explore security jobs"),
};

const DETAIL: Readonly<Record<ActionKind, Copy>> = {
  complete_assessment_assignment: c(
    "{0} bedömning väntar på dig från en arbetsgivare.",
    "{0} assessment is waiting for you from an employer.",
  ),
  read_released_report: c(
    "{0} rapport har släppts till dig.",
    "{0} report has been released to you.",
  ),
  complete_profile_basics: c(
    "Din yrkestitel och ditt yrke används av allt annat i CQrityjob.",
    "Your professional title and profession are used by everything else in CQrityjob.",
  ),
  start_passport: c(
    "Passet skiljer på vad du uppger och vad som faktiskt har verifierats.",
    "The Passport keeps what you state separate from what has actually been verified.",
  ),
  submit_passport_verification: c(
    "{0} uppgift är inlagd men ännu inte granskad.",
    "{0} entry is recorded but not yet reviewed.",
  ),
  take_career_discovery: c(
    "Cirka 15 minuter. Ger dig en karriärriktning och underlaget till ditt karriärkort.",
    "About 15 minutes. Gives you a career direction and the basis for your Career Card.",
  ),
  create_career_card: c(
    "Din yrkesidentitet som ett kort du kan dela.",
    "Your professional identity as a card you can share.",
  ),
  create_cv: c(
    "Byggt av det du redan har registrerat. Inget hittas på.",
    "Built from what you have already recorded. Nothing is invented.",
  ),
  explore_jobs: c(
    "Se lediga tjänster inom säkerhetsbranschen.",
    "See open roles across the security sector.",
  ),
};

const HEADING = c("Fortsätt din karriär", "Continue your career");
const EMPTY = c(
  "Inget väntar på dig just nu.",
  "Nothing is waiting for you right now.",
);

export function NextActions({ identity }: { identity: ProfessionalIdentityV1 }) {
  const { lang } = useT();
  const l = lang as Lang;
  const { primary } = computeNextBestActions(identity);

  return (
    <section aria-labelledby="next-actions-heading">
      <h2
        id="next-actions-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(HEADING, l)}
      </h2>

      {primary.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{L(EMPTY, l)}</p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {primary.map((action) => (
            <li key={action.kind} className="h-full">
              <Link
                to={action.href}
                className="group flex h-full flex-col rounded-lg border border-border bg-card p-4 shadow-xs transition-colors hover:border-accent/50 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm font-semibold text-foreground">
                  {L(TITLE[action.kind], l)}
                </span>
                <span className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {action.count === null
                    ? L(DETAIL[action.kind], l)
                    : Lf(DETAIL[action.kind], l, action.count)}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent">
                  {L(c("Fortsätt", "Continue"), l)}
                  <ArrowRight
                    className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
