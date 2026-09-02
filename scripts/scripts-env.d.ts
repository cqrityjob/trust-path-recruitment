// Bun exposes `import.meta.dir`, which neither `vite/client` nor `@types/node`
// declares. The guard scripts use it to resolve repository paths.
//
// Declared here rather than by installing `bun-types`: that package brings a
// whole runtime's globals into a typecheck whose only unmet need is one
// string, and the wider the ambient surface the less the typecheck means.
interface ImportMeta {
  /** Absolute path of the directory containing this module. Bun-specific. */
  readonly dir: string;
}

// `bun:test`, narrowed to the one export the guard scripts use.
//
// Same argument as above, and the same restraint. A render guard that draws a
// component containing <Link> has to substitute the router first —
// `renderToStaticMarkup` gives <Link> no live router and it throws — and
// `mock.module` is how every such guard in this directory does it.
//
// Only `module` is declared. Pulling in the whole test API would put `expect`,
// `describe` and `it` in scope for files that are not tests and must not start
// looking like them.
declare module "bun:test" {
  export const mock: {
    /** Replace a module's exports for the remainder of the process. Must be
     *  awaited BEFORE the module under test is imported, which is why the
     *  scripts that use it import their subjects dynamically. */
    module(specifier: string, factory: () => unknown): Promise<void>;
  };
}
