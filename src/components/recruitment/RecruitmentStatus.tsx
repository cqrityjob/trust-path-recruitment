// Status labels for the recruitment workspace.
//
// Every label is TEXT with an icon; colour is a third, redundant signal and
// never the only one. Stage, decision, recruitment phase, booking state and
// message delivery each have their own badge, because they are different
// facts: a candidate's stage is not their assessment, and a delivered message
// is not a delivered e-mail.

import {
  Ban,
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  CircleDot,
  Eye,
  FileEdit,
  Inbox,
  Lock,
  Mail,
  MailCheck,
  MailWarning,
  MessagesSquare,
  Radio,
  Undo2,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { messageDeliveryOf, type RecruitmentPhase } from "@/lib/recruitment/definitions";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONE: Record<Tone, string> = {
  neutral: "border-border bg-muted/40 text-foreground",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  accent: "border-accent/30 bg-accent/10 text-accent",
};

export function Pill({
  icon: Icon,
  tone,
  children,
  className,
}: {
  icon: LucideIcon;
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

const PHASE: Record<RecruitmentPhase, { icon: LucideIcon; tone: Tone; key: TranslationKey }> = {
  draft: { icon: FileEdit, tone: "neutral", key: "rec.phase.draft" },
  published: { icon: Radio, tone: "success", key: "rec.phase.published" },
  closed: { icon: Lock, tone: "warning", key: "rec.phase.closed" },
  completed: { icon: CheckCircle2, tone: "neutral", key: "rec.phase.completed" },
  cancelled: { icon: Ban, tone: "neutral", key: "rec.phase.cancelled" },
};

export function PhaseBadge({ phase }: { phase: RecruitmentPhase }) {
  const { t } = useT();
  const p = PHASE[phase];
  return (
    <Pill icon={p.icon} tone={p.tone}>
      {t(p.key)}
    </Pill>
  );
}

const STAGE: Record<string, { icon: LucideIcon; tone: Tone; key: TranslationKey }> = {
  submitted: { icon: Inbox, tone: "info", key: "rec.stage.new" },
  reviewing: { icon: Eye, tone: "neutral", key: "rec.stage.review" },
  interview: { icon: MessagesSquare, tone: "accent", key: "rec.stage.interview" },
  hired: { icon: UserCheck, tone: "success", key: "rec.decision.hired" },
  rejected: { icon: XCircle, tone: "neutral", key: "rec.decision.rejected" },
  withdrawn: { icon: Undo2, tone: "neutral", key: "rec.decision.withdrawn" },
};

/** One badge for the application's own lifecycle. Its three end states are
 *  worded as what happened (hired / not proceeding / withdrawn), so a
 *  decision never reads as a stage the person is "in". */
export function StageBadge({ status }: { status: string }) {
  const { t } = useT();
  const s = STAGE[status] ?? {
    icon: CircleDot,
    tone: "neutral" as Tone,
    key: "rec.stage.unknown" as TranslationKey,
  };
  return (
    <Pill icon={s.icon} tone={s.tone}>
      {t(s.key)}
    </Pill>
  );
}

const BOOKING: Record<string, { icon: LucideIcon; tone: Tone; key: TranslationKey }> = {
  planned: { icon: CalendarClock, tone: "neutral", key: "rec.booking.status.planned" },
  invited: { icon: Mail, tone: "info", key: "rec.booking.status.invited" },
  confirmed: { icon: CalendarCheck2, tone: "success", key: "rec.booking.status.confirmed" },
  declined: { icon: CalendarX2, tone: "warning", key: "rec.booking.status.declined" },
  cancelled: { icon: Ban, tone: "neutral", key: "rec.booking.status.cancelled" },
  completed: { icon: CheckCircle2, tone: "neutral", key: "rec.booking.status.completed" },
};

export function BookingBadge({ status }: { status: string }) {
  const { t } = useT();
  const b = BOOKING[status] ?? BOOKING.planned;
  return (
    <Pill icon={b.icon} tone={b.tone}>
      {t(b.key)}
    </Pill>
  );
}

/** What happened to a message, said in two parts: it is in the candidate's
 *  CQrityjob inbox, and separately what the e-mail provider answered. */
export function DeliveryBadge({ status, emailStatus }: { status: string; emailStatus: string }) {
  const { t } = useT();
  const d = messageDeliveryOf(status, emailStatus);
  switch (d) {
    case "draft":
      return (
        <Pill icon={FileEdit} tone="neutral">
          {t("rec.message.delivery.draft")}
        </Pill>
      );
    case "delivered_email_sent":
      return (
        <Pill icon={MailCheck} tone="success">
          {t("rec.message.delivery.emailSent")}
        </Pill>
      );
    case "delivered_email_sending":
      return (
        <Pill icon={Mail} tone="info">
          {t("rec.message.delivery.emailSending")}
        </Pill>
      );
    case "delivered_email_failed":
      return (
        <Pill icon={MailWarning} tone="warning">
          {t("rec.message.delivery.emailFailed")}
        </Pill>
      );
    case "delivered_email_not_configured":
      return (
        <Pill icon={MailWarning} tone="warning">
          {t("rec.message.delivery.emailNotConfigured")}
        </Pill>
      );
    case "delivered_in_app_only":
      return (
        <Pill icon={Inbox} tone="info">
          {t("rec.message.delivery.inApp")}
        </Pill>
      );
    default:
      return null;
  }
}
