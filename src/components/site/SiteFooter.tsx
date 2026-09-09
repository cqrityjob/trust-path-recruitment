import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { BrandMark } from "@/components/patterns/BrandMark";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";

/** ── THE SITE FOOTER (compacted 2026-09-06) ──────────────────────────────
 *
 *  It was five columns and ~500px tall, and it carried nine links to six
 *  destinations. "Kontakt" appeared twice. "Bedömningar" appeared twice.
 *  A footer that repeats itself is not a map, it is noise at the bottom of
 *  every page on the site.
 *
 *  What is here now is ONE row of links, and every one of them goes
 *  somewhere that works:
 *
 *    Security Passport · Karriärvägar · Jobb · För arbetsgivare · Om oss ·
 *    Betafeedback
 *
 *  "Security Passport" is the homepage's own Passport section, not a page
 *  of its own: every Passport route is authenticated, and a footer link
 *  that lands a signed-out reader on a login form is a dead end wearing a
 *  product name.
 *
 *  ── WHAT IS DELIBERATELY NOT A LINK ──────────────────────────────────
 *
 *  "Integritetspolicy" and "Villkor" have no pages yet. They are printed
 *  as plain text, in the muted colour, with no hover and no cursor change,
 *  because a link that does nothing when you click it is worse on a legal
 *  line than an absence -- somebody looking for the privacy policy learns
 *  something true from "not published yet" and nothing at all from a dead
 *  anchor. They become links the day the routes exist, and not before.
 *
 *  ── WHAT IS DELIBERATELY GONE ────────────────────────────────────────
 *
 *  /contact. The route still exists and is still reachable by URL, but the
 *  form on it calls preventDefault and sends nothing. The site should not
 *  invite anybody into it from the bottom of every page until it does. */
export function SiteFooter() {
  const { t } = useT();
  const year = new Date().getFullYear();

  const links = [
    // Same first entry as the header, for the same reason: the Passport has
    // no public page of its own, so the product's own name points at the
    // section of the homepage that explains it. `hash` rather than "#" in
    // `to` -- the router does not parse one out of the path.
    { to: "/", hash: "passport", label: t("nav.passportPublic") },
    { to: "/career-center", hash: undefined, label: t("nav.career_center") },
    { to: "/jobs", hash: undefined, label: t("nav.jobs") },
    { to: "/employers", hash: undefined, label: t("nav.employers") },
    { to: "/about", hash: undefined, label: t("nav.about") },
    { to: "/feedback", hash: undefined, label: t("footer.betaFeedback") },
  ] as const;

  return (
    <footer className="no-print border-t border-border bg-background">
      <Container className="py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <Link
              to="/"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <BrandMark />
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
                <li key={l.to}>
                  <Link
                    to={l.to}
                    hash={l.hash}
                    activeOptions={{ exact: l.to === "/" }}
                    className="inline-flex min-h-[44px] items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
            {/* Not anchors, and styled so they do not look like anchors. See
                the header comment: these two get the tag the day they get
                the route. */}
            <span>{t("footer.legal.privacy")}</span>
            <span>{t("footer.legal.terms")}</span>
            <LanguageSwitcher />
          </div>
        </div>
      </Container>
    </footer>
  );
}
