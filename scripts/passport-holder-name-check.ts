// The holder's name on their own Passport is the name they wrote.
//
// Run via `bun run passport-holder-name:check`.
//
// ── WHAT WENT WRONG ─────────────────────────────────────────────────────
//
// Two columns hold a name. `profiles.display_name` is set at registration
// (sign-up metadata or the e-mail's local part) and editable nowhere.
// `sp_passport_profiles.display_name` is "Namn som visas" on the profile page,
// and the source of every public share. The Passport card, the profile header
// and the international overview read the first; the form writes the second.
// The owner's own live card said "Mos Als" under a share that said
// "Mostafa Alshawi", with nothing in the product that could change it.
//
// ── WHAT THIS ASSERTS ───────────────────────────────────────────────────
//
//   1  the rule itself: Passport name first; account name when the Passport
//      name is missing, empty or whitespace; trimmed; null when neither;
//   2  the shared reader applies it through the caller's own client (both
//      tables, the holder's own rows, no other filter) and reports a failed
//      read instead of inventing a name;
//   3  the three surfaces go through the rule: the Passport identity reader
//      and the professional-identity seam against a stub database, and the
//      international metadata function by source (it is a server function,
//      callable only through the framework);
//   4  no reader in src takes `profiles.display_name` as a holder's name
//      directly any more -- a new reader must go through the rule;
//   5  the public share is untouched: the holder's name on a share, a page
//      and an image still comes from the database function, with the privacy
//      setting applied there, not from this rule.
//
// Deterministic, credential-free, network-free. Plain TS run with Bun.

import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveHolderDisplayName } from "../src/lib/security-passport/holder-display-name";
import { readHolderDisplayName } from "../src/lib/security-passport/holder-display-name.server";
import { readPassportProfileIdentity } from "../src/lib/security-passport/profile-identity.server";
import { readProfessionalIdentity } from "../src/lib/professional-identity/identity.functions";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

console.log("\n1 · the rule");
{
  ck(
    "the Passport name wins",
    resolveHolderDisplayName("Mostafa Alshawi", "Mos Als") === "Mostafa Alshawi",
  );
  ck(
    "a missing Passport name falls back to the account",
    resolveHolderDisplayName(null, "Mos Als") === "Mos Als",
  );
  ck(
    "an undefined Passport name falls back too",
    resolveHolderDisplayName(undefined, "Mos Als") === "Mos Als",
  );
  ck("an empty Passport name falls back", resolveHolderDisplayName("", "Mos Als") === "Mos Als");
  ck(
    "a whitespace Passport name falls back",
    resolveHolderDisplayName(" \t\n ", "Mos Als") === "Mos Als",
  );
  ck(
    "both names are trimmed",
    resolveHolderDisplayName("  Mostafa Alshawi ", "x") === "Mostafa Alshawi",
  );
  ck("the reserve is trimmed too", resolveHolderDisplayName("", "  Mos Als ") === "Mos Als");
  ck("neither → null, never an empty string", resolveHolderDisplayName("   ", "  ") === null);
  ck("nothing at all → null", resolveHolderDisplayName(null, null) === null);
}

// ── A stub client, the shape the readers use ───────────────────────────
type Answer = { data?: unknown; count?: number; error?: unknown };
function stubClient(tables: Record<string, (filters: Record<string, unknown>) => Answer>) {
  const seen: Record<string, Record<string, unknown>> = {};
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    seen[table] = filters;
    const answer = () => (tables[table] ? tables[table]!(filters) : { data: null });
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      },
      is: (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      },
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(answer()),
      then: (res: (v: Answer) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(answer()).then(res, rej),
    };
    return b;
  };
  return {
    client: { from, rpc: () => Promise.resolve({ data: [] }) } as never,
    seen,
  };
}
const ME = "holder-me";
const identityTables = (passport: string | null, account: string | null) => ({
  profiles: () => ({ data: { display_name: account, country: "SE", locale: "sv" } }),
  sp_passport_profiles: () => ({
    data:
      passport === undefined
        ? null
        : {
            display_name: passport,
            headline: null,
            jurisdiction_code: "SE",
            sub_jurisdiction_code: null,
          },
  }),
  security_career_profiles: () => ({ data: null }),
  sp_experience_periods: () => ({ data: [] }),
  sp_claims: () => ({ data: [] }),
  cd_report_snapshots: () => ({ data: null }),
  job_applications: () => ({ count: 0 }),
  employer_memberships: () => ({ count: 0 }),
});

console.log("\n2 · the shared reader");
{
  const both = stubClient(identityTables("Mostafa Alshawi", "Mos Als"));
  const r = await readHolderDisplayName(both.client, ME);
  ck(
    "reads the Passport row by holder_user_id",
    both.seen.sp_passport_profiles?.holder_user_id === ME,
  );
  ck("reads the account row by id", both.seen.profiles?.id === ME);
  ck("answers the Passport name", r.name === "Mostafa Alshawi" && r.failed === false);
  const blank = stubClient(identityTables("   ", "Mos Als"));
  ck(
    "a blank Passport name → the account name",
    (await readHolderDisplayName(blank.client, ME)).name === "Mos Als",
  );
  const noRow = stubClient({
    ...identityTables(null, "Mos Als"),
    sp_passport_profiles: () => ({ data: null }),
  });
  ck(
    "no Passport row → the account name",
    (await readHolderDisplayName(noRow.client, ME)).name === "Mos Als",
  );
  const failing = stubClient({
    ...identityTables("Mostafa Alshawi", "Mos Als"),
    sp_passport_profiles: () => ({ data: null, error: { message: "refused" } }),
  });
  const f = await readHolderDisplayName(failing.client, ME);
  ck("a failed Passport read is reported, not hidden", f.failed === true);
  ck("and never invents: the account name is still the reserve, not a guess", f.name === "Mos Als");
}

console.log("\n3 · the three surfaces");
{
  // The Passport card (CredentialWallet reads snapshot.profileIdentity).
  const card = await readPassportProfileIdentity(
    stubClient(identityTables("Mostafa Alshawi", "Mos Als")).client,
    ME,
  );
  ck(
    "the Passport card's identity carries the Passport name",
    card.displayName === "Mostafa Alshawi",
  );
  const cardReserve = await readPassportProfileIdentity(
    stubClient(identityTables("", "Mos Als")).client,
    ME,
  );
  ck(
    "…and the account name when the Passport name is empty",
    cardReserve.displayName === "Mos Als",
  );
  let threw = false;
  try {
    await readPassportProfileIdentity(
      stubClient({
        ...identityTables("Mostafa Alshawi", "Mos Als"),
        profiles: () => ({ data: null, error: { message: "refused" } }),
      }).client,
      ME,
    );
  } catch {
    threw = true;
  }
  ck("the card's reader still fails loudly on a refused read (no silent blank card)", threw);

  // The profile header and My Career (ProfessionalIdentityHeader reads the seam).
  const seam = await readProfessionalIdentity(
    stubClient(identityTables("Mostafa Alshawi", "Mos Als")).client,
    ME,
  );
  ck(
    "the professional-identity seam carries the Passport name",
    seam.displayName === "Mostafa Alshawi",
  );
  const seamReserve = await readProfessionalIdentity(
    stubClient(identityTables("  ", "Mos Als")).client,
    ME,
  );
  ck(
    "…and the account name when the Passport name is blank",
    seamReserve.displayName === "Mos Als",
  );
  const seamNoRow = await readProfessionalIdentity(
    stubClient({ ...identityTables(null, "Mos Als"), sp_passport_profiles: () => ({ data: null }) })
      .client,
    ME,
  );
  ck("…and when there is no Passport row at all", seamNoRow.displayName === "Mos Als");

  // The international overview: a server function, asserted by source.
  const intl = read("src/lib/security-passport/international.functions.ts");
  ck(
    "the international metadata reads the name through the shared reader",
    /readHolderDisplayName\(db, context\.userId\)/.test(intl) &&
      /holderDisplayName: holder\.failed \? null : holder\.name/.test(intl),
  );
  ck(
    "…and stays tolerant: a failed read is null, not an error",
    !/holder\.failed\) throw/.test(intl),
  );
}

console.log("\n4 · no reader takes the account name directly");
{
  const readers = [
    "src/lib/security-passport/profile-identity.server.ts",
    "src/lib/security-passport/international.functions.ts",
    "src/lib/professional-identity/identity.functions.ts",
  ];
  for (const file of readers) {
    const src = read(file);
    ck(`${file} imports the rule`, /holder-display-name(\.server)?"/.test(src));
    ck(
      `${file} no longer hands profiles.display_name out as the holder's name`,
      !/displayName:\s*\(?\s*(accountRow|profile\.data)\?\.display_name/.test(src) &&
        !/holderDisplayName:\s*profile\.error/.test(src),
    );
  }
  const seam = read("src/lib/professional-identity/identity.functions.ts");
  ck(
    "the seam selects display_name from the Passport row",
    /from\("sp_passport_profiles"\)\s*\.select\("display_name, headline/.test(seam),
  );
}

console.log("\n5 · the public share is untouched by this rule");
{
  for (const file of [
    "src/lib/security-passport/social-share.functions.ts",
    "src/lib/security-passport/social-share-public.ts",
    "src/lib/security-passport/og-image/model.ts",
    "src/routes/s.$publicId.tsx",
    "src/routes/og.share.$publicId.ts",
  ]) {
    ck(`${file} does not import the rule`, !/holder-display-name/.test(read(file)));
  }
  // The share's name is decided in the database: the create function reads the
  // Passport row and the privacy setting there; the public read returns the
  // holder label the holder approved. The migration says so in its own words.
  const migration = read(
    "supabase/migrations/20270217090000_sp_passport_number_and_social_share.sql",
  );
  ck(
    "the share's holder name comes from sp_passport_profiles in the database",
    /sp_passport_profiles/.test(migration) && /privacy_mode/.test(migration),
  );
  ck(
    "the share flow refuses a hidden name server-side (unchanged)",
    /name_not_approved/.test(read("src/lib/security-passport/social-share.functions.ts")),
  );
}

if (fails.length > 0) {
  console.error(`\npassport-holder-name-check: ${fails.length} failure(s)`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\npassport-holder-name-check: ok");
