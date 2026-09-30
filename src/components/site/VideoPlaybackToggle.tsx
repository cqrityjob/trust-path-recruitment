// The pause/play control every looping film on the site carries (WCAG 2.2.2:
// moving content that lasts more than five seconds must be stoppable). One
// component, so the hero's and the platform page's controls look and behave
// the same.

import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_ON_DARK } from "./dark-surface";

export function VideoPlaybackToggle({
  playing,
  onToggle,
  pauseLabel,
  playLabel,
  className,
}: {
  playing: boolean;
  onToggle: () => void;
  pauseLabel: string;
  playLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? pauseLabel : playLabel}
      className={cn(
        "absolute bottom-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-night/40 text-white backdrop-blur-sm transition-colors hover:bg-night/60 md:bottom-6 md:right-6",
        FOCUS_ON_DARK,
        className,
      )}
    >
      {playing ? (
        <Pause className="h-4 w-4" fill="currentColor" aria-hidden="true" />
      ) : (
        <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
      )}
    </button>
  );
}
