// The platform explorer on /plattformen: the chip video with the chosen
// product's name printed on the chip, and the list of products beside it.
//
// ── HOW THE NAME STAYS ON THE CHIP ─────────────────────────────────────
//
// The camera drifts over the chip for the whole clip, so a label pinned to
// one spot would slide off it. platform-chip-track.ts holds where the chip's
// top face is in every quarter second of the footage; each animation frame
// reads the video's own clock, interpolates the face's four corners and maps
// a flat label onto them with a perspective transform (matrix3d). The label
// is ordinary text, so it switches language and product without a new video.
//
// ── ACCESSIBILITY ──────────────────────────────────────────────────────
//
// The video and the name on the chip are decoration (aria-hidden): the same
// name is the list's own button text, which is what a screen reader reads.
// Each product is a disclosure button; the open one shows its description
// and ONE link to that product's own page. With reduced motion the video
// never plays and the label sits on the first frame; otherwise the shared
// pause/play control stops it (WCAG 2.2.2).
//
// ── ONE LOOK WITH THE HOMEPAGE HERO ────────────────────────────────────
//
// The surface, the glass, the white weights and the focus ring all come from
// dark-surface.ts, and the chip film is graded to the hero film's cool blue
// (desaturated, hue pulled from violet towards the brand's trust blue), so
// the two pages read as one site.

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { FOCUS_ON_DARK, GLASS, GLASS_HOVER, ON_DARK } from "./dark-surface";
import { CHIP_TRACK, CHIP_TRACK_FPS } from "./platform-chip-track";
import { VideoPlaybackToggle } from "./VideoPlaybackToggle";

type Product = {
  readonly key: string;
  readonly group: "individual" | "employer";
  readonly title: TranslationKey;
  readonly body: TranslationKey;
  readonly to:
    | "/career-center"
    | "/jobs"
    | "/security-passport"
    | "/sakerhetsarbete"
    | "/employers";
  readonly hash?: "bedomning" | "intervju" | "rekrytering" | "interim";
};

/** Every product, with the copy the header and the homepage already use, so
 *  this page cannot describe a product differently from the rest of the site. */
const PRODUCTS: readonly Product[] = [
  {
    key: "career",
    group: "individual",
    title: "home.individual.career.title",
    body: "home.individual.career.body",
    to: "/career-center",
  },
  {
    key: "jobs",
    group: "individual",
    title: "home.individual.jobs.title",
    body: "home.individual.jobs.body",
    to: "/jobs",
  },
  {
    key: "passport",
    group: "individual",
    title: "home.individual.passport.title",
    body: "home.individual.passport.body",
    to: "/security-passport",
  },
  {
    key: "work",
    group: "individual",
    title: "home.individual.work.title",
    body: "home.individual.work.body",
    to: "/sakerhetsarbete",
  },
  {
    key: "employer-platform",
    group: "employer",
    title: "nav.forEmployers.platform",
    body: "nav.forEmployers.platform.body",
    to: "/employers",
  },
  {
    key: "assessment",
    group: "employer",
    title: "nav.forEmployers.assessment",
    body: "nav.forEmployers.assessment.body",
    to: "/employers",
    hash: "bedomning",
  },
  {
    key: "interview",
    group: "employer",
    title: "nav.forEmployers.interview",
    body: "nav.forEmployers.interview.body",
    to: "/employers",
    hash: "intervju",
  },
  {
    key: "recruitment",
    group: "employer",
    title: "nav.forEmployers.recruitment",
    body: "nav.forEmployers.recruitment.body",
    to: "/employers",
    hash: "rekrytering",
  },
  {
    key: "interim",
    group: "employer",
    title: "nav.forEmployers.interim",
    body: "nav.forEmployers.interim.body",
    to: "/employers",
    hash: "interim",
  },
];

const GROUPS = [
  { key: "individual", label: "platform.group.individual" },
  { key: "employer", label: "platform.group.employer" },
] as const satisfies readonly { key: Product["group"]; label: TranslationKey }[];

const VIDEO_W = 1920;
const VIDEO_H = 1080;
/** The flat label before it is mapped onto the chip face. Square, like the
 *  chip; its padding keeps the name clear of the face's rounded edge. */
const LABEL_PX = 400;
/** The label's inset on each side, as a share of LABEL_PX. */
const LABEL_PAD = 0.08;

/** The chip face's corners at video time `t`, as fractions of the frame. */
function faceAt(t: number): number[] {
  const n = CHIP_TRACK.length;
  const pos = Math.max(0, t * CHIP_TRACK_FPS);
  const i = Math.min(Math.floor(pos), n - 1);
  const j = Math.min(i + 1, n - 1);
  const k = pos - Math.floor(pos);
  return CHIP_TRACK[i].map((v, c) => v + (CHIP_TRACK[j][c] - v) * k);
}

/** The CSS matrix3d that maps a LABEL_PX square onto four points (TL, TR,
 *  BR, BL), in pixels — Heckbert's square-to-quad projective mapping. */
function squareToQuad(p: readonly number[]): string {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den === 0 ? 0 : (dx3 * dy2 - dx2 * dy3) / den;
  const h = den === 0 ? 0 : (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const s = LABEL_PX;
  return `matrix3d(${[a / s, d / s, 0, g / s, b / s, e / s, 0, h / s, 0, 0, 1, 0, x0, y0, 0, 1].join(",")})`;
}

/** The name's size on the chip: as large as the face allows, but never so
 *  large that its longest word ("Säkerhetsarbete", "Arbetsgivarplattform")
 *  runs off the edge — words are not broken on a chip. */
function chipFontSize(name: string): number {
  const longest = Math.max(...name.split(/\s+/).map((w) => w.length));
  const inner = LABEL_PX * (1 - 2 * LABEL_PAD);
  return Math.min(68, Math.floor(inner / (0.66 * longest)));
}

export function PlatformLayers() {
  const { t } = useT();
  const [active, setActive] = useState(PRODUCTS[0].key);
  const [playing, setPlaying] = useState(false);
  const current = PRODUCTS.find((p) => p.key === active) ?? PRODUCTS[0];

  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  // Keep the label on the chip: one transform per animation frame, written
  // straight to the element so React does not re-render sixty times a second.
  useEffect(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    const label = labelRef.current;
    if (!stage || !video || !label) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    video.muted = true;
    const syncPlayback = () => {
      if (reduce.matches) {
        video.pause();
        video.currentTime = 0;
        setPlaying(false);
      } else {
        video
          .play()
          .then(() => setPlaying(true))
          // Autoplay refused: the poster and the label stay on frame one.
          .catch(() => setPlaying(false));
      }
    };
    syncPlayback();
    reduce.addEventListener("change", syncPlayback);

    let raf = 0;
    const place = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      // The video is object-cover: the same scale and the same
      // object-position here (centred on phones, left-aligned on wide
      // screens so the chip clears the list).
      const scale = Math.max(w / VIDEO_W, h / VIDEO_H);
      const vw = VIDEO_W * scale;
      const vh = VIDEO_H * scale;
      const [posX, posY] = getComputedStyle(video)
        .objectPosition.split(" ")
        .map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : 0.5));
      const ox = (w - vw) * posX;
      const oy = (h - vh) * posY;
      const face = faceAt(video.currentTime || 0);
      const px = face.map((v, c) => (c % 2 === 0 ? ox + v * vw : oy + v * vh));
      label.style.transform = squareToQuad(px);
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);

    return () => {
      cancelAnimationFrame(raf);
      reduce.removeEventListener("change", syncPlayback);
    };
  }, []);

  const toggle = () => {
    const video = videoRef.current;
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
    <div className="relative">
      <div className="relative">
        <div
          ref={stageRef}
          aria-hidden="true"
          className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-night shadow-[var(--shadow-md)] sm:aspect-video lg:aspect-auto lg:h-[760px]"
        >
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover object-[50%_50%] lg:object-[0%_50%]"
            src="/media/platform-chip.mp4"
            poster="/media/platform-chip-poster.jpg"
            muted
            loop
            playsInline
            preload="auto"
            tabIndex={-1}
          />
          <div
            ref={labelRef}
            className="pointer-events-none absolute left-0 top-0 flex origin-top-left flex-col items-center justify-center p-[8%] text-center will-change-transform"
            style={{ width: LABEL_PX, height: LABEL_PX }}
          >
            <span
              key={`brand-${current.key}`}
              className="text-[24px] font-semibold uppercase tracking-[0.32em] text-primary/70 animate-in fade-in duration-500 motion-reduce:animate-none"
            >
              CQrityjob
            </span>
            <span
              key={current.key}
              className="mt-3 text-balance font-semibold leading-[1.05] tracking-tight text-primary animate-in fade-in zoom-in-95 duration-500 motion-reduce:animate-none"
              style={{
                fontSize: chipFontSize(t(current.title)),
                fontFamily: "var(--font-display)",
                textShadow: "0 1px 0 rgb(255 255 255 / 0.28), 0 -1px 0 rgb(0 0 0 / 0.25)",
              }}
            >
              {t(current.title)}
            </span>
          </div>
          {/* Legibility wash behind the list on wide screens, where it overlays
            the footage. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[28rem] bg-gradient-to-r from-night/80 via-night/40 to-transparent lg:block" />
        </div>
        <VideoPlaybackToggle
          playing={playing}
          onToggle={toggle}
          pauseLabel={t("platform.video.pause")}
          playLabel={t("platform.video.play")}
        />
      </div>

      <div className="mt-6 space-y-6 lg:absolute lg:left-6 lg:top-6 lg:mt-0 lg:max-h-[calc(760px-3rem)] lg:w-[23rem] lg:overflow-y-auto">
        {GROUPS.map((group) => (
          <div key={group.key}>
            <p
              className={cn(
                "mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                ON_DARK.eyebrow,
              )}
            >
              {t(group.label)}
            </p>
            <ul className="flex flex-col items-start gap-2">
              {PRODUCTS.filter((p) => p.group === group.key).map((p) => {
                const open = p.key === current.key;
                const panelId = `platform-${p.key}`;
                return (
                  <li key={p.key} className={cn(open && "w-full")}>
                    <div
                      className={cn(
                        "overflow-hidden text-white transition-[border-radius,background-color,border-color] duration-300 motion-reduce:transition-none",
                        GLASS,
                        open
                          ? "rounded-2xl border-white/40 bg-white/15"
                          : cn("rounded-full", GLASS_HOVER),
                      )}
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setActive(p.key)}
                        className={cn(
                          "flex min-h-11 w-full items-center justify-between gap-3 text-left text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white",
                          open
                            ? cn("rounded-t-2xl px-4 pt-3 text-xs", ON_DARK.eyebrow)
                            : "rounded-full py-2 pl-4 pr-2",
                        )}
                      >
                        <span>{t(p.title)}</span>
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20",
                            open && "bg-transparent",
                          )}
                        >
                          {open ? (
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </span>
                      </button>
                      <div id={panelId} hidden={!open} className="px-4 pb-4 pt-1.5">
                        <p className={cn("text-[15px] leading-relaxed", ON_DARK.lead)}>
                          {t(p.body)}
                        </p>
                        <Link
                          to={p.to}
                          hash={p.hash}
                          className={cn(
                            "mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-white underline-offset-4 hover:underline",
                            FOCUS_ON_DARK,
                          )}
                        >
                          {t("platform.readMore")}
                          <span className="sr-only">: {t(p.title)}</span>
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
