import { z } from "zod";

/**
 * The workspace's operating profile, version 1. Pure and shared by server and
 * client. Every field is optional: onboarding is progressive and manual work
 * never waits for a complete profile. The database refuses any other schema
 * version; this module refuses to read one (fail closed).
 */
export const OPERATING_PROFILE_SCHEMA = "sw-operating-profile-1" as const;

const line = (max = 300) => z.string().trim().min(1).max(max);
const list = (max = 30, length = 300) => z.array(line(length)).max(max).default([]);

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const applicabilityValues = [
  "applies",
  "may_apply",
  "does_not_apply",
  "unassessed",
] as const;
export const classificationValues = ["public", "internal", "confidential"] as const;
export const riskMethodValues = ["rsa", "iso31000", "custom"] as const;

export const operatingProfileSchema = z
  .object({
    organisationDescription: z.string().trim().max(4000).default(""),
    sectors: list(20),
    activities: list(30),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(60)
      .default([]),
    locations: z
      .array(
        z
          .object({
            name: line(200),
            country: z.string().regex(/^[A-Z]{2}$/),
            timeZone: z.string().refine(validTimeZone, "IANA time zone required"),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    criticalServices: list(30),
    technologies: list(40),
    suppliers: list(40),
    riskMethod: z
      .object({
        method: z.enum(riskMethodValues),
        likelihoodScale: z.string().trim().max(1000).default(""),
        consequenceScale: z.string().trim().max(1000).default(""),
        horizon: z.string().trim().max(200).default(""),
        acceptanceAuthority: z.string().trim().max(500).default(""),
      })
      .strict()
      .optional(),
    language: z.enum(["sv", "en"]).optional(),
    terminology: z.string().trim().max(2000).default(""),
    responsibilities: z
      .array(z.object({ role: line(200), holder: line(200) }).strict())
      .max(40)
      .default([]),
    escalation: z.string().trim().max(2000).default(""),
    requirements: z
      .array(
        z
          .object({
            name: line(300),
            applicability: z.enum(applicabilityValues),
            basis: z.string().trim().max(1000).default(""),
          })
          .strict(),
      )
      .max(40)
      .default([]),
    monitoring: z
      .object({
        topics: list(40),
        places: list(40),
        exclusions: list(40),
        coverageExpectation: z.string().trim().max(500).default(""),
      })
      .strict()
      .default({ topics: [], places: [], exclusions: [], coverageExpectation: "" }),
    dataPolicy: z
      .object({
        classificationCeiling: z.enum(classificationValues),
        permittedProcessorRegions: list(10, 60),
        retentionMonths: z.number().int().min(1).max(120).nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type OperatingProfile = z.infer<typeof operatingProfileSchema>;
export type ProfileField = keyof OperatingProfile;

export const provenanceOrigins = ["user", "mandate", "assets", "monitoring_profile"] as const;
export const provenanceSchema = z.record(
  z.string(),
  z
    .object({
      origin: z.enum(provenanceOrigins),
      confirmed: z.boolean(),
      confirmedBy: z.string().uuid().optional(),
      confirmedAt: z.string().datetime().optional(),
    })
    .strict(),
);
export type Provenance = z.infer<typeof provenanceSchema>;

export class UnknownProfileSchema extends Error {
  constructor(readonly schemaVersion: string) {
    super(`SW_UNKNOWN_PROFILE_SCHEMA:${schemaVersion}`);
  }
}

/** Reads a stored profile. An unknown schema version is an error, never a guess. */
export function readProfile(schemaVersion: string, value: unknown): OperatingProfile {
  if (schemaVersion !== OPERATING_PROFILE_SCHEMA) throw new UnknownProfileSchema(schemaVersion);
  return operatingProfileSchema.parse(value);
}

export const emptyProfile = (): OperatingProfile => operatingProfileSchema.parse({});

/** Values the workspace already holds, offered for confirmation. Never saved unconfirmed. */
export interface PrefillSource {
  mandate: { organisation_description: string; geographic_scope: string } | null;
  assets: { name: string; category: string; status: string }[];
  monitoring: { sector: string; countries: string[]; threat_categories: string[] } | null;
}
export interface Prefill {
  profile: Partial<OperatingProfile>;
  provenance: Provenance;
}
export function prefillFrom(source: PrefillSource): Prefill {
  const profile: Partial<OperatingProfile> = {};
  const provenance: Provenance = {};
  const offer = <K extends ProfileField>(
    field: K,
    value: OperatingProfile[K],
    origin: Provenance[string]["origin"],
  ) => {
    profile[field] = value;
    provenance[field] = { origin, confirmed: false };
  };
  if (source.mandate?.organisation_description.trim())
    offer("organisationDescription", source.mandate.organisation_description.trim(), "mandate");
  const services = source.assets
    .filter((asset) => asset.status === "active" && asset.category === "operations")
    .map((asset) => asset.name.trim())
    .filter(Boolean);
  if (services.length) offer("criticalServices", services.slice(0, 30), "assets");
  const suppliers = source.assets
    .filter((asset) => asset.status === "active" && asset.category === "suppliers")
    .map((asset) => asset.name.trim())
    .filter(Boolean);
  if (suppliers.length) offer("suppliers", suppliers.slice(0, 40), "assets");
  if (source.monitoring?.sector.trim())
    offer("sectors", [source.monitoring.sector.trim()], "monitoring_profile");
  const countries = (source.monitoring?.countries ?? [])
    .map((country) => country.trim().toUpperCase())
    .filter((country) => /^[A-Z]{2}$/.test(country));
  if (countries.length) offer("countries", countries.slice(0, 60), "monitoring_profile");
  if (source.monitoring?.threat_categories.length)
    offer(
      "monitoring",
      {
        topics: source.monitoring.threat_categories.slice(0, 40),
        places: [],
        exclusions: [],
        coverageExpectation: "",
      },
      "monitoring_profile",
    );
  return { profile, provenance };
}

/**
 * What may be saved: every user-entered field, and a prefilled field only once
 * a person confirmed it. Unconfirmed prefilled values are dropped, so a record
 * elsewhere in the workspace never silently becomes the organisation's
 * stated context.
 */
export function confirmedOnly(
  profile: OperatingProfile,
  provenance: Provenance,
): { profile: OperatingProfile; provenance: Provenance } {
  const base = emptyProfile() as Record<string, unknown>;
  const kept: Record<string, unknown> = { ...profile };
  const keptProvenance: Provenance = {};
  for (const [field, entry] of Object.entries(provenance)) {
    if (entry.origin !== "user" && !entry.confirmed) {
      if (field in base) kept[field] = base[field];
      else delete kept[field];
      continue;
    }
    keptProvenance[field] = entry;
  }
  return { profile: operatingProfileSchema.parse(kept), provenance: keptProvenance };
}

/** The questions that matter first, in order. The rest is asked only when a task needs it. */
export function decisionCriticalGaps(profile: OperatingProfile): ProfileField[] {
  const gaps: ProfileField[] = [];
  if (!profile.organisationDescription) gaps.push("organisationDescription");
  if (!profile.countries.length && !profile.locations.length) gaps.push("countries");
  if (!profile.criticalServices.length) gaps.push("criticalServices");
  if (!profile.riskMethod?.acceptanceAuthority) gaps.push("riskMethod");
  return gaps;
}
