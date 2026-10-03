import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { useSignedIn } from "@/hooks/useSignedIn";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { footerExtraNav, publicNav } from "./public-nav";
import { CONTACT_EMAIL } from "@/lib/site-contact";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal/documents";

const LEGAL_LINK =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** ── THE SITE FOOTER ─────────────────────────────────────────────────────
 *
 *  ONE row of links, and every one of them goes somewhere that works: the
 *  header's six, from the same definition (public-nav.ts), then the
 *  recruitment contact page and beta feedback.
 *
 *    Karriär · Jobb · Security Passport · Säkerhetsarbete ·
 *    För arbetsgivare · Om oss · Kontakt · Betafeedback
 *
 *  "Security Passport" and "Säkerhetsarbete" open their PUBLIC pages for a
 *  signed-out reader (/security-passport, /sakerhetsarbete) and the product
 *  itself for a signed-in one — never a homepage anchor, and never a login
 *  form wearing a product name.
 *
 *  "Kontakt" is back because /contact now sends: a recruitment enquiry goes
 *  to CQrityjob through the product's existing mail transport, and the page
 *  says so honestly while that transport is not configured.
 *
 *  ── THE LEGAL ROW ────────────────────────────────────────────────────
 *
 *  The terms of use (/villkor) and the privacy policy (/integritetspolicy)
 *  are published, so the bottom row links them, with the contact address
 *  the policy itself names: info@cqrityjob.com, for contact, support and
 *  privacy questions. Every one is a 44 x 44 target, like the row above. */
export function SiteFooter() {
  const { t } = useT();
  const signedIn = useSignedIn();
  const year = new Date().getFullYear();

  // The same six destinations as the header, in the same order, then the
  // contact page and what depends on the reader: footerExtraNav() (public-nav.ts)
  // offers "Registrera företag" to a signed-out visitor while the employer
  // portal is released, and Betafeedback to a signed-in reader only (/feedback
  // is behind the login).
  const links = [
    ...publicNav(signedIn === true).map((item) => ({
      key: item.key,
      to: item.to,
      search: undefined,
      label: t(item.labelKey),
    })),
    ...footerExtraNav({ signedIn, employerPortal: employerPortalEnabled() }).map((item) => ({
      key: item.key,
      to: item.to,
      search: item.search,
      label: t(item.labelKey),
    })),
  ];

  return (
    <footer className="no-print border-t border-border bg-background">
      <Container className="py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <Link
              to="/"
              className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <ShieldCheck className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} />
              <span className="text-base">{t("brand.name")}</span>
            </Link>
            {/* The brand line, once: "Where trust comes first." — the owner's
                slogan, in the same words in both languages. */}
            <p
              className="text-sm text-muted-foreground sm:border-l sm:border-border sm:pl-5"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("brand.slogan")}
            </p>
          </div>

          <nav aria-label={t("footer.company")}>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              {links.map((l) => (
                <li key={l.key}>
                  <Link
                    to={l.to}
                    search={l.search as never}
                    // 44 x 44, BOTH dimensions. The height was already here;
                    // the width was not, and "Jobb" is a 33px word -- a
                    // 33 x 44 target that the suite used to exempt by
                    // measuring footer rows on height alone. Centred inside
                    // the reserved box so the row's rhythm is unchanged for
                    // the longer labels.
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row md:items-center">
          <p>
            © {year} {t("brand.name")}. {t("footer.rights")} · {t("footer.built")}
          </p>
          <nav
            aria-label={t("footer.legal")}
            className="flex flex-wrap items-center gap-x-5 gap-y-1"
          >
            <Link to={TERMS_PATH} className={LEGAL_LINK}>
              {t("footer.terms")}
            </Link>
            <Link to={PRIVACY_PATH} className={LEGAL_LINK}>
              {t("footer.privacy")}
            </Link>
            <span className="inline-flex items-center gap-1.5">
              <span>{t("footer.contactEmail")}</span>
              <a href={`mailto:${CONTACT_EMAIL}`} className={LEGAL_LINK}>
                {CONTACT_EMAIL}
              </a>
            </span>
            <LanguageSwitcher />
          </nav>
        </div>
      </Container>
    </footer>
  );
}
