# #462: första fel och terminalt omförsök på samma huvud

Huvud `398862f2ef264d369451d5a7c38d0df672b4fdb7`, [CI 37787703129](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37787703129). Normal merge efter terminal grön kontroll gav main `6d92056e555d513840f94c2c4993c6801d1aa11d` 2026-10-08 14:48:33 UTC. Produkt-SRC och migrationer ändrades inte i denna bokförings-PR.

[Första försöket](attempt1-readback.json), SHA256 `6869a602b1beed52ec9f6e287929464d55e03b7760d832fdfdb55a422522ed0a`, bevarar PG16-jobb 113347338449:s registry `Rate exceeded`-FAIL. Sju andra corejobb passerade. Delvis genomförd historik är inte ett fullständigt databas-PASS.

[Terminalt försök 2](attempt2-readback.json), SHA256 `9bbbdf0ec82a175641965da871c19004a2a9814eda745bc545855bf8bc6f7907`, bevarar den enda avgränsade ägaromkörningen av det felande jobbet på samma SHA. Nytt PG16-jobb 113361345106 passerade med PostgreSQL 16.15, 387 migrationer, 41 upload-journal-, 95 P1-, 56 P0- och 94 snapshotassertions, 28 riktiga PostgREST 14.15-domänkontroller samt 51 historiska rollbackkontroller. Icke-tom journal och adopterad snapshot stoppar rollback utan att kasta data. Alla åtta corejobb var terminalt SUCCESS; övriga registrerade workflows kontrollerades före merge.

Detta är ett CI-/historikbevis. Riktig isolerad GoTrue/Storage, hosted runtime, innehållsgodkännande och fysisk telefon har separata bevis och grindar. Det första felet skrivs inte om av det senare resultatet. En grön lintjobbsstatus upphäver inte repositoryts dokumenterade lintbaslinje.
