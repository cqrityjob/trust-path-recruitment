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
    <header className="no-print sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
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
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
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
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                activeProps={{ className: "bg-muted" }}
              >
                {t("nav.my_career")}
              </Link>
              <Link
                to="/employer"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("nav.employerPortal")}
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/candidate/login"
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                {t("nav.signin")}
              </Link>
              <Link
                to="/employer/login"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("nav.employerSignin")}
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
