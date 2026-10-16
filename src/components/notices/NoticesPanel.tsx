// The signed-in person's updates (user_notices): what is waiting for them and
// what was decided. Each item says what happened in words and leads to where
// the person acts. A failed read says so, with a retry -- never "no updates".

import { useCallback, useEffect, useState } from "react";
import { noticeLabelKey } from "@/lib/notices/notice-label";
import { Bell, RotateCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  listMyNotices,
  markNoticesRead,
  type Inbox,
  type UserNotice,
} from "@/lib/notices/notices.functions";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; inbox: Inbox };

export function NoticesPanel({
  hrefOf,
  audience,
  limit = 8,
}: {
  /** Where one notice leads, decided by the page that shows it. */
  readonly hrefOf: (n: UserNotice) => string;
  /** Which notices this surface shows. */
  readonly audience: readonly UserNotice["audience"][];
  readonly limit?: number;
}) {
  const { pt, lang } = usePassportCopy();
  const load = useServerFn(listMyNotices);
  const mark = useServerFn(markNoticesRead);
  const [state, setState] = useState<Load>({ status: "loading" });

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", inbox: await load() });
    } catch {
      setState({ status: "error" });
    }
  }, [load]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state.status === "ready" && !state.inbox.installed) return null;
  const items =
    state.status === "ready" && state.inbox.installed
      ? state.inbox.items.filter((n) => audience.includes(n.audience)).slice(0, limit)
      : [];
  const unread = items.filter((n) => !n.readAt);

  return (
    <section
      aria-labelledby="notices-heading"
      data-notices-panel
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="notices-heading"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
        >
          <Bell aria-hidden="true" className="h-4 w-4" />
          {pt("notices.title")}
          {unread.length > 0 ? (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
              {unread.length} {pt("notices.unread")}
            </span>
          ) : null}
        </h2>
        {unread.length > 0 ? (
          <button
            type="button"
            onClick={async () => {
              await mark({ data: { ids: unread.map((n) => n.id) } }).catch(() => undefined);
              await refresh();
            }}
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {pt("notices.markAll")}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{pt("notices.lead")}</p>
      {state.status === "loading" ? (
        <p aria-busy="true" className="mt-3 text-sm text-muted-foreground">
          …
        </p>
      ) : state.status === "error" ? (
        <div role="alert" className="mt-3">
          <p className="text-sm text-foreground">{pt("notices.loadError")}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium"
          >
            <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
            {pt("notices.retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{pt("notices.empty")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((n) => {
            const what = n.kind.startsWith("talent_")
              ? [
                  n.employerName,
                  lang === "sv" ? (n.jobTitleSv ?? n.jobTitleEn) : (n.jobTitleEn ?? n.jobTitleSv),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : n.title;
            return (
              <li
                key={n.id}
                data-notice-kind={n.kind}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {!n.readAt ? (
                      <span className="mr-2 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                        {pt("notices.new")}
                      </span>
                    ) : null}
                    {pt(noticeLabelKey(n) as PassportCopyKey)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {what ? <span>{what} · </span> : null}
                    <span className="tabular-nums">{n.createdAt.slice(0, 10)}</span>
                  </p>
                </div>
                <a
                  href={hrefOf(n)}
                  onClick={() => {
                    if (!n.readAt) void mark({ data: { ids: [n.id] } }).catch(() => undefined);
                  }}
                  className="inline-flex min-h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  {pt("notices.open")}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
