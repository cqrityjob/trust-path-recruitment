// Security Passport — the add-credential wizard's filters, as ONE pure model.
//
// ── WHY THIS IS A MODULE AND NOT A FEW LINES IN THE FORM ───────────────
//
// The wizard's five filters used to be five independent `useState`s whose
// option lists were all derived from the same unfiltered set. Three defects
// followed, and none of them was visible until a holder could not find a
// credential they were entitled to:
//
//   * a stale selection survived a change above it — pick an organisation in
//     Sweden, switch to Great Britain, and the catalogue was silently empty;
//   * the filters never narrowed one another, so a combination with no result
//     was offered as freely as one with forty;
//   * the search read four strings and ignored the code, the abbreviation and
//     the approved aliases — "CPP", "(ISC)²" and "VU1" found nothing.
//
// Everything here is derived from GOVERNED catalogue relationships handed in by
// the server: the approved definitions, the organisation-role model, the
// definition reviews, abbreviations and issuer aliases. Nothing is a hard-coded
// example list, and nothing is inferred from a holder-written string.
//
// ── THE RULES, EACH PINNED BY scripts/passport-catalogue-filter-check.ts ──
//
//   1. Optional filters start at "all". No filter is ever defaulted to its
//      first option.
//   2. FACETED OPTIONS: a filter's options are computed with every OTHER filter
//      applied, so only valid combinations are offered, each with its count.
//   3. A REGION filter never hides a country-wide credential: a definition with
//      no region of its own belongs to every region of its country.
//   4. Changing a filter clears exactly the dependent selections that are no
//      longer valid — never the ones that still are.
//   5. The region control is relevant only when the country has a regional
//      definition the holder may see.
//   6. An organisation option is a GOVERNED organisation in a stated role
//      (regulator, issuer, training provider, verification authority). A
//      document-stated issuer produces no option — the holder names it later —
//      and its credential stays findable through its regulator and through
//      "all".
//   7. Search matches every token, diacritic-folded, against the canonical
//      names, the stable code, the symbol, the abbreviation, approved issuer
//      aliases and the governed organisation names.
//   8. A definition with no reviewed professional area is never excluded by
//      "all areas".

export type OrganisationRoleKind =
  | "issuer"
  | "regulator"
  | "training_provider"
  | "verification_authority";

export interface FilterDefinition {
  readonly code: string;
  readonly name_sv: string;
  readonly name_en: string;
  readonly scope_code: string | null;
  readonly country: string | null;
  readonly region: string | null;
  readonly credential_class: string;
  readonly issuer_id: string | null;
  readonly issuer_name: string | null;
}

export interface FilterOrganisationRole {
  readonly credential_code: string;
  readonly role: OrganisationRoleKind;
  readonly authority_id: string | null;
  readonly certification_issuer_id: string | null;
  readonly document_specific: boolean;
}

export interface CatalogueFilterSource {
  readonly definitions: readonly FilterDefinition[];
  readonly organisationRoles: readonly FilterOrganisationRole[];
  readonly definitionReviews: readonly {
    readonly credential_code: string;
    readonly professional_domain: string;
  }[];
  /** `sp_credential_types`: the scope requirement and the governed symbol. */
  readonly definitionFacts: readonly {
    readonly code: string;
    readonly requires_scope?: boolean | null;
    readonly symbol_label?: string | null;
  }[];
  /** `sp_certification_definitions.abbreviation`. */
  readonly abbreviations: readonly {
    readonly credential_code: string;
    readonly abbreviation: string | null;
  }[];
  /** `sp_certification_issuer_aliases`: approved search aliases, never rendered. */
  readonly issuerAliases: readonly { readonly issuer_id: string; readonly alias: string }[];
  /** Governed organisations by id (authorities and certification bodies). */
  readonly organisations: readonly { readonly id: string; readonly name: string }[];
}

export interface CatalogueFilterState {
  readonly scope: "international" | "national";
  readonly country: string;
  readonly region: string;
  readonly domain: string;
  readonly category: string;
  readonly organisation: string;
  readonly search: string;
}

export const EMPTY_FILTERS: CatalogueFilterState = {
  scope: "international",
  country: "",
  region: "",
  domain: "",
  category: "",
  organisation: "",
  search: "",
};

export interface OrganisationInRole {
  readonly id: string;
  readonly name: string;
  readonly role: OrganisationRoleKind;
}

export interface IndexedDefinition extends FilterDefinition {
  readonly domain: string | null;
  readonly requiresScope: boolean;
  /** The organisation-role model says the issuer is stated on the document. */
  readonly issuerStatedOnDocument: boolean;
  /** The training provider is stated on the document (never a regulator). */
  readonly trainingProviderStatedOnDocument: boolean;
  readonly organisations: readonly OrganisationInRole[];
  readonly haystack: string;
  /**
   * Every approved way the ISSUER of this definition may be written: the
   * governed organisation name plus its approved aliases ("(ISC)²", a historical
   * name). For MATCHING a document against the catalogue only. Like the
   * haystack it is never rendered: whatever matched, the holder is shown the
   * governed name. Pinned by passport-global-certification:check.
   */
  readonly issuerMatchTerms: readonly string[];
}

export interface FacetOption {
  readonly value: string;
  readonly count: number;
}

export interface CatalogueFilterResult {
  /** Definitions matching every filter and the search. */
  readonly results: readonly IndexedDefinition[];
  /** Definitions matching scope (+ country), before any optional filter. */
  readonly total: number;
  readonly countries: readonly FacetOption[];
  readonly regions: readonly FacetOption[];
  readonly domains: readonly FacetOption[];
  readonly categories: readonly FacetOption[];
  readonly organisations: readonly (FacetOption & { readonly name: string })[];
  /** False when the country has no regional definition: hide the control. */
  readonly regionRelevant: boolean;
  /** True when any optional filter or the search is narrowing the list. */
  readonly narrowed: boolean;
}

/** Lower-case, diacritic-folded, punctuation-light: "(ISC)²" → "isc2". */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildCatalogueIndex(source: CatalogueFilterSource): readonly IndexedDefinition[] {
  const organisationName = new Map(source.organisations.map((o) => [o.id, o.name]));
  const domainOf = new Map(
    source.definitionReviews.map((r) => [r.credential_code, r.professional_domain]),
  );
  const factsOf = new Map(source.definitionFacts.map((f) => [f.code, f]));
  const abbreviationOf = new Map(
    source.abbreviations.map((a) => [a.credential_code, a.abbreviation ?? ""]),
  );
  const aliasesOf = new Map<string, string[]>();
  for (const a of source.issuerAliases)
    aliasesOf.set(a.issuer_id, [...(aliasesOf.get(a.issuer_id) ?? []), a.alias]);
  const rolesOf = new Map<string, FilterOrganisationRole[]>();
  for (const r of source.organisationRoles)
    rolesOf.set(r.credential_code, [...(rolesOf.get(r.credential_code) ?? []), r]);

  return source.definitions.map((d) => {
    const roles = rolesOf.get(d.code) ?? [];
    const organisations: OrganisationInRole[] = [];
    for (const r of roles) {
      const id = r.authority_id ?? r.certification_issuer_id;
      const name = id ? organisationName.get(id) : undefined;
      if (id && name) organisations.push({ id, name, role: r.role });
    }
    // A definition the role model does not cover yet still names its governed
    // issuer through the catalogue row itself.
    if (d.issuer_id && d.issuer_name && !organisations.some((o) => o.role === "issuer"))
      organisations.push({ id: d.issuer_id, name: d.issuer_name, role: "issuer" });
    const facts = factsOf.get(d.code);
    const aliasText = organisations.flatMap((o) => aliasesOf.get(o.id) ?? []);
    const issuingOrganisations = organisations.filter((o) => o.role === "issuer");
    return {
      ...d,
      domain: domainOf.get(d.code) ?? null,
      requiresScope: facts?.requires_scope === true,
      issuerStatedOnDocument:
        d.issuer_name === null || roles.some((r) => r.role === "issuer" && r.document_specific),
      trainingProviderStatedOnDocument: roles.some(
        (r) => r.role === "training_provider" && r.document_specific,
      ),
      organisations,
      issuerMatchTerms: issuingOrganisations.flatMap((o) => [
        o.name,
        ...(aliasesOf.get(o.id) ?? []),
      ]),
      haystack: foldForSearch(
        [
          d.name_sv,
          d.name_en,
          d.code,
          facts?.symbol_label ?? "",
          abbreviationOf.get(d.code) ?? "",
          ...organisations.map((o) => o.name),
          ...aliasText,
        ].join(" "),
      ),
    };
  });
}

type OptionalFilter = "region" | "domain" | "category" | "organisation" | "search";

function matchesScope(d: IndexedDefinition, state: CatalogueFilterState): boolean {
  if (state.scope === "international") return d.scope_code === "global_professional";
  if (d.scope_code === "global_professional") return false;
  return !state.country || d.country === state.country;
}

function matchesOptional(
  d: IndexedDefinition,
  state: CatalogueFilterState,
  extraHaystack: (d: IndexedDefinition) => string,
  skip?: OptionalFilter,
): boolean {
  // RULE 3: a country-wide definition (no region of its own) survives any
  // region filter of its country.
  if (skip !== "region" && state.scope === "national" && state.region)
    if (d.region && d.region !== state.region) return false;
  if (skip !== "domain" && state.domain && d.domain !== state.domain) return false;
  if (skip !== "category" && state.category && d.credential_class !== state.category) return false;
  if (
    skip !== "organisation" &&
    state.organisation &&
    !d.organisations.some((o) => o.id === state.organisation)
  )
    return false;
  if (skip !== "search") {
    const tokens = foldForSearch(state.search).split(" ").filter(Boolean);
    if (tokens.length) {
      const hay = `${d.haystack} ${foldForSearch(extraHaystack(d))}`;
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
  }
  return true;
}

function facet<T extends string>(
  items: readonly IndexedDefinition[],
  valuesOf: (d: IndexedDefinition) => readonly T[],
): FacetOption[] {
  const counts = new Map<string, number>();
  for (const d of items)
    for (const v of new Set(valuesOf(d))) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count }));
}

/**
 * The whole filter answer for one state.
 *
 * `extraHaystack` lets the form add LOCALISED labels (class, country, region,
 * professional area) to the search without this module knowing the language.
 */
export function filterCatalogue(
  index: readonly IndexedDefinition[],
  state: CatalogueFilterState,
  extraHaystack: (d: IndexedDefinition) => string = () => "",
): CatalogueFilterResult {
  const national = index.filter((d) => d.scope_code !== "global_professional");
  const inScope = index.filter((d) => matchesScope(d, state));
  const pass = (skip?: OptionalFilter) =>
    inScope.filter((d) => matchesOptional(d, state, extraHaystack, skip));

  const results = pass();
  const regionalInCountry = inScope.filter((d) => d.region);
  // Region options count the country-wide definitions too (rule 3), so the
  // number beside "Dubai" is what the holder will actually see.
  const regionBase = pass("region");
  const regionValues = [...new Set(regionalInCountry.map((d) => d.region as string))];
  const regions = regionValues.map((value) => ({
    value,
    count: regionBase.filter((d) => !d.region || d.region === value).length,
  }));
  const organisationBase = pass("organisation");
  const organisationNames = new Map(
    index.flatMap((d) => d.organisations.map((o) => [o.id, o.name] as const)),
  );

  return {
    results,
    total: inScope.length,
    countries: facet(national, (d) => (d.country ? [d.country] : [])),
    regions: state.scope === "national" && state.country ? regions : [],
    domains: facet(pass("domain"), (d) => (d.domain ? [d.domain] : [])),
    categories: facet(pass("category"), (d) => [d.credential_class]),
    organisations: facet(organisationBase, (d) => d.organisations.map((o) => o.id)).map((o) => ({
      ...o,
      name: organisationNames.get(o.value) ?? o.value,
    })),
    regionRelevant: state.scope === "national" && !!state.country && regionValues.length > 0,
    narrowed:
      !!state.region ||
      !!state.domain ||
      !!state.category ||
      !!state.organisation ||
      !!foldForSearch(state.search),
  };
}

/**
 * Apply one change and clear exactly the dependent selections it invalidated.
 *
 * Order of dependence: scope → country → region → (domain, category,
 * organisation). A selection that is still offered after the change is KEPT;
 * one that would now yield nothing is cleared, so the holder is never left
 * looking at an empty list caused by a filter they can no longer see the
 * reason for.
 */
export function changeFilter(
  index: readonly IndexedDefinition[],
  state: CatalogueFilterState,
  change: Partial<CatalogueFilterState>,
): CatalogueFilterState {
  let next: CatalogueFilterState = { ...state, ...change };
  if (change.scope !== undefined && change.scope !== state.scope)
    next = { ...next, country: "", region: "", domain: "", category: "", organisation: "" };
  if (next.scope === "international") next = { ...next, country: "", region: "" };
  if (change.country !== undefined && change.country !== state.country)
    next = { ...next, region: "" };

  // Region must belong to the country and to a definition the holder may see.
  if (next.region) {
    const offered = filterCatalogue(index, { ...next, region: "" }).regions;
    if (!offered.some((r) => r.value === next.region)) next = { ...next, region: "" };
  }
  // Each optional filter is judged ON ITS OWN against the new place: is this
  // value offered here at all? A still-valid credential type must not be lost
  // because a stale organisation was sitting beside it when it was tested.
  const alone = (key: "domain" | "category" | "organisation") => {
    const probe = { ...next, domain: "", category: "", organisation: "", search: "" };
    const answer = filterCatalogue(index, probe);
    const offered =
      key === "domain"
        ? answer.domains
        : key === "category"
          ? answer.categories
          : answer.organisations;
    return offered.some((o) => o.value === next[key] && o.count > 0);
  };
  for (const key of ["domain", "category", "organisation"] as const)
    if (next[key] && !alone(key)) next = { ...next, [key]: "" };
  // Valid one by one, but empty together: release the most specific first, so
  // the holder is never left with an empty list they cannot see the cause of.
  for (const key of ["organisation", "category", "domain"] as const) {
    if (filterCatalogue(index, { ...next, search: "" }).results.length > 0) break;
    if (next[key]) next = { ...next, [key]: "" };
  }
  return next;
}

/** "Clear filters": the optional filters and the search, never scope/country. */
export function clearOptionalFilters(state: CatalogueFilterState): CatalogueFilterState {
  return { ...state, region: "", domain: "", category: "", organisation: "", search: "" };
}
