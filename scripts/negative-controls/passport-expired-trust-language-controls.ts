/**
 * Negative controls for what may be said about a non-current entry.
 *
 * Each mutation lets a record inherit a past it does not have: a self-declared
 * entry described as having been verified, a document review upgraded to
 * "previously verified", or a caller allowed to skip the stored standing.
 *
 * Run: bun run negative-controls:passport-expired-trust-language
 */
import { runControls, type Mutation } from "./runner";

const RULES = "src/lib/security-passport/trust-presentation.ts";
const CHIP = "src/components/security-passport/LifecycleChip.tsx";
const COPY = "src/lib/security-passport/i18n.ts";
const GUARD = "passport-expired-trust-language:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "PETL-NC-SELF-DECLARED-INHERITS-A-REVIEW",
    defect:
      "an expired self-declared entry is given the documented sentence, so a record nobody looked at reads as one CQrityjob reviewed",
    file: RULES,
    find: '    case "self_declared":\n      return "lifecycle.expiredNote.self_declared";',
    replace: '    case "self_declared":\n      return "lifecycle.expiredNote.documented";',
    guard: GUARD,
    expect: "self-declared + expired",
  },
  {
    id: "PETL-NC-SELF-DECLARED-COPY-CLAIMS-VERIFICATION",
    defect:
      "the self-declared sentence goes back to 'was verified but its validity period has ended' — the original overclaim, in English",
    file: COPY,
    find: `    "The validity period has ended. This entry is the holder's own statement and was not checked by anyone else.",`,
    replace: '    "This entry was verified but its validity period has ended.",',
    guard: GUARD,
    expect: "self-declared + expired",
  },
  {
    id: "PETL-NC-SELF-DECLARED-COPY-CLAIMS-VERIFICATION-SV",
    defect: "the same overclaim, in Swedish: 'Uppgiften var verifierad men…'",
    file: COPY,
    find: '    "Giltighetstiden har gått ut. Uppgiften är innehavarens egen och har inte kontrollerats av någon annan.",',
    replace: '    "Uppgiften var verifierad men giltighetstiden har gått ut.",',
    guard: GUARD,
    expect: "sv · self-declared + expired",
  },
  {
    id: "PETL-NC-FILE-ATTACHED-READS-AS-REVIEWED",
    defect:
      "an attached but unreviewed document takes the documented sentence — 'evidence exists' becomes 'evidence was checked'",
    file: RULES,
    find: '    case "document_provided":\n      return "lifecycle.expiredNote.document_provided";',
    replace: '    case "document_provided":\n      return "lifecycle.expiredNote.documented";',
    guard: GUARD,
    expect: "document provided + expired",
  },
  {
    id: "PETL-NC-DOCUMENT-REVIEW-BECOMES-SOURCE-CONFIRMED",
    defect:
      "an expired CQrityjob document review is described as source-confirmed, which no issuer ever did",
    file: RULES,
    find: '    case "documented":\n      return "lifecycle.expiredNote.documented";',
    replace: '    case "documented":\n      return "lifecycle.expiredNote.source_confirmed";',
    guard: GUARD,
    expect: "documented + expired",
  },
  {
    id: "PETL-NC-PREVIOUSLY-VERIFIED-FOR-EVERYONE",
    defect:
      "every non-current entry wears PREVIOUSLY VERIFIED again, a self-declared one included — the credential verification page's original defect",
    file: RULES,
    find: '    case "self_declared":\n      return "assertion.self_declared";',
    replace: '    case "self_declared":\n      return "assertion.verified.historical";',
    guard: GUARD,
    expect: "keep their own level word",
  },
  {
    id: "PETL-NC-DOCUMENT-REVIEW-PREVIOUSLY-VERIFIED",
    defect:
      "an expired document review reads PREVIOUSLY VERIFIED on the shared card, restating a verification that never was one",
    file: RULES,
    find: '    case "documented":\n      return "trust.level.documented";\n    case "document_provided":\n      return "assertion.document_provided";',
    replace:
      '    case "documented":\n      return "assertion.verified.historical";\n    case "document_provided":\n      return "assertion.document_provided";',
    guard: GUARD,
    expect: "keep their own level word",
  },
  {
    id: "PETL-NC-STANDING-BECOMES-OPTIONAL",
    defect:
      "LifecycleNote's entry becomes optional, so a new caller can omit the stored standing and silently take whatever the default says",
    file: CHIP,
    find: "  entry: ProvenanceBearing;\n}) {",
    replace: "  entry?: ProvenanceBearing;\n}) {",
    guard: GUARD,
    expect: "REQUIRES the entry",
  },
];

runControls("passport-expired-trust-language", MUTATIONS);
