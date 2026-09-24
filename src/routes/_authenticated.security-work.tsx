import { createFileRoute } from "@tanstack/react-router";
import { SecurityWorkRoot } from "@/components/security-work/SecurityWorkLayout";

export const Route = createFileRoute("/_authenticated/security-work")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Security Work — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SecurityWorkRoot,
});
