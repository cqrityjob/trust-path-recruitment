import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  credentialPassportHolder,
  isPassportCredential,
} from "../src/lib/security-passport/credential-passport";
import { personaById } from "../src/lib/security-passport/fixtures/personas";
import {
  credentialDate,
  CREDENTIAL_CLASSES,
  currentCredentialVerification,
} from "../src/lib/security-passport/international";
import { readPassportProfileIdentity } from "../src/lib/security-passport/profile-identity.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

describe("credential-only Passport ownership", () => {
  for (const [claimType, credentialCode, expected] of [
    ["certification", null, true],
    ["licence", null, true],
    ["training", "VU1", true],
    ["specialisation", "SV", true],
    ["training", null, false],
    ["specialisation", null, false],
    ["education", null, false],
    ["professional_membership", null, false],
  ] as const)
    it(`${claimType}/${credentialCode}`, () =>
      assert.equal(isPassportCredential({ claimType, credentialCode }), expected));
  it("projection preserves CV source rows", () => {
    const source = personaById("overlapping-employers");
    const before = JSON.stringify(source);
    const projected = credentialPassportHolder(source);
    assert.deepEqual(projected.periods, []);
    assert(projected.claims.every(isPassportCredential));
    assert(source.periods.length > 0);
    assert.equal(JSON.stringify(source), before);
  });
});
describe("international identity, locale and review expiry", () => {
  it("every database class translated (india-entry-check 9.x mirrors the migrations)", () => {
    assert.equal(Object.keys(CREDENTIAL_CLASSES).length, 8);
    assert(Object.values(CREDENTIAL_CLASSES).every((c) => c.sv && c.en));
  });
  it("missing expiry remains unknown", () => {
    assert.equal(credentialDate(null, "en"), "Not stated");
    assert.equal(credentialDate(null, "sv"), "Inte angivet");
    assert.equal(credentialDate("2026-01-05", "en"), "5 Jan 2026");
  });
  it("canonical title updates and clears", async () => {
    let title: string | null = "Security analyst";
    const db = {
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            error: null,
            data:
              table === "profiles"
                ? { display_name: "Owner" }
                : table === "security_career_profiles"
                  ? { current_profession_slug: null, current_profession_other: title }
                  : null,
          }),
        };
        return query;
      },
    } as unknown as SupabaseClient<Database>;
    assert.equal((await readPassportProfileIdentity(db, "owner")).titleEn, title);
    title = "Operations manager";
    assert.equal((await readPassportProfileIdentity(db, "owner")).titleEn, title);
    title = null;
    assert.equal((await readPassportProfileIdentity(db, "owner")).titleEn, null);
  });
  const base = {
    ...personaById("overlapping-employers").claims[0]!,
    assertionLevel: "verified" as const,
  };
  for (const [result, validUntil, expected] of [
    ["approved", "2027-01-01", "verified"],
    ["approved", "2025-01-01", "document_provided"],
    ["revoked", null, "document_provided"],
    ["rejected", null, "document_provided"],
  ] as const)
    it(`review ${result}/${validUntil}`, () =>
      assert.equal(
        currentCredentialVerification(
          base,
          [{ claimId: base.id, result, decidedAt: "2026-01-01", validUntil }],
          "2026-09-15",
        ).assertionLevel,
        expected,
      ));
  it("no event cannot sustain verified status", () =>
    assert.equal(
      currentCredentialVerification(base, [], "2026-09-15").assertionLevel,
      "document_provided",
    ));
  it("an approval never promotes a self-reported claim", () =>
    assert.equal(
      currentCredentialVerification(
        { ...base, assertionLevel: "self_declared" },
        [{ claimId: base.id, result: "approved", decidedAt: "2026-01-01", validUntil: null }],
        "2026-09-15",
      ).assertionLevel,
      "self_declared",
    ));
});
