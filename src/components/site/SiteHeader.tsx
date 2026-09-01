import { useEffect, useState } from "react";
import { Link, useLocation, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X, ShieldCheck, Building2, LogOut, UserPen } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { Container } from "./Container";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { resolveCandidateNav, type CandidateNavKey } from "./candidate-app-nav";
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

export function SiteHeader() {
  const { t } = useT();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  // Sticky-header depth, added only once the page has actually moved.
  //
  // The bar carries a hairline at rest and gains a soft shadow on scroll, so
  // content passing underneath reads as passing UNDER something rather than
  // colliding with it. Nothing about the box changes -- no height, padding or
  // border-width transition -- so there is no layout shift, and the only
  // animated properties are colour and shadow.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
  // These six links are the WEBSITE's navigation and they stay exactly as
  // they are for anybody reading the website. What changed is that they
  // are no longer also served to somebody who is signed in and standing
  // inside their own workspace — where "Arbetsgivare", "Om oss" and
  // "Kontakt" were outranking the candidate's own career, and where
  // "Kontakt" appeared twice on every page (once here, once in the
  // utility bar above).
  //
  // Nothing is removed from the site: the public pages keep their routes,
  // their nav on public pages, and their place in the footer. See
  // candidate-app-nav.ts for the four destinations that replace them.
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
  // /reviews runs in AssessmentShell, which deliberately has no site
  // navigation: it should not compete with finishing the work in front of
  // you. That makes this header the only place a reviewer is offered a way
  // in, and until it was added there was none — the queue was reachable
  // only from a card on /my-career, or by typing the URL.
  //
  // /academy used to be offered the same way and no longer is: inside the
  // candidate workspace it is "Bedömningar" in the primary nav, and its
  // list and released reports now carry the app chrome so somebody who
  // opens one is not stranded on a page with no way back. Only the RUN
  // itself keeps the distraction-free shell, which is where that rule was
  // always earning its keep.
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

  // Does this person actually hold a workspace? Same server function the
  // dashboard used, same query key, so on /my-career the two share one
  // request rather than each making their own. `enabled` keeps a signed-out
  // visitor — and a build with the portal flag off — from asking at all.
  const fetchWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const workspaces = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => fetchWorkspaces(),
    enabled: signedIn === true && employerPortalEnabled(),
    staleTime: 5 * 60 * 1000,
    // The two count queries above use retry: false, because a missing badge
    // costs a number. This one gates NAVIGATION: if it fails, a member loses
    // the only route into their workspace from the chrome and gets it back
    // only by chance on a later page. One retry, so a transient blip does not
    // strand them.
    retry: 1,
  });
  // Strictly "the database returned an organisation this person belongs to".
  //
  // A failed read still reads as no context -- there is nothing truthful to
  // offer until the answer arrives. An organisation UNDER REVIEW, however, is
  // carried through with its status, because a registrant who cannot find
  // their own pending organisation from anywhere in the chrome is the defect
  // this PR exists to fix: the audit's employer had no route to it at all and
  // had to type /employer. The status decides the label and the destination
  // in AccountMenu; it grants nothing, and every route re-verifies access
  // server-side exactly as it does when the URL is typed.
  const myWorkspaces = (workspaces.data ?? []).map((w) => ({
    employerSlug: w.employerSlug,
    employerName: w.employerName,
    employerStatus: w.employerStatus,
  }));
  const hasEmployerWorkspace = myWorkspaces.length > 0;

  // ── WHICH CHROME THIS ROUTE GETS ────────────────────────────────────
  //
  // Asked of the ROUTER, not of the pathname: `useMatches()` hands back
  // the routes it actually resolved, so a prefix naming no real route
  // matches nothing rather than silently matching a lookalike path. The
  // decision itself is a pure function so it can be proven exhaustively
  // without standing up a router — see candidate-app-nav.ts.
  //
  // PRESENTATION ONLY, and this is the load-bearing sentence: being in
  // the candidate chrome grants nothing and withholds nothing. Every one
  // of these destinations re-verifies its own access server-side, exactly
  // as it does when the URL is typed. An employer member reading /jobs in
  // their personal context gets the candidate chrome and still cannot see
  // one row their memberships do not entitle them to; their workspace
  // keeps EmployerAppShell and is reached, by name, from the account menu.
  const matches = useMatches();
  const { inCandidateApp, activeKey } = resolveCandidateNav(
    matches.map((m) => m.routeId as string),
  );
  const appMode = signedIn === true && inCandidateApp;

  /** Which context the CURRENT ROUTE is in.
   *
   *  Presentation only. It decides which entry in the switcher wears a tick;
   *  it grants nothing and is never read as permission. The slug is taken
   *  from the path this browser is already on -- the route it names
   *  re-verifies membership itself. */
  const employerMatch = /^\/employer\/([^/]+)/.exec(location.pathname);
  const currentContext: AccountIdentity["currentContext"] =
    employerMatch && employerMatch[1] ? { employerSlug: employerMatch[1] } : "personal";

  const identity: AccountIdentity = {
    name: account.name,
    email: account.email,
    workspaces: myWorkspaces,
    currentContext,
  };

  async function onSignOut() {
    await supabase.auth.signOut();
  }

  const academyTotal = academy.data?.total ?? 0;
  const academyActionable = academy.data?.actionable ?? 0;
  const reviewCount = reviews.data ?? 0;

  // A count is shown only when it means "this is waiting for you". A person
  // whose only run is submitted and awaiting review is not being asked for
  // anything, and a badge would say otherwise.
  //
  // In the candidate workspace /academy is no longer a pill at all: it is
  // "Bedömningar", a standing primary-nav destination, present whether or
  // not anything is waiting. A destination that appears only once work
  // arrives is a destination nobody can learn. The COUNT still behaves
  // exactly as before — it rides on the nav item instead of the pill, and
  // still only when something is genuinely being asked of somebody.
  //
  // /reviews stays a pill in both chromes on purpose. Reviewing responses
  // is a separate authorised capability, not part of the candidate's four
  // products, and giving it equal billing in the primary nav would say
  // otherwise. It remains gated on the queue itself.
  const roleLinks: { to: "/academy" | "/reviews"; label: string; count: number | null }[] = [];
  if (!appMode && academyTotal > 0) {
    roleLinks.push({
      to: "/academy",
      label: t("nav.myAssessments"),
      count: academyActionable > 0 ? academyActionable : null,
    });
  }
  if (reviewCount > 0) {
    roleLinks.push({ to: "/reviews", label: t("nav.reviews"), count: reviewCount });
  }

  /** The badge for one app-nav item, or null. Only "this is waiting for
   *  you" earns a number — the same rule the pill used. */
  const appNavCount = (key: CandidateNavKey): number | null =>
    key === "assessments" && academyActionable > 0 ? academyActionable : null;

  // ── WHY THE DESKTOP BAR STARTS AT lg AND NOT md ─────────────────────
  //
  // Six primary-nav items in Swedish ("Säkerhetskarriärcenter" alone is 22
  // characters), a language toggle and two actions do not fit in 768px.
  // They never did: at exactly the md breakpoint the desktop layout
  // switched on and overflowed the viewport by ~240px in Swedish and ~150px
  // in English, which put the sign-in control off-screen behind a
  // horizontal scroll on every tablet.
  //
  // Measured, not guessed -- a Playwright sweep at 375/768/1280/1440 in
  // both locales found it, which is exactly the width nobody resizes to by
  // hand. The mobile menu already handles this range correctly, so the
  // breakpoint moves rather than the content.
  return (
    <header className="no-print sticky top-0 z-40 bg-background/90 backdrop-blur">
      {/* Slim utility bar — the WEBSITE's, desktop only. The brand principle
          on the left, and the ONE genuinely global control on the right.

          It does not follow anybody into the workspace. A marketing tagline
          strip above an application is the single loudest way to tell
          somebody they are still on a website.

          ── WHY "KONTAKT" IS NO LONGER HERE ─────────────────────────────
          It was the second "Kontakt" in the same header area: once in this
          bar, once in the primary nav directly underneath, both pointing at
          /contact. The route is untouched and remains reachable from the
          primary nav (desktop and mobile) and from the footer — only the
          visual duplication is gone.

          The language toggle moved UP here from the crowded action cluster:
          it is a site-wide preference rather than an action, and the main
          row now carries only the brand, the navigation and the account
          controls. Mobile keeps its own toggle inside the menu sheet, since
          this bar is desktop-only. */}
      <div className={cn("hidden bg-primary text-primary-foreground/85", !appMode && "lg:block")}>
        <Container className="flex h-9 items-center justify-between text-[11px] font-medium tracking-wide">
          <span className="inline-flex min-w-0 items-center gap-2">
            <ShieldCheck
              className="h-3 w-3 shrink-0 text-[color:var(--gold)]"
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="truncate uppercase tracking-[0.14em]">{t("footer.tagline")}</span>
          </span>
          <div className="flex shrink-0 items-center gap-5">
            <LanguageSwitcher tone="onDark" />
            {/* The employer door used to live here, ungated, for everybody.
                It is gone: an organisation context is reached from the
                account menu, which lists only the organisations the database
                actually returned for this person and names each one. An
                ungated "Arbetsgivarportal" offered a door to people who hold
                no membership, and told somebody who holds two nothing about
                which one it would open. /employers -- the information page --
                remains in the primary nav for anybody deciding whether
                CQrityjob is for their company. */}
          </div>
        </Container>
      </div>
      <div
        className={cn(
          "border-b bg-background/95 transition-shadow duration-200 motion-reduce:transition-none",
          scrolled
            ? "border-border/80 shadow-[var(--shadow-md)]"
            : "border-border shadow-[0_1px_0_0_var(--color-border)]",
        )}
      >
        <Container className="flex h-16 items-center justify-between gap-4 xl:gap-8">
          {/* In the workspace the brand mark is the way HOME — to the
              candidate's own home, /my-career, the way it is in every
              application. It used to drop somebody out onto the marketing
              landing page, which is an exit, not a home. */}
          <Link
            to={appMode ? "/my-career" : "/"}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-md font-semibold tracking-tight text-foreground",
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
            /* The indicator sits on the item itself rather than being hung
               off the bottom of the header row: a 2px rule at a hardcoded
               `-bottom-22px` had to be re-guessed every time the row height
               or the utility bar changed, and it was the only thing in the
               header that could not survive a spacing edit. */
            <nav
              className="hidden min-w-0 items-center gap-1 lg:flex xl:gap-2"
              aria-label="Primary"
            >
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative rounded-md px-2.5 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    focusRing,
                  )}
                  activeProps={{
                    className:
                      "text-foreground after:absolute after:bottom-0 after:left-2.5 after:right-2.5 after:h-[2px] after:rounded-full after:bg-accent",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          {/* One control height (h-9) across the whole cluster, so the
              language toggle, the pills, the two entrances and the account
              button share a single optical baseline instead of four. */}
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            {roleLinks.map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md border border-accent/40 bg-secondary px-3 text-xs font-semibold whitespace-nowrap text-foreground transition-colors hover:border-accent/60",
                  focusRing,
                )}
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
                {/* The way into the workspace, for somebody who is signed
                    in but reading the public site. Inside the workspace it
                    would be a SECOND "Min karriär" beside the primary nav
                    item, which is the duplicate this PR exists to remove. */}
                {!appMode && (
                  <Link
                    to="/my-career"
                    className={cn(
                      "inline-flex h-9 items-center rounded-md border border-border bg-background px-3.5 text-xs font-semibold whitespace-nowrap text-foreground transition-colors hover:border-accent/40 hover:bg-secondary",
                      focusRing,
                    )}
                    activeProps={{ className: "border-accent/50 bg-secondary" }}
                  >
                    {t("nav.my_career")}
                  </Link>
                )}
                {/* Account concerns — identity, workspace switch, sign out —
                    in the chrome, on every page. Before this they existed
                    only as a row at the bottom of the /my-career dashboard. */}
                <AccountMenu identity={identity} onSignOut={onSignOut} />
              </>
            ) : (
              // ONE door in, one door to create an account. The header used
              // to carry two audience-specific logins, which asked a visitor
              // to classify themselves before the product had told them that
              // one account covers both. "Arbetsgivare" still belongs to the
              // marketing page in the primary nav and to nothing else --
              // reusing that word for an action is what made this header
              // unreadable in the first place, and that fix is preserved.
              //
              // The hierarchy between the two is now unmistakable: signing in
              // is a quiet text control, creating an account is the one solid
              // navy button in the row. Two bordered boxes of equal weight
              // asked a first-time visitor to choose between two things that
              // looked identically important.
              <>
                <Link
                  to="/login"
                  className={cn(
                    "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    focusRing,
                  )}
                >
                  {t("nav.signin")}
                </Link>
                <Link
                  to="/signup"
                  className={cn(
                    "inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-sm transition-all duration-200 hover:bg-[color:var(--primary-hover)] hover:shadow-md motion-reduce:transition-none",
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
              // 44px touch target, which a p-2 icon button was not.
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary lg:hidden",
              focusRing,
            )}
            /* Was a hardcoded English "Menu" on a Swedish-first product,
               and said nothing about state beyond aria-expanded. */
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

      {/* The sheet scrolls on its own rather than pushing the page: signed in,
          with an organisation and the account block, it is taller than a 320px
          phone in landscape, and the last rows were unreachable. */}
      <div
        id="site-menu"
        className={cn(
          "max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-background lg:hidden",
          open ? "block" : "hidden",
        )}
      >
        <Container className="flex flex-col gap-1 py-4">
          {/* ── Mobile is the same product, not a collapsed website ──────
              The four destinations come from the SAME array the desktop
              bar renders, so the two cannot drift; they come FIRST, before
              anything else in the sheet; and each is a 44px target with
              the same three-signal current-location treatment. */}
          {appMode ? (
            <CandidateAppNav
              variant="mobile"
              activeKey={activeKey}
              badgeFor={appNavCount}
              onNavigate={() => setOpen(false)}
            />
          ) : (
            <nav className="flex flex-col gap-0.5" aria-label="Primary">
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    // 44px, not the old ~36px row: these are the primary
                    // destinations on the viewport where they are hardest to hit.
                    "flex min-h-[44px] items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
                    focusRing,
                  )}
                  activeProps={{
                    className:
                      "bg-secondary text-foreground border-l-2 border-accent rounded-l-none pl-[10px]",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
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
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <LanguageSwitcher />
              {/* Same rule as desktop: inside the workspace this would be
                  a second "Min karriär" a few rows under the first. */}
              {signedIn && !appMode ? (
                <Link
                  to="/my-career"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "inline-flex min-h-[44px] items-center rounded-md border border-border px-3.5 text-sm font-semibold text-foreground hover:bg-secondary",
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
                    "inline-flex min-h-[44px] items-center rounded-md px-3 text-sm font-medium text-foreground hover:bg-secondary",
                    focusRing,
                  )}
                >
                  {t("nav.signin")}
                </Link>
              )}
            </div>
            {/* Mobile carries the same single entrance as desktop, and the
                same primary action. There is no employer door here either:
                an organisation context is reached from the account section
                below, by name, and only for organisations the database
                returned. */}
            {signedIn !== true && (
              <Link
                to="/signup"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-[44px] items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-[color:var(--primary-hover)] motion-reduce:transition-none",
                  focusRing,
                )}
              >
                {t("nav.createAccount")}
              </Link>
            )}
          </div>

          {/* ── Account, at this width ──────────────────────────────────
              A dropdown is the wrong affordance inside an already-open
              mobile sheet, so the same three concerns are listed inline:
              who you are, the workspace switch when you hold one, and sign
              out. Same gate and same actions as the desktop menu — the
              switch is not duplicated, it is the one control rendered for
              the one viewport in play. */}
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

              {hasEmployerWorkspace && (
                <>
                  <p className="mt-3 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t("account.context.switchTo")}
                  </p>
                  {/* Same rule as the desktop menu, and it has to be the
                      same rule: an organisation that is discoverable on a
                      laptop and invisible on a phone is still a registrant
                      who cannot reach their own registration. Under review
                      goes to the status page, wearing its status. */}
                  {myWorkspaces.map((workspace) => {
                    const statusKey = workspaceStatusLabelKey(workspace.employerStatus);
                    const rowClass =
                      "mt-1 flex min-h-[44px] items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted";
                    const inner = (
                      <>
                        <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{workspace.employerName}</span>
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
                        className={rowClass}
                      >
                        {inner}
                      </Link>
                    );
                  })}
                </>
              )}

              {/* Parity with the desktop menu. Account settings existed
                  there and not here, so the one control that lets somebody
                  correct their own professional identity was desktop-only.

                  It is labelled "Min profil" now, which is what the page it
                  opens has always called itself. "Konto och profil" was a
                  third name for the same screen. */}
              <Link
                to="/my-career/profile"
                onClick={() => setOpen(false)}
                className="mt-2 flex min-h-[44px] items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted"
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
