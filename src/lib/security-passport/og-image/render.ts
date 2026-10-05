// Security Passport — the preview image for one public share, as PNG bytes.
//
// Pure: a public payload in, bytes (or null) out. The route does the reading
// and the HTTP; this is what the check pins.

import type { PublicSocialShareActive } from "../social-share-public";
import { drawImage } from "./draw";
import { buildImageModel } from "./model";

/** The PNG, or null when the faithful image cannot be drawn (a name in a
 *  script the embedded faces do not cover). */
export function renderShareImage(
  share: PublicSocialShareActive,
  evaluationOn: string,
): Uint8Array<ArrayBuffer> | null {
  const model = buildImageModel(share, evaluationOn);
  if (model === null) return null;
  return drawImage(model).toPng();
}
