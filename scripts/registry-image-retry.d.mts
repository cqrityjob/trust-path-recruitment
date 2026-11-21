/** Types for the pinned-image helper used by TypeScript checks. */
export interface PinnedImage {
  readonly tag: string;
  readonly platform: string;
  readonly digest: string;
  readonly imageId: string;
  readonly sources: readonly string[];
}
export const REGISTRY_RETRY_DELAYS_MS: readonly number[];
export const POSTGREST_14_IMAGE: PinnedImage;
export function ensurePinnedImage(
  pin: PinnedImage,
  options?: { run?: unknown; wait?: unknown; onRetry?: unknown },
): Promise<{
  ref: string;
  source: string;
  via: string;
  platform: string;
  digest: string;
  imageId: string;
}>;
