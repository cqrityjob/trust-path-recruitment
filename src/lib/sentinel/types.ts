import { z } from "zod";
export const FAMILIES = [
  "rotation",
  "quantity",
  "position",
  "shape",
  "fill",
  "reflection",
  "distribution",
  "superposition",
  "alternation",
  "compound",
] as const;
export type Family = (typeof FAMILIES)[number];
export const atomSchema = z.object({
  shape: z.enum(["arrow", "circle", "square", "triangle", "flag"]),
  position: z.number().int().min(0).max(8),
  rotation: z.number().int().min(0).max(7),
  fill: z.enum(["outline", "solid", "striped"]),
  reflected: z.boolean(),
});
export const cellSchema = z.array(atomSchema).max(9);
export type Atom = z.infer<typeof atomSchema>;
export type Cell = z.infer<typeof cellSchema>;
export const questionSchema = z.object({
  id: z.string(),
  matrix: z.array(cellSchema.nullable()).length(9),
  options: z.array(z.object({ id: z.string(), cell: cellSchema })).length(6),
});
export type Question = z.infer<typeof questionSchema>;
export type SentinelReport = {
  version: string;
  status: string;
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
  elapsedSeconds: number;
  finishedAt: string;
  durationSeconds: number;
  accommodation: boolean;
};
export type Session = {
  attemptId: string;
  language: "sv" | "en";
  version: string;
  status: "ready" | "running" | "completed" | "timed_out" | "abandoned";
  durationSeconds: number;
  deadline: string | null;
  serverNow: string;
  revision: number;
  answers: Record<string, string>;
  questions: Question[];
  report: SentinelReport | null;
  reportVisible: boolean;
};
export const SENTINEL_SLUG = "abstract_reasoning_v1";
export const TITLE = {
  sv: "Sentinel – abstrakt problemlösning",
  en: "Sentinel – Abstract Reasoning",
};
