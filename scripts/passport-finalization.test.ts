import { describe, expect, test } from "bun:test";
import {
  credentialPassportHolder,
  isPassportCredential,
} from "../src/lib/security-passport/credential-passport";
import { personaById } from "../src/lib/security-passport/fixtures/personas";

describe("credential-only Passport ownership", () => {
  test.each([
    ["certification", null, true],
    ["licence", null, true],
    ["training", "VU1", true],
    ["specialisation", "SV", true],
    ["training", null, false],
    ["specialisation", null, false],
    ["education", null, false],
    ["professional_membership", null, false],
  ] as const)("%s / %s belongs to Passport: %s", (claimType, credentialCode, expected) => {
    expect(isPassportCredential({ claimType, credentialCode })).toBe(expected);
  });
  test("projecting the wallet leaves CV source rows intact", () => {
    const source = personaById("overlapping-employers");
    const before = JSON.stringify(source);
    const projected = credentialPassportHolder(source);
    expect(projected.periods).toEqual([]);
    expect(projected.claims.every(isPassportCredential)).toBe(true);
    expect(source.periods.length).toBeGreaterThan(0);
    expect(JSON.stringify(source)).toBe(before);
  });
});

import { credentialDate, CREDENTIAL_CLASSES } from "../src/lib/security-passport/international";
import { readPassportProfileIdentity } from "../src/lib/security-passport/profile-identity.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

describe("international identity and dates", () => {
  test("all seven classes have both display languages", () => {
    expect(Object.keys(CREDENTIAL_CLASSES)).toHaveLength(7);
    expect(Object.values(CREDENTIAL_CLASSES).every((c) => c.sv && c.en)).toBe(true);
  });
  test("a missing date is unknown, never no expiry", () => {
    expect(credentialDate(null, "en")).toBe("Not stated");
    expect(credentialDate(null, "sv")).toBe("Inte angivet");
    expect(credentialDate("2026-01-05", "en")).toBe("5 Jan 2026");
  });
  test("a Profile update replaces the title and clearing it never revives a Passport headline", async () => {
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
    expect((await readPassportProfileIdentity(db, "owner")).titleEn).toBe("Security analyst");
    title = "Operations manager";
    expect((await readPassportProfileIdentity(db, "owner")).titleEn).toBe(title);
    title = null;
    expect((await readPassportProfileIdentity(db, "owner")).titleEn).toBeNull();
  });
});
