import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/my-career")({
  component: MyCareerLayout,
});

function MyCareerLayout() {
  return <Outlet />;
}
