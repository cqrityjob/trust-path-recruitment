# Granskning av preview mot ursprungsuppdraget (read-only)

Status: Alla kodändringar pausade. Claude äger de tre RPC-typerna, startsidans tester och jobbannonsens tillbaka-navigation i separat PR. Astra: #301. Claude: #302. Denna granskning ändrar inga filer.

## Vad som är verifierat i preview (skärmdumpar 2026-09-27)

- Startsida SV desktop: rubrik "Din karriär och ditt säkerhetsarbete. På samma plats.", tre ingångar (Kom igång / Hitta jobb / För arbetsgivare), "Lediga jobb kan du läsa utan konto.", mörk Security Passport-panel med tydligt EXEMPEL-märkt innehåll och riktiga trust-states (Registrerat/Dokumenterat/Källbekräftat). Inga sidfel, ingen horisontell scroll.
- Arbetsgivarsektion med fem steg, sista steget "Ni fattar beslutet" (människan beslutar).
- Security Intelligence-sektion: uppgift/underlag/resultat/granskning, tydlig ansvarsfriskrivning.
- Kom-igång: tre steg för person och tre för arbetsgivare.
- FAQ: fem frågor inkl. verifiering och "Beslutar AI vem som anställs?". Inga priser; "Kontakta oss".
- Jobblista SV desktop/mobil: sök, fem filter, träffräknare, kort med roll, arbetsgivare, plats, anställningsform, yrkesområde och sista ansökningsdag.
- Jobbdetalj SV desktop: krav/meriter, arbetsgivarkort, "Logga in för att ansöka".

## Konkreta förbättringar som fortfarande saknas

1. Jobbkort: titeln "Säkerhetschef" bryts mitt i ordet utan bindestreck ("Säkerhetsc hef"). Ordbrytningen ska använda riktigstavningsbindestreck eller normal radbrytning.
2. Jobbdetalj: annonsens brödtext visar platshållaren "[Beskriv arbetsuppgifterna och arbetsplatsen]" rakt ut, och rubriken "Om rollen" upprepas i brödtexten. Överväg att dölja ofyllda mallfält eller rendera dem snyggare (gäller visning, inte data).
3. Jobblista mobil: filterpanelen fyller hela första skärmen innan träffarna. Fäll ihop filtren bakom en "Filter"-knapp på mobil.
4. Jobbkort/datakvalitet (ej design): arbetsgivarnamn "cqrityjob" och plats "göteborg" med liten bokstav; överväg versal-normalisering vid visning.
5. Startsida: hjältens knapprad har ojämn ikon-/textmellanrum på "Hitta jobb" (noterat tidigare, ej åtgärdat).
6. EN-versionen av startsidan ska återverifieras efter Claudes testrättning (tidigare flagga: home.ai.title kunde flaggas som oöversatt i CI-kollen).
7. Tillbaka-länken "Alla jobb" från annonsen bevarar inte sökfilter — ägs av Claudes PR, ingen egen rättning.

## Ej testbart utan inloggad session

- Ansökningsflödets retur till annonsen efter inloggning, ansökningsbekräftelse, delningsflöden. Kräver syntetiskt konto; rapporteras som gap, inte som fel.

## Nästa steg (efter att gemensam rättning mergats och synkats)

- Återuppta samordnat designuppdrag: punkterna 1–5 ovan, plus återverifiering SV/EN desktop+mobil.
- Säkerhetsfynden (tre katalogvarningar) förblir öppna. Ingen merge, publicering eller produktionsändring.
