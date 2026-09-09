// The hub's four compact status modules: CV, Career analysis, Applications
// and Sharing.
//
// ── WHAT THESE REPLACED ────────────────────────────────────────────────
//
// The full product sections that used to stand here — the career picture
// in full, three open roles, an applications block, a tests block, a
// training block, a four-row tools list. Each of those is a page of its
// own and each of those pages is better at being itself than a slice of it
// on an overview. What is left is one fact per area and one way in.
//
// ── EACH MODULE OWNS ITS OWN STATE ─────────────────────────────────────
//
// Loading, empty, failed and ready are four visibly different things here,
// and a module in one of them costs the other three nothing. That is the
// same rule home-primitives.tsx was written for, applied at module scale:
// a failed share read leaves the CV module untouched, and a skeleton means
// "still reading" and never "nothing here".
//
// ── ONE PRIMARY ACTION PER MODULE ──────────────────────────────────────
//
// Every module ends in ONE primary link, and it goes to the area's
// CANONICAL page — never to a second copy of it. Which link it is depends
// on the state: an empty CV module offers "create my first CV" and a
// populated one offers "open my CVs", because those are different requests
// and offering both would make the reader choose between them for no
// reason.
//
// Career analysis is the one module with a second link, and it is quiet
// and conditional: "see open roles in this area" appears only when the
// analysis named a career family AND that family has vacancies right now.
// It is the single place in the product where a frozen result connects to
// something a candidate can act on today, and it was the one thing worth
// keeping when the open-roles section left this page.
//
// ── NO CARD IS SECRETLY A LINK ─────────────────────────────────────────
//
// The module is a titled group with a real <a> in it. The box itself is
// not clickable, does not carry a hover state, and never looks like a
// disabled button — the three ways a dashboard tile lies about what it is.

import { Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Compass, Send, Share2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type {
  ApplicationsModel,
  CvModel,
  SharingModel,
} from "@/lib/professional-identity/home-presentation";
import type { CareerDirection } from "@/lib/professional-identity/career-direction";
import { L, Lf, Lp, type Lang } from "./copy";
import { APPLICATIONS, APPLICATION_STATUS, HUB_TILE } from "./home-copy";
import { Failed } from "./home-primitives";
import { LINK, formatDate } from "./home-format";

/** One module. A heading, one status line, one way in — in that order, at
 *  every width, in both languages. */
function Module({
  moduleKey,
  title,
  icon,
  children,
}: {
  moduleKey: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`hub-${moduleKey}-heading`}
      data-hub-module={moduleKey}
      className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-4"
    >
      <h3
        id={`hub-${moduleKey}-heading`}
        className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <span className="text-accent" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The status line. `muted` is for an empty state, which is a sentence
 *  about the absence of a thing rather than a fact about one. */
function Status({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p
      data-hub-status
      className={cn(
        "mt-2 text-sm leading-relaxed",
        muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {children}
    </p>
  );
}

/** The one way in. `mt-auto` so every module's link sits on the same line
 *  whatever its status said. */
function Go({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <div className="mt-auto pt-3">
      <Link to={to} className={LINK} data-hub-go>
        {children}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** A module still reading. Announced, sized like the content it replaces,
 *  and visibly NOT an empty state. */
function ModuleLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" data-hub-loading className="mt-2">
      <p className="sr-only">{label}</p>
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
    </div>
  );
}

export function HubStatusGrid({
  cv,
  career,
  careerClosed,
  careerJobsFamilyId,
  applications,
  sharing,
  onRetryCv,
  onRetryCareer,
  onRetryApplications,
  onRetrySharing,
  className,
}: {
  cv: CvModel;
  career: CareerDirection;
  /** Career Discovery is not open to this candidate. An empty module must
   *  then say so rather than offering a button that refuses. */
  careerClosed: boolean;
  /** The career family the analysis named, for the jobs link's `family`
   *  search param. Null when the analysis named none — the module then
   *  offers no jobs link at all, rather than one that silently drops the
   *  filter and lands on every vacancy in the country.
   *
   *  A search PARAM, not a query string inside `to`: the router does not
   *  parse one out of `to` and would navigate to a literal path with a
   *  "?" in it. Same trap splitReturnPath() exists for. */
  careerJobsFamilyId: string | null;
  applications: ApplicationsModel;
  sharing: SharingModel;
  onRetryCv: () => void;
  onRetryCareer: () => void;
  onRetryApplications: () => void;
  onRetrySharing: () => void;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  const loading = L(HUB_TILE.loading, l);
  const unavailable = L(HUB_TILE.unavailable, l);

  return (
    <div data-hub-status-grid className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {/* ── CV ───────────────────────────────────────────────────────── */}
      <Module
        moduleKey="cv"
        title={L(HUB_TILE.cv.title, l)}
        icon={<FileText className="h-4 w-4" />}
      >
        {cv.state === "loading" ? (
          <ModuleLoading label={loading} />
        ) : cv.state === "unavailable" ? (
          <Failed message={unavailable} onRetry={onRetryCv} className="mt-2" />
        ) : cv.state === "none" ? (
          <Status muted>{L(HUB_TILE.cv.none, l)}</Status>
        ) : (
          <Status>
            {Lp(HUB_TILE.cv.saved, l, cv.count)}
            {cv.latest && (
              <>
                {" · "}
                {/* The document's own name, then when it last changed. A
                    count alone cannot tell somebody whether the CV they
                    are about to send is the one they edited last week. */}
                <span className="text-muted-foreground">
                  {cv.latest.title}
                  {formatDate(cv.latest.updatedAt, l)
                    ? ` · ${Lf(HUB_TILE.cv.latest, l, formatDate(cv.latest.updatedAt, l)!)}`
                    : ""}
                </span>
              </>
            )}
          </Status>
        )}
        {cv.state !== "unavailable" && (
          <Go to={cv.state === "none" ? "/my-career/cv/new" : "/my-career/cv"}>
            {L(cv.state === "none" ? HUB_TILE.cv.create : HUB_TILE.cv.open, l)}
          </Go>
        )}
      </Module>

      {/* ── Career analysis ──────────────────────────────────────────── */}
      <Module
        moduleKey="discovery"
        title={L(HUB_TILE.discovery.title, l)}
        icon={<Compass className="h-4 w-4" />}
      >
        {career.state === "loading" ? (
          <ModuleLoading label={loading} />
        ) : career.state === "unavailable" ? (
          <Failed message={unavailable} onRetry={onRetryCareer} className="mt-2" />
        ) : career.state === "none" ? (
          <Status muted>
            {L(careerClosed ? HUB_TILE.discovery.closed : HUB_TILE.discovery.none, l)}
          </Status>
        ) : career.state === "unreadable" ? (
          // A result EXISTS. Saying "not taken yet" here would be false
          // about the one person who most deserves it not to be.
          <Status>{L(HUB_TILE.discovery.unreadable, l)}</Status>
        ) : (
          <Status>
            {formatDate(career.completedAt, l) &&
              Lf(HUB_TILE.discovery.completed, l, formatDate(career.completedAt, l)!)}
            {career.state === "ready" && (
              <>
                {formatDate(career.completedAt, l) ? " · " : ""}
                <span className="text-muted-foreground">
                  {career.topRole
                    ? Lf(
                        HUB_TILE.discovery.topRole,
                        l,
                        l === "sv" ? career.topRole.titleSv : career.topRole.titleEn,
                      )
                    : L(HUB_TILE.discovery.noRolesNamed, l)}
                </span>
              </>
            )}
          </Status>
        )}
        {career.state === "none" && !careerClosed && (
          <Go to="/security-career-assessment">{L(HUB_TILE.discovery.start, l)}</Go>
        )}
        {(career.state === "ready" || career.state === "legacy") && (
          <Go to={career.reportHref}>{L(HUB_TILE.discovery.open, l)}</Go>
        )}
        {career.state === "ready" && careerJobsFamilyId && (
          <p className="mt-1 text-sm">
            <Link to="/jobs" search={{ family: careerJobsFamilyId }} className={LINK} data-hub-jobs>
              {L(HUB_TILE.discovery.jobs, l)}
            </Link>
          </p>
        )}
      </Module>

      {/* ── Applications ─────────────────────────────────────────────── */}
      <Module
        moduleKey="applications"
        title={L(HUB_TILE.applications.title, l)}
        icon={<Send className="h-4 w-4" />}
      >
        {applications.state === "loading" ? (
          <ModuleLoading label={loading} />
        ) : applications.state === "unavailable" ? (
          <Failed message={unavailable} onRetry={onRetryApplications} className="mt-2" />
        ) : applications.activeCount === 0 ? (
          // Concluded applications are not "none". Somebody with three
          // rejections has applied for things, and telling them they have
          // not is both wrong and unkind.
          applications.concludedCount > 0 ? (
            <Status>{Lp(APPLICATIONS.onlyHistory, l, applications.concludedCount)}</Status>
          ) : (
            <Status muted>{L(HUB_TILE.applications.none, l)}</Status>
          )
        ) : (
          <Status>
            {Lp(APPLICATIONS.active, l, applications.activeCount)}
            {applications.latestActive && (
              <>
                {" · "}
                <span className="text-muted-foreground">
                  {L(APPLICATION_STATUS[applications.latestActive.status], l)}
                </span>
              </>
            )}
          </Status>
        )}
        {applications.state !== "unavailable" && (
          <Go
            to={
              applications.state === "ready" &&
              applications.activeCount === 0 &&
              applications.concludedCount === 0
                ? "/jobs"
                : "/my-career/applications"
            }
          >
            {L(
              applications.state === "ready" &&
                applications.activeCount === 0 &&
                applications.concludedCount === 0
                ? HUB_TILE.applications.findJobs
                : HUB_TILE.applications.open,
              l,
            )}
          </Go>
        )}
      </Module>

      {/* ── Sharing ──────────────────────────────────────────────────── */}
      <Module
        moduleKey="sharing"
        title={L(HUB_TILE.sharing.title, l)}
        icon={<Share2 className="h-4 w-4" />}
      >
        {sharing.state === "loading" ? (
          <ModuleLoading label={loading} />
        ) : sharing.state === "unavailable" ? (
          <Failed message={unavailable} onRetry={onRetrySharing} className="mt-2" />
        ) : sharing.state === "none" ? (
          <Status muted>{L(HUB_TILE.sharing.none, l)}</Status>
        ) : (
          <Status>
            {Lp(HUB_TILE.sharing.active, l, sharing.activeCount)}
            {formatDate(sharing.nextExpiryAt, l) && (
              <>
                {" · "}
                <span className="text-muted-foreground">
                  {Lf(HUB_TILE.sharing.nextExpiry, l, formatDate(sharing.nextExpiryAt, l)!)}
                </span>
              </>
            )}
          </Status>
        )}
        {sharing.state !== "unavailable" && (
          <Go to="/passport/share">
            {L(sharing.state === "none" ? HUB_TILE.sharing.create : HUB_TILE.sharing.open, l)}
          </Go>
        )}
      </Module>
    </div>
  );
}
