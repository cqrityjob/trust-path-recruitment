/** Browser-only synthetic catalogue. Every backend request is intercepted;
 * these fixtures prove UI behavior, not Postgres filtering/RLS or persistence. */
import { expect, type Page, type Route } from "@playwright/test";
import { exportOf } from "./public-entry-harness";

export const JOBS_EMPLOYER = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Nordisk Säkerhet",
  slug: "nordisk-sakerhet",
  logo_url: null,
  website: "https://employer.example.test",
  country: "SE",
  description_sv: "Vi arbetar med säkerhet för människor och verksamheter i hela Sverige.",
  description_en: "We provide security for people and organisations across Sweden.",
};
const base = {
  location_text: "Stockholm",
  country: "SE",
  city: "Stockholm",
  region: "Stockholm",
  workplace_type: "onsite",
  employment_type: "full_time",
  experience_level: "mid",
  family_id: null,
  profession_slug: null,
  application_method: "internal",
  application_url: null,
  application_email: null,
  published_at: "2026-09-25T10:00:00Z",
  deadline_at: "2099-11-30T23:59:59Z",
  employer_id: JOBS_EMPLOYER.id,
  employer: JOBS_EMPLOYER,
  description_sv:
    "Du arbetar nära kollegor och kunder för att skapa en trygg arbetsmiljö. Rollen innebär både planering och praktiskt säkerhetsarbete.",
  description_en:
    "Work with colleagues and clients to create a safe workplace. The role combines planning with practical security work.",
  responsibilities: null,
  requirements: null,
  requirements_sv: "Erfarenhet av säkerhetsarbete.",
  requirements_en: "Experience in security work.",
  benefits: null,
  language_requirements: [],
  regulated: false,
  security_vetting_mentioned: false,
  driving_licence_required: false,
  sector: null,
  employer_type: null,
  expires_at: null,
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  seniority: null,
  work_environment: null,
  leadership_responsibility: null,
};
export const JOBS_FIXTURE = [
  {
    ...base,
    id: "20000000-0000-4000-8000-000000000001",
    slug: "test-sakerhetschef",
    title_sv: "Säkerhetschef",
    title_en: "Head of security",
  },
  {
    ...base,
    id: "20000000-0000-4000-8000-000000000002",
    slug: "test-vaktare",
    title_sv: "Väktare med ansvar för reception och besökares trygghet",
    title_en: "Security officer responsible for reception and visitor safety",
    location_text: "Göteborg",
    city: "Göteborg",
    region: "Västra Götaland",
    employment_type: "part_time",
    application_method: "external",
    application_url: "https://employer.example.test/apply",
    published_at: "2026-09-24T10:00:00Z",
    deadline_at: "2099-10-01T23:59:59Z",
  },
];
export const CLOSED_JOB = {
  ...JOBS_FIXTURE[0]!,
  id: "20000000-0000-4000-8000-000000000003",
  slug: "test-closed",
  title_sv: "Avslutad säkerhetstjänst",
  title_en: "Closed security vacancy",
  deadline_at: "2020-01-01T00:00:00Z",
};

export async function installJobsFixture(page: Page, language: "sv" | "en" = "sv") {
  const requests: URL[] = [];
  const unexpected: string[] = [];
  page.on("pageerror", (error) => unexpected.push(`Browser error: ${error.message}`));
  const state = { fail: false, empty: false };
  await page.addInitScript((lang) => localStorage.setItem("cqrityjob.lang", lang), language);
  const respond = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url());
    if (name === "getPublicJobBySlugSSR") {
      const text = decodeURIComponent(route.request().url());
      const job = [...JOBS_FIXTURE, CLOSED_JOB].find((row) => text.includes(row.slug));
      return respond(route, { result: job ?? null, error: null, context: {} });
    }
    if (name === "getV31Availability")
      return respond(route, { result: { available: true }, error: null, context: {} });
    unexpected.push(`server function ${name}`);
    return respond(route, { error: "Unstubbed test request" }, 500);
  });
  for (const host of ["**://*.supabase.co/**", "**://*.supabase.in/**"]) {
    await page.route(host, async (route) => {
      const url = new URL(route.request().url());
      // The Security Passport Network band's public read, answered "hidden" --
      // what production says today -- so it draws nothing here.
      if (url.pathname.endsWith("/rest/v1/rpc/sp_network_stats"))
        return respond(route, { display: "hidden" });
      if (route.request().method() !== "GET") {
        unexpected.push(`${route.request().method()} ${url.pathname}`);
        return route.abort();
      }
      if (url.pathname.endsWith("/rest/v1/jobs")) {
        requests.push(url);
        if (state.fail) return respond(route, { message: "Synthetic read failure" }, 500);
        const slug = url.searchParams.get("slug")?.replace(/^eq\./, "");
        if (slug)
          return respond(
            route,
            [...JOBS_FIXTURE, CLOSED_JOB].find((row) => row.slug === slug) ?? null,
          );
        let rows = state.empty ? [] : [...JOBS_FIXTURE];
        for (const [param, field] of [
          ["employment_type", "employment_type"],
          ["workplace_type", "workplace_type"],
          ["country", "country"],
          ["employer_id", "employer_id"],
        ] as const) {
          const value = url.searchParams.get(param)?.replace(/^eq\./, "");
          if (value) rows = rows.filter((row) => row[field] === value);
        }
        for (const condition of url.searchParams.getAll("or")) {
          const term = condition.match(/ilike\."?%([^%]*)%/)?.[1]?.toLowerCase();
          if (!term) continue;
          rows = rows.filter((row) =>
            (condition.includes("title_sv")
              ? `${row.title_sv} ${row.title_en} ${row.description_sv} ${row.description_en}`
              : `${row.location_text} ${row.city} ${row.region}`
            )
              .toLowerCase()
              .includes(term),
          );
        }
        if (url.searchParams.get("order")?.startsWith("deadline_at"))
          rows.sort((a, b) => a.deadline_at.localeCompare(b.deadline_at));
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? rows.length);
        return respond(route, rows.slice(offset, offset + limit));
      }
      if (url.pathname.endsWith("/rest/v1/employers")) return respond(route, [JOBS_EMPLOYER]);
      if (/\/rest\/v1\/recruitment_(requirements|questions)$/.test(url.pathname))
        return respond(route, []);
      unexpected.push(url.pathname);
      return route.abort();
    });
  }
  return {
    requests,
    state,
    assertClean: () => expect(unexpected, "Unexpected backend request").toEqual([]),
  };
}
