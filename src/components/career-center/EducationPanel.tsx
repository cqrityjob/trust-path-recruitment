import { ExternalLink, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { L, type EducationOffer, type ProfessionEducation } from "@/lib/career-center";

// "Utbildning och behörighet" — the neutral education surface.
//
// ── FOUR THINGS EVERY ROW MUST CARRY ───────────────────────────────────
//
//   1. Whether it is a FORMAL REQUIREMENT or RECOMMENDED DEVELOPMENT.
//   2. Which country that statement applies in.
//   3. The source it rests on.
//   4. When that source was last reviewed.
//
// None of the four is optional, because a row missing any of them is a claim
// a reader cannot check. Rows that cannot carry all four never reach this
// component: `offerPresentable` filters them out upstream and they are named
// here as under review instead — the same treatment an unfinished profession
// guide gets.
//
// ── THE COMMERCIAL BOUNDARY, VISIBLE ON THE PAGE ───────────────────────
//
// The order of this list is computed before any provider is attached, and a
// short line above the list says so in the reader's own language. When a paid
// placement eventually exists it renders with a "Sponsrad utbildningsanordnare"
// label that has no off switch: the label is driven by `placement`, not by a
// separate flag somebody could forget to set.
//
// In the pilot `EDUCATION_PROVIDER_PLACEMENTS` is empty, so no badge renders
// at all. The mechanism ships; the money does not.

export function EducationPanel({
  education,
  onOfferOpen,
}: {
  education: ProfessionEducation;
  /** Fired with the offer id and its placement so organic and sponsored can
   *  be measured separately without inferring anything from a URL. */
  onOfferOpen?: (offerId: string, placement: "organic" | "sponsored") => void;
}) {
  const { t, lang } = useT();

  if (education.offers.length === 0 && education.underReview.length === 0) {
    return (
      <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {t("cc.p.education.none")}
      </p>
    );
  }

  return (
    <div data-education-panel>
      <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-muted-foreground">
        {t("cc.p.education.subtitle")}
      </p>

      {education.offers.length > 0 ? (
        <>
          <p
            data-education-neutrality
            className="mt-4 flex max-w-[70ch] items-start gap-2 text-xs leading-relaxed text-muted-foreground"
          >
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
            {t("cc.p.education.neutrality")}
          </p>
          <ul className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {education.offers.map((o) => (
              <OfferCard key={`${o.kind}-${o.id}`} offer={o} onOpen={onOfferOpen} />
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-6 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
          {t("cc.p.education.none")}
        </p>
      )}

      {education.underReview.length > 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-secondary/30 p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("cc.p.education.underreview")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
            {education.underReview.map((n, i) => (
              <li key={i} data-education-under-review>
                {L(n, lang)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OfferCard({
  offer,
  onOpen,
}: {
  offer: EducationOffer;
  onOpen?: (offerId: string, placement: "organic" | "sponsored") => void;
}) {
  const { t, lang } = useT();
  const formal = offer.relevance === "formal_requirement";

  return (
    <li
      data-education-offer={offer.id}
      data-education-relevance={offer.relevance}
      className="flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-xs"
    >
      <span
        className={[
          "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight",
          formal
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border bg-secondary text-foreground",
        ].join(" ")}
      >
        {t(`cc.p.education.relevance.${offer.relevance}` as TranslationKey)}
      </span>

      <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
        {L(offer.name, lang)}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {formal ? t("cc.p.education.formal.help") : t("cc.p.education.recommended.help")}
      </p>
      {offer.provider && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium">{t("cc.p.education.provider")}:</span>{" "}
          {L(offer.provider, lang)}
        </p>
      )}
      {offer.notes && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{L(offer.notes, lang)}</p>
      )}

      {/* A paid provider, when one exists. Never a plain link: the disclosure
          rides on the same element, in the same visual weight as the name. */}
      {offer.placements.length > 0 && (
        <ul className="mt-4 space-y-2">
          {offer.placements.map((pl) => (
            <li key={pl.url} data-education-placement={pl.placement}>
              <a
                href={pl.url}
                target="_blank"
                rel="noreferrer sponsored"
                onClick={() => onOpen?.(offer.id, pl.placement)}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {pl.providerName}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              {pl.placement === "sponsored" && (
                <>
                  <span className="ml-2 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t("cc.p.education.sponsored")}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {t("cc.p.education.sponsored.help")}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pushed to the bottom of the card so the four facts line up across a
          row whatever length the names above them are. The wrapper carries the
          gap: `mt-auto` on the list itself collapses against the line above
          it and reads as an underline under the provider. */}
      <div className="mt-auto pt-6">
        <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <div className="flex gap-1.5">
            <dt className="font-medium">{t("cc.p.education.country")}:</dt>
            <dd className="text-foreground">{offer.countries.join(", ")}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-medium">{t("cc.p.education.reviewed")}:</dt>
            <dd className="tabular-nums text-foreground">{offer.lastVerified}</dd>
          </div>
          {offer.source && (
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("cc.p.education.source")}:</dt>
              <dd>
                {offer.source.url ? (
                  <a
                    href={offer.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:text-accent hover:underline"
                  >
                    {L(offer.source.label, lang)}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <span className="text-foreground">{L(offer.source.label, lang)}</span>
                )}
                {offer.source.publisher && <span> — {offer.source.publisher}</span>}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </li>
  );
}
