import path from "node:path";
import process from "node:process";
import {
  LOCAL_CONTRACT_TARGET,
  FixtureStop,
  executeRun,
  planRun,
  readPrivateJson,
} from "./core.mjs";
import { officialAdmin } from "./admin-adapter.mjs";

// This separate test entry point cannot accept hosted credentials or arbitrary endpoints. It never runs from CI automatically.
const STATUS_FILE =
  "/Users/mostafas/.codex/visualizations/2026/10/07/01a11715-e113-77e1-9f70-baee7b636c8c/ri-real-stack-20261008/supabase/.temp/ri-local-status.json";

export function parseLocalArgs(argv) {
  if (
    argv.length !== 3 ||
    argv[0] !== "--directory" ||
    !path.isAbsolute(argv[1]) ||
    argv[2] !== "--execute-local-eight"
  ) {
    throw new FixtureStop("LOCAL_EXPLICIT_EIGHT_REQUIRED");
  }
  return argv[1];
}

export async function localContractMain(argv) {
  const directory = parseLocalArgs(argv);
  const credentials = readPrivateJson(STATUS_FILE);
  if (
    credentials.API_URL !== LOCAL_CONTRACT_TARGET.url ||
    typeof credentials.SERVICE_ROLE_KEY !== "string" ||
    credentials.SERVICE_ROLE_KEY.length < 32
  ) {
    throw new FixtureStop("LOCAL_CREDENTIAL_TARGET_DENIED");
  }
  planRun({ directory, target: LOCAL_CONTRACT_TARGET, candidateCount: 0 });
  return executeRun({
    directory,
    target: LOCAL_CONTRACT_TARGET,
    createAdmin: (target, ids) => officialAdmin(target, ids, credentials.SERVICE_ROLE_KEY),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  localContractMain(process.argv.slice(2)).then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(
        `${error instanceof FixtureStop ? error.message : "RI_AUTH_FIXTURE_STOP:INTERNAL_FAILURE"}\n`,
      );
      process.exitCode = 1;
    },
  );
}
