import React, { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from "@tanstack/react-router";
import { questionNoteBody, pendingQuestionNoteBody, type QuestionNoteDraft } from "../src/lib/interview-intelligence/question-note-draft";
const state = (window as any).__noteProbe = { oldWrites: [] as string[], newWrites: [] as string[], oldRoot: null as any, newRoot: null as any };
const saved = "Synthetic saved Q8";
function Old() {
  const [draft, setDraft] = useState("");
  const body = useRef(draft);
  body.current = draft;
  useEffect(() => { setDraft(saved); }, []);
  useEffect(() => () => { if (body.current !== saved) state.oldWrites.push(body.current); }, []);
  return <input id="old-note" value={draft} readOnly />;
}
function New() {
  const [draft, setDraft] = useState<QuestionNoteDraft | null>(null);
  const [question, setQuestion] = useState("Q8");
  const latest = useRef({ draft, question });
  latest.current = { draft, question };
  useEffect(() => () => {
    const { draft, question } = latest.current;
    const pending = pendingQuestionNoteBody(question, draft, question === "Q8" ? saved : "Synthetic saved Q7", true);
    if (pending !== null) state.newWrites.push(pending);
  }, []);
  return <><input id="new-note" value={questionNoteBody(question, draft, question === "Q8" ? saved : "Synthetic saved Q7")} onChange={(e) => setDraft({ questionId: question, body: e.target.value })} /><button id="other-question" onClick={() => setQuestion("Q7")}>Other question</button></>;
}
state.oldRoot = createRoot(document.getElementById("old")!);
state.oldRoot.render(<StrictMode><Old /></StrictMode>);
state.mountNew = () => {
  state.newRoot = createRoot(document.getElementById("new")!);
  state.newRoot.render(<StrictMode><New /></StrictMode>);
};
state.mountNew();
function CaseNote() {
  const data = caseRoute.useLoaderData();
  const [draft, setDraft] = useState<QuestionNoteDraft | null>(null);
  const [identity] = useState(() => (state.caseCounter = (state.caseCounter ?? 0) + 1));
  const known = useRef(`${data.caseId}-note-id`);
  return <><input id="case-note" value={questionNoteBody("shared-Q1", draft, data.body)} onChange={(e) => setDraft({ questionId: "shared-Q1", body: e.target.value })} /><output id="case-instance">{identity}</output><output id="case-known">{known.current}</output></>;
}
const parentRoute = createRootRoute({ component: () => <Outlet /> });
const caseRoute = createRoute({
  getParentRoute: () => parentRoute,
  path: "/case/$caseId",
  validateSearch: (search: Record<string, unknown>) => ({ question: typeof search.question === "string" ? search.question : undefined }),
  remountDeps: ({ params }) => params.caseId,
  loader: async ({ params }) => ({ caseId: params.caseId, body: `Synthetic case ${params.caseId} stored` }),
  component: CaseNote,
});
state.caseRouter = createRouter({ routeTree: parentRoute.addChildren([caseRoute]), history: createMemoryHistory({ initialEntries: ["/case/A"] }) });
state.caseRoot = createRoot(document.getElementById("cases")!);
state.caseRoot.render(<StrictMode><RouterProvider router={state.caseRouter} /></StrictMode>);
