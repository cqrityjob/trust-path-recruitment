// TRUST Evidence Report — the employer page on fixtures. DEVELOPMENT ONLY.
//
// ── FAIL-CLOSED, NOT MERELY HIDDEN ─────────────────────────────────────
//
// The guard is `beforeLoad` throwing `notFound()`, the same pattern as
// src/routes/dev.security-passport.tsx: a production build refuses at
// routing time, before the component tree is reached.
//
// ── WHAT THIS ROUTE DOES NOT DO ────────────────────────────────────────
//
// No authentication, no Supabase client, no server function, no network
// call. Every value on screen comes from the four V3 documents in
// src/lib/security-competency/trust-report-fixtures, produced against a
// local replay for a fictional organisation. `?fixture=` picks the
// document, `?lang=` the language, `?app=1` pretends the report was opened
// from an application (name, role, the interview link) and `?record=1`
// shows the addendum composer; the composer's save goes nowhere here.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { LanguageScope } from "@/i18n/context";
import { TrustReportPage } from "@/components/trust-report/TrustReportPage";
import {
  TRUST_REPORT_FIXTURES,
  type TrustReportFixtureName,
} from "@/lib/security-competency/trust-report-fixtures";

const IS_DEV = !!import.meta.env?.DEV;
const NAMES = Object.keys(TRUST_REPORT_FIXTURES) as TrustReportFixtureName[];

export const Route = createFileRoute("/dev/trust-evidence-report")({
  beforeLoad: () => {
    if (!IS_DEV) throw notFound();
  },
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    fixture: (NAMES as string[]).includes(String(search.fixture))
      ? (String(search.fixture) as TrustReportFixtureName)
      : ("standard" as TrustReportFixtureName),
    lang: search.lang === "en" ? ("en" as const) : ("sv" as const),
    app: search.app === "1" || search.app === 1 || search.app === true,
    record: search.record === "1" || search.record === 1 || search.record === true,
  }),
  head: () => ({
    meta: [
      { title: "TRUST Evidence Report preview (dev)" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TrustEvidenceReportPreview,
});

function TrustEvidenceReportPreview() {
  const { fixture, lang, app, record } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (!IS_DEV) return null;
  const doc = TRUST_REPORT_FIXTURES[fixture];
  const employerSlug = "trust-bevakning-r3a";
  const applicationId = app ? "11111111-1111-4111-8111-111111111111" : null;
  const jobId = app ? "22222222-2222-4222-8222-222222222222" : null;

  return (
    <LanguageScope lang={lang}>
      <div className="min-h-screen bg-background">
        <div className="no-print mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 pt-4 text-[12px] text-muted-foreground sm:px-6">
          <span className="font-semibold uppercase tracking-[0.08em]">dev preview</span>
          <label className="inline-flex items-center gap-1.5">
            fixture
            <select
              id="tr-fixture"
              value={fixture}
              onChange={(e) =>
                void navigate({
                  search: (s) => ({ ...s, fixture: e.target.value as TrustReportFixtureName }),
                })
              }
              className="min-h-[32px] rounded-[6px] border border-border bg-card px-2 text-[12px] text-foreground"
            >
              {NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5">
            lang
            <select
              id="tr-lang"
              value={lang}
              onChange={(e) =>
                void navigate({ search: (s) => ({ ...s, lang: e.target.value as "sv" | "en" }) })
              }
              className="min-h-[32px] rounded-[6px] border border-border bg-card px-2 text-[12px] text-foreground"
            >
              <option value="sv">sv</option>
              <option value="en">en</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={app}
              onChange={(e) => void navigate({ search: (s) => ({ ...s, app: e.target.checked }) })}
            />
            from application
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={record}
              onChange={(e) =>
                void navigate({ search: (s) => ({ ...s, record: e.target.checked }) })
              }
            />
            can record addenda
          </label>
        </div>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <TrustReportPage
            doc={doc}
            attemptId={doc.frozen_report.employer.context.attempt_id}
            nav={{ employerSlug, applicationId, jobId }}
            subject={
              app
                ? {
                    candidateName: "Kim Andersson",
                    jobTitle: lang === "en" ? "Security Officer, Stockholm" : "Väktare, Stockholm",
                  }
                : { candidateName: null, jobTitle: null }
            }
            canRecord={record}
          />
        </main>
      </div>
    </LanguageScope>
  );
}
