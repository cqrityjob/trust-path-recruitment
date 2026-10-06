import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createBank,
  pilotForm,
  practiceItems,
  generateItem,
  validateItem,
  visualHash,
  structuralHash,
} from "../src/lib/sentinel/engine.server";
import { FAMILIES } from "../src/lib/sentinel/types";
const bank = createBank(),
  form = pilotForm();
assert.equal(bank.length, 40);
assert.equal(form.length, 20);
assert.equal(practiceItems().length, 3);
assert.deepEqual(bank, createBank());
assert.equal(new Set(form.map((x) => x.family)).size, 10);
assert(form.every((x, i) => !i || form[i - 1].designDifficulty <= x.designDifficulty));
assert(practiceItems().every((p) => !bank.some((i) => i.question.id === p.question.id)));
let checked = 0;
for (const f of FAMILIES)
  for (let seed = 1; seed <= 500; seed++)
    for (let variant = 0; variant < 4; variant++) {
      const i = generateItem(f, seed, variant);
      validateItem(i);
      assert.deepEqual(i, generateItem(f, seed, variant));
      checked++;
    }
for (let n = 0; n < 40; n++) {
  const seed = createHash("sha256").update(`private-seed-test:${n}`).digest("hex");
  const privateBank = createBank(seed);
  assert.deepEqual(privateBank, createBank(seed));
  assert.equal(privateBank.length, 40);
  for (const i of privateBank) {
    validateItem(i);
    assert.match(i.question.id, /^q-[a-f0-9]{32}$/);
    assert(!i.question.id.includes(seed));
    checked++;
  }
}
for (const i of form) {
  const duplicate = structuredClone(i);
  duplicate.question.options[0] = structuredClone(duplicate.question.options[1]);
  assert.throws(() => validateItem(duplicate));
  const key = structuredClone(i);
  key.key = "invalid";
  assert.throws(() => validateItem(key));
  const outside = structuredClone(i);
  outside.question.options[0].cell[0].position = 10;
  assert.throws(() => validateItem(outside));
  const row = structuredClone(i);
  row.question.matrix[2] = [];
  assert.throws(() => validateItem(row));
}
const circle = {
  shape: "circle",
  position: 4,
  rotation: 0,
  fill: "outline",
  reflected: false,
} as const;
assert.equal(visualHash([circle]), visualHash([{ ...circle, rotation: 2, reflected: true }]));
assert.notEqual(structuralHash([circle]), structuralHash([{ ...circle, rotation: 2 }]));
assert.notEqual(
  visualHash([{ ...circle, shape: "arrow" }]),
  visualHash([{ ...circle, shape: "arrow", rotation: 2 }]),
);
console.log(
  `PASS: ${checked} reproducible generated items; 40-bank/20-form/3-practice; negative controls, equivalences and geometry.`,
);
