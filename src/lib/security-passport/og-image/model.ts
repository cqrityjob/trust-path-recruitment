// Security Passport — what the server-drawn preview image says.
//
// ── ONE SOURCE, THE PUBLIC PAYLOAD ─────────────────────────────────────
//
// The image is built from `PublicSocialShareActive` and from nothing else: the
// bounded object `sp_get_social_share` returns for a share that is active NOW,
// reduced to the holder's current privacy setting and to the credentials they
// approved. No request body, uploaded picture or client-side model reaches this
// function, so the image cannot say more than the public page can. A revoked or
// expired share never gets this far (the read answers "unavailable").
//
// The credentials are read through the same presentation the page uses
// (`buildRecipientPresentation`), so a shield means here what it means there:
// "verified" only for a source confirmation, "documented" for a CQrityjob
// review, "self-declared" for the holder's own entry. Nothing is raised for the
// image, and anything the presentation does not call one of those three is
// drawn as the LOWEST of them rather than as something better.
//
// What is deliberately not here: issuer, verifier name, dates, certificate or
// licence numbers, document images, contact details, the holder's e-mail or
// internal id. The payload does not carry them; this model has no field for them.

import { formatJurisdiction } from "../format";
import { passportT } from "../i18n";
import { buildRecipientPresentation } from "../recipient-presentation";
import {
  FOUNDER_DESIGNATION,
  toRecipientPayload,
  type PublicSocialShareActive,
} from "../social-share-public";
import { isSocialPublishable } from "../social";
import { canDraw, drawable } from "./text";

export type ShieldState = "verified" | "documented" | "self_declared";

export interface ImageMerit {
  readonly title: string;
  readonly state: ShieldState;
  /** The word beside the shield, in the share's language. */
  readonly word: string;
}

export interface ImageModel {
  readonly lang: "sv" | "en";
  readonly passportNumber: number | null;
  /** Already reduced to the holder's privacy setting; null shows no name. */
  readonly name: string | null;
  readonly founder: string | null;
  readonly country: string | null;
  readonly merits: readonly ImageMerit[];
  /** Approved, current credentials that did not fit the rows. */
  readonly hidden: number;
  readonly total: number;
  readonly strings: {
    readonly brand: string;
    readonly label: string;
    readonly more: string;
    readonly none: string;
    readonly footer: string;
  };
}

/** Rows that fit the 1200×630 card without shrinking text below legibility. */
export const MAX_ROWS = 6;

const STRINGS = {
  sv: {
    brand: "CQrityjob",
    label: "Security Passport",
    none: "Inga aktuella meriter just nu",
    footer: "Bilden är en sammanfattning. Aktuell status visas bara via länken.",
    more: (n: number) => `+ ${n} fler ${n === 1 ? "merit" : "meriter"} på sidan`,
  },
  en: {
    brand: "CQrityjob",
    label: "Security Passport",
    none: "No current credentials right now",
    footer: "This image is a summary. Current status is shown only at the link.",
    more: (n: number) => `+ ${n} more ${n === 1 ? "credential" : "credentials"} on the page`,
  },
} as const;

const RANK: Readonly<Record<ShieldState, number>> = {
  verified: 0,
  documented: 1,
  self_declared: 2,
};

function shieldStateOf(presentation: string): ShieldState {
  if (presentation === "verified") return "verified";
  if (presentation === "documented") return "documented";
  return "self_declared";
}

/**
 * The image's content, or null when the name cannot be drawn faithfully (a
 * script the embedded faces do not cover). The caller then falls back to the
 * branded image rather than print a row of empty boxes under a person's name.
 */
export function buildImageModel(
  share: PublicSocialShareActive,
  evaluationOn: string,
): ImageModel | null {
  if (share.holder !== null && !canDraw("heading", share.holder)) return null;

  const presentation = buildRecipientPresentation(toRecipientPayload(share), evaluationOn);
  const lang = share.locale;

  const all = presentation.credentials
    .filter(isSocialPublishable)
    .map((c, index) => ({
      index,
      title: drawable("textBold", c.title),
      state: shieldStateOf(c.presentation),
      word: passportT(c.statusWordKey, lang),
    }))
    .filter((c) => c.title.length > 0)
    // Strongest evidence first; the database's own order within a level.
    .sort((a, b) => RANK[a.state] - RANK[b.state] || a.index - b.index);

  const merits = all.slice(0, MAX_ROWS).map(({ title, state, word }) => ({ title, state, word }));
  return {
    lang,
    passportNumber: share.passportNumber,
    name: share.holder,
    founder: share.designation === "founder" ? FOUNDER_DESIGNATION[lang] : null,
    country: share.jurisdiction ? formatJurisdiction(share.jurisdiction, lang) : null,
    merits,
    hidden: all.length - merits.length,
    total: all.length,
    strings: {
      brand: STRINGS[lang].brand,
      label: STRINGS[lang].label,
      none: STRINGS[lang].none,
      footer: STRINGS[lang].footer,
      more: STRINGS[lang].more(all.length - merits.length),
    },
  };
}
