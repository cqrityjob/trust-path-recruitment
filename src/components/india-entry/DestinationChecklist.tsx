import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ScopeMark } from "@/components/security-passport/CredentialShield";
import { resolveCredentialScope } from "@/lib/security-passport/credential-shield";
import {
  indiaT,
  INDIA_ENTRY_SOURCES,
  type IndiaCopyKey,
  type IndiaLang,
} from "@/lib/india-entry/copy";
import type { IndiaSetupCredential } from "@/lib/india-entry/setup.functions";

/**
 * The next steps for a destination the holder CHOSE — Dubai first, and the
 * United Kingdom when asked for.
 *
 * ── THREE LISTS, KEPT APART ────────────────────────────────────────────
 *
 *   recorded   what the Passport holds, each with its OWN territory (an Indian
 *              qualification keeps India's flag; nothing is relabelled Dubai)
 *   needed     what Dubai's regulator usually requires and the Passport does
 *              not hold — stated from SIRA's own page
 *   external   what only the employer and the authorities can confirm
 *
 * ── WHAT IT NEVER SHOWS ────────────────────────────────────────────────
 *
 * No score, no percentage, no "ready" state and no badge. Nothing here is
 * computed from the credentials: the "needed" list is the same for everybody,
 * because whether a holder meets a Dubai requirement is SIRA's and the
 * employer's decision, not this product's. Choosing Dubai changes nothing
 * about a credential, a work country or what a market lets anyone record.
 */
export function DestinationChecklist({
  lang,
  destinations,
  credentials,
}: {
  lang: IndiaLang;
  destinations: readonly string[];
  credentials: readonly IndiaSetupCredential[];
}) {
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  const passportLang = lang === "sv" ? "sv" : "en";
  const wantsDubai = destinations.includes("AE-DU") || destinations.includes("AE");
  const wantsUk = destinations.includes("GB");
  if (!wantsDubai && !wantsUk) return null;

  return (
    <div className="space-y-5" data-destination-checklist>
      {wantsDubai && (
        <section
          aria-labelledby="dest-dubai-title"
          className="rounded-xl border border-border bg-card p-5 sm:p-6"
          data-destination="AE-DU"
        >
          <h2 id="dest-dubai-title" className="text-lg font-semibold text-foreground">
            {t("check.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("check.lead")}</p>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div data-checklist-group="recorded">
              <h3 className="text-sm font-semibold text-foreground">{t("check.recorded.title")}</h3>
              {credentials.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t("check.recorded.none")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {credentials.map((c) => {
                    const scope = resolveCredentialScope(
                      {
                        global: c.scopeCode === "global_professional",
                        jurisdictionCode: c.jurisdictionCode,
                        subJurisdictionCode: c.subJurisdictionCode,
                      },
                      passportLang,
                    );
                    return (
                      <li key={c.id} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5">
                          <ScopeMark scope={scope} />
                        </span>
                        <span className="min-w-0 break-words">
                          {c.title}
                          <span className="block text-xs text-muted-foreground">{scope.label}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{t("check.recorded.note")}</p>
            </div>

            <div data-checklist-group="needed">
              <h3 className="text-sm font-semibold text-foreground">{t("check.needed.title")}</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-foreground">
                <li>{t("check.needed.training")}</li>
                <li>{t("check.needed.card")}</li>
                <li>{t("check.needed.conduct")}</li>
                <li>{t("check.needed.medical")}</li>
              </ul>
            </div>

            <div data-checklist-group="external">
              <h3 className="text-sm font-semibold text-foreground">{t("check.external.title")}</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-foreground">
                <li>{t("check.external.residency")}</li>
                <li>{t("check.external.recognition")}</li>
              </ul>
            </div>
          </div>

          <p className="mt-5 border-l-2 border-accent/60 pl-3 text-sm text-foreground">
            {t("check.notReplace")}
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <a
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent underline"
              href={INDIA_ENTRY_SOURCES.siraCadreCard}
              target="_blank"
              rel="noreferrer"
            >
              {t("check.source")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <span className="text-xs text-muted-foreground">{t("check.checked")}</span>
          </p>
        </section>
      )}

      {wantsUk && (
        <section
          aria-labelledby="dest-uk-title"
          className="rounded-xl border border-border bg-card p-5 sm:p-6"
          data-destination="GB"
        >
          <h2 id="dest-uk-title" className="text-lg font-semibold text-foreground">
            {t("check.uk.title")}
          </h2>
          <p className="mt-2 text-sm text-foreground">{t("check.uk.body1")}</p>
          <p className="mt-2 text-sm text-foreground">{t("check.uk.body2")}</p>
          <p className="mt-3 flex flex-col gap-1 text-sm sm:flex-row sm:gap-5">
            <a
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent underline"
              href={INDIA_ENTRY_SOURCES.siaLicence}
              target="_blank"
              rel="noreferrer"
            >
              {t("check.uk.sia")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent underline"
              href={INDIA_ENTRY_SOURCES.skilledWorkerOccupations}
              target="_blank"
              rel="noreferrer"
            >
              {t("check.uk.visa")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </p>
        </section>
      )}

      <p className="flex flex-wrap gap-3">
        <Link
          to="/passport/credentials/new"
          className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium"
        >
          {t("check.addCredential")}
        </Link>
        <Link
          to="/passport/start"
          search={{ step: "destinations" }}
          className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium"
        >
          {t("check.editDestinations")}
        </Link>
      </p>
    </div>
  );
}
