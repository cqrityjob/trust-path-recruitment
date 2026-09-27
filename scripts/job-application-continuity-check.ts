import assert from "node:assert/strict";
import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";
import { safeReturnPath, splitReturnPath } from "../src/lib/auth/safe-redirect";
import {
  jobAdReturnPath,
  jobApplyReturnPath,
  jobSearchFromFrom,
  jobSearchToFrom,
  validateJobAdSearch,
} from "../src/lib/job-intelligence/job-search";

// Exercise the complete URL handoff used by password, email and OAuth auth:
// intent -> redirect parameter -> safe destination -> router -> ad validator.
const filters = { q: "Säkerhetschef & risk", location: "Göteborg", employment: "full_time" };
const destination = jobApplyReturnPath(jobAdReturnPath("sakerhetschef", jobSearchToFrom(filters)));
const login = new URL(`https://example.test/login?redirect=${encodeURIComponent(destination)}`);
const restored = splitReturnPath(safeReturnPath(login.searchParams.get("redirect"), "/my-career"));
const arrival = validateJobAdSearch(defaultParseSearch(defaultStringifySearch(restored.search)));
assert.equal(restored.to, "/jobs/sakerhetschef");
assert.equal(arrival.apply, "1");
assert.deepEqual(jobSearchFromFrom(arrival.from), filters);
assert.equal(jobApplyReturnPath("/jobs/security-manager"), "/jobs/security-manager?apply=1");
assert.deepEqual(validateJobAdSearch({ apply: 1 }), { apply: "1" });
assert.deepEqual(validateJobAdSearch({ apply: "anything", redirect: "https://evil.test" }), {});
for (const hostile of ["https://evil.test", "//evil.test", "/login", "/jobs", "/jobs/x%0afoo"]) {
  assert.equal(jobApplyReturnPath(hostile), "/jobs");
}
const longSearch = jobAdReturnPath("security-manager", `q=${"a".repeat(460)}`);
assert.equal(jobApplyReturnPath(longSearch).length <= 500, true);
assert.equal(
  new URL(jobApplyReturnPath(longSearch), "https://example.test").searchParams.get("apply"),
  "1",
);
console.log(
  "Application intent: auth round-trip, search restoration, direct entry and redirect safety passed.",
);
