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
