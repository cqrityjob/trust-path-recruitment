# Beroende administration för rekryteringstest

**Draft, inte mergeklar.** Kräver schema-PR #309 applicerad och läsverifierad. Befintlig schemaspärr förväntas blockera applikationsrelease tills dess; kontrollerna ändras inte.

Efter tillämpat schema: öppna `/admin/assessments` som befintlig plattformsadministratör med innehållsbehörighet. Välj testversion, förhandsgranska frågorna på svenska/engelska, ändra urval och versionsanteckning, och spara en ny utkastversion. Alternativet att skapa ett nytt test kräver unikt slug och namn på båda språken. Ny definition ärver ingen standardtillgänglighet. Befintliga frågor återanvänds med sina exakta versioner; poängnycklar och historiska svar skrivs inte om.

Denna yta redigerar testsammansättning och versionsanteckningar. Textförfattande, poängnycklar, validering och publicering hör fortsatt till den granskade innehållsprocessen. Varken pilotstatus eller organisationers åtkomst kan aktiveras här. Nya utkast förblir spärrade även om originalet är ett öppet pilotinnehåll.

Verifierat i lokal isolerad stack med ett separat syntetiskt administratörskonto: listning, förhandsgranskning av 50 frågor, ändrat urval och skapande av ny spärrad version. [Webbläsarbevis](../../artifacts/assessment-authoring/new-draft.png). Schema-PR:n innehåller de 14 transaktionella behörighets- och versionsproven. Ingen produktionsskrivning har utförts.
