import process from "node:process";
import {
  HOSTED_TARGET,
  FixtureStop,
  assertTarget,
  dryRun,
  executeRun,
  planRun,
  readHostedCredentials,
} from "./core.mjs";
import { officialAdmin } from "./admin-adapter.mjs";

export function parseHostedArgs(argv) {
  const [command, ...rest] = argv;
  if (!["plan", "dry-run", "create"].includes(command)) throw new FixtureStop("COMMAND_INVALID");
  const values = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (
      ![
        "--directory",
        "--credentials-file",
        "--project-ref",
        "--url",
        "--with-100-candidates",
        "--execute",
      ].includes(key)
    ) {
      throw new FixtureStop("ARGUMENT_INVALID");
    }
    if (key in values) throw new FixtureStop("ARGUMENT_DUPLICATED");
    if (["--with-100-candidates", "--execute"].includes(key)) values[key] = true;
    else {
      const value = rest[++i];
      if (!value || value.startsWith("--")) throw new FixtureStop("ARGUMENT_VALUE_MISSING");
      values[key] = value;
    }
  }
  if (typeof values["--directory"] !== "string") throw new FixtureStop("DIRECTORY_REQUIRED");
  const target = {
    kind: "hosted",
    projectRef: values["--project-ref"] ?? HOSTED_TARGET.projectRef,
    url: values["--url"] ?? HOSTED_TARGET.url,
  };
  assertTarget(target);
  if (command === "create") {
    if (values["--execute"] !== true || typeof values["--credentials-file"] !== "string") {
      throw new FixtureStop("EXPLICIT_CREATE_REQUIRED");
    }
    if (values["--with-100-candidates"]) throw new FixtureStop("CANDIDATES_MUST_BE_PLANNED");
  } else if (
    values["--execute"] ||
    values["--credentials-file"] ||
    (command === "dry-run" && values["--with-100-candidates"])
  ) {
    throw new FixtureStop("ARGUMENT_OUT_OF_SCOPE");
  }
  return {
    command,
    directory: values["--directory"],
    target,
    credentialsFile: values["--credentials-file"],
    candidateCount: values["--with-100-candidates"] ? 100 : 0,
  };
}

export async function hostedMain(argv) {
  const args = parseHostedArgs(argv);
  if (args.command === "plan") return planRun(args);
  if (args.command === "dry-run") return dryRun(args.directory);
  // Validated target/arguments first; the server key is read only for an explicit create command.
  const serverKey = readHostedCredentials(args.credentialsFile);
  return executeRun({
    ...args,
    createAdmin: (target, ids) => officialAdmin(target, ids, serverKey),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  hostedMain(process.argv.slice(2)).then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      // Never print SDK responses, errors, stack traces, credentials, emails, passwords or tokens.
      process.stderr.write(
        `${error instanceof FixtureStop ? error.message : "RI_AUTH_FIXTURE_STOP:INTERNAL_FAILURE"}\n`,
      );
      process.exitCode = 1;
    },
  );
}
