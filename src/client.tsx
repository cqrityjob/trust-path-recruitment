import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { hydrateStart } from "@tanstack/react-start/client";

async function start() {
  const router = await hydrateStart();
  // Client-only routes start loading during Start hydration. With a slow CPU,
  // that load can finish between Transitioner's render and commit, calling its
  // setState before mount. Complete this existing load before mounting React;
  // do not issue another load or change subsequent navigation transitions.
  await router.latestLoadPromise;
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  });
}
void start();
