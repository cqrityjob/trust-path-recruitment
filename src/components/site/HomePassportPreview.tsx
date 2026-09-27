import { Lock } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  CredentialConstellation,
  type ShieldCredential,
} from "@/components/security-passport/CredentialShield";
import { resolveCredentialScope } from "@/lib/security-passport/credential-shield";

/**
 * The homepage's illustrative Security Passport: ONE example card, in the
 * Passport section it explains.
 *
 * ── MOVED OUT OF THE HERO (MVP text specification, 2026-09-27) ─────────
 *
 * This panel used to be the hero's dark product anchor and carried the
 * Passport's own heading and registration action. With three equal core
 * parts, a large Passport visual in the hero would make the other two
 * subordinate, so the example now lives in the Passport section, and the
 * section — not this card — carries the heading and the action.
 *
 * ── NOT AN IMITATION ───────────────────────────────────────────────────
 *
 * It wears the SAME ground (`passport-signature`, mirrored from
 * PASSPORT_CARD_SURFACE) and draws its credentials with the SAME
 * `CredentialConstellation`, scope resolver, flags and globe the holder's own
 * card uses. There is nothing here to keep in step by hand.
 *
 * ── THE EXAMPLE IS FICTIONAL, AND SAYS SO ──────────────────────────────
 *
 * The card carries an "Exempel / Example" label and a caption that says the
 * person and the credentials are made up. Nothing on it is verified: every
 * shield is self-declared — the honest shape of a Passport on the day
 * somebody starts one.
 * No name, number, issuer logo, tick or rating that could be mistaken for a
 * real holder's.
 *
 * ── NO ACTION IN HERE ──────────────────────────────────────────────────
 *
 * Nobody may read "create your Passport" as a control ON a fictional
 * person's record, so the card holds no control at all; the section's own
 * action sits outside it.
 *
 * ── NO <header> AND NO <footer> IN HERE ────────────────────────────────
 *
 * The public-entry suite asserts ONE site header and ONE site footer and
 * drives the mobile menu through `header`. The bands are plain containers.
 */
export function HomePassportPreview() {
  const { t, lang } = useT();
  const l = lang === "sv" ? "sv" : "en";

  // Fictional, and deliberately unverified. The abbreviations are governed
  // marks or written in the name itself — see `shieldMarkText`.
  const example: readonly ShieldCredential[] = [
    {
      id: "example-cpp",
      code: "INTL_ASIS_CPP",
      name: "Certified Protection Professional (CPP)",
      state: "self_declared",
      lifecycle: "active",
      validUntil: null,
      scope: resolveCredentialScope({ global: true }, l),
    },
    {
      id: "example-ov",
      code: "OV",
      name: l === "sv" ? "Ordningsvaktsförordnande" : "Public Order Guard Appointment",
      state: "self_declared",
      lifecycle: "active",
      validUntil: null,
      scope: resolveCredentialScope({ jurisdictionCode: "SE" }, l),
    },
    {
      id: "example-sia",
      code: null,
      name: "SIA Licence — Security Guarding",
      state: "self_declared",
      lifecycle: "active",
      validUntil: null,
      scope: resolveCredentialScope({ jurisdictionCode: "GB" }, l),
    },
  ];

  return (
    <article
      aria-label={t("home.markets.eyebrow")}
      className="passport-signature passport-card-frame relative isolate overflow-hidden rounded-xl bg-primary p-5 text-primary-foreground sm:p-7"
      data-home-passport-preview
    >
      <div
        className="flex items-start justify-between gap-4 border-b border-primary-foreground/15 pb-5"
        data-home-passport-band="top"
      >
        <div>
          <p className="text-base font-semibold text-primary-foreground">CQrityjob</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/65">
            Security Passport
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 text-xs text-primary-foreground/80">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("home.passportPreview.private")}
        </span>
      </div>

      {/* ── The illustrative card ─────────────────────────────────────── */}
      {/* The visible label "Exempel / Example" and the caption under the card
          say what this is: a fictional person with fictional credentials.
          The caption is also the figure's accessible name. */}
      <figure
        className="mt-6"
        data-home-passport-example
        aria-label={t("home.passportPreview.exampleCaption")}
      >
        <div className="rounded-lg border border-primary-foreground/15 bg-primary-foreground/[0.04] p-4 [container-type:inline-size] sm:p-5">
          <div className="flex items-center justify-end gap-3">
            <span
              data-home-passport-example-label
              className="inline-flex min-h-6 items-center rounded-full border border-dashed border-primary-foreground/45 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/85"
            >
              {t("home.passportPreview.exampleLabel")}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3.5">
            <div
              aria-hidden="true"
              className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-lg border border-dashed border-primary-foreground/30 bg-primary-foreground/[0.06] text-sm font-semibold text-primary-foreground/80"
            >
              EX
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight text-primary-foreground [overflow-wrap:normal] [word-break:keep-all]">
                {t("home.passportPreview.exampleName")}
              </p>
            </div>
          </div>

          <CredentialConstellation
            credentials={example}
            ground="navy"
            className="mt-5 border-t border-primary-foreground/15 pt-4"
          />
        </div>
        <figcaption
          data-home-passport-example-caption
          className="mt-3 text-xs leading-relaxed text-primary-foreground/80"
        >
          {t("home.passportPreview.exampleCaption")}
        </figcaption>
      </figure>

      {/* Each credential carries its OWN review status; the panel states none.
          This replaces the decorative "Documented source" facts. */}
      <p
        data-home-passport-status-note
        className="mt-5 border-l-2 border-primary-foreground/35 pl-3.5 text-sm leading-relaxed text-primary-foreground/85"
      >
        {t("home.passportPreview.statusNote")}
      </p>

      {/* No market band on this card: the homepage's Passport section names
          the three markets together with their pilot status, which a bare
          "markets today" list here could only overstate. */}
    </article>
  );
}
