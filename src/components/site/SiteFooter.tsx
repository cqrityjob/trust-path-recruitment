import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { useSignedIn } from "@/hooks/useSignedIn";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { publicNav } from "./public-nav";

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
 *  ── WHAT IS DELIBERATELY NOT A LINK ──────────────────────────────────
 *
 *  The privacy policy and the terms of use have no approved pages yet. The
 *  footer says exactly that, as plain text in the muted colour, with no
 *  hover and no cursor change: somebody looking for the privacy policy learns
 *  something true from "not published yet" and nothing at all from a dead
 *  anchor. They become links the day approved documents and routes exist. */
export function SiteFooter() {
  const { t } = useT();
  const signedIn = useSignedIn();
  const year = new Date().getFullYear();

  // The same six destinations as the header, in the same order, then the
  // recruitment contact page and beta feedback.
  const links = [
    ...publicNav(signedIn === true).map((item) => ({
      key: item.key,
      to: item.to,
      label: t(item.labelKey),
    })),
    { key: "contact", to: "/contact", label: t("nav.contact") },
    { key: "feedback", to: "/feedback", label: t("footer.betaFeedback") },
  ] as const;

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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {/* Not anchors, and not two document names either: one plain
                statement that the documents are not published yet. See the
                header comment: they get links the day they get routes. */}
            <span>{t("footer.legal.notice")}</span>
            <LanguageSwitcher />
          </div>
        </div>
      </Container>
    </footer>
  );
}
