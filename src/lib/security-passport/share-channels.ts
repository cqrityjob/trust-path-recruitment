// Security Passport — where a share link can be sent, in one place.
//
// The channel list used to live inside LiveShareActions, next to the buttons
// that rendered it. The share panel now presents the same channels in a
// different shape (a vertical list rather than a button row), and a second
// copy of `intentUrl` is exactly the kind of parallel share logic that drifts
// until two surfaces disagree about what WhatsApp receives.
//
// So the destinations are data, and the components are presentation.
//
// ── WHAT TRAVELS ───────────────────────────────────────────────────────
//
// The /p/<token> URL, and nothing else. No credential payload reaches a
// platform: platforms cache what they are given and a cached credential
// cannot be revoked, whereas the page behind the link is re-checked on
// every open.
//
// ── INSTAGRAM ──────────────────────────────────────────────────────────
//
// Instagram has no web publishing path, so it has no intent URL. It is still
// a listed channel because the holder's intent is real; the action behind it
// is the correctly sized Story image, which they post from the app. A button
// that pretended to publish would be the dishonest option.

import type { PassportCopyKey } from "./i18n";

export type ShareChannel =
  | "linkedin"
  | "facebook"
  | "x"
  | "email"
  | "instagram"
  | "whatsapp"
  | "copy_link"
  | "native";

export interface ShareChannelMeta {
  readonly id: ShareChannel;
  readonly labelKey: PassportCopyKey;
}

/** The feed list, in the order the product decision fixed: LinkedIn first,
 *  because a Security Passport is a professional artifact. */
export const FEED_CHANNELS: readonly ShareChannelMeta[] = [
  { id: "linkedin", labelKey: "share.channel.linkedin" },
  { id: "facebook", labelKey: "share.channel.facebook" },
  { id: "x", labelKey: "share.channel.x" },
  { id: "email", labelKey: "share.channel.email" },
  { id: "instagram", labelKey: "share.channel.instagram" },
  { id: "whatsapp", labelKey: "share.channel.whatsapp" },
  { id: "copy_link", labelKey: "share.channel.copyUrl" },
] as const;

/**
 * The web intent for a channel, or null where the platform has none.
 *
 * `null` is a real answer, not a gap: `copy_link` and `native` are handled by
 * the browser, and `instagram` is handled by downloading the Story image.
 */
export function shareIntentUrl(
  channel: ShareChannel,
  shareUrl: string,
  subject: string,
): string | null {
  const u = encodeURIComponent(shareUrl);
  const t = encodeURIComponent(subject);
  switch (channel) {
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case "whatsapp":
      return `https://wa.me/?text=${t}%20${u}`;
    case "email":
      return `mailto:?subject=${t}&body=${u}`;
    default:
      return null;
  }
}
