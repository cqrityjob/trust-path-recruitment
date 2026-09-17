// /passport/card — retired in favour of Preview and share.
//
// ── WHY THIS IS A REDIRECT AND NOT A PAGE ──────────────────────────────
//
// This route was a second "preview": the compact Passport card beside a
// list of checkboxes. Ticking them filled the card — and did nothing else.
// The selection was not carried into the sharing flow, the card was not
// what a recipient sees, and the page ended in a button to /passport/share,
// where the holder chose the same credentials again and only then met the
// real recipient view.
//
// The owner's rule is that the complete recipient-style Passport lives in
// ONE place, Preview and share: select credentials, see exactly what the
// recipient will see, inspect trust state and source, set the expiry,
// create and manage links. That page already does all of it. So this one
// sends the reader there.
//
// The FILE stays because the address is real: it is in browser histories,
// it was the target of "Open preview" on two surfaces, and a bookmark that
// lands on a 404 is worse than one that lands on the right page. `replace`
// so Back does not bounce between the two.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/passport/card")({
  beforeLoad: () => {
    throw redirect({ to: "/passport/share", replace: true });
  },
});
