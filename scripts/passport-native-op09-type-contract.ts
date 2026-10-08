/** Compile-time contracts only. This function is deliberately never invoked. */
type Contract = typeof import("./passport-native-op09-contract.mjs");
type Command = typeof import("./passport-native-op09-command.mjs");
type Fault = typeof import("./passport-native-op09-fault-preload.mjs");
type Public = typeof import("./passport-native-op09-public.mjs");

function checkNativeDeclarations(
  contract: Contract,
  command: Command,
  fault: Fault,
  publication: Public,
  fetcher: typeof globalThis.fetch,
) {
  const parsed = contract.readPrivateJson("not-executed.json");
  // @ts-expect-error A private JSON read must not manufacture validated actor fields.
  void parsed.C1.id;
  // @ts-expect-error Environment values must be strings, not an untyped provider bag.
  contract.validateTarget({ CI: 1 }, "evidence", "app");
  // @ts-expect-error All native service/key fields are required before status validation.
  contract.validateStatus({ API_URL: contract.API });
  const status = contract.validateStatus({
    API_URL: contract.API,
    DB_URL: "postgresql://not-executed.invalid",
    ANON_KEY: "test-only",
    SERVICE_ROLE_KEY: "test-only",
  });
  const anon: string = status.ANON_KEY;
  const stage: "official_native_stack" = contract.STAGES[0];
  const digest: string = contract.digest(Buffer.from("synthetic"));
  // @ts-expect-error A byte digest cannot accept a plain object.
  contract.digest({ bytes: [1, 2] });
  const summary = contract.sdkSummary({});
  const completed: 44 = summary.completed;
  const expired: false = summary.expiredJwtClaim;
  // @ts-expect-error Observed race outcomes are a fixed two-item domain tuple.
  const invalidRace: ["registration_won", "other"] = summary.observedRaceOutcomes;
  const browser = contract.browserSummary({});
  const physicalPhone: false = browser.physicalPhone;
  const nativeFetch: typeof globalThis.fetch = fault.cleanupFaultFetch(
    { file: "not-executed.json" },
    fetcher,
  );
  // @ts-expect-error A fetch replacement must return Response rather than arbitrary text.
  fault.cleanupFaultFetch({ file: "not-executed.json" }, async () => "response");
  // @ts-expect-error Command output requires both private file paths.
  command.privateOutput("node", [], { cwd: ".", env: {}, stdoutFile: "stdout" });
  const stdout: string = command.privateOutput("node", [], {
    cwd: ".",
    env: {},
    stdoutFile: "stdout",
    stderrFile: "stderr",
  });
  publication.writePublic(
    { stackRoot: "not-executed", publicRoot: "not-executed" },
    { result: "FAILED", stages: {} },
  );
  // @ts-expect-error Public reports must carry stage outcomes.
  publication.writePublic({ stackRoot: ".", publicRoot: "." }, { result: "PASS" });
  const diagnostic = contract.rpcFailure("sp_test", {}).safeDiagnostic;
  const operation: string = diagnostic.operation;
  // @ts-expect-error The secret-safe diagnostic does not expose raw response bodies.
  void diagnostic.responseBody;
  return {
    anon,
    stage,
    digest,
    completed,
    expired,
    invalidRace,
    physicalPhone,
    nativeFetch,
    stdout,
    operation,
  };
}
export {};
