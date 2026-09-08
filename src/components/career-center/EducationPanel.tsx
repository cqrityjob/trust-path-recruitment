import { ExternalLink, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { L, type EducationOffer, type ProfessionEducation } from "@/lib/career-center";

// "Utbildning och behörighet" — the neutral education surface.
//
// ── FIVE THINGS EVERY ROW MUST CARRY ───────────────────────────────────
//
//   1. Whether it is a FORMAL REQUIREMENT or RECOMMENDED DEVELOPMENT.
//   2. Exactly WHICH PART of the requirement it satisfies — and what it does
//      not. "This is required" without saying required for what is not a
//      claim a reader can check.
//   3. Which country that statement applies in.
//   4. The authority or source behind it.
//   5. When that was last reviewed.
//
// All five come from an AUTHORED profession->offer link (education-links.ts),
// not from an inference over metadata. Rows that cannot carry them never
// reach this component.
//
// ── A COURSE IS NOT AN APPROVAL ────────────────────────────────────────
//
// Every regulated role in this catalogue also requires a suitability
// assessment and a decision by an authority. The standing sentence below says
// so once for the whole section, and each row's `supports` text says what
// remains outstanding for that particular requirement. Nothing here may imply
// that finishing a course produces an appointment.
//
// ── STANDARDS ARE NOT CERTIFICATES ─────────────────────────────────────
//
// ISO 31000, ISO 22301 and ISO/IEC 27001 used to render under a "Certifikat"
// heading with ISO named as the issuer. ISO issues no certificates; ISO 31000
// cannot be certified against at all; the other two certify an organisation's
// management system, not a person. Those records now carry
// `credentialType: "standard"` and render as KNOWLEDGE AREAS, with the issuer
// described as the publisher of the standard.
//
// ── THE COMMERCIAL BOUNDARY, VISIBLE ON THE PAGE ───────────────────────
//
// The order of this list is computed before any provider is attached, and a
// short line above the list says so. A paid placement renders as an
// advertisement: the disclosure is part of the link's own accessible name, so
// a screen-reader user hears "Annons – betald placering från X" as the link,
// not as a decoration beside it. In the pilot the placement list is empty, so
// nothing of the sort renders at all.

export function EducationPanel({ education }: { education: ProfessionEducation }) {
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
          <p
            data-education-not-guarantee
            className="mt-2 max-w-[70ch] text-xs leading-relaxed text-muted-foreground"
          >
            {t("cc.p.education.notGuarantee")}
          </p>
          <ul className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {education.offers.map((o) => (
              <OfferCard key={`${o.kind}-${o.id}`} offer={o} />
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

function OfferCard({ offer }: { offer: EducationOffer }) {
  const { t, lang } = useT();
  const formal = offer.relevance === "formal_requirement";

  return (
    <li
      data-education-offer={offer.id}
      data-education-relevance={offer.relevance}
      data-education-standard={offer.isStandard ? "true" : "false"}
      className="flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
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
        {offer.kind === "certification" && (
          <span className="inline-flex w-fit items-center rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {offer.isStandard ? t("cc.p.education.standard") : t("cc.p.education.credential")}
          </span>
        )}
      </div>

      <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
        {L(offer.name, lang)}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {formal ? t("cc.p.education.formal.help") : t("cc.p.education.recommended.help")}
      </p>

      {/* The authored relevance statement: which part of the requirement this
          satisfies, and what it does not. Never derived. */}
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("cc.p.education.supports")}
        </p>
        <p data-education-supports className="mt-1 text-sm leading-relaxed text-foreground">
          {L(offer.supports, lang)}
        </p>
      </div>

      {offer.provider && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium">
            {offer.isStandard ? t("cc.p.education.publisher") : t("cc.p.education.provider")}:
          </span>{" "}
          {L(offer.provider, lang)}
        </p>
      )}
      {offer.notes && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{L(offer.notes, lang)}</p>
      )}

      {/* A paid or manually added provider, when one exists. The disclosure is
          INSIDE the link, so it is part of the accessible name rather than a
          badge a screen reader meets afterwards — and `rel="sponsored"` is set
          only for a sponsored placement, because saying it of an organic link
          is simply false. */}
      {offer.placements.length > 0 && (
        <ul className="mt-4 space-y-2">
          {offer.placements.map((pl) => {
            const sponsored = pl.placement === "sponsored";
            return (
              <li key={pl.placementId} data-education-placement={pl.placement}>
                <a
                  href={pl.url}
                  target="_blank"
                  rel={sponsored ? "noreferrer sponsored" : "noreferrer"}
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {sponsored && (
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("cc.p.education.sponsored").replace("{provider}", pl.providerName)}
                    </span>
                  )}
                  {!sponsored && pl.providerName}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
                {sponsored && (
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {t("cc.p.education.sponsored.help")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Pushed to the bottom of the card so the facts line up across a row
          whatever length the text above them is. */}
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
