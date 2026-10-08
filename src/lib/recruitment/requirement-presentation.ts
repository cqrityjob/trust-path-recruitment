export const requirementLabels = {
  sv: {
    green: "Skallkrav uppfyllda",
    yellow: "Skallkrav inte uppfyllda",
    gray: "Behöver klarläggas",
    not_established: "Skallkrav inte fastställda",
  },
  en: {
    green: "Mandatory requirements met",
    yellow: "Mandatory requirements not met",
    gray: "Clarification needed",
    not_established: "Mandatory requirements not established",
  },
} as const;
export const reviewLabels = {
  sv: {
    remaining: "Återstående granskning",
    reviewed: "Mänskligt granskad",
    pending: "Inte färdiggranskad",
    stale: "Granskning behöver uppdateras",
  },
  en: {
    remaining: "Review remaining",
    reviewed: "Human reviewed",
    pending: "Not yet reviewed",
    stale: "Review needs updating",
  },
} as const;
export const sourceLabels = {
  sv: {
    application_answer: "Kandidatens ansökningssvar",
    application_cv: "Inskickat CV / dokument",
    interview_source: "Uttryckligen valt intervjuunderlag",
    external_reference: "Extern kontroll / referens",
  },
  en: {
    application_answer: "Candidate's application answer",
    application_cv: "Submitted CV / document",
    interview_source: "Explicitly selected interview source",
    external_reference: "External check / reference",
  },
} as const;

export const controlClass = "mt-1 w-full rounded border border-border bg-background p-2 text-sm";
