// Career tools — the secondary outputs, grouped and kept secondary.
//
// ── WHY A TOOL CAN BE ABSENT ───────────────────────────────────────────
//
// The CV card used to be permanent, and it said "built from what you have
// already recorded" to people with no employment and no education — whose
// CV builder would then refuse to generate anything. Two sentences, one
// card, contradicting each other.
//
// So a tool appears only when it can produce something. The CV is gated on
// the SAME `computeCvReadiness` the builder itself applies, and the Career
// Card on the same "the report names careers" condition the report view
// applies before it offers one. A tool that cannot produce a result is not
// shown at all, which is the only version of this that is never a lie.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import type { ToolItem } from "@/lib/professional-identity/home-presentation";
import { L, type Lang } from "./copy";
import { TOOL, TOOLS } from "./home-copy";

export function CareerTools({
  tools,
  className,
}: {
  tools: readonly ToolItem[];
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  // Nothing to offer, nothing rendered. A card that exists to say "no tools
  // available" is the premium space this page refuses to spend.
  if (tools.length === 0) return null;

  return (
    <section aria-labelledby="tools-heading" data-career-tools className={className}>
      <h2
        id="tools-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(TOOLS.heading, l)}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((tool) => {
          const copy = TOOL[tool.key];
          const title = tool.existing && copy.existingTitle ? copy.existingTitle : copy.title;
          return (
            <li key={tool.key} className="flex">
              {/* A link, not a clickable card: one interactive element per
                  row, so nothing nests inside anything else clickable. */}
              <Link
                to={tool.href}
                data-tool={tool.key}
                className="group flex w-full flex-col rounded-xl border border-border bg-card p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="text-sm font-semibold text-balance text-foreground group-hover:underline">
                  {L(title, l)}
                </span>
                <span className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {L(copy.body, l)}
                </span>
                <span
                  className="mt-auto inline-flex items-center pt-3 text-accent"
                  aria-hidden="true"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
