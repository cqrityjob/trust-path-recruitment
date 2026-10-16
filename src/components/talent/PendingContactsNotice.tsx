// A line in the candidate's existing application inbox when employers have
// asked to get in touch: how many wait for an answer, and where to answer.
// Renders nothing when there is nothing to say, the slot is not installed, or
// the read failed (the Passport page owns the full list and its errors).

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { listMyContactRequests } from "@/lib/talent/discoverability.functions";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

export function PendingContactsNotice() {
  const { pt } = usePassportCopy();
  const loadFn = useServerFn(listMyContactRequests);
  const contacts = useQuery({
    queryKey: ["talent", "my-contacts"],
    queryFn: () => loadFn(),
    retry: false,
  });
  const pending =
    contacts.data && contacts.data.installed
      ? contacts.data.items.filter((c) => c.status === "pending").length
      : 0;
  if (pending === 0) return null;
  return (
    <div
      role="status"
      data-pending-contacts={pending}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4"
    >
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Mail aria-hidden="true" className="h-4 w-4" />
        <span>
          <span className="font-semibold tabular-nums">{pending}</span> ·{" "}
          {pt("notices.kind.talent_contact_received")}
        </span>
      </p>
      <Link
        to="/passport/discoverability"
        hash="contacts"
        className="inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-secondary"
      >
        {pt("disc.contacts.title")}
      </Link>
    </div>
  );
}
