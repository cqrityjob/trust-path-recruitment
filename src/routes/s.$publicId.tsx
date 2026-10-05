// Security Passport — the public page behind a social post.
//
// `/s/<publicId>` is what a LinkedIn (or any) link preview points at. It is a
// DIFFERENT object from the private `/p` link: a random public id, created by
// an explicit "I am sharing this publicly" act, opening only the credentials
// the holder approved, and answering one "unavailable" for an unknown, an
// expired and a revoked id.
//
// ── SERVER-RENDERED, BECAUSE A CRAWLER READS RAW HTML ──────────────────
//
// A link-preview crawler does not run the application. The Open Graph tags are
// therefore written into the first response from the loader's data, so they
// exist without a session and without JavaScript. They name the person and the
// approved credentials; they claim no standing (standing is on the page, which
// is read again on every open).
//
// ── THE PREVIEW IMAGE IS NOT PERSONAL ──────────────────────────────────
//
// og:image is the branded CQrityjob Security Passport image, identical for
// every share. A personalised image would have to be supplied by someone, and a
// client-supplied picture can show credentials the holder does not have. A
// personalised image is drawn from the controlled payload by the application
// or not at all; until that renderer exists, the text beside the image is the
// personal part.
//
// ── noindex ────────────────────────────────────────────────────────────
//
// A personal card is not a page to rank. `noindex` keeps it out of search while
// the preview crawlers of the platforms it is shared on still read the tags.

import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { getPublicSocialShare } from "@/lib/security-passport/social-share.functions";
import {
  isWellFormedPublicId,
  linkPreviewFor,
  publicSocialShareUrl,
  toRecipientPayload,
  type PublicSocialShare,
} from "@/lib/security-passport/social-share-public";
import { buildRecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import { RecipientPassportView } from "@/components/security-passport/live/RecipientPassportView";
import { PassportLangProvider, usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { publicShareOrigin } from "@/lib/security-passport/public-origin";

export const Route = createFileRoute("/s/$publicId")({
  loader: async ({ params }): Promise<PublicSocialShare> => {
    if (!isWellFormedPublicId(params.publicId)) return { status: "unavailable" };
    try {
      return await getPublicSocialShare({ data: { publicId: params.publicId } });
    } catch {
      return { status: "error" };
    }
  },
  head: ({ loaderData, params }) => {
    const share = (loaderData ?? { status: "unavailable" }) as PublicSocialShare;
    const preview = linkPreviewFor(share);
    const origin = publicShareOrigin();
    const image = `${origin}/og-security-passport.png`;
    const active = share.status === "active";
    return {
      meta: [
        { title: preview.title },
        { name: "robots", content: "noindex, nofollow" },
        { name: "description", content: preview.description },
        { property: "og:title", content: preview.title },
        { property: "og:description", content: preview.description },
        { property: "og:type", content: "website" },
        // The canonical address of THIS page, on the configured public origin.
        {
          property: "og:url",
          content: active ? publicSocialShareUrl(params.publicId) : `${origin}/security-passport`,
        },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: "CQrityjob Security Passport" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: preview.title },
        { name: "twitter:description", content: preview.description },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: PublicSocialSharePage,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function PublicSocialSharePage() {
  const share = Route.useLoaderData() as PublicSocialShare;
  const { params } = Route.useMatch();

  const presentation = useMemo(
    () =>
      share.status === "active"
        ? buildRecipientPresentation(toRecipientPayload(share), today())
        : null,
    [share],
  );

  if (share.status === "active" && presentation) {
    return (
      <main data-public-share="active" className="px-4 py-8 sm:py-10">
        <RecipientPassportView
          presentation={presentation}
          lang={share.locale}
          verifyUrl={publicSocialShareUrl(params.publicId)}
          identity={{ passportNumber: share.passportNumber, designation: share.designation }}
        />
      </main>
    );
  }

  return (
    <PassportLangProvider lang="sv">
      <Unavailable error={share.status === "error"} />
    </PassportLangProvider>
  );
}

/** One answer for an unknown, an expired and a revoked share; a different one
 *  only for a failed read, which says nothing about the share itself. */
function Unavailable({ error }: { error: boolean }) {
  const { pt } = usePassportCopy();
  return (
    <main
      data-public-share={error ? "error" : "unavailable"}
      className="mx-auto max-w-2xl px-4 py-16"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {pt("rec.brand")}
      </p>
      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <ShieldAlert aria-hidden="true" className="h-5 w-5" />
          {pt(error ? "pubshare.errorTitle" : "pubshare.unavailableTitle")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {pt(error ? "pubshare.errorBody" : "pubshare.unavailableBody")}
        </p>
        <a
          href="/security-passport"
          className="mt-4 inline-flex h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("rec.aboutLink")}
        </a>
      </div>
    </main>
  );
}
