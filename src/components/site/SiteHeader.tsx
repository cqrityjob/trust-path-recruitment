import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  ChevronDown,
  Gavel,
  LogOut,
  Menu,
  ShieldCheck,
  UserPen,
  UserRound,
  X,
} from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { resolveCandidateNav, type CandidateNavKey } from "./candidate-app-nav";
import { EMPLOYER_NAV, EMPLOYER_REGISTER_NAV, publicNav } from "./public-nav";
import { CandidateAppNav } from "./CandidateAppNav";
import { supabase } from "@/integrations/supabase/client";
import { countMyAcademyWork } from "@/lib/security-competency/academy-learning.functions";
import { countMyReviewQueue } from "@/lib/security-competency/academy-employer.functions";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { AccountMenu, type AccountIdentity } from "./AccountMenu";
import { workspaceStatusLabelKey } from "./workspace-status";

/** One visible keyboard-focus treatment for every control in the header.
 *  Several of them previously had none at all, which made the header
 *  un-navigable by keyboard without guessing where you were. */
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** The minimum hit area for EVERY interactive control in the public chrome,
 *  at every width, in both dimensions (Platform Entry Specification §4.2 and
 *  §12). e2e/public-homepage.spec.ts measures header, main AND footer at
 *  320/375/390/768/1024/1440 against `getBoundingClientRect()` -- a real box,
 *  not a padding trick a pseudo-element could fake. */
const touchTarget = "min-h-[44px] min-w-[44px]";

/** A public nav entry on the desktop bar. The padding steps up at xl: at
 *  1024-1279px the locked six, SV / EN and both account actions have ~40px to
 *  spare, and a wider box is what would spend it. Measured, not guessed. */
const DESKTOP_ITEM =
  "relative inline-flex items-center justify-center gap-1 rounded-md px-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground xl:px-2.5";
const DESKTOP_ACTIVE =
  "text-foreground after:absolute after:bottom-0 after:left-1.5 after:right-1.5 after:h-[2px] after:rounded-full after:bg-accent xl:after:left-2.5 xl:after:right-2.5";

/** The compact menu sheet's own surface. It scrolls independently: signed in,
 *  with an organisation and the account block, the sheet is taller than a
 *  small phone in landscape and the last rows were unreachable. */
const MENU_SURFACE =
  "max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-background";

export function SiteHeader() {
  const { t, tp } = useT();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  // Sticky-header depth, added only once the page has actually moved. Only
  // colour and shadow animate, so there is no layout shift.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // ── THE SHEET CLOSES BY ITSELF ───────────────────────────────────────
  //
  // On navigation, on Escape, and on a resize past the desktop breakpoint --
  // each of those is otherwise a person looking at a full-width menu they did
  // not ask for.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    mql.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      mql.removeEventListener("change", onChange);
    };
  }, [open]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // Read off the SAME session this component already subscribes to — no extra
  // request. The account menu has to be able to say who it would sign out.
  const [account, setAccount] = useState<{ name: string; email: string }>({
    name: "",
    email: "",
  });

  useEffect(() => {
    let alive = true;
    const read = (session: { user?: unknown } | null) => {
      const user = (session?.user ?? null) as {
        email?: string | null;
        user_metadata?: Record<string, unknown>;
      } | null;
      if (!user) {
        setAccount({ name: "", email: "" });
        return;
      }
      const meta = user.user_metadata ?? {};
      const email = user.email ?? "";
      const name =
        (typeof meta.display_name === "string" && meta.display_name) ||
        (typeof meta.name === "string" && meta.name) ||
        email.split("@")[0] ||
        "";
      setAccount({ name, email });
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSignedIn(Boolean(data.session));
      read(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION"
      ) {
        setSignedIn(Boolean(session));
        read(session);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ── MARKETING CHROME vs APPLICATION CHROME ──────────────────────────
  //
  // These six links are the WEBSITE's navigation. They are not served to
  // somebody signed in and standing inside their own workspace, where the
  // candidate's seven destinations replace them (candidate-app-nav.ts).
  //
  // ── THE LOCKED NAVIGATION (2026-09-30) ──────────────────────────────
  //
  //   Karriär · Jobb · Security Passport · Säkerhetsarbete ·
  //   För arbetsgivare ▾ · Om oss            SV / EN · Logga in · Skapa konto
  //
  // One definition (public-nav.ts) renders the desktop bar, the compact menu
  // and the footer. Only "För arbetsgivare" opens a submenu; its five entries
  // are sections of /employers (EMPLOYER_NAV). The two product entries open
  // their PUBLIC pages for a signed-out visitor — never a homepage anchor —
  // and the product itself for a signed-in one.
  const nav = publicNav(signedIn === true).map((item) => ({ ...item, label: t(item.labelKey) }));

  // ── The two role entries ────────────────────────────────────────────
  //
  // Each is gated by whether the person actually has that kind of work, and
  // the gate is the data rather than a client-side role check. The review
  // queue is a security_invoker view, so a non-reviewer gets zero and the
  // entry never renders. Counts only — never a programme or employer name.
  const academyCountFn = useServerFn(countMyAcademyWork);
  const reviewCountFn = useServerFn(countMyReviewQueue);

  const academy = useQuery({
    queryKey: ["academy", "my-work-count"],
    queryFn: () => academyCountFn(),
    // Signed-out visitors never ask.
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

  // Does this person actually hold a workspace? Same server function and
  // query key as the dashboard, so on /my-career the two share one request.
  const fetchWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const workspaces = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => fetchWorkspaces(),
    enabled: signedIn === true && employerPortalEnabled(),
    staleTime: 5 * 60 * 1000,
    // This one gates NAVIGATION: one retry, so a transient blip does not
    // strand a member without the route into their workspace.
    retry: 1,
  });
  // Strictly "the database returned an organisation this person belongs to".
  // An organisation UNDER REVIEW is carried through with its status so a
  // registrant can find their own pending organisation. The status decides
  // the label and the destination in AccountMenu; it grants nothing, and
  // every route re-verifies access server-side.
  const myWorkspaces = (workspaces.data ?? []).map((w) => ({
    employerSlug: w.employerSlug,
    employerName: w.employerName,
    employerStatus: w.employerStatus,
  }));
  const hasEmployerWorkspace = myWorkspaces.length > 0;

  // ── WHICH CHROME THIS ROUTE GETS ────────────────────────────────────
  //
  // Asked of the ROUTER, not of the pathname. PRESENTATION ONLY: being in
  // the candidate chrome grants nothing and withholds nothing.
  const matches = useMatches();
  const { inCandidateApp, activeKey } = resolveCandidateNav(
    matches.map((m) => m.routeId as string),
  );
  const appMode = signedIn === true && inCandidateApp;

  /** Which context the CURRENT ROUTE is in. Presentation only. */
  const employerMatch = /^\/employer\/([^/]+)/.exec(location.pathname);
  const currentContext: AccountIdentity["currentContext"] =
    employerMatch && employerMatch[1]
      ? { employerSlug: employerMatch[1] }
      : /^\/reviews(\/|$)/.test(location.pathname)
        ? "reviewer"
        : "personal";

  async function onSignOut() {
    await supabase.auth.signOut();
  }

  const academyTotal = academy.data?.total ?? 0;
  const academyActionable = academy.data?.actionable ?? 0;
  const reviewCount = reviews.data ?? 0;

  const identity: AccountIdentity = {
    name: account.name,
    email: account.email,
    workspaces: myWorkspaces,
    reviewQueueCount: reviewCount,
    currentContext,
  };
  // The public-site chrome keeps the assessment entry for somebody signed in
  // and reading the website, so an employer's invitation is findable from
  // any page: as its own row in the compact menu, and on the desktop bar as
  // the count on "Min karriär" — the locked row has no width for a third
  // pill beside SV / EN.
  const roleLinks: { to: "/academy"; label: string; count: number | null }[] = [];
  if (!appMode && academyTotal > 0) {
    roleLinks.push({
      to: "/academy",
      label: t("nav.myAssessments"),
      count: academyActionable > 0 ? academyActionable : null,
    });
  }

  /** The badge for one app-nav item, or null. Only "this is waiting for
   *  you" earns a number. */
  const appNavCount = (key: CandidateNavKey): number | null =>
    key === "assessments" && academyActionable > 0 ? academyActionable : null;

  const onEmployers = /^\/employers(\/|$)/.test(location.pathname);

  return (
    <header className="no-print sticky top-0 z-40 bg-background/90 backdrop-blur">
      {/* ── ONE ROW ─────────────────────────────────────────────────────
          The navy utility strip that used to sit above this row is gone. It
          carried the slogan, the language toggle and the employer door; the
          toggle now sits on the right as the locked navigation specifies, the
          employer door lives in the "För arbetsgivare" menu, and the slogan
          is the footer's. One row also keeps the sticky header from eating a
          sixth of a laptop screen. */}
      <div
        className={cn(
          "border-b bg-background/95 transition-shadow duration-200 motion-reduce:transition-none",
          scrolled
            ? "border-border/80 shadow-[var(--shadow-md)]"
            : "border-border shadow-[0_1px_0_0_var(--color-border)]",
        )}
      >
        <Container className="flex h-16 items-center justify-between gap-3 lg:px-6 xl:gap-6 xl:px-8">
          {/* The brand mark goes to the public homepage, always, signed in or
              not. `to="/"` unconditionally: a brand mark must never mean two
              different things depending on who is reading it. */}
          <Link
            to="/"
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight text-foreground",
              touchTarget,
              focusRing,
            )}
            style={{ fontFamily: "var(--font-display)" }}
            onClick={() => setOpen(false)}
          >
            <ShieldCheck className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} />
            <span className="text-base leading-none">{t("brand.name")}</span>
          </Link>

          {appMode ? (
            <CandidateAppNav variant="desktop" activeKey={activeKey} badgeFor={appNavCount} />
          ) : (
            <nav
              className="hidden min-w-0 items-center gap-0.5 lg:flex xl:gap-1"
              aria-label={t("nav.primary")}
              data-site-nav="primary"
            >
              {nav.map((item) =>
                item.key === "employers" ? (
                  <EmployerMenu
                    key={item.key}
                    label={item.label}
                    active={onEmployers}
                    signedIn={signedIn}
                  />
                ) : (
                  <Link
                    key={item.key}
                    to={item.to}
                    className={cn(DESKTOP_ITEM, touchTarget, focusRing)}
                    activeProps={{ className: DESKTOP_ACTIVE }}
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
          )}

          {/* One control height across the cluster: 44px, like every other
              control in the public chrome. */}
          <div className="hidden shrink-0 items-center gap-1.5 lg:flex xl:gap-2">
            {!appMode && (
              <>
                <LanguageSwitcher compact className="xl:hidden" />
                <LanguageSwitcher className="hidden xl:inline-flex" />
              </>
            )}
            {signedIn ? (
              <>
                {/* The way into the workspace, for somebody who is signed in
                    but reading the public site. Inside the workspace it would
                    be a SECOND "Min karriär" beside the nav item. */}
                {!appMode && (
                  <Link
                    to="/my-career"
                    className={cn(
                      "inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3.5 text-xs font-semibold whitespace-nowrap text-foreground transition-colors hover:border-accent/40 hover:bg-secondary",
                      focusRing,
                    )}
                    activeProps={{ className: "border-accent/50 bg-secondary" }}
                  >
                    {t("nav.my_career")}
                    {roleLinks[0]?.count != null && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-accent-foreground">
                        {roleLinks[0].count}
                      </span>
                    )}
                  </Link>
                )}
                {/* Account concerns — identity, workspace switch, sign out —
                    in the chrome, on every page. */}
                <AccountMenu identity={identity} onSignOut={onSignOut} />
              </>
            ) : (
              // ONE door in, and ONE product-neutral account action. The intent
              // to use a particular product is carried by `?redirect=` from the
              // page where somebody chose it — never from this chrome, which
              // would make one product the site's default. See
              // scripts/header-entry-check.ts.
              <>
                <Link
                  to="/login"
                  className={cn(
                    "inline-flex h-11 min-w-[44px] items-center justify-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground xl:px-3",
                    focusRing,
                  )}
                >
                  {t("nav.signin")}
                </Link>
                <Link
                  to="/signup"
                  className={cn(
                    "inline-flex h-11 min-w-[44px] items-center justify-center rounded-md bg-primary px-3.5 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-sm transition-all duration-200 hover:bg-[color:var(--primary-hover)] hover:shadow-md motion-reduce:transition-none xl:px-4",
                    focusRing,
                  )}
                >
                  {t("nav.createAccount")}
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className={cn(
              // 44px touch target.
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary lg:hidden",
              focusRing,
            )}
            aria-label={open ? t("nav.menu.close") : t("nav.menu.open")}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </Container>
      </div>

      {/* The sheet scrolls on its own rather than pushing the page. Both
          chromes switch to it at the SAME breakpoint, lg (1024px). */}
      <div id="site-menu" className={cn(MENU_SURFACE, "lg:hidden", open ? "block" : "hidden")}>
        <Container className="flex flex-col gap-1 py-4">
          {/* ── Mobile is the same product, not a collapsed website ──────
              The destinations come from the SAME array the desktop bar
              renders, so the two cannot drift; they come FIRST; and each is a
              44px target with the same current-location treatment. */}
          {appMode ? (
            <CandidateAppNav
              variant="mobile"
              activeKey={activeKey}
              badgeFor={appNavCount}
              onNavigate={() => setOpen(false)}
            />
          ) : (
            <nav
              className="flex flex-col gap-0.5"
              aria-label={t("nav.primary")}
              data-site-nav="primary"
            >
              {nav.map((item) =>
                item.key === "employers" ? (
                  <MobileEmployerGroup
                    key={item.key}
                    label={item.label}
                    active={onEmployers}
                    onNavigate={() => setOpen(false)}
                  />
                ) : (
                  <Link
                    key={item.key}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-[44px] min-w-[44px] items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
                      focusRing,
                    )}
                    activeProps={{
                      className:
                        "bg-secondary text-foreground border-l-2 border-accent rounded-l-none pl-[10px]",
                    }}
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
          )}
          {roleLinks.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-between gap-2 rounded-md border border-accent/40 bg-secondary px-2 py-2 text-sm font-semibold text-foreground"
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
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <LanguageSwitcher />
              {/* Same rule as desktop: inside the workspace this would be a
                  second "Min karriär" a few rows under the first. */}
              {signedIn && !appMode ? (
                <Link
                  to="/my-career"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "inline-flex min-h-[44px] min-w-[44px] items-center rounded-md border border-border px-3.5 text-sm font-semibold text-foreground hover:bg-secondary",
                    focusRing,
                  )}
                >
                  {t("nav.my_career")}
                </Link>
              ) : signedIn ? null : (
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "inline-flex min-h-[44px] min-w-[44px] items-center rounded-md px-3 text-sm font-medium text-foreground hover:bg-secondary",
                    focusRing,
                  )}
                >
                  {t("nav.signin")}
                </Link>
              )}
            </div>
            {/* Same destination and same label as the desktop bar, so the
                account somebody creates on a phone is the account they would
                have created on a laptop. */}
            {signedIn !== true && (
              <Link
                to="/signup"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-primary px-4 text-center text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-[color:var(--primary-hover)] motion-reduce:transition-none",
                  focusRing,
                )}
              >
                {t("nav.createAccount")}
              </Link>
            )}
            {/* ── THE EMPLOYER DOORS, AT THIS WIDTH ───────────────────────
                The same two the desktop menu carries. REGISTER a company:
                /signup with /employer (EMPLOYER_REGISTER_NAV, the one
                definition the homepage band, /employers and the footer share).
                SIGN IN to one: /login — the one door — with /employer as its
                validated `?redirect=`. Both signed-out only, both gated on the
                release flag, visible text, 44px, the shared focus ring. They
                grant nothing: /employer resolves membership server-side on
                every load. */}
            {signedIn !== true && employerPortalEnabled() && (
              <Link
                to={EMPLOYER_REGISTER_NAV.to}
                search={EMPLOYER_REGISTER_NAV.search as never}
                data-employer-register
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md border border-border px-4 text-center text-sm font-medium text-foreground transition-colors hover:bg-secondary",
                  focusRing,
                )}
              >
                <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(EMPLOYER_REGISTER_NAV.labelKey)}
              </Link>
            )}
            {signedIn !== true && employerPortalEnabled() && (
              <Link
                to="/login"
                search={{ redirect: "/employer" } as never}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md border border-border px-4 text-center text-sm font-medium text-foreground transition-colors hover:bg-secondary",
                  focusRing,
                )}
              >
                <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("nav.employerLogin")}
              </Link>
            )}
          </div>

          {/* ── Account, at this width ──────────────────────────────────
              A dropdown is the wrong affordance inside an already-open mobile
              sheet, so the same concerns are listed inline: who you are, the
              workspace switch when you hold one, and sign out. */}
          {signedIn && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("account.section")}
              </p>
              <p className="mt-1 truncate px-2 text-sm font-medium text-foreground">
                {identity.name || identity.email}
              </p>
              {identity.name && identity.email && (
                <p className="truncate px-2 text-xs text-muted-foreground">{identity.email}</p>
              )}

              <p className="mt-3 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("account.context.switchTo")}
              </p>
              <Link
                to="/my-career"
                onClick={() => setOpen(false)}
                data-workspace="personal"
                className="mt-1 flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{t("account.context.personal")}</span>
              </Link>
              <Link
                to="/security-work"
                onClick={() => setOpen(false)}
                data-workspace="security-work"
                className="mt-1 flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{t("sw.name")}</span>
              </Link>
              {hasEmployerWorkspace && (
                <>
                  {/* Same rule as the desktop menu: an organisation that is
                      discoverable on a laptop must be on a phone too. Under
                      review goes to the status page, wearing its status. */}
                  {myWorkspaces.map((workspace) => {
                    const statusKey = workspaceStatusLabelKey(workspace.employerStatus);
                    const rowClass =
                      "mt-1 flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted";
                    const inner = (
                      <>
                        <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">
                          {workspace.employerName} – {t("account.context.employer")}
                        </span>
                        {statusKey && (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {t(statusKey)}
                          </span>
                        )}
                      </>
                    );
                    return statusKey ? (
                      <Link
                        key={workspace.employerSlug}
                        to="/employer/pending"
                        onClick={() => setOpen(false)}
                        data-workspace="employer"
                        className={rowClass}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <Link
                        key={workspace.employerSlug}
                        to="/employer/$employerSlug"
                        params={{ employerSlug: workspace.employerSlug }}
                        onClick={() => setOpen(false)}
                        data-workspace="employer"
                        className={rowClass}
                      >
                        {inner}
                      </Link>
                    );
                  })}
                </>
              )}

              {/* The reviewer view, only for somebody with a queue. Same gate
                  as the desktop menu: the queue read, never a role literal. */}
              {reviewCount > 0 && (
                <Link
                  to="/reviews"
                  onClick={() => setOpen(false)}
                  data-workspace="reviewer"
                  className="mt-1 flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <Gavel className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    {t("account.context.reviewer")} ·{" "}
                    <span className="tabular-nums">{reviewCount}</span>{" "}
                    {tp("account.context.reviewerPending", reviewCount)}
                  </span>
                </Link>
              )}

              {/* Parity with the desktop menu: the one control that lets
                  somebody correct their own professional identity. */}
              <Link
                to="/my-career/profile"
                onClick={() => setOpen(false)}
                className="mt-2 flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <UserPen className="h-4 w-4" aria-hidden="true" />
                {t("account.settings")}
              </Link>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void onSignOut();
                }}
                className="mt-1 flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-foreground hover:bg-muted"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("account.signOut")}
              </button>
            </div>
          )}
        </Container>
      </div>
    </header>
  );
}

/**
 * "För arbetsgivare ▾" on the desktop bar — a DISCLOSURE, not an ARIA menu.
 *
 * A button that says whether it is open (`aria-expanded`), and a panel of
 * ordinary links it controls. That is the WAI-ARIA disclosure-navigation
 * pattern: Tab walks the links in order, Escape closes the panel and returns
 * focus to the button, and a click anywhere else, or moving focus out of the
 * group, closes it. No hover-to-open, which strands keyboard and touch users.
 *
 * The five entries are sections of /employers (EMPLOYER_NAV) — every one an
 * existing destination. Beneath them, for a signed-out visitor only and only
 * while the employer portal is released: a new company's way in ("Registrera
 * företag", EMPLOYER_REGISTER_NAV: /signup carrying /employer) and the existing
 * customer's way back in: the SAME one door, /login, carrying /employer as a
 * validated `?redirect=`.
 */
function EmployerMenu({
  label,
  active,
  signedIn,
}: {
  label: string;
  active: boolean;
  /** The header's own session answer; null while it is not known yet. */
  signedIn: boolean | null;
}) {
  const { t } = useT();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className="relative"
      onBlur={(e) => {
        if (open && root.current && !root.current.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        data-employer-menu-trigger
        onClick={() => setOpen((o) => !o)}
        className={cn(DESKTOP_ITEM, touchTarget, focusRing, active && DESKTOP_ACTIVE)}
      >
        {label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        data-employer-menu
        hidden={!open}
        className="absolute left-1/2 top-full z-50 mt-2 w-[22rem] -translate-x-1/2 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-[var(--shadow-lg)]"
      >
        <ul className="flex flex-col">
          {EMPLOYER_NAV.map((sub) => (
            <li key={sub.key}>
              <Link
                to={sub.to}
                hash={sub.hash}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-[44px] flex-col justify-center rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary",
                  focusRing,
                )}
              >
                <span className="text-sm font-semibold text-foreground">{t(sub.labelKey)}</span>
                <span className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {t(sub.bodyKey)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {signedIn !== true && employerPortalEnabled() && (
          <div className="mt-1 border-t border-border pt-1">
            {/* A NEW company's way in, from every page: the one definition in
                public-nav.ts (/signup carrying /employer), the same label and
                destination as the homepage band and /employers. */}
            <Link
              to={EMPLOYER_REGISTER_NAV.to}
              search={EMPLOYER_REGISTER_NAV.search as never}
              data-employer-register
              onClick={() => setOpen(false)}
              className={cn(
                "flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary",
                focusRing,
              )}
            >
              <Building2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              {t(EMPLOYER_REGISTER_NAV.labelKey)}
            </Link>
          </div>
        )}
        {signedIn !== true && employerPortalEnabled() && (
          <p className="flex flex-wrap items-center gap-x-1 px-3 text-xs text-muted-foreground">
            {t("nav.forEmployers.customerLead")}
            <Link
              to="/login"
              search={{ redirect: "/employer" } as never}
              onClick={() => setOpen(false)}
              className={cn(
                "inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-md px-1 font-semibold text-accent underline-offset-4 hover:underline",
                focusRing,
              )}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("nav.employerLogin")}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

/** The same five entries in the compact sheet, behind the same disclosure:
 *  one row that opens the group, then the sections of /employers. */
function MobileEmployerGroup({
  label,
  active,
  onNavigate,
}: {
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(active);
  const groupId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={groupId}
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex min-h-[44px] w-full min-w-[44px] items-center justify-between rounded-md px-3 text-left text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
          focusRing,
          active &&
            "bg-secondary text-foreground border-l-2 border-accent rounded-l-none pl-[10px]",
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <ul id={groupId} hidden={!expanded} className="mt-0.5 flex flex-col gap-0.5 pl-3">
        {EMPLOYER_NAV.map((sub) => (
          <li key={sub.key}>
            <Link
              to={sub.to}
              hash={sub.hash}
              onClick={onNavigate}
              className={cn(
                "flex min-h-[44px] min-w-[44px] items-center rounded-md border-l border-border px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground",
                focusRing,
              )}
            >
              {t(sub.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
