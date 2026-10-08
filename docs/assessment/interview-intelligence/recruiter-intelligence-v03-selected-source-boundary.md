# P1: garanti för uttryckligen överfört förberedelsematerial

Granskad schema-SHA: `f2084a16dd058f1d78832cafc5d485bda3d3a81a`.

`rec_ri_transfer_requirements` skapar en separat sparad `employer_requirements`-textpost i målärendet efter ett uttryckligt kravval. Den innehåller källreferens/version, mänsklig anteckning, neutral fråga och nästa handling. Den kopierar inte hela original-CV:t och bekräftar inte intervjuevidens.

Den sparade textposten följer målärendets behörigheter och retention. Originalärendets senare ACL-ändring eller radering av originalkällan återkallar inte automatiskt denna redan uttryckligen överförda textkopia. Källradering/ändring invaliderar aktuell P1-bedömningsgrund och granskning; en ny överföring med den gamla bindningen avvisas. Privata anteckningar i P1 kräver alltid aktuell läsrätt till sitt ursprungsärende, även när originalet saknas eller ett offentligt Nej-svar används för kravstatus. Ny överföring får inte kringgå den kontrollen.

En aktuell, sakligt märkt klarläggandefråga eller tidigare mänsklig anteckning kan fortfarande väljas av en person som har rätt att läsa ursprungsärendet, även om originalkällan raderats; det gör inte ett saknat original till accepterad evidens eller grå kravstatus till grön. Påstå därför inte att originalradering förbjuder varje möjlig ny överföring.

Tillåtet produktpåstående: “Ändrad eller återkallad källa uppdaterar aktuell kravstatus och behovet av granskning. Uttryckligen sparat förberedelsematerial i ett intervjuärende följer det ärendets behörigheter och retention.”

Undvik påståendet att en återkallning omedelbart raderar alla tidigare valda kopior, fastställda rapporter, redan nedladdade bytes eller redan utfärdade signerade länkar. Om även valda kopior behöver raderas måste detta göras och följas upp genom respektive målärendes befintliga raderings-/retentionsflöde.

Utfört isolerat prov: sex kontroller via verkliga P1-/intervju-RPC:er, RLS och syntetiska konton. En medlem skapade målärendet; ägaren valde och överförde en privat anteckning. Efter att medlemmen förlorade ursprungsärendets läsrätt hade medlemmen fortsatt legitim läsrätt till målärendet och dess redan valda text. Efter `scp_iv_erase_source` blev aktuell P1-status grå och granskning inaktuell, ny överföring med gammal bindning avvisades, och målärendets befintliga text fanns kvar. Allt rullades tillbaka. Ingen hosted Auth/Storage- eller produktionsverifiering påstås.

Filer: `p1-selected-copy-check.sql`, `p1-selected-copy-check.log` i `/private/tmp/ri-live-20261008/`. Missing-case-regressionen i mandatory SQL89 använder en separat no-event-fixtur med riktiga snapshottriggers. Ordinarie DELETE av ett RPC-skapat ärende stoppas redan av befintlig append-only ärendehistorik; denna regel ändrades inte.
