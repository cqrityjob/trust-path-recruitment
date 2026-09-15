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
