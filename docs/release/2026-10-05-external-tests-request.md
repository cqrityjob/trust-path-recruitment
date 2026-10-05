# External checks of the personal preview — what is needed, and how to do them safely

**Status: not run.** Nothing below has been performed. The sandbox this work was
done in cannot reach LinkedIn, Cloudflare or Lovable at all, so these checks need
the owner's access. They are marked **NOT VERIFIED** until someone has done them.
No account, password or token is ever pasted into a chat; every secret goes into
GitHub's repository secrets by the owner.

## What can be checked without any of it (and has been)

| Claim                                                                      | Where it is proved                                                                 |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A valid 1200×630 PNG, byte-equal to what Node draws, first and later calls | the `og-worker-evidence` workflow: the BUILT bundle in workerd, over http and https |
| An unselected merit is absent from the image model, the payload and bytes   | `passport-og-image:check`, hermetic test 26, the pilot spec's case S               |
| The LinkedIn button opens the share box on the public link                  | hermetic tests 23–28 (the dialog address is asserted; nothing is posted)           |
| Cancelling the phone's share sheet downloads nothing                        | hermetic tests (the share API is stubbed; a real phone is below)                   |
| Revoke, expiry and a failed read stop the page and the image                | the Worker evidence (next request) and the pilot spec against a real database      |
| The page behind the link lists the whole selection                          | the Worker evidence (40 credentials listed, six drawn on the image)                |

"In workerd" is **local runtime verification**: it is Cloudflare's runtime
(workerd), but not Cloudflare's network, not the Lovable account's plan and not
its CPU and memory enforcement. See the measurements note in
`docs/passport/personal-share.md`.

## What needs the owner

### 1. A public https address with a synthetic Passport

Needed by LinkedIn's Post Inspector (it fetches the page and the image from the
public internet, so a loopback address cannot work).

**Prepared:** `.github/workflows/og-public-test.yml` (manual, `workflow_dispatch`
only). It deploys the BUILT application and a stand-in database Worker, both
temporary, to the owner's own Cloudflare account on `workers.dev`. The stand-in
answers only `sp_get_social_share` for invented people; no real project, person
or merit is involved. Actions: `deploy`, `revoke`, `expire`, `error`, `restore`,
`teardown`.

**What it needs from the owner (once):**

1. A Cloudflare account with a `workers.dev` subdomain enabled.
2. An API token limited to **Workers Scripts: Edit** on that one account.
3. In the GitHub repository, *Settings → Secrets and variables → Actions*, add:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `OG_TEST_ADMIN_TOKEN`
   (any random string of 32+ characters).

This is a temporary test Worker the owner can delete with `teardown`; it is not a
change to hosting, a new payment service or a new database. If the owner would
rather not, the alternative is a preview on Lovable after merge with a synthetic
holder the owner registers themself; that needs a holder in the real project and
is a separate decision.

### 2. LinkedIn's Post Inspector (needs a LinkedIn login)

The Inspector is behind a LinkedIn sign-in, so the owner does this step.

1. Run the workflow with `deploy`; open its summary for the addresses.
2. In `https://www.linkedin.com/post-inspector/` inspect
   `<app>/s/AbCdEfGhIjKlMnOpQrStUvWx`.
3. Expect: title *Selma Dahlberg (fiktiv) · Security Passport #17*, the
   description with the approved credentials, and an image that is **her card**
   (number, name, country, three shields), 1200×630, not the generic image.
4. Inspect the founder address and the forty-credential address too: the image
   shows six rows and "+ 34 fler meriter på sidan"; the page lists all forty.
5. Run `revoke`, then inspect again after LinkedIn's cache is cleared with
   "Inspect again": the page and the image answer "not available" **at
   CQrityjob**. LinkedIn may keep the old picture it already fetched; that is a
   limit of every link preview and is what the share screen tells the holder.

### 3. LinkedIn's real share box (needs a LinkedIn login)

Open `https://www.linkedin.com/sharing/share-offsite/?url=<app>/s/AbCdEfGhIjKlMnOpQrStUvWx`
while signed in. Expect the share box with that link and its preview card. **Do
not press Post.** The application itself only opens this address; the hermetic
tests assert exactly this address.

### 4. A real phone's share sheet

The phone's share sheet is only offered where the browser can share a file. It
needs the signed-in share screen, which needs a real Supabase session, so it
cannot run against the stand-in. Two honest options:

* the owner, signed in on their phone to a **synthetic** holder in whatever
  environment they choose, opens "Dela mitt Security Passport", ticks the consent
  box and uses "Dela via appar": the app list should show, and the file handed over
  is the Passport image (a PNG). Cancel the sheet: **no file should be saved**.
* or the owner reports that the browser offers no file sharing there, in which
  case the button must not appear (that is the designed fallback).

## Reporting back

For each numbered check: the address used, what LinkedIn or the phone showed
(a screenshot, with nothing private in it), and pass or fail. Until then the
external checks stay **NOT VERIFIED** in the publication underlay.
