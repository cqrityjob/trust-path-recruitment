// The single front door.
//
// ── WHY THERE IS ONE OF THESE AND NOT FOUR ─────────────────────────────
//
// Until now CQrityjob had four public auth routes named after audiences.
// A person who is both a recruiter and a Passport holder — which is the
// ordinary case, not an edge case — had to answer "which of these is my
// account?" before the product had told them that both are. Both were.
// Neither said so.
//
// `docs/architecture/adr-unified-account-and-professional-identity.md`
// supersedes that decision and explains why it is safe to: portal intent
// was never a role (the original ADR's own decision 7), so collapsing the
// doors removes a routing hint and touches no authorisation surface. The
// four old routes remain as compatibility redirects, indefinitely.
//
// ── WHAT "PREMIUM" MEANS HERE, CONCRETELY ──────────────────────────────
//
// Not decoration. The things that actually make a B2B sign-in feel built:
//
//   * a password manager can fill it — real <label for>, real autocomplete
//     tokens, a stable form, and no field that appears after focus
//   * one visible error region, announced, focusable, listing what to fix,
//     rather than a raw provider message dropped under a button
//   * the submit control says what it is doing and cannot be pressed twice
//   * nothing flashes: an already-signed-in visitor never sees the form,
//     and the page renders a quiet placeholder until the session is known
//   * it works at 375px without a horizontal scrollbar
//
// ── THE ORGANISATION SECTION ───────────────────────────────────────────
//
// Registration is minimal by default. The one exception is a disclosed,
// collapsed section for somebody registering on behalf of an organisation,
// which preserves a real fix: an employer registration that never names a
// company used to produce nothing an administrator could review. The
// values go into user metadata (there is no session yet, so nothing can be
// written under this person's identity) and the organisation is created
// from them on their first authenticated visit to /employer, by the
// existing `ensureMyEmployerCompanyFromSignup`.
//
// Choosing it grants nothing. It selects a post-signup destination and
// carries two strings; every permission is still derived from
// `employer_memberships` server-side.
//
// ── WHAT THIS FILE IS NOW ──────────────────────────────────────────────
//
// The PAGE at /login: the shell, the proposition column, and the panel.
//
// Every handler, every piece of state, the validation, the error region,
// the OAuth return handling and the organisation intent MOVED to
// UnifiedAuthPanel so that the owner's image 0 can mount a working login
// panel on the public landing page. Nothing was copied and no second auth
// flow exists — there is one implementation with two mount points.
//
// /login stays the canonical direct route and the fallback: it is where an
// email confirmation link, a password reset and every redirect land.

import { ShieldCheck } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { useT } from "@/i18n/context";
import { UnifiedAuthPanel } from "./UnifiedAuthPanel";
import type { UnifiedAuthMode } from "./UnifiedAuthPanel";

export type { UnifiedAuthMode };

export function UnifiedAuthForm({ mode }: { mode: UnifiedAuthMode }) {
  const { t } = useT();

  return (
    <SiteLayout>
      <div className="border-b border-border bg-secondary/40">
        <Container className="py-10 md:py-16 lg:py-20">
          <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_minmax(0,26rem)] lg:gap-16">
            {/* ── The proposition ─────────────────────────────────────
                Present on every viewport, condensed rather than hidden on
                mobile: somebody arriving from an email link has no other
                way to tell what this account is for. */}
            <div className="lg:pt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                {t("brand.name")}
              </p>
              <h1
                className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl lg:text-[2.75rem] lg:leading-[1.1]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t("auth.unified.proposition")}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                {t("auth.unified.lede")}
              </p>

              <ul className="mt-8 hidden space-y-3 lg:block">
                {(
                  [
                    "auth.unified.benefit.identity",
                    "auth.unified.benefit.passport",
                    "auth.unified.benefit.jobs",
                    "auth.unified.benefit.context",
                  ] as const
                ).map((key) => (
                  <li key={key} className="flex items-start gap-3 text-sm text-foreground">
                    <ShieldCheck
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-8 hidden text-sm italic text-muted-foreground lg:block">
                {t("brand.slogan")}
              </p>
            </div>

            {/* The panel — the same component / mounts in its hero. */}
            <UnifiedAuthPanel mode={mode} />
          </div>
        </Container>
      </div>
    </SiteLayout>
  );
}
