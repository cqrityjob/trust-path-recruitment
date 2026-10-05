// The personal preview image of a public Security Passport share.
//
// `/og/share/<publicId>` is what `og:image` on `/s/<publicId>` points at, so a
// link-preview crawler (LinkedIn's, above all) fetches a card that shows THIS
// holder's number, name, country and approved credentials, each shield at its
// true evidence level.
//
// ── DRAWN HERE, FROM THE CONTROLLED PAYLOAD, OR NOT AT ALL ─────────────
//
// The bytes are produced on this server from `sp_get_social_share`, the one
// anonymous read, which builds its answer from the holder's CURRENT rows for
// the credentials they approved. Nothing a client sends is ever drawn: there is
// no upload, no image parameter and no query that selects content. A picture
// that came from a browser could show credentials the holder does not hold; this
// one cannot say anything the public page cannot.
//
// ── REVOCATION AND EXPIRY STOP IT HERE ─────────────────────────────────
//
// An unknown, expired or revoked id is answered 404 with no body that says
// which, and the response is never cacheable (`no-store`), so a withdrawn share
// stops serving its image from this address at once. A platform that already
// fetched the image may keep its own copy; that is a limit of every link
// preview and the holder is told so before sharing.
//
// ── WHEN IT CANNOT BE DRAWN FAITHFULLY ─────────────────────────────────
//
// A name in a script the embedded faces do not cover would become boxes on a
// public image. Then, and on any failure while drawing, the answer is a redirect
// to the branded static image: a generic preview, never a wrong or broken one.

import { createFileRoute } from "@tanstack/react-router";
import { serverPublicClient } from "@/integrations/supabase/public-server";
import { renderShareImage } from "@/lib/security-passport/og-image/render";
import { publicShareOrigin } from "@/lib/security-passport/public-origin";
import {
  isWellFormedPublicId,
  parsePublicSocialShare,
} from "@/lib/security-passport/social-share-public";

const NO_STORE = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
} as const;

function gone(): Response {
  return new Response("Not found", { status: 404, headers: NO_STORE });
}

function generic(): Response {
  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE, location: `${publicShareOrigin()}/og-security-passport.png` },
  });
}

export const Route = createFileRoute("/og/share/$publicId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!isWellFormedPublicId(params.publicId)) return gone();

        let raw: unknown;
        try {
          const { data, error } = await serverPublicClient().rpc("sp_get_social_share", {
            _public_id: params.publicId,
          });
          if (error) {
            // A failed read says nothing about the share: ask the crawler to retry.
            return new Response("Unavailable", {
              status: 503,
              headers: { ...NO_STORE, "retry-after": "60" },
            });
          }
          raw = data;
        } catch {
          return new Response("Unavailable", {
            status: 503,
            headers: { ...NO_STORE, "retry-after": "60" },
          });
        }

        const now = new Date();
        const share = parsePublicSocialShare(raw, now.toISOString());
        if (share.status !== "active") return gone();

        let png: Uint8Array<ArrayBuffer> | null;
        try {
          png = renderShareImage(share, now.toISOString().slice(0, 10));
        } catch (error) {
          console.error(
            "passport share image failed",
            error instanceof Error ? error.name : "unknown",
          );
          return generic();
        }
        if (png === null) return generic();

        return new Response(png, {
          status: 200,
          headers: {
            ...NO_STORE,
            "content-type": "image/png",
            "content-length": String(png.length),
          },
        });
      },
    },
  },
});
