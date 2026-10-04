# Access probes, production-test steps 11 and 15 (2026-10-04)

**Database level: done and passing, read-only. Browser level: not done; it needs the owner's login (exact steps below).**

Run against owner production (project `wrygicdfxwjnrugduxnt`) at ~06:00-06:12 UTC through the Supabase connector. Every
probe ran inside `BEGIN ... ROLLBACK`; nothing was committed and nothing was left behind (verified afterwards:
0 synthetic users, memberships, requests, grants or profiles; 9 memberships; ledger 368 rows unchanged). The output is
booleans and counts only. No pg_net, http or pg_cron extension exists and no trigger on the touched tables calls out of
the database, so a rolled-back probe has no external effect. The SQL and the results are kept in
[`evidence/2026-10-04-access-probes/`](evidence/2026-10-04-access-probes/probes.sql) ([results](evidence/2026-10-04-access-probes/results.txt)).

## Step 11: report access (needs `20270202`-`204`, applied)

Real production principals (all 9 active members), as role `authenticated` with that member's id as the subject:

| Who | Result |
|---|---|
| 5 owners and the 1 admin | `employer_report_access`: member, owner/admin, both use cases readable; `employer_reports_readable` true |
| 2 members with a live reviewer grant | read exactly the granted use case (`recruitment`), not the organisation-wide gate |
| **the 1 ordinary member without a grant** | member, **no readable use case, no organisation-wide read** |

The ordinary member without a grant is a platform administrator account that is only a plain member in that organisation (platform administration is a separate role and adds no report reading right in an organisation). That is why this person is not a candidate for the browser step below. Production has exactly two platform administrator accounts.

The one thing an owner cannot read is an interview case whose subject is that owner (2 such cases), which is rule 2 of
`employer_reports_readable`: a person never reads the employer-audience record about themselves through membership.
An ordinary member still reads the interview cases they created (5), as designed.

## Step 15: suspension (needs `20270202`, applied)

There is no suspended or removed membership in production, so a synthetic person was created inside the rolled-back
transaction (the real bodies and triggers ran):

| Check | Result |
|---|---|
| a suspended member asks for access again | refused, `ACCESS_REQUEST_MEMBERSHIP_BLOCKED` (42501), no request row created |
| a removed member asks for access again | refused, `ACCESS_REQUEST_MEMBERSHIP_BLOCKED` (42501) |
| a request is pending, the person is then suspended, an owner approves | refused, `ACCESS_REQUEST_REACTIVATION_REFUSED` (42501); the membership stays `suspended` |
| a reviewer with a live grant is suspended | the grant is revoked by the suspension; the person is no longer a member, has no use case and reads nothing |

## What is NOT verified

The text the person sees in the **browser** ("no access to results here, ask an owner or an administrator", and the error
text on a blocked request) and the owner's Team screen. They are application text on top of the database results above.
They need a signed-in browser session; see below.

## Browser steps that need the owner (about 10 minutes)

Accounts: the owner (platform administrator) and one more approved test account that is not the owner and not the test
candidate. All pages are on `https://www.cqrityjob.com`.

1. **Second account requests access.** Log in as the second test account (private window). Open `/employer/join?org=cqrityjob`
   and send the access request.
2. **Owner approves as an ordinary member.** Log in as the owner. Open `/employer/cqrityjob/settings`, the Team part, and
   approve the request with the role **Member**. Do not give reviewer access.
3. **Step 11 in the browser.** As the second account open `/employer/cqrityjob/reports`. Expected: a plain statement that
   there is no access to results in this organisation, **not** an empty list. Save a screenshot.
4. **Step 15 in the browser.** As the owner (platform administrator) open `/admin/employers`, the organisation
   `cqrityjob`, its members, and suspend the second account. As the second account reload `/employer/cqrityjob/reports`
   (denied) and open `/employer/join?org=cqrityjob` and send a request again. Expected: refused with the text containing
   `ACCESS_REQUEST_MEMBERSHIP_BLOCKED` (access suspended or ended by a platform administrator). Save a screenshot.
5. **Clean up.** As the owner/administrator remove the second account's membership again.
