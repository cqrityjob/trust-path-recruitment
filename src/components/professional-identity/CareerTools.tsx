// Career tools — the secondary outputs, as one list rather than four cards.
//
// A tool appears only when it can produce something: the CV is gated on the
// same readiness function the builder applies, the Career Card on the same
// "the report names careers" condition the report view applies. Rendered
// nothing when empty.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import type { ToolItem } from "@/lib/professional-identity/home-presentation";
import { L, type Lang } from "./copy";
import { TOOL, TOOLS } from "./home-copy";
import { Group } from "./home-primitives";

export function CareerTools({
  tools,
  className,
}: {
  tools: readonly ToolItem[];
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  if (tools.length === 0) return null;

  return (
    <Group id="tools" title={L(TOOLS.heading, l)} className={className} data-career-tools="">
      <ul className="mt-1 divide-y divide-border">
        {tools.map((tool) => {
          const copy = TOOL[tool.key];
          const title = tool.existing && copy.existingTitle ? copy.existingTitle : copy.title;
          return (
            <li key={tool.key}>
              <Link
                to={tool.href}
                data-tool={tool.key}
                className="group flex min-h-11 items-center justify-between gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground group-hover:underline">
                    {L(title, l)}
                  </span>
                  <span className="mt-0.5 block max-w-[64ch] text-xs leading-relaxed text-muted-foreground">
                    {L(copy.body, l)}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Group>
  );
}
