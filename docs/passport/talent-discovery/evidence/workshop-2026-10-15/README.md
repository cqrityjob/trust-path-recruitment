# Workshop 2026-10-15: aktuella bilder

Bilderna är tagna från appens slutversion mot den lokala stacken. Stacken består av PostgreSQL med alla 397 migrationer, PostgREST och den syntetiska fixturen `scripts/fixtures/talent-discovery-fixture.sql`, efter att webbläsarsvitens 13 scenarier har körts. Alla personer och företag är påhittade.

`sv`/`en` anger språk och `1440`/`390` anger bredd i pixlar. Bilderna med prefixet `suite-` tas av webbläsarsviten (`e2e/talent-discovery-local.spec.ts`) under körningen.

## A. Samma uppgift och nästa steg

| Bild                               | Visar                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `1-overview-cecilia-*`             | Översikten efter rättad CPP. Nästa steg är "Underlag saknas → Bifoga underlag". Samma steg och samma namn som meritraden och meritsidan. |
| `2-credential-detail-cecilia-*`    | Meritsidan för samma merit, med samma steg. Den ersatta versionen står kvar som historik ("Dokumenterad · Ersatt").                      |
| `1-overview-bo-*`                  | Återkallad granskning: "Granskningen är återkallad → Läs beslutet". Ingen "Nyligen verifierat" för den återkallade meriten.              |
| `2-credential-detail-bo-revoked-*` | Meritsidan för den återkallade meriten.                                                                                                  |
| `2-reviewer-queue-*`               | Granskarens kö med samma ärendeord.                                                                                                      |

## B. Utkast och sparat läge

| Bild                                                         | Visar                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `3-job-opportunities-unsaved-*`                              | Jobbmöjligheter med en osparad ändring: stöd och giltighet vid varje val, sammanfattning av formuläret, "Så visas dina sparade uppgifter" med "Osparade ändringar". Mobilordningen följer workshopens lista. |
| `3-job-opportunities-saved-*`                                | Samma sida utan osparade ändringar. Huvudhandlingen är "Spara ändringar".                                                                                                                                    |
| `suite-after-discoverability-draft-sv-1440`                  | Första aktiveringen: knappen säger "Gör mig sökbar" och förhandsvisningen visar fortfarande det sparade läget.                                                                                               |
| `suite-after-discoverability-saved-after-correction-sv-1440` | Scenario 13: urvalet sparat igen genom appen efter rättad merit och ändrad anställning, och läst efter omladdning.                                                                                           |
| `4-criteria-confirmed-*`                                     | Matchningsvillkoren med den bekräftade version som sökningen använder.                                                                                                                                       |

## C. Kontakt och separat ansökan

| Bild                                    | Visar                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `4-find-candidates-results-*`           | Resultat med neutral anonym referens, vilken kravversion sökningen använder och samma kontaktstatus som kontaktfliken.              |
| `4-find-candidates-contact-dialog-*`    | Kontaktfönstret visar företag, tjänst och mottagande anonym profil.                                                                 |
| `4-find-candidates-contacts-*`          | Kontaktfliken: status, och "Öppna ansökan" bara när en intern ansökan finns.                                                        |
| `suite-after-withdraw-failed-sv-1440`   | En återtagning som misslyckades: felmeddelande och "Försök igen".                                                                   |
| `3-job-opportunities-contact-pending-*` | Kandidatens kort före beslut: "Läs annonsen", konsekvenstexten, "Acceptera och dela mitt namn" och ett stopp som namnger företaget. |
| `suite-after-contact-accepted-sv-1440`  | Efter accept: ingen ansökan har skickats, och vägen till annons och ansökan.                                                        |
| `suite-after-talent-corrected-sv-1440`  | Arbetsgivarens vy efter rättelsen: rätt version, aktuell roll och egen uppgift. Den ersatta versionens högre nivå följer inte med.  |
