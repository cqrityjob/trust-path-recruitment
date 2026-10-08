# P1-schema6039: faktiskt95 SQL- och23 API-bevis

[CI37762014757](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37762014757),
jobb113260736669, passerade på huvud
`6039fbc685cad255aae4a4e39c1035e933af883d`.
Artefakt11543611221, ZIP-SHA256
`d35c5d0a97e45039bb3e0e24847dc2094d4fa6b8db1756d2825a0c0442b92c2b`.

Manifestets virtuella checkout0103cec37dd42451cf2aedb0455d3feeb769ca14
jämfördes via GitHub med6039: ahead1, files tom. De har samma testade Git-innehåll.
Manifest, fem loggar och verification.json ingår här. De fem faktiskt
inkluderade loggarnas byteantal och SHA256 matchar originalmanifestet exakt.
Två versionsloggar som manifestet listar följde inte med workflow-artefakten:
postgres-version.log och api-postgrest-version.log. Det är en bevarad
insamlinglucka; filerna har inte rekonstruerats och inget7/7-hashpåstående görs.

Utfört: full replay,95 SQL-assertions inklusive pgcrypto utanförpublic och
Unicode/NULL-hash, samtliga23 HTTP-assertions, 100 ansökningar med40/25/35,
27 granskade/73 återstående, global filtrering före pagination och två
samtidiga granskningar med200/409. Åtta precisa PT409-konflikter tog3,68–10,54ms.
Ändrad profil gav30/35/35 samt0 granskade/100 återstående; stale handoff
kopierade inget underlag. Databas-/rollbackjobben på PG16 och17 passerade
separat, men hela obligatoriska CI hade ännu väntande browserjobb vid avläsningen.

Auth och Storage är ersättningar i denna svit. Browser är avsiktligt not_run.
Detta är inte native GoTrue/Storage, publicerad runtime eller fysisk telefon.
080 är fortfarande pending och inte installerad hosted. Native100 #460 är
ett separat versionsbundet tjänsteprov; dess förstaB4-körning stoppade före
schema/Auth/Storage/browser och får inte ärva detta PASS.
