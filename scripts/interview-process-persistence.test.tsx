import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { I18nProvider } from "../src/i18n/context";
import { CandidateBackgroundStatus } from "../src/components/employer/interview/CandidateBackgroundStatus";
import { InterviewOpeningDisclosure } from "../src/components/employer/interview/InterviewOpeningDisclosure";
import {
  SessionProcessSave,
  type SessionProcessRecord,
} from "../src/lib/interview-intelligence/session-process-save";
import type { InterviewContextResult, LinkState } from "../src/lib/interview-intelligence/context";
import { drainInterviewNoteDraft } from "../src/lib/interview-intelligence/note-save-drain";
import { drainInterviewDrafts } from "../src/lib/interview-intelligence/draft-save-drain";
import {
  pendingQuestionNoteBody,
  questionNoteBody,
  mayApplyStoredQuestionNote,
  type QuestionNoteDraft,
} from "../src/lib/interview-intelligence/question-note-draft";

describe("question-bound note draft after reload", () => {
  test("the interview route remounts its draft and known CAS records when the case changes, not when the question changes", () => {
    const route = readFileSync(
      "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx",
      "utf8",
    );
    expect(route).toContain("remountDeps: ({ params }) => params.caseId");
    expect(route).not.toContain("remountDeps: ({ search })");
    const sharedQuestion = "shared-role-pack-question";
    const caseADraft = { questionId: sharedQuestion, body: "Case A human draft" };
    expect(questionNoteBody(sharedQuestion, caseADraft, "Case A saved")).toBe("Case A human draft");
    // A new route component has a fresh draft/known map even though its pack
    // reuses the same Q-ID. It must display case B's source and perform no write.
    expect(questionNoteBody(sharedQuestion, null, "Case B saved")).toBe("Case B saved");
    expect(pendingQuestionNoteBody(sharedQuestion, null, "Case B saved", true)).toBeNull();
  });
  test("a late explicit reload cannot replace text typed on another question or after the reload began", async () => {
    let draft = { questionId: "Q1", body: "Q1 human draft" };
    let currentQuestion = "Q1";
    let revision = 1;
    let observedVersion = "Q1 old CAS version";
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requestedQuestion = currentQuestion;
    const requestedRevision = revision;
    const reload = pending.then(() => {
      if (
        !mayApplyStoredQuestionNote(
          requestedQuestion,
          currentQuestion,
          requestedRevision,
          revision,
          true,
        )
      )
        return;
      observedVersion = "Q1 returned CAS version";
      draft = { questionId: requestedQuestion, body: "Q1 returned stored text" };
    });
    currentQuestion = "Q2";
    revision += 1;
    draft = { questionId: "Q2", body: "Q2 new human draft" };
    release();
    await reload;
    expect(draft).toEqual({ questionId: "Q2", body: "Q2 new human draft" });
    expect(observedVersion).toBe("Q1 old CAS version");
    expect(mayApplyStoredQuestionNote("Q1", "Q1", 1, 2, true)).toBe(false);
    expect(mayApplyStoredQuestionNote("Q1", "Q1", 2, 2, true)).toBe(true);
    expect(mayApplyStoredQuestionNote("Q1", "Q1", 2, 2, false)).toBe(false);
  });
  test("initial loaded Q8 and StrictMode cleanup replay cannot clear a stored note", () => {
    const saved = "Persisted Q8 account before pause";
    const initial: QuestionNoteDraft | null = null;
    expect(questionNoteBody(null, initial, saved)).toBe("");
    expect(questionNoteBody("Q8", initial, saved)).toBe(saved);
    const writes: string[] = [];
    // The route may mount after CaseContentBoundary loaded the saved case.
    // StrictMode's repeated effect cleanup has no human write intention.
    for (let cleanup = 0; cleanup < 2; cleanup++) {
      const body = pendingQuestionNoteBody("Q8", initial, saved, true);
      if (body !== null) writes.push(body);
    }
    expect(writes).toEqual([]);
    expect(questionNoteBody("Q8", initial, saved)).toBe(saved);
  });
  test("a prior question's draft cannot be displayed or saved into a newly selected question", () => {
    const previous = { questionId: "Q1", body: "Human Q1 text" };
    expect(questionNoteBody("Q2", previous, "Stored Q2 text")).toBe("Stored Q2 text");
    expect(pendingQuestionNoteBody("Q2", previous, "Stored Q2 text", true)).toBeNull();
    expect(questionNoteBody("Q3", previous, "")).toBe("");
    expect(pendingQuestionNoteBody("Q3", previous, "", false)).toBeNull();
  });
  test("an explicit empty edit still drains through the ordinary writer and CAS failure keeps it", async () => {
    const draft = { questionId: "Q8", body: "" };
    let saved = "Stored Q8 account";
    expect(questionNoteBody("Q8", draft, saved)).toBe("");
    expect(pendingQuestionNoteBody("Q8", draft, saved, true)).toBe("");
    const writes: string[] = [];
    expect(
      await drainInterviewNoteDraft({
        readDraft: () => questionNoteBody("Q8", draft, saved),
        readSaved: () => saved,
        hasSavedNote: () => true,
        isCurrentQuestion: () => true,
        write: async (body) => {
          writes.push(body);
          saved = body;
        },
      }),
    ).toBe(true);
    expect(writes).toEqual([""]);
    expect(pendingQuestionNoteBody("Q8", draft, saved, true)).toBeNull();
    saved = "Changed in another tab";
    expect(
      await drainInterviewNoteDraft({
        readDraft: () => draft.body,
        readSaved: () => saved,
        hasSavedNote: () => true,
        isCurrentQuestion: () => true,
        write: async () => {
          throw Error("SCP_IV_NOTE_STALE");
        },
      }),
    ).toBe(false);
    expect(saved).toBe("Changed in another tab");
    expect(draft.body).toBe("");
    expect(pendingQuestionNoteBody("Q8", draft, saved, true)).toBe("");
    expect(pendingQuestionNoteBody("Q8", draft, "", false)).toBeNull();
  });
  test("human edits survive later stored reads and still drain edits made during a pending write", async () => {
    let draft: QuestionNoteDraft = { questionId: "Q8", body: "Human A" };
    let saved = "Stored older account";
    expect(questionNoteBody("Q8", draft, "Newer query response")).toBe("Human A");
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    const writes: string[] = [];
    const drain = drainInterviewNoteDraft({
      readDraft: () => questionNoteBody("Q8", draft, saved),
      readSaved: () => saved,
      hasSavedNote: () => true,
      isCurrentQuestion: () => true,
      write: async (body) => {
        writes.push(body);
        if (writes.length === 1) {
          started();
          await held;
        }
        saved = body;
      },
    });
    await requested;
    draft = { questionId: "Q8", body: "Human B while A pending" };
    release();
    expect(await drain).toBe(true);
    expect(writes).toEqual(["Human A", "Human B while A pending"]);
    expect(saved).toBe(draft.body);
  });
  test("a new question-bound edit during the process flush drains before navigation", async () => {
    let draft: QuestionNoteDraft | null = null;
    let saved = "Existing Q8";
    let processDirty = true;
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    const writes: string[] = [];
    let navigated = false;
    const guard = drainInterviewDrafts({
      flushNote: async () => {
        if (draft?.questionId !== "Q8") return true;
        return drainInterviewNoteDraft({
          readDraft: () => questionNoteBody("Q8", draft, saved),
          readSaved: () => saved,
          hasSavedNote: () => true,
          isCurrentQuestion: () => true,
          write: async (body) => {
            writes.push(body);
            saved = body;
          },
        });
      },
      flushProcess: async () => {
        if (processDirty) {
          started();
          await held;
          processDirty = false;
        }
        return true;
      },
      noteIsDirty: () => pendingQuestionNoteBody("Q8", draft, saved, true) !== null,
      processIsDirty: () => processDirty,
    }).then((ok) => {
      navigated = ok;
      return ok;
    });
    await requested;
    expect(navigated).toBe(false);
    draft = { questionId: "Q8", body: "New human Q8 during process write" };
    release();
    expect(await guard).toBe(true);
    expect(writes).toEqual(["New human Q8 during process write"]);
    expect(saved).toBe(draft.body);
    expect(navigated).toBe(true);
  });
});

const t0 = "2026-10-07T12:00:00.000001Z";
const t1 = "2026-10-07T12:00:00.000002Z";
const t2 = "2026-10-07T12:00:00.000003Z";
const record = (
  updatedAt = t0,
  reflection = "Saved reflection",
  deviations = "Saved change",
): SessionProcessRecord => ({
  id: "session-one",
  updatedAt,
  processReflection: reflection,
  protocolDeviations: deviations,
});

describe("combined navigation guard", () => {
  test("drains note edits during process writes and process edits during note writes before navigating", async () => {
    let noteDraft = "Note A";
    let noteSaved = "";
    const noteWrites: string[] = [];
    const processWrites: string[] = [];
    let releaseNoteA!: () => void;
    let releaseNoteB!: () => void;
    let releaseProcess!: () => void;
    let noteAStarted!: () => void;
    let noteBStarted!: () => void;
    let processStarted!: () => void;
    const noteA = new Promise<void>((resolve) => {
      releaseNoteA = resolve;
    });
    const noteB = new Promise<void>((resolve) => {
      releaseNoteB = resolve;
    });
    const processGate = new Promise<void>((resolve) => {
      releaseProcess = resolve;
    });
    const firstNoteStarted = new Promise<void>((resolve) => {
      noteAStarted = resolve;
    });
    const secondNoteStarted = new Promise<void>((resolve) => {
      noteBStarted = resolve;
    });
    const firstProcessStarted = new Promise<void>((resolve) => {
      processStarted = resolve;
    });
    const process = new SessionProcessSave(record(), async (input) => {
      processWrites.push(input.processReflection);
      if (processWrites.length === 1) {
        processStarted();
        await processGate;
      }
      return { sessionId: input.sessionId, updatedAt: processWrites.length === 1 ? t1 : t2 };
    });
    process.edit({ processReflection: "Reflection A" });
    const guard = drainInterviewDrafts({
      flushNote: () =>
        drainInterviewNoteDraft({
          readDraft: () => noteDraft,
          readSaved: () => noteSaved,
          hasSavedNote: () => noteSaved !== "",
          isCurrentQuestion: () => true,
          write: async (body) => {
            noteWrites.push(body);
            if (noteWrites.length === 1) {
              noteAStarted();
              await noteA;
            }
            if (noteWrites.length === 2) {
              noteBStarted();
              await noteB;
            }
            noteSaved = body;
          },
        }),
      flushProcess: () => process.flush(),
      noteIsDirty: () => noteDraft !== noteSaved,
      processIsDirty: () => process.dirty,
    });
    let navigated = false;
    void guard.then((ok) => {
      navigated = ok;
    });
    await firstNoteStarted;
    process.edit({ processReflection: "Reflection B", protocolDeviations: "Deviation B" });
    releaseNoteA();
    await firstProcessStarted;
    noteDraft = "Note B";
    releaseProcess();
    await secondNoteStarted;
    expect(navigated).toBe(false);
    process.edit({ processReflection: "Reflection C", protocolDeviations: "Deviation C" });
    releaseNoteB();
    expect(await guard).toBe(true);
    expect(noteWrites).toEqual(["Note A", "Note B"]);
    expect(processWrites).toEqual(["Reflection B", "Reflection C"]);
    expect(noteSaved).toBe("Note B");
    expect(process.saved.protocolDeviations).toBe("Deviation C");
    expect(process.dirty).toBe(false);
    expect(navigated).toBe(true);
  });

  test("a failed drain stops the combined guard without retrying or permitting navigation", async () => {
    let noteDirty = true;
    let noteCalls = 0;
    let processCalls = 0;
    const ok = await drainInterviewDrafts({
      flushNote: async () => {
        noteCalls += 1;
        noteDirty = false;
        return true;
      },
      flushProcess: async () => {
        processCalls += 1;
        noteDirty = true;
        return false;
      },
      noteIsDirty: () => noteDirty,
      processIsDirty: () => true,
    });
    expect(ok).toBe(false);
    expect(noteDirty).toBe(true);
    expect(noteCalls).toBe(1);
    expect(processCalls).toBe(1);
  });
});

describe("guarded question-note navigation", () => {
  test("one flush drains A, B and C typed during requests before replacing the question draft", async () => {
    let draft = "A";
    let saved = "";
    let question = "Q1";
    let hasSavedNote = false;
    const writes: string[] = [];
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    let secondStarted!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const secondRequest = new Promise<void>((resolve) => {
      secondStarted = resolve;
    });
    const flush = drainInterviewNoteDraft({
      readDraft: () => draft,
      readSaved: () => saved,
      hasSavedNote: () => hasSavedNote,
      isCurrentQuestion: () => question === "Q1",
      write: async (body) => {
        writes.push(body);
        if (writes.length === 1) await first;
        if (writes.length === 2) {
          secondStarted();
          await second;
        }
        saved = body;
        hasSavedNote = true;
      },
    });
    let navigated = false;
    void flush.then((ok) => {
      if (ok) {
        navigated = true;
        question = "Q2";
      }
    });
    draft = "B";
    releaseFirst();
    await secondRequest;
    expect(navigated).toBe(false);
    expect(saved).toBe("A");
    draft = "C";
    releaseSecond();
    expect(await flush).toBe(true);
    expect(writes).toEqual(["A", "B", "C"]);
    expect(saved).toBe("C");
    expect(navigated).toBe(true);
  });

  for (const message of ["temporary failure", "SCP_IV_NOTE_STALE"]) {
    test(`a failed drain blocks question navigation and retains the newer note: ${message}`, async () => {
      let draft = "A";
      let saved = "";
      let release!: () => void;
      const first = new Promise<void>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      const flush = drainInterviewNoteDraft({
        readDraft: () => draft,
        readSaved: () => saved,
        hasSavedNote: () => saved !== "",
        isCurrentQuestion: () => true,
        write: async (body) => {
          calls += 1;
          if (calls === 1) {
            await first;
            saved = body;
            return;
          }
          throw new Error(message);
        },
      });
      draft = "B";
      release();
      expect(await flush).toBe(false);
      expect(saved).toBe("A");
      expect(draft).toBe("B");
    });
  }

  test("clearing a newly inserted note during the request is saved as a clearing", async () => {
    let draft = "A";
    let saved = "";
    let exists = false;
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writes: string[] = [];
    const flush = drainInterviewNoteDraft({
      readDraft: () => draft,
      readSaved: () => saved,
      hasSavedNote: () => exists,
      isCurrentQuestion: () => true,
      write: async (body) => {
        writes.push(body);
        if (writes.length === 1) await first;
        saved = body;
        exists = true;
      },
    });
    draft = "";
    release();
    expect(await flush).toBe(true);
    expect(writes).toEqual(["A", ""]);
    expect(saved).toBe("");
  });

  test("another completed navigation cannot cause this guard to save a new question into the old one", async () => {
    let question = "Q1";
    let draft = "Original Q1 text";
    let saved = "";
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writes: string[] = [];
    const flush = drainInterviewNoteDraft({
      readDraft: () => draft,
      readSaved: () => saved,
      hasSavedNote: () => true,
      isCurrentQuestion: () => question === "Q1",
      write: async (body) => {
        writes.push(body);
        await first;
        saved = body;
      },
    });
    question = "Q2";
    draft = "Different Q2 text";
    release();
    expect(await flush).toBe(false);
    expect(writes).toEqual(["Original Q1 text"]);
    expect(draft).toBe("Different Q2 text");
  });
});

describe("interviewer process persistence", () => {
  test("loads both saved fields after pause/reload; clearing is persisted", async () => {
    const writes: unknown[] = [];
    const process = new SessionProcessSave(record(), async (input) => {
      writes.push(input);
      return { sessionId: input.sessionId, updatedAt: t1 };
    });
    expect(process.draft.processReflection).toBe("Saved reflection");
    expect(process.draft.protocolDeviations).toBe("Saved change");
    expect(await process.flush()).toBe(true);
    expect(writes).toHaveLength(0);
    process.edit({ processReflection: "", protocolDeviations: "" });
    expect(await process.flush()).toBe(true);
    expect(writes).toEqual([
      {
        sessionId: "session-one",
        expectedUpdatedAt: t0,
        processReflection: "",
        protocolDeviations: "",
      },
    ]);
    const reloaded = new SessionProcessSave(record(t1, "", ""), async () => {
      throw new Error("unexpected write");
    });
    expect(reloaded.dirty).toBe(false);
    expect(reloaded.draft).toEqual({ processReflection: "", protocolDeviations: "" });
  });

  test("serialises autosave and pre-pause flush and retains text typed during a save", async () => {
    const writes: Array<{ expectedUpdatedAt: string; processReflection: string }> = [];
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const process = new SessionProcessSave(record(), async (input) => {
      writes.push(input);
      if (writes.length === 1) await first;
      return { sessionId: input.sessionId, updatedAt: writes.length === 1 ? t1 : t2 };
    });
    process.edit({ processReflection: "First edit" });
    const autosave = process.flush();
    await Promise.resolve();
    process.edit({ processReflection: "Latest edit", protocolDeviations: "A justified change" });
    const beforePause = process.flush();
    expect(writes).toHaveLength(1);
    release();
    expect(await autosave).toBe(true);
    expect(await beforePause).toBe(true);
    expect(writes).toHaveLength(2);
    expect(writes[1].expectedUpdatedAt).toBe(t1);
    expect(writes[1].processReflection).toBe("Latest edit");
    expect(process.dirty).toBe(false);
    expect(process.draft.protocolDeviations).toBe("A justified change");
  });

  test("one guarded flush drains edits made during both the first and second request", async () => {
    const writes: Array<{ expectedUpdatedAt: string; processReflection: string }> = [];
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    let secondStarted!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const secondRequest = new Promise<void>((resolve) => {
      secondStarted = resolve;
    });
    const process = new SessionProcessSave(record(), async (input) => {
      writes.push(input);
      const number = writes.length;
      if (number === 1) await first;
      if (number === 2) {
        secondStarted();
        await second;
      }
      return {
        sessionId: input.sessionId,
        updatedAt: number === 1 ? t1 : number === 2 ? t2 : "2026-10-07T12:00:00.000004Z",
      };
    });
    process.edit({ processReflection: "A" });
    const completionGuard = process.flush();
    let guardFinished = false;
    void completionGuard.then(() => {
      guardFinished = true;
    });
    await Promise.resolve();
    process.edit({ processReflection: "B", protocolDeviations: "New deviation B" });
    releaseFirst();
    await secondRequest;
    expect(guardFinished).toBe(false);
    expect(writes[1].processReflection).toBe("B");
    process.edit({ processReflection: "C", protocolDeviations: "Latest deviation C" });
    releaseSecond();
    expect(await completionGuard).toBe(true);
    expect(writes.map((write) => write.processReflection)).toEqual(["A", "B", "C"]);
    expect(writes.map((write) => write.expectedUpdatedAt)).toEqual([t0, t1, t2]);
    expect(process.dirty).toBe(false);
    expect(process.saved.processReflection).toBe("C");
    expect(process.saved.protocolDeviations).toBe("Latest deviation C");
  });

  for (const errorMessage of ["temporary failure", "SCP_IV_SESSION_PROCESS_STALE"]) {
    test(`one guarded flush blocks completion and keeps the newer draft if drain fails: ${errorMessage}`, async () => {
      let release!: () => void;
      const first = new Promise<void>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      const process = new SessionProcessSave(record(), async (input) => {
        calls += 1;
        if (calls === 1) {
          await first;
          return { sessionId: input.sessionId, updatedAt: t1 };
        }
        throw new Error(errorMessage);
      });
      process.edit({ processReflection: "A" });
      const completionGuard = process.flush();
      await Promise.resolve();
      process.edit({ processReflection: "B", protocolDeviations: "Unsaved deviation B" });
      release();
      expect(await completionGuard).toBe(false);
      expect(process.saved.processReflection).toBe("A");
      expect(process.draft.processReflection).toBe("B");
      expect(process.draft.protocolDeviations).toBe("Unsaved deviation B");
      expect(process.dirty).toBe(true);
      expect(process.conflict).toBe(errorMessage === "SCP_IV_SESSION_PROCESS_STALE");
    });
  }

  test("failed writes retain both drafts and retry uses the unchanged concurrency token", async () => {
    const versions: string[] = [];
    const process = new SessionProcessSave(record(), async (input) => {
      versions.push(input.expectedUpdatedAt);
      if (versions.length === 1) throw new Error("temporary failure");
      return { sessionId: input.sessionId, updatedAt: t1 };
    });
    process.edit({ processReflection: "Unsaved reflection", protocolDeviations: "Unsaved change" });
    expect(await process.flush()).toBe(false);
    expect(process.dirty).toBe(true);
    expect(process.conflict).toBe(false);
    expect(process.draft.processReflection).toBe("Unsaved reflection");
    expect(await process.flush()).toBe(true);
    expect(versions).toEqual([t0, t0]);
    expect(process.error).toBeNull();
  });

  test("another tab cannot be overwritten; explicit reload is required after conflict", async () => {
    let calls = 0;
    const process = new SessionProcessSave(record(), async (input) => {
      calls += 1;
      if (input.expectedUpdatedAt === t0) throw new Error("SCP_IV_SESSION_PROCESS_STALE");
      return { sessionId: input.sessionId, updatedAt: t2 };
    });
    process.edit({ processReflection: "This tab's draft" });
    process.reconcile(record(t1, "Other tab's reflection", "Other tab's change"));
    expect(process.updatedAt).toBe(t0);
    expect(process.draft.processReflection).toBe("This tab's draft");
    expect(await process.flush()).toBe(false);
    expect(process.conflict).toBe(true);
    expect(await process.flush()).toBe(false);
    expect(calls).toBe(1);
    process.takeStored(record(t1, "Other tab's reflection", "Other tab's change"));
    expect(process.conflict).toBe(false);
    expect(process.draft.processReflection).toBe("Other tab's reflection");
    process.edit({ protocolDeviations: "Reconciled change" });
    expect(await process.flush()).toBe(true);
  });

  test("a clean read adopts a newer phase/pause version, including microseconds, and ignores stale reads", async () => {
    const versions: string[] = [];
    const process = new SessionProcessSave(record(), async (input) => {
      versions.push(input.expectedUpdatedAt);
      return { sessionId: input.sessionId, updatedAt: t2 };
    });
    process.reconcile(record(t1));
    process.reconcile(record(t0, "stale read"));
    expect(process.updatedAt).toBe(t1);
    expect(process.draft.processReflection).toBe("Saved reflection");
    process.edit({ processReflection: "After resume" });
    expect(await process.flush()).toBe(true);
    expect(versions).toEqual([t1]);
  });
});

const context = (link: LinkState): InterviewContextResult => ({
  kind: "context",
  context: {
    version: "icb-v1",
    link,
    reads: {
      application: link === "linkedUnreadable" ? "failed" : "ok",
      job: "absent",
      cv: "absent",
      assessment: "absent",
    },
    candidateName: "Synthetic",
    roleSv: null,
    roleEn: null,
    applicationStatus: null,
    appliedAt: null,
    cvPresence: "none",
    cvSubmittedAt: null,
    assessmentReleasedAt: null,
    assessmentPending: false,
    requirements: [],
    known: [],
    followUps: [],
  },
});

describe("truthful background and opening copy", () => {
  for (const lang of ["sv", "en"] as const) {
    const render = (node: React.ReactNode) =>
      renderToStaticMarkup(<I18nProvider initialLang={lang}>{node}</I18nProvider>);
    test(`${lang}: live application and saved sources remain separate`, () => {
      const live = render(
        <CandidateBackgroundStatus
          result={context("linked")}
          isLoading={false}
          savedSourceCount={0}
        />,
      );
      expect(live).toContain(
        lang === "sv" ? "Tillgängliga ansökningsuppgifter" : "Available application information",
      );
      expect(live).toContain(lang === "sv" ? "inte automatiskt" : "not automatically");
      const saved = render(
        <CandidateBackgroundStatus
          result={context("standalone")}
          isLoading={false}
          savedSourceCount={2}
        />,
      );
      expect(saved).toContain(lang === "sv" ? "2 källor" : "2 sources");
      expect(saved).toContain(lang === "sv" ? "fristående" : "standalone");
    });
    test(`${lang}: failed/refused reads never claim absence`, () => {
      for (const result of [
        context("linkedUnreadable"),
        { kind: "caseReadFailed" },
        { kind: "caseNotFoundOrRefused" },
      ] as InterviewContextResult[]) {
        const rendered = render(
          <CandidateBackgroundStatus result={result} isLoading={false} savedSourceCount={0} />,
        );
        expect(rendered).toContain(lang === "sv" ? "kunde inte läsas" : "could not be read");
        expect(rendered).not.toContain(
          lang === "sv" ? "Intervjun är fristående" : "This is a standalone interview",
        );
      }
      const loading = render(
        <CandidateBackgroundStatus result={undefined} isLoading={true} savedSourceCount={0} />,
      );
      expect(loading).toContain(lang === "sv" ? "kontrolleras" : "being checked");
    });
    test(`${lang}: actual preparation and recording are disclosed separately`, () => {
      const manual = render(<InterviewOpeningDisclosure aiUsed={false} />);
      const ai = render(<InterviewOpeningDisclosure aiUsed={true} />);
      expect(manual).toContain(lang === "sv" ? "AI användes inte" : "AI was not used");
      expect(ai).toContain(lang === "sv" ? "AI användes för" : "AI was used to");
      for (const rendered of [manual, ai]) {
        expect(rendered).toContain(
          lang === "sv"
            ? "Ingen inspelning eller transkribering startas"
            : "No recording or transcription is started",
        );
      }
    });
  }
});
