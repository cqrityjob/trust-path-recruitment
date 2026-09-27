import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { useSignedIn } from "@/hooks/useSignedIn";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { publicNav } from "./public-nav";

/** ── THE SITE FOOTER (compacted 2026-09-06) ──────────────────────────────
 *
 *  It was five columns and ~500px tall, and it carried nine links to six
 *  destinations. "Kontakt" appeared twice. "Bedömningar" appeared twice.
 *  A footer that repeats itself is not a map, it is noise at the bottom of
 *  every page on the site.
 *
 *  What is here now is ONE row of links, and every one of them goes
 *  somewhere that works: the header's six, from the same definition
 *  (public-nav.ts), plus beta feedback.
 *
 *    Säkerhetsarbete · Security Passport · Karriär · Jobb ·
 *    För arbetsgivare · Om oss · Betafeedback
 *
 *  "Säkerhetsarbete" and "Security Passport" are the homepage's own
 *  sections for a signed-out reader, not pages of their own: every Passport
 *  and security-work route is authenticated, and a footer link that lands a
 *  signed-out reader on a login form is a dead end wearing a product name.
 *  A signed-in reader goes straight to the product instead.
 *
 *  Career Discovery is no longer a footer entry of its own (MVP text
 *  specification §4): it is reached from the career card and the career
 *  section on the homepage and from the Career Center, and it does not
 *  compete with the three core parts in the site's navigation.
 *
 *  ── WHAT IS DELIBERATELY NOT A LINK ──────────────────────────────────
 *
 *  The privacy policy and the terms of use have no approved pages yet. The
 *  footer says exactly that, as plain text in the muted colour, with no
 *  hover and no cursor change, because a link that does nothing when you
 *  click it is worse on a legal line than an absence -- somebody looking for
 *  the privacy policy learns something true from "not published yet" and
 *  nothing at all from a dead anchor or a bare document name. They become
 *  links the day approved documents and their routes exist, and not before.
 *
 *  ── WHAT IS DELIBERATELY GONE ────────────────────────────────────────
 *
 *  /contact. The route still exists and is still reachable by URL, but the
 *  form on it calls preventDefault and sends nothing. The site should not
 *  invite anybody into it from the bottom of every page until it does. */
export function SiteFooter() {
  const { t } = useT();
  const signedIn = useSignedIn();
  const year = new Date().getFullYear();

  // The same six destinations as the header, in the same order, plus beta
  // feedback. `hash` rather than "#" in `to` -- the router does not parse
  // one out of the path.
  const links = [
    ...publicNav(signedIn === true).map((item) => ({
      key: item.key,
      to: item.to,
      hash: item.hash,
      label: t(item.labelKey),
    })),
    { key: "feedback", to: "/feedback", hash: undefined, label: t("footer.betaFeedback") },
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
            {/* The brand principle, once. It used to appear twice in this
                footer -- as `footer.tagline` beside the mark and again as
                `brand.slogan` on the bottom rule, saying the same thing. */}
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
                    hash={l.hash}
                    activeOptions={{ exact: l.to === "/", includeHash: l.hash !== undefined }}
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
