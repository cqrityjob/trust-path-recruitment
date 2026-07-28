import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { supabase } from "@/integrations/supabase/client";

export function SiteHeader() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION"
      ) {
        setSignedIn(Boolean(session));
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const nav = [
    { to: "/career-center", label: t("nav.career_center") },
    { to: "/jobs", label: t("nav.jobs") },
    { to: "/employers", label: t("nav.employers") },
    { to: "/assessment", label: t("nav.assessment") },
    { to: "/about", label: t("nav.about") },
    { to: "/contact", label: t("nav.contact") },
  ] as const;

  return (
    <header className="no-print sticky top-0 z-40 bg-background/90 backdrop-blur">
      {/* Slim utility bar — desktop only. Small trust signals + secondary access. */}
      <div className="hidden bg-primary text-primary-foreground/85 md:block">
        <Container className="flex h-8 items-center justify-between text-[11px] font-medium tracking-wide">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-3 w-3 text-[color:var(--gold)]" strokeWidth={2} />
            <span className="uppercase tracking-[0.14em]">{t("footer.tagline")}</span>
          </span>
          <div className="flex items-center gap-5">
            <Link
              to="/contact"
              className="text-primary-foreground/75 transition-colors hover:text-primary-foreground"
            >
              {t("nav.contact")}
            </Link>
            <Link
              to={signedIn ? "/employer" : "/employer/login"}
              className="text-primary-foreground/75 transition-colors hover:text-primary-foreground"
            >
              {signedIn ? t("nav.employerPortal") : t("nav.employerSignin")}
            </Link>
          </div>
        </Container>
      </div>
      <div className="border-b border-border bg-background/95 shadow-[0_1px_0_0_var(--color-border)]">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
          onClick={() => setOpen(false)}
        >
          <ShieldCheck className="h-5 w-5 text-accent" strokeWidth={1.75} />
          <span className="text-base">{t("brand.name")}</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="relative py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{
                className:
                  "text-foreground after:absolute after:-bottom-[22px] after:left-0 after:h-[2px] after:w-full after:bg-accent",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          {signedIn ? (
            <>
              <Link
                to="/my-career"
                className="rounded-md border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/40 hover:bg-secondary"
                activeProps={{ className: "border-accent/50 bg-secondary" }}
              >
                {t("nav.my_career")}
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/candidate/login"
                className="rounded-md border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/40 hover:bg-secondary"
              >
                {t("nav.signin")}
              </Link>
              <Link
                to="/employers"
                className="inline-flex items-center rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-[color:var(--primary-hover)] hover:shadow-md"
              >
                {t("nav.employers")}
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-foreground md:hidden"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </Container>
      </div>

      <div className={cn("border-t border-border md:hidden", open ? "block" : "hidden")}>
        <Container className="flex flex-col gap-1 py-4">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <LanguageSwitcher />
              {signedIn ? (
                <Link
                  to="/my-career"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                >
                  {t("nav.my_career")}
                </Link>
              ) : (
                <Link
                  to="/candidate/login"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                >
                  {t("nav.signin")}
                </Link>
              )}
            </div>
            <Link
              to={signedIn ? "/employer" : "/employer/login"}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {signedIn ? t("nav.employerPortal") : t("nav.employerSignin")}
            </Link>
          </div>
        </Container>
      </div>
    </header>
  );
}
