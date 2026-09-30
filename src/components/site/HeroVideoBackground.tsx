// The homepage hero's background film.
//
// Decorative only: the <video> is out of the accessibility tree and carries no
// copy. It loops silently, starts only when the visitor has NOT asked for
// reduced motion, and always offers a visible pause/play control (WCAG 2.2.2:
// moving content that lasts more than five seconds must be stoppable).
//
// Rendering is SSR-safe: the server renders a paused video with its poster;
// the effect decides on the client whether to start it. `muted` is set on the
// element itself because React does not reliably reflect the attribute, and
// mobile browsers refuse to autoplay a video that is not muted.
//
// Files live in public/videos (8.5 s seamless loop, no audio track):
//   hero-1920.webm / hero-1920.mp4   ≥ 768 px
//   hero-1080.mp4                    smaller screens, and the fallback
//   hero-poster.jpg                  first frame, shown before playback and
//                                    to reduced-motion visitors

import { useEffect, useRef, useState } from "react";
import { VideoPlaybackToggle } from "@/components/site/VideoPlaybackToggle";
import { useT } from "@/i18n/context";

export function HeroVideoBackground() {
  const { t } = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    video
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, []);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      video.muted = true;
      video
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <video
          ref={ref}
          className="h-full w-full object-cover object-[50%_40%]"
          poster="/videos/hero-poster.jpg"
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
        >
          <source src="/videos/hero-1920.webm" type="video/webm" media="(min-width: 768px)" />
          <source src="/videos/hero-1920.mp4" type="video/mp4" media="(min-width: 768px)" />
          <source src="/videos/hero-1080.mp4" type="video/mp4" />
        </video>
        {/* Legibility: one even dim, then a deeper fall-off where the copy
            and the two entrances sit. */}
        <div className="absolute inset-0 bg-night/40" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-night/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-night/90 via-night/50 to-transparent" />
      </div>
      <VideoPlaybackToggle
        playing={playing}
        onToggle={toggle}
        pauseLabel={t("home.hero.video.pause")}
        playLabel={t("home.hero.video.play")}
      />
    </>
  );
}
