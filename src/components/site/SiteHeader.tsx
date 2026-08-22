import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { countMyAcademyWork } from "@/lib/security-competency/academy-learning.functions";
import { countMyReviewQueue } from "@/lib/security-competency/academy-employer.functions";

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

  // ── The two role entries ────────────────────────────────────────────
  //
  // /academy and /reviews both run in AssessmentShell, which deliberately has
  // no site navigation: neither surface should compete with finishing the work
  // in front of you. That makes this header the only place either role can be
  // offered a way in, and until now neither was — both were reachable only
  // from a card on /my-career, or by typing the URL.
  //
  // Each entry is gated by whether the person actually has that kind of work,
  // and the gate is the data rather than a client-side role check. The review
  // queue is a security_invoker view, so a non-reviewer gets zero and the entry
  // never renders; there is no second copy of the capability rule here to drift
  // out of step with the database.
  //
  // Counts only — never a programme name, an employer name or anything a
  // reviewer is meant to see once, in context, on their own workspace.
  const academyCountFn = useServerFn(countMyAcademyWork);
  const reviewCountFn = useServerFn(countMyReviewQueue);

  const academy = useQuery({
    queryKey: ["academy", "my-work-count"],
    queryFn: () => academyCountFn(),
    // Signed-out visitors never ask. Every page in the app mounts this header,
    // so the window keeps a normal browsing session to one request per role.
    enabled: signedIn === true,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const reviews = useQuery({
    queryKey: ["academy", "review-queue-count"],
    queryFn: () => reviewCountFn(),
    enabled: signedIn === true,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const academyTotal = academy.data?.total ?? 0;
  const academyActionable = academy.data?.actionable ?? 0;
  const reviewCount = reviews.data ?? 0;

  // A count is shown only when it means "this is waiting for you". A person
  // whose only run is submitted and awaiting review is not being asked for
  // anything, and a badge would say otherwise.
  const roleLinks: { to: "/academy" | "/reviews"; label: string; count: number | null }[] = [];
  if (academyTotal > 0) {
    roleLinks.push({
      to: "/academy",
      label: t("nav.myAssessments"),
      count: academyActionable > 0 ? academyActionable : null,
    });
  }
  if (reviewCount > 0) {
    roleLinks.push({ to: "/reviews", label: t("nav.reviews"), count: reviewCount });
  }

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
            {/* Signed in, the right-hand action group offers the person their
                own workspace and nothing employer-shaped, so this quiet link
                is the only way back into the portal and has to stay. Signed
                out it would be an exact duplicate of the "Arbetsgivarportal"
                action button below -- same label, same route -- which is the
                ambiguity this header is being fixed for, so it is not
                rendered at all. */}
            {signedIn === true && (
              <Link
                to="/employer"
                className="text-primary-foreground/75 transition-colors hover:text-primary-foreground"
              >
                {t("nav.employerPortal")}
              </Link>
            )}
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
            {roleLinks.map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-secondary px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/60"
                activeProps={{ className: "border-accent bg-secondary" }}
              >
                {r.label}
                {r.count !== null && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-accent-foreground">
                    {r.count}
                  </span>
                )}
              </Link>
            ))}
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
              // Two entries, two audiences, two destinations. "Logga in" is
              // the candidate/general door (/candidate/login); the primary
              // button is the employer door (/employer/login). Neither is
              // "Arbetsgivare" -- that word belongs to the marketing page in
              // the primary nav, and reusing it here for an action is what
              // made the header unreadable. Both routes are the existing
              // PortalAuthForm entries; no new auth surface is introduced.
              <>
                <Link
                  to="/candidate/login"
                  className="rounded-md border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/40 hover:bg-secondary"
                >
                  {t("nav.signin")}
                </Link>
                <Link
                  to="/employer/login"
                  className="inline-flex items-center rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-[color:var(--primary-hover)] hover:shadow-md"
                >
                  {t("nav.employerPortal")}
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
          {roleLinks.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center justify-between gap-2 rounded-md border border-accent/40 bg-secondary px-2 py-2 text-sm font-semibold text-foreground"
              activeProps={{ className: "border-accent" }}
            >
              {r.label}
              {r.count !== null && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-accent-foreground">
                  {r.count}
                </span>
              )}
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
            {/* Mobile carries the same two-door distinction as desktop: the
                pill above is the candidate/general door, this is the employer
                one. Signed out it is the primary action and is styled like
                the desktop button; signed in it drops back to a quiet link,
                matching the utility bar it stands in for at this width. */}
            <Link
              to={signedIn ? "/employer" : "/employer/login"}
              onClick={() => setOpen(false)}
              className={cn(
                "flex min-h-[44px] items-center justify-center rounded-md px-2 py-2 text-sm font-semibold transition-colors",
                signedIn
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "bg-primary text-primary-foreground shadow-sm hover:bg-[color:var(--primary-hover)]",
              )}
            >
              {t("nav.employerPortal")}
            </Link>
          </div>
        </Container>
      </div>
    </header>
  );
}
