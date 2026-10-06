// Offline original content import. Actual keys/seeds are private database data,
// never written into this public repository or into a frontend asset.
import { createBank, pilotForm, practiceItems } from "../src/lib/sentinel/engine.server";
import { writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const preview = args.includes("--preview");
const output = args[args.indexOf("--output") + 1];
if (!args.includes("--output") || !output)
  throw new Error("Use --output /private/path/content.sql; --preview is synthetic content only");
if (resolve(output).startsWith(process.cwd() + "/"))
  throw new Error("SENTINEL_PRIVATE_OUTPUT: content must be outside the public checkout");
const seed = preview ? 1000 : randomBytes(32).toString("hex");
const payload = JSON.stringify({
  bank: createBank(seed),
  items: pilotForm(seed),
  practice: practiceItems(),
});
const sql = `
DO $content_import$ DECLARE av uuid; form uuid; content jsonb := $private_content$${payload}$private_content$::jsonb;
BEGIN
 SELECT v.id,f.id INTO av,form FROM public.scp_assessment_versions v JOIN public.scp_assessment_definitions d ON d.id=v.definition_id JOIN public.scp_forms f ON f.assessment_version_id=v.id WHERE d.slug='abstract_reasoning_v1' AND v.version_number=1;
 IF av IS NULL THEN RAISE EXCEPTION 'SENTINEL_MIGRATION_REQUIRED'; END IF;
 INSERT INTO public.sentinel_forms(assessment_version_id,form_id,version,duration_seconds,bank,items,practice)
 VALUES(av,form,'sentinel-v1-a.${preview ? "preview" : randomUUID()}',1500,content->'bank',content->'items',content->'practice');
END $content_import$;
`;
writeFileSync(output, sql, { mode: 0o600 });
console.log(
  `Private ${preview ? "synthetic preview" : "proposed pilot"} import prepared: 40 candidates, 20 proposed items, 3 practice items. Owner approval pending.`,
);
