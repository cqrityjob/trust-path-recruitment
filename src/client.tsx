import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { hydrateRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { hydrateStart } from "@tanstack/react-start/client";

async function start() {
  const router = await hydrateStart();
  // Commit the initial router mount before its asynchronous client-only load
  // can finish and update Transitioner. Waiting for that load first discards
  // the server's client-only Suspense boundaries and breaks hydration.
  // Subsequent route transitions keep the router's normal scheduling.
  flushSync(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  });
}
void start();
