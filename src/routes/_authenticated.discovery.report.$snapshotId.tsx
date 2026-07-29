// TEMPORARY ALIAS — redirects to the canonical report route, preserving
// the snapshot id. Never a permanent second report hub.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/discovery/report/$snapshotId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/security-career-assessment/report/$snapshotId",
      params: { snapshotId: (params as { snapshotId: string }).snapshotId },
      replace: true,
    });
  },
});
