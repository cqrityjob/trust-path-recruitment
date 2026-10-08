/** Exact own native-origin test fault; the returned fetch preserves the native API. */
export function cleanupFaultFetch(
  options: { file: string },
  originalFetch: typeof globalThis.fetch,
): typeof globalThis.fetch;
