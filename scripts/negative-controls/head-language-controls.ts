/**
 * Negative controls for the language of page titles and descriptions.
 *
 * Every public route renders the Swedish head on the server and swaps in the
 * reader's language on the client. The routes that had not joined in are the
 * ones a reader noticed in the tab: an English description under a Swedish
 * title on /login and /signup, an English title on /reset-password, a
 * Swedish-only profession guide and the English words "Security job". Each way
 * that can quietly come back is planted here.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte (proved by the shared
 * runner).
 *
 * Run: bun run negative-controls:head-language
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "head-language:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "HL-NC-LOGIN-ENGLISH-DESCRIPTION",
    defect: "/login's head carries a hand-written English description above a Swedish title again",
    file: "src/routes/login.tsx",
    find: '      { name: "description", content: SV["meta.login.description"] },',
    replace:
      '      { name: "description", content: "Log in to CQrityjob — your professional identity." },',
    guard: GUARD,
    expect: "the head's description is the Swedish dictionary entry",
  },
  {
    id: "HL-NC-RESET-ENGLISH-TITLE",
    defect: "/reset-password's tab title is a hand-written English string on the Swedish site",
    file: "src/routes/reset-password.tsx",
    find: '      { title: dictionaries.sv["meta.resetPassword.title"] },',
    replace: '      { title: "Reset your password — CQrityjob" },',
    guard: GUARD,
    expect: "the head's title is the Swedish dictionary entry",
  },
  {
    id: "HL-NC-SIGNUP-NO-LANGUAGE-SWAP",
    defect:
      "/signup stops swapping its title and description into the reader's language, so an English reader keeps a Swedish tab",
    file: "src/routes/signup.tsx",
    find: '  useLocalizedHead("meta.signup.title", "meta.signup.description");\n',
    replace: "",
    guard: GUARD,
    expect: "the component swaps in the reader's language",
  },
  {
    id: "HL-NC-PROFESSION-TAB-SWEDISH-ONLY",
    defect:
      "the profession guide's tab stops following the language toggle for an unavailable guide",
    file: "src/routes/career-center.$profession.tsx",
    find: '      : t("meta.profession.unavailable.title");',
    replace: '      : "Yrkesguide — CQrityjob";',
    guard: GUARD,
    expect: "the page swaps the tab's title and description to the reader's language",
  },
  {
    id: "HL-NC-JOB-FALLBACK-ENGLISH",
    defect: 'an ad with no title of its own is called "Security job" in a Swedish tab again',
    file: "src/routes/jobs.$slug.tsx",
    find: 't("jobs.detail.titleFallback")',
    replace: '"Security job"',
    guard: GUARD,
    expect: "no English fallback literal is left in the tab title",
  },
];

runControls("head-language", MUTATIONS);
