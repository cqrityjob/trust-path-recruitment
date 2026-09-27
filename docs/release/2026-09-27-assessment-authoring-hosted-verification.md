# Produktionsverifiering efter schema-PR #309

Verifierat med enbart läsningar via Supabase-anslutningen på den kanoniska databasen `wrygicdfxwjnrugduxnt`, 2026-09-27 kl. 17:16:34 UTC. PR #309 är mergad som `80e63d0bdf37c6a09f5f341300eacdbf62bdc37a`. Att migrationen är tillämpad är observerat i databasen, inte härlett enbart från merge.

## Observerat

- Migrationsregistret innehåller `20261219090000 / assessment_draft_authoring`, 12 SQL-satser. Alla tidigare 321 versions-/namnpar är oförändrade; det uppdaterade `supabase/hosted-ledger.json` innehåller 322 rader.
- `scp_assessment_versions.authoring_release_required` är `boolean NOT NULL DEFAULT false`.
- `scp_authoring_release_guard` är aktiv (`O`), BEFORE UPDATE per rad på `scp_assessment_versions`.
- `scp_authored_assignment_guard` är aktiv (`O`), BEFORE INSERT per rad på `assessment_assignments`.
- Alla fyra funktioners `md5(prosrc)` är identiska med respektive dollar-citerad funktionskropp i den granskade migrationen. Samtliga ägs av `postgres` och har `search_path=public, pg_temp`.

| Funktion | MD5 av funktionskroppen | SECURITY DEFINER | anon EXECUTE | authenticated EXECUTE |
| --- | --- | --- | --- | --- |
| `scp_author_assessment_draft` | `da9b0628c062f377b25ee530382d722d` | ja | nej | ja |
| `scp_employer_content_library` | `46e8f3ed2f202bbdd09f4a7ffe4b5010` | ja | nej | ja |
| `scp_guard_authored_assignment` | `f758813a967a1c4c8462f926357b5df1` | ja | nej | nej |
| `scp_guard_authoring_release` | `a1a747dd6a6945c49c938038ef6f3119` | nej | nej | nej |

Författarfunktionen behåller sin kontroll av `auth.uid()` och `scp_can_author`. Versionsspärren finns både i bibliotekets tillgänglighet och i tilldelningstriggern. Identiska funktionskroppar, aktiv kolumn och aktiva triggers binder produktionsschemat till de tidigare 14 isolerade databasproven, inklusive nekat kringgående av spärren. Inga skrivande beteendeprov har körts i produktion.

## Ändringen i #310

`release-state.json` ändras från `pending` till `applied` med ovanstående evidens, den fullständiga lästa migrationslistan ersätter den tidigare snapshoten och migrationen tas bort från `expectedPending`. Själva schema-first-kontrollen och dess negativa kontroller ändras inte. Den redan mergade main-grenen förs in med en vanlig merge utan omskriven historik.

Denna uppföljning kör ingen migration och ändrar inga konton, roller, tilldelningar eller testinnehåll i produktion. Administrationsgränssnittets merge och publicering ingår inte.
