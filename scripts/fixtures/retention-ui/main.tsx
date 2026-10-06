import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, createRootRoute, RouterProvider } from "@tanstack/react-router";
import { I18nProvider } from "@/i18n/context";
import { MaterialLifecycle } from "@/components/recruitment/MaterialLifecycle";
import "@/styles.css";
const params = new URLSearchParams(location.search);
const lang = params.get("lang") === "en" ? "en" : "sv";
const rootRoute = createRootRoute({
  component: () => (
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLang={lang}>
        <main className="mx-auto max-w-4xl p-4">
          <h1>Synthetic recruitment</h1>
          <MaterialLifecycle
            employerId="employer"
            jobId="job"
            applicationId={params.get("scope") === "app" ? "app" : null}
          />
        </main>
      </I18nProvider>
    </QueryClientProvider>
  ),
});
const router = createRouter({ routeTree: rootRoute });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
