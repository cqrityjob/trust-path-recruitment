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
// A share link, or nothing but a sentence. No credential payload reaches a
// platform through an intent: platforms cache what they are given and a
// cached credential cannot be revoked, whereas the page behind a link is
// re-checked on every open. A post made from the social image carries NO link
// unless the holder added one for it; the image travels as an attachment the
// holder adds themselves, and nothing here publishes anything.
//
// ── INSTAGRAM ──────────────────────────────────────────────────────────
//
// Instagram has no web publishing path, so it has no intent URL. It is still
// a listed channel because the holder's intent is real; the action behind it
// is the correctly sized Story image, which they post from the app. A button
// that pretended to publish would be the dishonest option.
//
// ── WHERE THE IMAGE GOES, AND WHAT THE HOLDER IS TOLD ──────────────────
//
// No web address carries a file. LinkedIn's share-offsite takes a url,
// Facebook's sharer a url, X's intent text and a url, WhatsApp's click-to-chat
// text, a mailto: a subject and a body -- and Instagram has no web intent at
// all. So a platform button never claims the image went with it: it hands the
// holder the exact image as a download, opens the platform where there is a
// page to post from, and says to add the image to the post.
//
// The one path that attaches the image is the device's own share sheet (the
// Web Share API with files), where the PNG itself is handed to the app the
// holder picks. Only that path says the image is attached.

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
 *
 * `shareUrl` is null for a post that carries no link. A platform whose only
 * web intent is a link (LinkedIn, Facebook) is then opened on its own page,
 * where the holder attaches the image; one that takes text (X, WhatsApp,
 * e-mail) is given the text alone. Every destination opens a composer or a
 * page for the holder: nothing is posted.
 */
export function shareIntentUrl(
  channel: ShareChannel,
  shareUrl: string | null,
  subject: string,
  text: string = subject,
): string | null {
  const t = encodeURIComponent(text);
  const subj = encodeURIComponent(subject);
  if (shareUrl === null) {
    switch (channel) {
      case "linkedin":
        return "https://www.linkedin.com/feed/";
      case "facebook":
        return "https://www.facebook.com/";
      case "x":
        return `https://twitter.com/intent/tweet?text=${t}`;
      case "whatsapp":
        return `https://wa.me/?text=${t}`;
      case "email":
        return `mailto:?subject=${subj}&body=${t}`;
      default:
        return null;
    }
  }
  const u = encodeURIComponent(shareUrl);
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
      return `mailto:?subject=${subj}&body=${t}%0A%0A${u}`;
    default:
      return null;
  }
}

/** How the image reaches a post. Only the device share attaches it. */
export type ImageDelivery = "attached" | "added_by_holder";

/** What pressing a platform does: the exact image as a download, then the
 *  platform's page, then what the holder is told. */
export interface PlatformPlan {
  readonly channel: Exclude<ShareChannel, "copy_link" | "native">;
  /** Always the holder's to add: no web intent carries an image. */
  readonly delivery: "added_by_holder";
  /** The format the image is prepared in first, or null for the one on
   *  screen. Instagram posts the Story image. */
  readonly format: "story" | null;
  /** The page to open afterwards, or null where the web has none to post
   *  from (Instagram). */
  readonly url: string | null;
  /** Said once the image is ready: "add the image to your post". */
  readonly noticeKey: PassportCopyKey;
}

export function platformPlan(
  channel: PlatformPlan["channel"],
  shareUrl: string | null,
  postText: string,
): PlatformPlan {
  if (channel === "instagram") {
    return {
      channel,
      delivery: "added_by_holder",
      format: "story",
      url: null,
      noticeKey: "social.ready.instagram",
    };
  }
  return {
    channel,
    delivery: "added_by_holder",
    format: null,
    url: shareIntentUrl(channel, shareUrl, postText, postText),
    noticeKey: channel === "email" ? "social.ready.email" : "social.ready.post",
  };
}

/**
 * What the device's share sheet is given: ONE PNG file -- the holder's whole
 * Passport, the image the preview shows -- and the post's sentence. Never a
 * set of files: one holder, one Passport, one image. A link travels only when
 * the holder chose one for this image.
 */
export function deviceShareData(file: File, postText: string, shareUrl: string | null): ShareData {
  return {
    files: [file],
    title: postText,
    text: postText,
    ...(shareUrl ? { url: shareUrl } : {}),
  };
}
