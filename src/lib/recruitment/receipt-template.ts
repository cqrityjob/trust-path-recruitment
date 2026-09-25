// The placeholders of an automatic receipt, rendered exactly as the
// database renders them (rec_render_receipt in 20261213090000): both
// languages' placeholders are accepted in either template, and an empty
// name takes its leading space with it, so "Hej {namn}!" becomes "Hej!".
//
// Pure, so the settings page's preview and the guard execute the same
// function -- and so what the preview shows is what a candidate gets.

export type ReceiptVariables = { name: string; job: string; company: string; link: string };

export function renderReceiptTemplate(template: string, v: ReceiptVariables): string {
  const name = v.name.trim();
  let out =
    name === ""
      ? template.replace(/\s*\{(namn|name)\}/g, "")
      : template.replace(/\{namn\}/g, name).replace(/\{name\}/g, name);
  out = out.replace(/\{tjänst\}/g, v.job).replace(/\{job\}/g, v.job);
  out = out.replace(/\{företag\}/g, v.company).replace(/\{company\}/g, v.company);
  out = out.replace(/\{länk\}/g, v.link).replace(/\{link\}/g, v.link);
  return out;
}
