// Which interview an intended start leads to -- decided from the start's own
// source, never from the application alone and never from a job title.
//
//   * after a completed test, the setup is the one the TEST was sent with;
//     a test sent without one needs an explicit choice, limited to the roles
//     whose content includes exactly that test;
//   * before any test, only an explicitly chosen, available setup starts
//     anything -- there is no Väktare default;
//   * the guide is the role's own (TRUST_CONTENT), and a role whose test is
//     not the one that was taken is refused rather than re-labelled.
//
// Pure, so the routing can be proved with fixture content maps; the database
// (scp_iv_start_interview) re-checks the source, the candidate and the setup.

import {
  ENVIRONMENTS_WITH_CONTENT,
  ROLE_PROFILES,
  TRUST_CONTENT,
  type EnvironmentKey,
  type RoleGroup,
  type RoleProfileKey,
} from "@/lib/library/catalogue";

export interface StartSetup {
  readonly roleGroup: RoleGroup;
  readonly roleProfile: RoleProfileKey;
  readonly environment: EnvironmentKey;
}

export type TrustContentMap = Readonly<
  Record<string, { readonly guidePackSlug: string; readonly assessmentSlug: string | null } | null>
>;

export interface StartCatalogue {
  readonly content: TrustContentMap;
  readonly profiles: readonly { readonly key: string; readonly group: RoleGroup }[];
  readonly environments: readonly string[];
}

export const LIVE_CATALOGUE: StartCatalogue = {
  content: TRUST_CONTENT,
  profiles: ROLE_PROFILES,
  environments: ENVIRONMENTS_WITH_CONTENT,
};

export type StartRefusal =
  | "setup_already_recorded"
  | "no_role_content"
  | "environment_without_content"
  | "setup_test_mismatch"
  | "no_setup_for_test";

export type StartRoute =
  | {
      readonly kind: "route";
      readonly setup: StartSetup;
      readonly guidePackSlug: string;
      /** True when the setup came from the source itself, not from a choice. */
      readonly fromSource: boolean;
    }
  | { readonly kind: "choose"; readonly choices: readonly StartSetup[] }
  | { readonly kind: "refused"; readonly reason: StartRefusal };

function same(a: StartSetup, b: StartSetup): boolean {
  return (
    a.roleGroup === b.roleGroup &&
    a.roleProfile === b.roleProfile &&
    a.environment === b.environment
  );
}

/** Every setup that may be chosen for this start: roles with content (and,
 *  after a test, content built on THAT test) in environments with content. */
export function startChoices(
  testSlug: string | null,
  catalogue: StartCatalogue = LIVE_CATALOGUE,
): readonly StartSetup[] {
  const out: StartSetup[] = [];
  for (const p of catalogue.profiles) {
    const c = catalogue.content[p.key];
    if (!c) continue;
    if (testSlug !== null && c.assessmentSlug !== testSlug) continue;
    for (const e of catalogue.environments) {
      out.push({
        roleGroup: p.group,
        roleProfile: p.key as RoleProfileKey,
        environment: e as EnvironmentKey,
      });
    }
  }
  return out;
}

export function routeInterviewStart(
  input: {
    /** The slug of the completed test this start comes from; null before any test. */
    readonly testSlug: string | null;
    /** The setup recorded with the source, when there is one. */
    readonly recorded: StartSetup | null;
    /** The setup the employer chose explicitly, when they did. */
    readonly chosen: StartSetup | null;
  },
  catalogue: StartCatalogue = LIVE_CATALOGUE,
): StartRoute {
  const { testSlug, recorded, chosen } = input;
  if (recorded && chosen && !same(recorded, chosen)) {
    return { kind: "refused", reason: "setup_already_recorded" };
  }
  const setup = recorded ?? chosen;
  if (!setup) {
    const choices = startChoices(testSlug, catalogue);
    return choices.length > 0
      ? { kind: "choose", choices }
      : { kind: "refused", reason: "no_setup_for_test" };
  }
  const profile = catalogue.profiles.find((p) => p.key === setup.roleProfile);
  const content = catalogue.content[setup.roleProfile];
  if (!profile || profile.group !== setup.roleGroup || !content) {
    return { kind: "refused", reason: "no_role_content" };
  }
  if (!catalogue.environments.includes(setup.environment)) {
    return { kind: "refused", reason: "environment_without_content" };
  }
  if (testSlug !== null && content.assessmentSlug !== testSlug) {
    return { kind: "refused", reason: "setup_test_mismatch" };
  }
  return {
    kind: "route",
    setup,
    guidePackSlug: content.guidePackSlug,
    fromSource: recorded !== null,
  };
}
