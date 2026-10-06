import { createHash } from "node:crypto";
// Private authoring engine. Only import from server handlers or offline tooling.
import {
  FAMILIES,
  cellSchema,
  questionSchema,
  type Atom,
  type Cell,
  type Family,
  type Question,
} from "./types";
export type Item = {
  question: Question;
  family: Family;
  templateId: string;
  templateVersion: string;
  generatorVersion: string;
  seed: number | string;
  variant: number;
  designDifficulty: number;
  observedDifficulty: null;
  key: string;
  explanation: { sv: string; en: string };
  strategies: Record<string, string>;
  engineeringReview: string;
  ownerApproval: null;
};
export function rng(seed: number | string) {
  if (typeof seed === "string") {
    let counter = 0;
    return () =>
      createHash("sha256").update(`${seed}:${counter++}`).digest().readUInt32BE() / 4294967296;
  }
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = Math.imul(n ^ (n >>> 15), n | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mod = (n: number, m: number) => ((n % m) + m) % m;
const fills: Atom["fill"][] = ["outline", "solid", "striped"];
const shapes: Atom["shape"][] = ["circle", "square", "triangle"];
function atom(p: number, overrides: Partial<Atom> = {}): Atom {
  return {
    shape: "arrow",
    position: p,
    rotation: 0,
    fill: "outline",
    reflected: false,
    ...overrides,
  };
}
export function structuralHash(cell: Cell): string {
  const canonical = [...cell]
    .sort((a, b) => a.position - b.position)
    .map((a) => [a.shape, a.position, a.rotation, a.fill, a.reflected]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
// Render equivalences: circle rotation/reflection; square quarter turns; triangle
// only reflection about its vertical axis. Arrows/flags deliberately asymmetric.
export function visualHash(cell: Cell): string {
  return structuralHash(
    cell.map((a) => ({
      ...a,
      rotation: a.shape === "circle" ? 0 : a.shape === "square" ? a.rotation % 2 : a.rotation,
      reflected:
        a.shape === "circle" || a.shape === "square" || a.shape === "triangle"
          ? false
          : a.reflected,
    })),
  );
}
export function step(cell: Cell, family: Family, variant: number): Cell {
  return cell.map((a) => {
    switch (family) {
      case "rotation":
        return { ...a, rotation: mod(a.rotation + (variant % 2 ? 2 : 1), 8) };
      case "position":
        return { ...a, position: mod(a.position + 1, 9) };
      case "shape":
        return { ...a, shape: shapes[mod(shapes.indexOf(a.shape) + 1, 3)] };
      case "fill":
        return { ...a, fill: fills[mod(fills.indexOf(a.fill) + 1, 3)] };
      case "reflection":
        return { ...a, reflected: !a.reflected };
      case "alternation":
        return {
          ...a,
          fill: a.fill === "solid" ? "outline" : "solid",
          rotation: mod(a.rotation + 2, 8),
        };
      case "compound":
        return variant % 2 === 0
          ? {
              ...a,
              rotation: mod(a.rotation + 1, 8),
              fill: fills[mod(fills.indexOf(a.fill) + 1, 3)],
            }
          : { ...a, position: mod(a.position + 1, 9) };
      default:
        return a;
    }
  });
}
function advance(cell: Cell, family: Family, variant: number): Cell {
  const c = step(cell, family, variant);
  if (family === "quantity" || (family === "compound" && variant % 2 === 1)) {
    const occupied = new Set(c.map((a) => a.position));
    const p = Array.from({ length: 9 }, (_, i) => i).find((i) => !occupied.has(i))!;
    return [...c, atom(p, { shape: "circle", fill: c[0].fill })];
  }
  return c;
}
const explanations: Record<Family, [string, string]> = {
  rotation: [
    "Figuren vrids lika mycket för varje steg åt höger. Samma regel gäller i alla tre rader.",
    "The figure turns by the same angle at each step to the right, in all three rows.",
  ],
  quantity: [
    "En figur läggs till för varje steg åt höger, på den första lediga platsen.",
    "One figure is added at each step to the right, at the first empty position.",
  ],
  position: [
    "Figuren flyttas en plats framåt i rutnätets läsordning för varje steg åt höger.",
    "The figure moves one position forward in reading order at each step to the right.",
  ],
  shape: [
    "Formerna följer cykeln cirkel, kvadrat, triangel och sedan cirkel igen.",
    "Shapes follow the cycle circle, square, triangle, then circle again.",
  ],
  fill: [
    "Utseendet följer cykeln kontur, fylld, randig och sedan kontur igen.",
    "Appearance follows the cycle outline, solid, striped, then outline again.",
  ],
  reflection: [
    "Flaggans orientering speglas för varje steg åt höger; i varje rad är första och tredje rutan lika.",
    "The flag orientation is reflected at each step to the right; the first and third cells match in every row.",
  ],
  distribution: [
    "Varje rad och kolumn innehåller var och en av de tre formerna exakt en gång.",
    "Each row and column contains each of the three shapes exactly once.",
  ],
  superposition: [
    "Den tredje rutan kombinerar de två första: alla upptagna platser behålls, en gång var.",
    "The third cell combines the first two: all occupied positions are kept, once each.",
  ],
  alternation: [
    "Figuren vrids ett kvarts varv samtidigt som fylld och ofylld växlar.",
    "The figure turns a quarter turn while solid and outline alternate.",
  ],
  compound: [
    "Två regler gäller samtidigt: vridning och fyllning, eller ökat antal och förflyttning.",
    "Two rules apply together: rotation and fill, or increasing quantity and movement.",
  ],
};
function union(a: Cell, b: Cell): Cell {
  return [...new Map([...a, ...b].map((x) => [x.position, x])).values()].sort(
    (a, b) => a.position - b.position,
  );
}
export function generateItem(family: Family, seed: number | string, variant = 0): Item {
  const random = rng(seed);
  const base = Math.floor(random() * 8);
  const start = Math.floor(random() * 7);
  const fill = fills[Math.floor(random() * 3)];
  const rows: Cell[] = [];
  for (let r = 0; r < 3; r++) {
    let first: Cell = [atom(mod(start + r * 2, 9), { rotation: mod(base + r, 8), fill })];
    if (family === "quantity" || (family === "compound" && variant % 2 === 1))
      first = Array.from({ length: r + 1 }, (_, i) =>
        atom(mod(start + i, 9), { shape: "circle", fill }),
      );
    if (family === "shape" || family === "distribution")
      first = [atom(4, { shape: shapes[mod(r + variant, 3)], rotation: 0, fill })];
    if (family === "alternation")
      first = first.map((a) => ({ ...a, fill: variant % 2 === 0 ? "outline" : "solid" }));
    if (family === "shape") first = [{ ...first[0], position: mod(start + r, 9) }];
    if (family === "reflection")
      first = [atom(4, { shape: "flag", rotation: base, fill, reflected: r % 2 === 1 })];
    if (family === "distribution")
      rows.push(
        first,
        [{ ...first[0], shape: shapes[mod(r + variant + 1, 3)] }],
        [{ ...first[0], shape: shapes[mod(r + variant + 2, 3)] }],
      );
    else if (family === "superposition") {
      first = [
        atom(mod(start + r, 9), { shape: "circle", fill }),
        atom(mod(start + r + 2, 9), { shape: "circle", fill }),
      ];
      const second = [
        atom(mod(start + r + 2, 9), { shape: "circle", fill }),
        atom(mod(start + r + 4 + (variant % 2), 9), { shape: "circle", fill }),
      ];
      rows.push(first, second, union(first, second));
    } else {
      const second = advance(first, family, variant);
      rows.push(first, second, advance(second, family, variant));
    }
  }
  const answer = rows[8];
  const distractors: { cell: Cell; strategy: string }[] = [];
  const seen = new Set([visualHash(answer)]);
  const add = (cell: Cell, strategy: string) => {
    const h = visualHash(cell);
    if (!seen.has(h)) {
      seen.add(h);
      distractors.push({ cell, strategy });
    }
  };
  add(rows[7], "previous_state");
  add(rows[6], "two_steps_omitted");
  for (let n = 1; n <= 8; n++) {
    add(
      answer.map((a) => ({ ...a, rotation: mod(a.rotation + n, 8) })),
      "wrong_rotation",
    );
    add(
      answer.map((a) => ({ ...a, position: mod(a.position + n, 9) })),
      "wrong_position",
    );
    add(
      answer.map((a) => ({ ...a, fill: fills[mod(fills.indexOf(a.fill) + n, 3)] })),
      "wrong_fill",
    );
    if (answer.length > 1)
      add(answer.slice(0, n % answer.length), "incomplete_superposition_or_quantity");
  }
  if (distractors.length < 5) throw new Error("SENTINEL_DISTRACTORS_EXHAUSTED");
  const options = [{ cell: answer, strategy: "key" }, ...distractors.slice(0, 5)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const id =
    "q-" +
    createHash("sha256")
      .update(`sentinel-1.0.0:${family}:${seed}:${variant}`)
      .digest("hex")
      .slice(0, 32);
  const key = `o${options.findIndex((o) => o.strategy === "key")}`;
  const question: Question = {
    id,
    matrix: [...rows.slice(0, 8), null],
    options: options.map((o, i) => ({ id: `o${i}`, cell: o.cell })),
  };
  const item: Item = {
    question,
    family,
    seed,
    variant,
    templateId: `sentinel-${family}`,
    templateVersion: "1.0.0",
    generatorVersion: "1.0.0",
    key,
    designDifficulty:
      family === "compound"
        ? 4
        : family === "superposition" || family === "alternation"
          ? 3
          : family === "distribution"
            ? 2
            : 1,
    observedDifficulty: null,
    explanation: { sv: explanations[family][0], en: explanations[family][1] },
    strategies: Object.fromEntries(options.map((o, i) => [`o${i}`, o.strategy])),
    engineeringReview: "automatic-consistency-passed; visual review pending",
    ownerApproval: null,
  };
  validateItem(item);
  return item;
}
// Independent constraint checker: derives relation from observed row pairs,
// rather than calling advance() or copying the generated answer.
export function expectedCell(item: Item, row: number): Cell {
  const a = item.question.matrix[row * 3]!;
  const b = item.question.matrix[row * 3 + 1]!;
  if (item.family === "superposition") return union(a, b);
  if (item.family === "distribution")
    return [{ ...a[0], shape: shapes.find((s) => s !== a[0].shape && s !== b[0].shape)! }];
  if (item.family === "quantity" || (item.family === "compound" && item.variant % 2 === 1)) {
    const c = b.map((x) => ({
      ...x,
      position: item.family === "compound" ? mod(x.position + 1, 9) : x.position,
    }));
    const p = Array.from({ length: 9 }, (_, i) => i).find((p) => !c.some((x) => x.position === p))!;
    return [...c, atom(p, { shape: "circle", fill: b[0].fill })];
  }
  return b.map((x, i) => {
    const prev = a[i];
    return {
      ...x,
      rotation: mod(x.rotation + mod(x.rotation - prev.rotation, 8), 8),
      position: mod(x.position + mod(x.position - prev.position, 9), 9),
      shape:
        item.family === "shape"
          ? shapes[
              mod(
                shapes.indexOf(x.shape) +
                  mod(shapes.indexOf(x.shape) - shapes.indexOf(prev.shape), 3),
                3,
              )
            ]
          : x.shape,
      fill:
        item.family === "alternation"
          ? x.fill === prev.fill
            ? x.fill
            : prev.fill
          : fills[
              mod(
                fills.indexOf(x.fill) + mod(fills.indexOf(x.fill) - fills.indexOf(prev.fill), 3),
                3,
              )
            ],
      reflected: x.reflected === prev.reflected ? x.reflected : prev.reflected,
    };
  });
}
export function validateItem(item: Item) {
  questionSchema.parse(item.question);
  for (const cell of [
    ...item.question.matrix.filter((x): x is Cell => x !== null),
    ...item.question.options.map((o) => o.cell),
  ]) {
    cellSchema.parse(cell);
    if (new Set(cell.map((a) => a.position)).size !== cell.length)
      throw new Error("SENTINEL_OVERLAP");
  }
  for (let r = 0; r < 2; r++)
    if (visualHash(expectedCell(item, r)) !== visualHash(item.question.matrix[r * 3 + 2]!))
      throw new Error("SENTINEL_ROW_RULE");
  const expected = visualHash(expectedCell(item, 2));
  const matches = item.question.options.filter((o) => visualHash(o.cell) === expected);
  if (matches.length !== 1 || matches[0].id !== item.key) throw new Error("SENTINEL_AMBIGUOUS_KEY");
  if (new Set(item.question.options.map((o) => visualHash(o.cell))).size !== 6)
    throw new Error("SENTINEL_DUPLICATE_OPTIONS");
  if (item.family === "distribution")
    for (let c = 0; c < 3; c++) {
      const cells = [
        item.question.matrix[c]!,
        item.question.matrix[c + 3]!,
        c === 2 ? matches[0].cell : item.question.matrix[c + 6]!,
      ];
      if (new Set(cells.map((x) => x[0].shape)).size !== 3) throw new Error("SENTINEL_COLUMN_RULE");
    }
}
export function createBank(rootSeed: number | string = 1000): Item[] {
  const bank: Item[] = [];
  const seen = new Set<string>();
  for (const [i, f] of FAMILIES.entries())
    for (let v = 0; v < 4; v++) {
      let accepted = false;
      for (let retry = 0; retry < 200; retry++) {
        const item = generateItem(
          f,
          typeof rootSeed === "number"
            ? rootSeed + i * 101 + v * 17 + retry * 7919
            : `${rootSeed}:${i}:${v}:${retry}`,
          v,
        );
        const hash = JSON.stringify([
          item.question.matrix,
          item.question.options.map((o) => visualHash(o.cell)).sort(),
        ]);
        if (!seen.has(hash)) {
          seen.add(hash);
          bank.push(item);
          accepted = true;
          break;
        }
      }
      if (!accepted) throw new Error("SENTINEL_DUPLICATE_BANK_RETRIES_EXHAUSTED");
    }
  return bank;
}
export function pilotForm(rootSeed: number | string = 1000): Item[] {
  return createBank(rootSeed)
    .filter((i) => i.variant < 2)
    .sort(
      (a, b) =>
        a.designDifficulty - b.designDifficulty ||
        FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family) ||
        a.variant - b.variant,
    );
}
export function practiceItems(): Item[] {
  return [
    generateItem("rotation", 71),
    generateItem("fill", 83),
    generateItem("superposition", 97),
  ];
}
