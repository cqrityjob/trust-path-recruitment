// The library's order: METHOD → ROLE → WORK ENVIRONMENT → SETUP → START.
//
// This module is the one place that says which real content a choice leads
// to. It holds no content of its own and decides no access: availability is
// read live (the startable interview guides, the recruitment assessments, the
// BESKT versions in the employer's offer), and this module only maps a choice
// onto that content and states, truthfully, what is and is not there.
//
// Three rules it exists to keep:
//   * a strategic setup is never the operational one renamed: a role profile
//     with no content of its own is NOT startable, and says what is missing;
//   * a work environment is never decoration: an environment with no scenario
//     content of its own is shown as not available, not as "adapted";
//   * TRUST and BESKT stay apart -- two methods, two reports, no shared score.

export type LibraryMethod = "trust" | "beskt";
export type RoleGroup = "operational" | "strategic";
export type RoleProfileKey = "vaktare" | "security_manager";
export type EnvironmentKey = "general" | "data_centre" | "hospital" | "shopping_centre";

export const METHODS: readonly LibraryMethod[] = ["trust", "beskt"];
export const ROLE_GROUPS: readonly RoleGroup[] = ["operational", "strategic"];

export interface RoleProfile {
  readonly key: RoleProfileKey;
  readonly group: RoleGroup;
}

export const ROLE_PROFILES: readonly RoleProfile[] = [
  { key: "vaktare", group: "operational" },
  { key: "security_manager", group: "strategic" },
];

export const ENVIRONMENTS: readonly EnvironmentKey[] = [
  "general",
  "data_centre",
  "hospital",
  "shopping_centre",
];

/** Environments with scenario content of their own. Only the general setup
 *  has any today; the others are shown, and are not startable. */
export const ENVIRONMENTS_WITH_CONTENT: readonly EnvironmentKey[] = ["general"];

/** What each TRUST role profile is built from. `null` = no content yet. */
export const TRUST_CONTENT: Record<
  RoleProfileKey,
  { readonly guidePackSlug: string; readonly assessmentSlug: string | null } | null
> = {
  vaktare: { guidePackSlug: "vaktare-se", assessmentSlug: "security-officer-recruitment" },
  // The strategic level has content OF ITS OWN (20261216090000): the
  // Säkerhetschef guide and the Security Manager recruitment test, authored
  // as governed drafts. The Väktare material is NOT offered under this
  // heading: that would be the operational test with a new title, which the
  // product structure forbids. Whether an organisation may START anything
  // with these slugs is read live: until the content is approved and
  // released, the library answers not_permitted and the startable list
  // omits the guide, and this module says so rather than pretending.
  security_manager: {
    guidePackSlug: "security-manager-se",
    assessmentSlug: "security-manager-recruitment",
  },
};

/** BESKT is one method whose questions are motivated by the ROLE'S exposure,
 *  set by the employer when the assignment starts. Both role groups use the
 *  same governed method; neither has role-specific question sets of its own
 *  yet, which the setup says. */
export const BESKT_ROLE_FIT: Record<RoleProfileKey, "generic_method"> = {
  vaktare: "generic_method",
  security_manager: "generic_method",
};

export function profilesFor(group: RoleGroup): readonly RoleProfile[] {
  return ROLE_PROFILES.filter((p) => p.group === group);
}

export function isRoleGroup(v: unknown): v is RoleGroup {
  return v === "operational" || v === "strategic";
}
export function isMethod(v: unknown): v is LibraryMethod {
  return v === "trust" || v === "beskt";
}
export function isRoleProfile(v: unknown): v is RoleProfileKey {
  return ROLE_PROFILES.some((p) => p.key === v);
}
export function isEnvironment(v: unknown): v is EnvironmentKey {
  return (ENVIRONMENTS as readonly unknown[]).includes(v);
}

// ---- the live content the setup resolves against -------------------------------

export interface LiveGuide {
  readonly packVersionId: string;
  readonly packSlug: string | null;
  readonly name: string;
  readonly nameEn: string | null;
  readonly versionNumber: number;
  readonly contentStatus: string;
  readonly validationLabel: string;
}

export interface LiveAssessment {
  readonly slug: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly assignable: boolean;
  readonly minutesMin: number | null;
  readonly minutesMax: number | null;
  readonly itemCount: number;
  readonly moduleCount: number;
  readonly contentStatus: string;
  readonly validationStatus: string;
  readonly versionNumber: number;
  readonly competenciesSv: readonly string[];
  readonly competenciesEn: readonly string[];
  readonly doesNotMeasureSv: readonly string[];
  readonly doesNotMeasureEn: readonly string[];
}

export interface LiveBesktVersion {
  readonly methodVersionId: string;
  readonly mode: string;
  readonly versionNumber: number;
  readonly validationLabel: string;
  readonly contentStatus: string | null;
  readonly availability: string | null;
  readonly nameSv: string | null;
  readonly nameEn: string | null;
}

export interface LiveContent {
  readonly guides: readonly LiveGuide[] | null;
  readonly assessments: readonly LiveAssessment[] | null;
  readonly beskt: readonly LiveBesktVersion[] | null;
}

// ---- the resolved setup -----------------------------------------------------------

/** Why a setup cannot be started. Each names a real gap, never a generic "no". */
export type SetupBlocker =
  | "no_role_content"
  | "environment_without_content"
  | "guide_unavailable"
  | "beskt_unavailable"
  | "content_unreadable";

export interface ResolvedSetup {
  readonly method: LibraryMethod;
  readonly roleGroup: RoleGroup;
  readonly roleProfile: RoleProfileKey;
  readonly environment: EnvironmentKey;
  readonly startable: boolean;
  readonly blockers: readonly SetupBlocker[];
  /** TRUST: the interview guide the case will pin. */
  readonly guide: LiveGuide | null;
  /** TRUST: the candidate test that belongs to the role, when there is one. */
  readonly assessment: LiveAssessment | null;
  /** BESKT: the versions in the offer (recruitment and, for the security
   *  function, security vetting). */
  readonly besktVersions: readonly LiveBesktVersion[];
  /** True when the setup uses the general content for a specific environment
   *  -- never, today, because such an environment is not startable. Kept so a
   *  later environment variant cannot be presented as adapted by accident. */
  readonly environmentAdapted: boolean;
}

export function resolveSetup(
  method: LibraryMethod,
  roleGroup: RoleGroup,
  roleProfile: RoleProfileKey,
  environment: EnvironmentKey,
  live: LiveContent,
): ResolvedSetup {
  const blockers: SetupBlocker[] = [];
  const profile = ROLE_PROFILES.find((p) => p.key === roleProfile);
  if (!profile || profile.group !== roleGroup) blockers.push("no_role_content");
  if (!ENVIRONMENTS_WITH_CONTENT.includes(environment))
    blockers.push("environment_without_content");

  let guide: LiveGuide | null = null;
  let assessment: LiveAssessment | null = null;
  let besktVersions: readonly LiveBesktVersion[] = [];

  if (method === "trust") {
    const content = TRUST_CONTENT[roleProfile];
    if (!content) {
      if (!blockers.includes("no_role_content")) blockers.push("no_role_content");
    } else if (live.guides === null) {
      blockers.push("content_unreadable");
    } else {
      guide = live.guides.find((g) => g.packSlug === content.guidePackSlug) ?? null;
      if (!guide) blockers.push("guide_unavailable");
      if (content.assessmentSlug && live.assessments) {
        assessment =
          live.assessments.find((a) => a.slug === content.assessmentSlug && a.assignable) ?? null;
      }
    }
  } else {
    if (live.beskt === null) blockers.push("content_unreadable");
    else {
      besktVersions = live.beskt;
      if (besktVersions.length === 0) blockers.push("beskt_unavailable");
    }
  }

  return {
    method,
    roleGroup,
    roleProfile,
    environment,
    startable: blockers.length === 0,
    blockers,
    guide,
    assessment,
    besktVersions,
    environmentAdapted: false,
  };
}

/** The role profiles a customer is offered under a method: only those with
 *  content they can start. A catalogue of switched-off future packages is not
 *  shown to customers (owner decision 2026-09-19); it lives in documentation. */
export function availableProfiles(
  method: LibraryMethod,
  live: LiveContent,
): readonly RoleProfile[] {
  return ROLE_PROFILES.filter(
    (p) => resolveSetup(method, p.group, p.key, "general", live).startable,
  );
}

/** The environments a customer is offered: only those with content. */
export function availableEnvironments(): readonly EnvironmentKey[] {
  return ENVIRONMENTS.filter((e) => ENVIRONMENTS_WITH_CONTENT.includes(e));
}

/** Whether a whole method has anything this organisation can start. `null`
 *  when the content could not be read -- never shown as "nothing there". */
export function methodAvailability(
  method: LibraryMethod,
  live: LiveContent,
): "available" | "none" | "unreadable" {
  if (method === "trust" && live.guides === null) return "unreadable";
  if (method === "beskt" && live.beskt === null) return "unreadable";
  return availableProfiles(method, live).length > 0 ? "available" : "none";
}
