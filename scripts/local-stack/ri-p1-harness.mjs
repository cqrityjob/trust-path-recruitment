// Narrow adaptation of the existing disposable Auth harness, generated only
// for P1's three fixed test databases. The original guard stays untouched.
import { readFileSync } from "node:fs";
const db = process.argv[2];
const names = ["ri_p1_seed_ci_test", "ri_p1_browser_ci_test", "ri_p1_api_ci_test"];
if (!names.includes(db)) throw new Error("RI_P1_HARNESS_WRONG_DATABASE");
const sql = readFileSync(new URL("./harness.sql", import.meta.url), "utf8");
const guard = "current_database() NOT IN ('beskt_e2e', 'postgres', 'scp_ci_test')";
if (sql.split(guard).length !== 2) throw new Error("RI_P1_HARNESS_GUARD_CHANGED");
process.stdout.write(sql.replace(guard, `current_database() <> '${db}'`));
