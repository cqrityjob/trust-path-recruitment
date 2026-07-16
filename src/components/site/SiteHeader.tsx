import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const nav = [
    { to: "/careers", label: t("nav.careers") },
    { to: "/jobs", label: t("nav.jobs") },
    { to: "/employers", label: t("nav.employers") },
    { to: "/assessment", label: t("nav.assessment") },
    { to: "/about", label: t("nav.about") },
    { to: "/contact", label: t("nav.contact") },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
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
          <span
            className="cursor-not-allowed rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
            title={t("nav.signin.tooltip")}
            aria-disabled="true"
          >
            {t("nav.signin")}
          </span>
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
          <div className="mt-3 flex items-center justify-between">
            <LanguageSwitcher />
            <span
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
              title={t("nav.signin.tooltip")}
            >
              {t("nav.signin")}
            </span>
          </div>
        </Container>
      </div>
    </header>
  );
}