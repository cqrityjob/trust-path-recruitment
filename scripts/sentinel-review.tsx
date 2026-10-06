/** Offline private review of the exact imported form. Never publish this output. */
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Matrix, Options } from "../src/components/sentinel/Figure";
import type { Item } from "../src/lib/sentinel/engine.server";
const [input, output] = process.argv.slice(2);
if (!input || !output || [input, output].some((p) => resolve(p).startsWith(process.cwd() + "/")))
  throw new Error("Use private paths outside the public checkout: input.sql output.html");
const content = readFileSync(input, "utf8").split("$private_content$")[1];
const form = JSON.parse(content) as { bank: Item[]; items: Item[]; practice: Item[] };
const html = renderToStaticMarkup(
  <html lang="sv">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Sentinel · privat innehållsgranskning</title>
      <style>{`
*{box-sizing:border-box}body{margin:0;background:#edf5fc;color:#101b30;font:16px/1.5 system-ui,sans-serif}main{max-width:940px;margin:auto;padding:28px}header{margin-bottom:28px}article{padding:26px;background:white;border:1px solid #d5dfe9;border-radius:16px;margin:24px 0;break-inside:avoid}h1{font-size:30px}h2{font-size:20px}p{max-width:780px}svg{width:100%;height:100%;display:block;color:#101b30}.grid{display:grid;gap:8px}.grid-cols-3{grid-template-columns:repeat(3,1fr)}[aria-label="Matris med nio rutor"]{max-width:390px;margin:16px auto;padding:12px;border:1px solid #d5dfe9;border-radius:14px}[aria-label="Matris med nio rutor"]>div{aspect-ratio:1;border:1px solid #d5dfe9;border-radius:8px;background:#fafbfc}fieldset{border:0;padding:0;margin:20px 0}fieldset .grid{grid-template-columns:repeat(6,1fr);gap:10px}fieldset label{display:block;border:2px solid #d5dfe9;border-radius:10px;padding:8px}fieldset label:has(input:checked){border-color:#076bac;background:#edf5fc}fieldset label>div{aspect-ratio:1}fieldset label span{display:block;text-align:center}input[type=radio]{position:absolute;clip-path:inset(100%);width:1px;height:1px;overflow:hidden}legend{margin-bottom:10px}details{font-size:13px}code{overflow-wrap:anywhere}.status{padding:14px;background:#fff4d8;border-radius:8px}li{margin:8px 0}@media(max-width:600px){main{padding:12px}article{padding:14px}fieldset .grid{grid-template-columns:repeat(3,1fr)}}@media print{body{background:white}details{display:none}}
`}</style>
    </head>
    <body>
      <main>
        <header>
          <h1>Sentinel – abstrakt problemlösning</h1>
          <p>
            Privat originalbank · 40 kandidatuppgifter · 20 föreslagna testuppgifter · 3 separata
            övningar. Inga externa testuppgifter har återanvänts.
          </p>
          <p className="status">
            Ägarens innehållsgodkännande: väntar. Integritets- och retentionbeslut: väntar.
            Automatisk konsistens är kontrollerad; det är inte psykometrisk validering.
          </p>
          <ul>
            <li>
              Bedöm om hela matrisen har en tydlig, konsekvent regel och ett entydigt alternativ.
            </li>
            <li>
              Kontrollera alternativa rimliga tolkningar, distraktorer, storlek, kontrast och mobil.
            </li>
            <li>Granska SV/EN och instruktioner, resultatbegränsningar samt användning i pilot.</li>
            <li>
              Markera ändringar och godkännande per uppgift i separat ägargranskning innan release.
            </li>
          </ul>
        </header>
        {[...form.bank, ...form.practice].map((item, index) => {
          const n = form.items.findIndex((i) => i.question.id === item.question.id);
          return (
            <article key={item.question.id}>
              <h2>
                {index < 40
                  ? `Bank ${index + 1} · ${item.family} · ${n >= 0 ? `föreslagen testuppgift ${n + 1}` : "reserv, ej vald"}`
                  : `Övning ${index - 39} · ${item.family}`}
              </h2>
              <Matrix question={item.question} sv />
              <Options
                question={item.question}
                sv
                selected={item.key}
                disabled
                onSelect={() => {}}
              />
              <p>
                <b>SV: </b>
                {item.explanation.sv}
              </p>
              <p>
                <b>EN: </b>
                {item.explanation.en}
              </p>
              <p>
                Designsvårighet: {item.designDifficulty}. Observerad svårighet: ej mätt.
                Ägargodkännande: väntar.
              </p>
              <details>
                <summary>Privat reproduktions- och distraktorprotokoll</summary>
                <code>
                  {JSON.stringify({
                    id: item.question.id,
                    template: item.templateId,
                    templateVersion: item.templateVersion,
                    generatorVersion: item.generatorVersion,
                    seed: item.seed,
                    variant: item.variant,
                    key: item.key,
                    strategies: item.strategies,
                    engineeringReview: item.engineeringReview,
                  })}
                </code>
              </details>
            </article>
          );
        })}
      </main>
    </body>
  </html>,
);
writeFileSync(output, "<!doctype html>" + html, { mode: 0o600 });
chmodSync(output, 0o600);
console.log(
  "Private review gallery prepared: 40 candidates and 3 separate practice items; approvals pending.",
);
