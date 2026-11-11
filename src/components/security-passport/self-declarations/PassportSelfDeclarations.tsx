// The holder's own Passport: a compact, SEPARATE self-declarations section.
//
// ── WHAT IT IS NOT ──────────────────────────────────────────────────────
//
// Not part of the credential wallet. It owns its own read and is mounted by
// the route beside the wallet, so it cannot contribute to the wallet's
// counts, the card's shields, completeness, the next-step prompts, the
// Passport number or anything exported: none of those is given this data.
//
// ── CLOSED MEANS NO SHIELD ──────────────────────────────────────────────
//
// A shield is drawn only for a statement the database returns as CURRENT
// (active, inside its retention, under a current processing authorization)
// whose wording this application holds. With processing closed, a failed
// read or a refusal, the section shows one neutral line -- "not activated"
// -- and a link to the Profile. It never shows "missing", "withdrawn" or
// anything about the holder.
//
// Editing lives on the Profile (the existing editor); this only links there.
//
// The route owns the server call and passes it in (`load`), as every Passport
// component's read is owned by its route.

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { L, type Lang } from "@/components/professional-identity/copy";
import { PASSPORT_SECTION, SECTION } from "@/lib/self-declarations/copy";
import {
  CLOSED_PASSPORT_DECLARATIONS,
  type PassportDeclarationsView,
} from "@/lib/self-declarations/passport-bridge";
import { SelfDeclarationShield } from "./SelfDeclarationShield";

export const PASSPORT_SELF_DECLARATIONS_QUERY_KEY = ["self-declarations", "passport"] as const;

const LINK =
  "inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function PassportSelfDeclarations({
  lang,
  load,
}: {
  readonly lang: Lang;
  readonly load: () => Promise<PassportDeclarationsView>;
}) {
  const query = useQuery({
    queryKey: PASSPORT_SELF_DECLARATIONS_QUERY_KEY,
    // An aborted or redirected call resolves to nothing: that is the closed view.
    queryFn: async () => (await load()) ?? CLOSED_PASSPORT_DECLARATIONS,
    retry: false,
  });
  // Nothing is drawn until the answer is known, and an error is the closed
  // state: this section never holds up or breaks the Passport around it.
  if (query.isPending) return null;
  const view: PassportDeclarationsView = query.data ?? CLOSED_PASSPORT_DECLARATIONS;

  return (
    <section
      id="self-declarations"
      aria-labelledby="passport-self-declarations-heading"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
      data-passport-self-declarations={view.state}
    >
      <h2
        id="passport-self-declarations-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(SECTION.heading, lang)}
      </h2>

      {view.state === "declared" ? (
        <>
          <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            {L(PASSPORT_SECTION.lede, lang)}
          </p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {view.declarations.map((declaration) => (
              <li key={declaration.id} className="min-w-0">
                <SelfDeclarationShield
                  statement={declaration.statement}
                  lang={lang}
                  holderProvenance={declaration.provenance}
                />
                <p
                  className="mt-1.5 px-1 text-xs text-muted-foreground"
                  data-vsd-shareable={declaration.shareable ? "yes" : "no"}
                >
                  {L(
                    declaration.shareable
                      ? PASSPORT_SECTION.shareable
                      : PASSPORT_SECTION.notShareable,
                    lang,
                  )}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p
          className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-muted-foreground"
          data-vsd-neutral
        >
          {L(view.state === "none" ? PASSPORT_SECTION.none : PASSPORT_SECTION.notActivated, lang)}
        </p>
      )}

      <Link to="/my-career/profile" hash="profile-self-declarations" className={`${LINK} mt-2`}>
        {L(
          view.state === "not_activated" ? PASSPORT_SECTION.readMore : PASSPORT_SECTION.manage,
          lang,
        )}
      </Link>
    </section>
  );
}
