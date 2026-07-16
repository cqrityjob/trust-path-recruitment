import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteFooter() {
  const { t } = useT();
  const year = new Date().getFullYear();

  const individuals = [
    { to: "/career-center", label: t("nav.career_center") },
    { to: "/jobs", label: t("nav.jobs") },
    { to: "/assessment", label: t("nav.assessment") },
  ] as const;
  const orgs = [
    { to: "/employers", label: t("nav.employers") },
    { to: "/assessment", label: t("nav.assessment") },
    { to: "/contact", label: t("nav.contact") },
  ] as const;
  const company = [
    { to: "/about", label: t("nav.about") },
    { to: "/contact", label: t("nav.contact") },
  ] as const;

  return (
    <footer className="border-t border-border bg-background">
      <Container className="py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <Link
              to="/"
              className="flex items-center gap-2 font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <ShieldCheck className="h-5 w-5 text-accent" strokeWidth={1.75} />
              <span className="text-base">{t("brand.name")}</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">{t("footer.tagline")}</p>
            <p className="mt-2 max-w-sm text-xs text-muted-foreground/80">{t("footer.built")}</p>
            <div className="mt-6">
              <LanguageSwitcher />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">
              {t("footer.for_individuals")}
            </h3>
            <ul className="mt-4 space-y-2 text-sm">
              {individuals.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">
              {t("footer.for_orgs")}
            </h3>
            <ul className="mt-4 space-y-2 text-sm">
              {orgs.map((l) => (
                <li key={`${l.to}-org`}>
                  <Link to={l.to} className="text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">
              {t("footer.company")}
            </h3>
            <ul className="mt-4 space-y-2 text-sm">
              {company.map((l) => (
                <li key={`${l.to}-co`}>
                  <Link to={l.to} className="text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h3 className="mt-8 text-xs font-semibold uppercase tracking-widest text-foreground">
              {t("footer.legal")}
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>{t("footer.legal.privacy")}</li>
              <li>{t("footer.legal.terms")}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row md:items-center">
          <p>© {year} {t("brand.name")}. {t("footer.rights")}</p>
          <p className="tracking-tight text-foreground/70" style={{ fontFamily: "var(--font-display)" }}>
            {t("brand.slogan")}
          </p>
        </div>
      </Container>
    </footer>
  );
}