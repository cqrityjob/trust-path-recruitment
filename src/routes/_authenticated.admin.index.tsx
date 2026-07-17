import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/")({
  ssr: false,
  component: () => <Navigate to="/admin/jobs" replace />,
});