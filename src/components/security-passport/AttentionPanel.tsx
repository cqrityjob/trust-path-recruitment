// Security Passport — the "needs your attention" panel.
//
// ── WHY IT IS FOUR LISTS AND NOT ONE BADGE ─────────────────────────────
//
// "3 items need attention" makes the holder open three things to find out
// which. Each bucket here says what KIND of thing it is and who is blocked,
// so a holder can tell at a glance whether they have work to do or are simply
// waiting on somebody else. Waiting is the common case and it deserves to
// look calm, not urgent.
//
// The order is deliberate: what the holder must act on comes first, then what
// has quietly stopped being valid, then what is about to, then what somebody
// else is handling. Nothing here is a count of failures.
//
// ── NO COLOUR-ONLY SIGNAL ──────────────────────────────────────────────
//
// Each bucket carries a heading in words and its own explanatory line. The
// only visual difference is a left rule, and it is redundant with the words.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { AttentionItem, AttentionSummary } from "@/lib/security-passport/attention";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

function Bucket({
  titleKey,
  hintKey,
  items,
  rule,
  onOpen,
  showDays,
}: {
  titleKey: PassportCopyKey;
  hintKey: PassportCopyKey;
  items: readonly AttentionItem[];
  rule: string;
  onOpen?: (kind: "claim" | "experience", id: string) => void;
  showDays?: boolean;
}) {
  const { pt } = usePassportCopy();
  if (items.length === 0) return null;

  return (
    <div className={`border-l-2 pl-4 ${rule}`}>
      <h3 className="text-sm font-semibold text-foreground">{pt(titleKey)}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{pt(hintKey)}</p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="text-sm">
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(item.kind, item.id)}
                className="inline-flex min-h-11 items-center text-left text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {item.title}
                {showDays && item.daysLeft !== undefined ? (
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {item.daysLeft} {pt("att.daysLeft")}
                  </span>
                ) : null}
              </button>
            ) : (
              <span className="inline-flex min-h-11 items-center text-foreground">
                {item.title}
                {showDays && item.daysLeft !== undefined ? (
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {item.daysLeft} {pt("att.daysLeft")}
                  </span>
                ) : null}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AttentionPanel({
  summary,
  onOpenEntry,
  className,
}: {
  summary: AttentionSummary;
  onOpenEntry?: (kind: "claim" | "experience", id: string) => void;
  className?: string;
}) {
  const { pt } = usePassportCopy();

  return (
    <section className={`rounded-xl border border-border bg-card p-5 ${className ?? ""}`}>
      <h2 className="text-base font-semibold tracking-tight text-foreground">{pt("att.title")}</h2>

      {summary.clear ? (
        // Said plainly rather than by showing an empty box. "Nothing waiting"
        // is a good state and reads better as a sentence than as absence.
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt("att.clear")}</p>
      ) : (
        <div className="mt-4 space-y-4">
          <Bucket
            titleKey="att.needsHolder"
            hintKey="att.needsHolderHint"
            items={summary.needsHolder}
            rule="border-amber-500/60"
            onOpen={onOpenEntry}
          />
          <Bucket
            titleKey="att.expired"
            hintKey="att.expiredHint"
            items={summary.expired}
            rule="border-amber-500/60"
            onOpen={onOpenEntry}
          />
          <Bucket
            titleKey="att.expiring"
            hintKey="att.expiringHint"
            items={summary.expiring}
            rule="border-border"
            onOpen={onOpenEntry}
            showDays
          />
          <Bucket
            titleKey="att.waiting"
            hintKey="att.waitingHint"
            items={summary.waiting}
            rule="border-border"
            onOpen={onOpenEntry}
          />
        </div>
      )}
    </section>
  );
}
