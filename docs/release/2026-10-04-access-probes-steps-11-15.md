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

Corrected 2026-10-04 against the current UI (`src/i18n/dictionaries.ts`) and production (read-only):

- The join link takes the organisation **id**, not its slug. `?org=cqrityjob` shows "Länken saknar organisation".
- The organisation `cqrityjob` has id `b901bdaf-6931-4b55-92b5-11053cf8ab6b`. Its only active member is the owner, who is both owner and platform administrator.
- The owner approves the member role with "Godkänn som rekryterare". Owners cannot suspend members; only a platform administrator can, from `/admin/employers`.
- The blocked request shows a Swedish sentence, not the error code.

### People and accounts

- **Owner**: the owner's own account. It is owner in `cqrityjob` and platform administrator.
- **Test member**: a second, signed-in account that is neither the owner nor a member of `cqrityjob`. Use a private window for it.

All pages are on `https://www.cqrityjob.com`.

### Steps

**1. The test member asks for access.**
- Open `/employer/join?org=b901bdaf-6931-4b55-92b5-11053cf8ab6b`.
- Expect the heading "Begär åtkomst till organisationen".
- Click **Skicka begäran**. The message is optional.
- Expect "Begäran skickad".

**2. The owner approves as an ordinary member.**
- Open `/employer/cqrityjob/settings` and scroll to **Team & behörigheter**.
- Under "Väntar på ditt svar (1)", click **Godkänn som rekryterare**.
- Do **not** click "Ge granskningsbehörighet".
- Expect the person to appear with role "Rekryterare" and status "Aktiv".

**3. Step 11: an ordinary member sees no reports.**
- As the test member, open `/employer/cqrityjob/reports`.
- Expect a notice, not a list:
  - "Du har inte tillgång till organisationens intervjuer"
  - followed by "… Just nu finns ingen intervju du har rätt att öppna."
  - and "Be en ägare eller administratör i organisationen om åtkomst om du behöver den."
- Take a screenshot.

**4. Step 15: suspension blocks access and a new request.**
- As the owner, open `/admin/employers` and choose the filter **Aktiva**.
- Click **Granska** on CQrityjob, or open `/admin/employers/b901bdaf-6931-4b55-92b5-11053cf8ab6b` directly.
- Under **Medlemmar**, click **Stäng av åtkomst** on the test member, then **Bekräfta**.
- Expect "<namn>: åtkomsten är avstängd."
- As the test member, reload `/employer/cqrityjob/reports`. Expect "Åtkomst ej tillgänglig".
- As the test member, open the join link from step 1 again and click **Skicka begäran**.
- Expect a red text: "Din åtkomst till den här organisationen har pausats eller avslutats av en plattformsadministratör, så du kan inte begära åtkomst på nytt. …".
- Take a screenshot.

**5. Clean up.**
- As the owner, on the same member row, click **Ta bort** and then **Bekräfta**.
- Expect "<namn> har tagits bort från organisationen."
- The row stays, marked "Borttagen", as a trail.
- Do not reactivate the test member.

### What to send back

- The two screenshots, from steps 3 and 4.
- Anything that differs from the expected texts above.
