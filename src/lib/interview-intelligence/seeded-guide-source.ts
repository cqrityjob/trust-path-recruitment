// The one case source that is a COPY of content shown elsewhere on the page.
//
// When an interview case is created, the guide's competencies (C1–C6) are
// seeded into it as an `employer_requirements` source labelled "Rollens krav
// (ur intervjuguiden)" -- by `seedCaseSources` for a standalone case and by
// `scp_iv_start_interview` for the application, test and BESKT starts. It is a
// real, citable source and it stays: the preparation screen only has to know
// which source it is, so the same six definitions are not printed twice.
//
// Pure, and deliberately narrow: kind, label and origin all have to match the
// seeding, so an employer's OWN requirements text under a similar name is
// never folded away.

export const SEEDED_GUIDE_SOURCE_LABEL = "Rollens krav (ur intervjuguiden)";

export function isSeededGuideRequirementsSource(source: {
  kind: string;
  label: string;
  origin?: string | null;
}): boolean {
  return (
    source.kind === "employer_requirements" &&
    source.label === SEEDED_GUIDE_SOURCE_LABEL &&
    (source.origin ?? "employer_supplied") === "employer_supplied"
  );
}
