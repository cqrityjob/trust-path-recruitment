import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { ProfessionInfoDestination } from "@/lib/career-center";

// "Läs om {yrke}" — the one action that opens information about exactly one
// profession, on every Career Center surface.
//
// Where it goes is decided by `professionInfoDestination` (profession-links),
// not here: the published guide, else the reviewed catalogue page for the
// same CIG profession. This component only renders the destination it is
// given, so the recommendation card, the current-role section and My Career
// cannot drift apart on where one profession is described.
//
// `none` is the only case without a link, and it says so in words rather
// than rendering a control that goes nowhere.

const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold tracking-tight text-primary-foreground shadow-sm transition-colors hover:bg-[color:var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:text-[color:var(--accent-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function ProfessionInfoAction({
  info,
  title,
  variant = "link",
  onOpen,
  className,
}: {
  info: ProfessionInfoDestination;
  /** The profession's name in the reader's language — part of the label. */
  title: string;
  variant?: "button" | "link";
  /** Fired alongside navigation, with the destination href. */
  onOpen?: (href: string) => void;
  className?: string;
}) {
  const { t } = useT();
  const label = t("cc.info.read").replace("{role}", title);
  const cls = cn(variant === "button" ? BUTTON : LINK, className);

  if (info.kind === "career_center") {
    return (
      <Link
        to="/career-center/$profession"
        params={{ profession: info.slug }}
        onClick={() => onOpen?.(info.href)}
        data-profession-info={info.slug}
        data-info-kind="career_center"
        className={cls}
      >
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    );
  }
  if (info.kind === "catalogue_profile") {
    return (
      <Link
        to="/career-center/yrke/$cigSlug"
        params={{ cigSlug: info.cigSlug }}
        onClick={() => onOpen?.(info.href)}
        data-profession-info={info.cigSlug}
        data-info-kind="catalogue_profile"
        className={cls}
      >
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    );
  }
  return (
    <p data-info-kind="none" className="text-sm leading-relaxed text-muted-foreground">
      {t("cc.info.none")}
    </p>
  );
}
