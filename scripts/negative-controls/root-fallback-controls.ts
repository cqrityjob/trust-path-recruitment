/**
 * Negative controls for the root's 404 and error screens.
 *
 * The screens were English-only on a Swedish-default site, and they can render
 * after a hard crash has taken the I18nProvider and QueryClientProvider away.
 * Each way that can quietly come back is planted here: an English literal in
 * the component, the tolerant translator turning strict (it would throw inside
 * the error boundary), the 404 wearing the public chrome without the providers
 * the chrome needs, a Swedish string replaced by its English twin, the retry
 * losing its invalidate, and the route no longer using the component.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte (proved by the shared
 * runner).
 *
 * Run: bun run negative-controls:root-fallback
 */
import { runControls, type Mutation } from "./runner";

const COMPONENT = "src/components/site/RootFallbacks.tsx";
const CONTEXT = "src/i18n/context.tsx";
const ROUTE = "src/routes/__root.tsx";
const DICT = "src/i18n/dictionaries.ts";
const GUARD = "root-fallback:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "RF-NC-ENGLISH-LITERAL",
    defect: "the 404's heading is hard-coded English again, on the Swedish-default site",
    file: COMPONENT,
    find: '{t("root.notFound.title")}',
    replace: "Page not found",
    guard: GUARD,
    expect: 'no hard-coded "Page not found" in the route or the component',
  },
  {
    id: "RF-NC-TOLERANT-T-TURNS-STRICT",
    defect:
      "the tolerant translator calls useT(), which throws outside the I18nProvider -- inside the error boundary meant to catch the first failure",
    file: CONTEXT,
    find: '  const ctx = useContext(I18nContext);\n  const [stored, setStored] = useState<Lang>("sv");',
    replace: '  const ctx = useT();\n  const [stored, setStored] = useState<Lang>("sv");',
    guard: GUARD,
    expect: "404 with no provider at all: renders",
  },
  {
    id: "RF-NC-404-FRAMED-WITHOUT-PROVIDERS",
    defect:
      "the 404 wears the public chrome even with no providers above it, so the header's useT() / useQuery() crash the boundary",
    file: COMPONENT,
    find: "  const framed = hasI18n && hasQueryClient;",
    replace: "  const framed = true;",
    guard: GUARD,
    expect: "does not wear the chrome",
  },
  {
    id: "RF-NC-SWEDISH-IS-ENGLISH",
    defect: "the Swedish error heading is the English one, so the Swedish site shows English",
    file: DICT,
    find: '"root.error.title": "Sidan kunde inte laddas",',
    replace: '"root.error.title": "This page didn\'t load",',
    guard: GUARD,
    expect: '"root.error.title" is actually translated',
  },
  {
    id: "RF-NC-RETRY-DOES-NOT-INVALIDATE",
    defect:
      "Try again resets the boundary without invalidating the router, so it re-renders the same failed state",
    file: COMPONENT,
    find: "              router.invalidate();\n",
    replace: "",
    guard: GUARD,
    expect: "retry still invalidates the router and resets the boundary",
  },
  {
    id: "RF-NC-ROUTE-KEEPS-ITS-OWN-404",
    defect: "the root route stops using the translated 404 component",
    file: ROUTE,
    find: "  notFoundComponent: RootNotFound,",
    replace: "  notFoundComponent: undefined,",
    guard: GUARD,
    expect: "notFoundComponent is RootNotFound",
  },
];

runControls("root-fallback", MUTATIONS);
