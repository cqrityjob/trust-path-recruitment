// stats.mjs [col] < numbers -> n, median, min, max, p95 (nearest-rank), IQR
const col = Number(process.argv[2] ?? 0);
const xs = require("fs").readFileSync(0, "utf8").trim().split("\n").map((l) => Number(l.split("\t")[col])).sort((a, b) => a - b);
const q = (p) => xs[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)];
const f = (x) => x.toFixed(0);
console.log(`n=${xs.length} median=${f(q(0.5))} min=${f(xs[0])} max=${f(xs.at(-1))} p95=${f(q(0.95))} IQR=${f(q(0.25))}-${f(q(0.75))} ms`);
