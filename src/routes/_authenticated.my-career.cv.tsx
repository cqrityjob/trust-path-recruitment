// The CV area.
//
// It became three screens when CVs started being saved, because a generator
// and a document are different things and pretending otherwise is what
// makes a feature feel like a demo:
//
//   /my-career/cv          the list -- or, for somebody with none, one
//                          invitation to create their first
//   /my-career/cv/new      the creator
//   /my-career/cv/$cvId    a saved document: read it, reword it, regenerate
//                          it, update it from the profile, export it
//
// A layout with no chrome of its own. Each screen carries its own heading,
// because each is a destination somebody can arrive at directly.

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/my-career/cv")({
  component: () => <Outlet />,
});
