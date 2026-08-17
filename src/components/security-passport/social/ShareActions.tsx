// Share actions — PROTOTYPE CONTROLS ONLY.
//
// None of these buttons contacts a network, opens a share intent, writes to
// the clipboard, downloads a file or publishes anything. They record which
// channel a reviewer pressed and show it back, so the owner can evaluate
// the shape of the flow without the prototype being able to publish a
// fictional person's credential anywhere.
//
// ── INSTAGRAM IS DELIBERATELY NOT A POST BUTTON ────────────────────────
//
// Instagram offers no web publishing path for this. A button labelled
// "Share to Instagram" would promise something that cannot happen, so the
// Story download carries that case and the note says why. Designing the
// honest version now is cheaper than removing the dishonest one after
// someone builds against it.
//
// ── WHY THE EXCLUSION LIST IS ON SCREEN ────────────────────────────────
//
// The holder is about to publish something about themselves to an audience
// they cannot fully predict. Telling them plainly what the image can never
// contain is the difference between informed sharing and hoping.

import { useState } from "react";
import {
  Copy,
  Download,
  Facebook,
  Linkedin,
  Mail,
  MessageCircle,
  Share2,
  X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { SHARE_CHANNELS, type ShareChannel } from "@/lib/security-passport/social";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

const ICON: Record<ShareChannel, typeof Linkedin> = {
  linkedin: Linkedin,
  facebook: Facebook,
  x: XIcon,
  whatsapp: MessageCircle,
  email: Mail,
  copy_link: Copy,
  native: Share2,
  download_square: Download,
  download_story: Download,
};

export function ShareActions({ className }: { className?: string }) {
  const { pt } = usePassportCopy();
  const [pressed, setPressed] = useState<ShareChannel | null>(null);

  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <h3
        className="text-base font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {pt("share.channels")}
      </h3>

      <div className="mt-3 flex flex-wrap gap-2">
        {SHARE_CHANNELS.map((ch) => {
          const Icon = ICON[ch];
          const isPressed = pressed === ch;
          return (
            <button
              key={ch}
              type="button"
              aria-pressed={isPressed}
              onClick={() => setPressed(ch)}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isPressed
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-input text-foreground hover:bg-accent/5",
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {pt(`share.channel.${ch}` as PassportCopyKey)}
            </button>
          );
        })}
      </div>

      <p role="status" className="mt-3 min-h-5 text-xs text-muted-foreground">
        {pressed
          ? `${pt(`share.channel.${pressed}` as PassportCopyKey)} — ${pt("share.prototypeOnly")}`
          : pt("share.prototypeOnly")}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {pt("share.instagramNote")}
      </p>
    </section>
  );
}

const EXCLUDED_KEYS: readonly PassportCopyKey[] = [
  "share.excluded.numbers",
  "share.excluded.documents",
  "share.excluded.employers",
  "share.excluded.dates",
  "share.excluded.contact",
];

/** The social-safe contract, shown to the holder in their own language. */
export function SocialSafetyNote({ className }: { className?: string }) {
  const { pt } = usePassportCopy();
  return (
    <section className={cn("rounded-xl border border-border bg-secondary/40 p-5", className)}>
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {pt("share.excluded")}
      </h3>
      <ul className="mt-3 space-y-1.5">
        {EXCLUDED_KEYS.map((k) => (
          <li key={k} className="flex items-start gap-2 text-sm text-foreground">
            <span
              aria-hidden="true"
              className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground"
            />
            {pt(k)}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{pt("share.lead")}</p>
    </section>
  );
}
