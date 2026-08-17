// Security Passport — Phase 1 prototype route. DEVELOPMENT ONLY.
//
// ── FAIL-CLOSED, NOT MERELY HIDDEN ─────────────────────────────────────
//
// The guard is `beforeLoad` throwing `notFound()`, matching
// src/routes/dev.career-assessment-calibration.tsx. That refuses at routing
// time, before the component tree is reached, so a production build cannot
// render this even if something later links to it. The weaker pattern —
// swapping the component for a null-returning stub — still resolves the
// route, and was not used here.
//
// ── WHY ONE ROUTE FOR TWENTY SCREENS ───────────────────────────────────
//
// The whole Phase 1 review surface lives behind this single path, including
// the mocked candidate home and the mocked recipient page. That means:
//
//   * no production route is created;
//   * the live /my-career experience is untouched;
//   * /passport and /p/:token are NOT claimed — those names stay free for a
//     future, separately approved phase;
//   * removal is deleting this file and two package.json lines.
//
// ── WHAT THIS ROUTE DOES NOT DO ────────────────────────────────────────
//
// No authentication check, no Supabase client, no server function, no
// network call, no database read or write. Every value on screen comes from
// src/lib/security-passport/fixtures/personas.ts, which is entirely
// fictional. Enforced by scripts/passport-separation-check.ts, which fails
// the build if any Passport module imports a Supabase client, Career
// Discovery, Career Card or Security Competence Platform module.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { PrototypeShell } from "@/components/security-passport/PrototypeShell";

const IS_DEV = !!import.meta.env?.DEV;

export const Route = createFileRoute("/dev/security-passport")({
  beforeLoad: () => {
    if (!IS_DEV) throw notFound();
  },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Security Passport prototype (dev)" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SecurityPassportPrototype,
});

function SecurityPassportPrototype() {
  // Belt and braces: beforeLoad already refuses, but a component that
  // renders nothing outside dev means even a routing regression cannot
  // expose the prototype.
  if (!IS_DEV) return null;
  return <PrototypeShell />;
}
