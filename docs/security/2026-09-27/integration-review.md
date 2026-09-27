# Kontroll före push och draft-PR

Kontrollerad 2026-09-27, efter uttryckligt godkännande att pusha enbart
`codex/security-rls-audit` och skapa draft-PR mot `main`. Godkännandet omfattar
inte merge, produktionsändring, publicering, ny kostnad eller ändrade integrationer.

| Yta                   | Observerat                                                                                                                                                                                   | Konsekvens för åtgärden                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GitHub                | Default branch `main`, auto-merge avstängt, repository public. Lokal branch utgår från `353f634c44c396ecea928a03e2127832a808142e`.                                                           | Explicit pushref endast säkerhetsbranchen; ingen main-push eller merge.                                   |
| GitHub Actions        | Åtta versionshanterade workflows granskade. PR-flöden kör statiska kontroller, build och isolerade lokala Supabase-/PostgreSQL-tester.                                                       | Draft-PR startar CI; ingen produktionsdeploy i dessa flöden.                                              |
| Schemalagda workflows | `recruitment-receipts-sweep.yml` och `regulatory-sources.yml` har endast schedule/workflow_dispatch.                                                                                         | De triggas inte av branchpush/PR och dispatchas inte.                                                     |
| Lokala Git hooks      | Ingen aktiv hook; `core.hooksPath` ej satt.                                                                                                                                                  | Ingen lokal deployhook identifierad.                                                                      |
| Supabase GitHub App   | Aktiv: check-run `108606100346` på main. Live `list_branches` visar en enda koppling: `git_branch=main`, `project_ref=wrygicdfxwjnrugduxnt`, `is_default=true`, status `FUNCTIONS_DEPLOYED`. | Produktionen är kopplad till main; säkerhetsbranchen har ingen databaskoppling.                           |
| Supabase preview      | PR #303:s head-check `108574083620` är skipped med meddelandet att Git-branchen saknar Supabase-branch. Organisationen är fortfarande `free`/`tier_free`.                                    | Ingen plan uppgraderas eller betald branch beställs. Följ checken på nya PR:n; en spärr ska lämnas orörd. |
| Lovable               | Projektets `latest_commit_sha` är exakt main `353f634…142e`. Projektet är published/ready; ingen agent kör. Den nya säkerhetsbranchen finns ännu bara lokalt.                                | Ingen branchväxling, bygg-/publiceringsbeställning eller instruktion till Lovable-agenten görs.           |

[Supabases integrationsdokumentation](https://supabase.com/docs/guides/deployment/branching/github-integration)
beskriver produktionsdeploy vid push/merge till den konfigurerade produktionsbranchen.
[Lovables dokumentation](https://docs.lovable.dev/integrations/github) beskriver
synk av endast den aktiva branchen. Dessa regler stämmer med observerad main-koppling.

**Begränsning:** connectorerna exponerar inte alla dashboardreglage, exempelvis
Supabases automatic branching/production deployment-toggle eller Lovables aktiva
branchfält. Godtyckliga administrativa GitHub-webhooks kunde inte inventeras med
connectorns behörigheter. Vi påstår därför inte en fullständig export av externa
integrationsinställningar. Det finns inget identifierat produktionsflöde för den
nya säkerhetsbranchen eller draft-PR:n. Ingen integration, betalplan, branchkoppling,
workflow eller spärrlogik har ändrats. Kontrollera efter push att main/Lovable-head och
Supabase-branchlistan är oförändrade; CI får inte användas för produktionsmigration.

## Release-registret

`deploy-plan:check` upptäckte först att säkerhetsmigrationen saknade pending-post.
Posten registreras nu med verifiering och återställningsvillkor. Detta är ordinarie
releasebokföring, inte en lättnad av spärren eller ett produktionsgodkännande.
Den befintliga ledgersnapshoten har dessutom två äldre väntande innehållsmigrationer.
En framtida generell `supabase db push` skulle planera alla tre; säkerhets-PR:ns
godkännande innebär inte godkännande att applicera de andra två. Ingen push till
Supabase, ingen workflow_dispatch och ingen SQL-skrivning mot produktion utförs.

CI fångade även den explicita expectedPending-listan i release-frontier-check.
Samma enda migration registreras där enligt befintlig arbetsgång. Jämförelsen
kräver fortfarande exakt överensstämmelse; deploy-plan:gate avvisar fortfarande
release med väntande migrationer. Inga kontroller stängs av eller hoppas över.
