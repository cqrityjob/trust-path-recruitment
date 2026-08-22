type PublicConfigSource = "cqrityjob-owned" | "lovable-cloud";

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
  source: PublicConfigSource;
};

function viteEnv(name: string): string | undefined {
  const env = (
    import.meta as ImportMeta & {
      readonly env?: Record<string, string | undefined>;
    }
  ).env;
  return env?.[name];
}

function processEnv(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

function requirePair(
  url: string | undefined,
  publishableKey: string | undefined,
  source: PublicConfigSource,
): SupabasePublicConfig | undefined {
  if (!url && !publishableKey) return undefined;
  if (!url || !publishableKey) {
    throw new Error(
      `Incomplete Supabase configuration for ${source}: URL and publishable key must be set together.`,
    );
  }
  return { url, publishableKey, source };
}

/**
 * CQrityjob-owned variables deliberately have first priority. Lovable Cloud
 * injects the standard SUPABASE_* names at runtime, so those names cannot
 * perform a reversible cutover to an externally owned project.
 */
export function getSupabasePublicConfig(): SupabasePublicConfig {
  const owned = requirePair(
    viteEnv("VITE_CQRITYJOB_SUPABASE_URL") ?? processEnv("CQRITYJOB_SUPABASE_URL"),
    viteEnv("VITE_CQRITYJOB_SUPABASE_PUBLISHABLE_KEY") ??
      processEnv("CQRITYJOB_SUPABASE_PUBLISHABLE_KEY"),
    "cqrityjob-owned",
  );
  if (owned) return owned;

  const cloud = requirePair(
    viteEnv("VITE_SUPABASE_URL") ?? processEnv("SUPABASE_URL"),
    viteEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ?? processEnv("SUPABASE_PUBLISHABLE_KEY"),
    "lovable-cloud",
  );
  if (cloud) return cloud;

  throw new Error(
    "Missing Supabase URL and publishable key. Configure the CQrityjob-owned backend or the Lovable Cloud fallback.",
  );
}

export function getSupabaseAdminConfig(): {
  url: string;
  serviceRoleKey: string;
  source: PublicConfigSource;
} {
  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey =
    publicConfig.source === "cqrityjob-owned"
      ? processEnv("CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY")
      : processEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceRoleKey) {
    const variable =
      publicConfig.source === "cqrityjob-owned"
        ? "CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY"
        : "SUPABASE_SERVICE_ROLE_KEY";
    throw new Error(`Missing server-only Supabase environment variable: ${variable}.`);
  }

  return {
    url: publicConfig.url,
    serviceRoleKey,
    source: publicConfig.source,
  };
}
