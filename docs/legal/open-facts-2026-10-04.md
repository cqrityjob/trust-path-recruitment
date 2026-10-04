# Kvarstående faktauppgifter (2026-10-04)

Kort lista över det som texten inte kan fastställa av sig själv. Varje punkt säger var den behövs, var
den läses och vem som kan ge den. En punkt är klar först när uppgiften är ifylld i texten och vaktskriptet
(`bun run launch-legal:check`) har uppdaterats med den.

| # | Uppgift | Behövs i | Var den läses | Vem |
|---|---|---|---|---|
| 1 | **Bolagsadress** | Villkor (inledning), policy §1, biträdesavtalets parter. Dessutom sidfot och kontaktsida när adressen finns (leverantörens uppgifter ska synas på webbplatsen) | Bolagsverkets registrering | Ägaren |
| 2 | **Faktisk backuprotation** (antal dagar, dagliga kopior, eventuell återställning till tidpunkt) | Policy §9 (säkerhetskopior), biträdesavtalet punkt 10.2 | Supabase: Database, Backups | Ägaren |
| 3 | **Leverantörer**: exakt avtalspart, om biträdesavtal är accepterat (och när), driftregion. Gäller Supabase (region Frankfurt är verifierad), Lovable, Resend, **e-postleverantören för inloggningsmejl och brevlådorna (namnet saknas)** och Google (självständigt ansvarig eller underbiträde) | Policy §6 (tabellen), biträdesavtalets Bilaga 3 | Respektive konto och avtal | Ägaren |
| 4 | **Överföringsstöd** per leverantör: mottagarland och om stödet är certifiering under EU–U.S. Data Privacy Framework, standardavtalsklausuler eller annat. Dokumentera även att ett köp eller ett godkännande av villkoren inte ersätter stödet | Policy §6 och §8, biträdesavtalets punkt 7 och Bilaga 3 | Leverantörens avtal och DPF-listan | Ägaren |
| 5 | **Plattformens och e-postleverantörens loggtid**, och **sessionernas giltighetstid** | Policy §9 (tre rader) | Supabase (loggar, Auth), Resend | Ägaren |
| 6 | **Servermiljön för AI**: bekräfta i Lovable att `INTERVIEW_AI_PROVIDER`, `ANTHROPIC_API_KEY` och `SW_ANTHROPIC_API_KEY` inte är satta. CV-utkastet styrs bara av dem | Policy §5 och villkor §6 ("AI är avstängt"), biträdesavtalets Bilaga 2 punkt 16 | Lovable, serverns miljövariabler | Ägaren |
| 7 | **Tekniska avvikelser från lagringsplanen**, upptäckta vid kontrollen (detaljer i `retention-plan.ts`, fältet `evidence`): (a) `sweep_application_retention()` raderar efter 12 månader, planen säger 24 månader och anonymisering, och funktionen körs aldrig. (b) `cd_sessions` står under användningshändelser men är användarnas egna testkörningar (48 rader, alla med användar-id) och hör till kontots lagringstid. (c) `sweep_analytics_retention()` gäller en annan tabell (tom) med 90 dagar och 24 månader, inte 13 månader. (d) Ingen rutin finns för feedback, användningshändelser, granskningsloggar, inaktiva konton eller anonymisering. (e) Notisutkorgens 90 dagar rensas av svepningen, som inte är konfigurerad. (f) Kontoradering avbryts för 4 innehavare (rättelse `20270208090000` granskas). (g) Månatlig rensning av info@ och job@ är inte nedskriven eller tilldelad | Policy §9, biträdesavtalet punkt 10 | Koden och en skrivskyddad läsning av produktion 2026-10-04 | Ägaren beslutar, Claude bygger rutinerna |
| 8 | **Bokföringsraden** i policy §9 ("sju år") är ett tillägg som inte fanns i den godkända planen | Policy §9 | Bolagets redovisningsrutin | Ägaren eller redovisningskonsulten |
| 9 | **Företagsavtalet**: finns en text utanför repot? Biträdesavtalet hänvisar till den för ansvar | Biträdesavtalet punkt 1.3 och 12 | – | Ägaren |
| 10 | **Biträdesavtalets valfria tider och frister** (underrättelse om nya underbiträden, invändningstid, incidentmeddelande, radering, revision, domstol) är förslag, inte beslut | Biträdesavtalet, markerade med `[Ange …]` | – | Ägaren |

Regel för listan: en uppgift som inte kan läsas i koden eller i produktionen ska inte fyllas i av någon
annan än den som kan styrka den.
