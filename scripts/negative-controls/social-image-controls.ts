import { runControls, type Mutation } from "./runner";

const guard = "passport-social-image:check";
const DRAWING = "src/components/security-passport/social/SocialCardSvg.tsx";
const MODEL = "src/lib/security-passport/social.ts";
const mutations: readonly Mutation[] = [
  {
    id: "SOCIAL-QR-WITHOUT-LINK",
    defect: "the image draws the QR code it was handed even when the holder chose no link",
    file: DRAWING,
    find: "const qr = link ? p.qrDataUrl : null;",
    replace: "const qr = p.qrDataUrl;",
    guard,
    expect: "no link and no QR code when the model carries none",
  },
  {
    id: "SOCIAL-RAISED-TO-VERIFIED",
    defect: "every shield on the image is drawn as verified, whatever the credential's standing",
    file: DRAWING,
    find: "<ShieldMark state={c.state} size={r(shield)} />",
    replace: '<ShieldMark state="verified" size={r(shield)} />',
    guard,
    expect: "each shield wears its own state",
  },
  {
    id: "SOCIAL-HISTORY-PUBLISHED",
    defect: "an expired credential is drawn on the image that cannot be recalled",
    file: MODEL,
    find: 'return credential.lifecycle === "active";',
    replace: "return credential.lifecycle.length > 0;",
    guard,
    expect: "a credential that is no longer current is never drawn",
  },
  {
    id: "SOCIAL-NO-SNAPSHOT-LINE",
    defect: "an image without a link no longer says it is a snapshot",
    file: "src/lib/security-passport/share-image.ts",
    find: 'snapshotNote: pt("social.snapshotNote"),',
    replace: 'snapshotNote: "",',
    guard,
    expect: "an image without a link says it is a snapshot",
  },
  {
    id: "SOCIAL-NO-LIMIT",
    defect: "the image names every selected credential, turning a summary into a dossier",
    file: MODEL,
    find: "    .filter(isSocialPublishable)\n    .slice(0, MAX_SOCIAL_CREDENTIALS)\n",
    replace: "    .filter(isSocialPublishable)\n",
    guard,
    expect: "the image draws at most three credentials",
  },
  {
    id: "SOCIAL-WORD-OVERFLOW",
    defect: "a long trust word runs into the next column instead of the card being drawn smaller",
    file: DRAWING,
    find: "      if (word.length * (17 * u * 0.72 + 2.4 * u) > slotW - 16 * u) columnsFit = false;\n",
    replace: "",
    guard,
    expect: "every trust word stays inside its own column",
  },
  {
    id: "SOCIAL-PLACE-OVERFLOW",
    defect: "a long place name runs into the next column instead of the card being drawn smaller",
    file: DRAWING,
    find: "        if (markW + 8 * u + labelW > slotW - 16 * u) columnsFit = false;\n",
    replace: "",
    guard,
    expect: "every place stays inside its own column",
  },
];

runControls("social-image", mutations);
