# Security Passport — pilotchecklista (svenska)

Gäller PR #265 (`claude/passport-catalogue-completion`). Läs först **Läget** — det avgör vad en
testare faktiskt kan göra i dag.

## Läget: fyra olika saker

| | Vad det betyder | Status |
|---|---|---|
| **Implementerat** | Koden och migrationerna finns på grenen och är bevisade lokalt och i CI | Ja, allt nedan |
| **Mergat** | PR #265 är sammanslagen till `main` | **Nej** — utkast. (PR #264 är mergad.) |
| **Applicerat hostat** | Migrationerna körda mot ägarens Supabase-projekt | 20261124090000 och 20261125090000: **ja** (raden i den hostade migrationsloggen är läst, inget skrivet). 20261126090000: **nej** — väntar på merge av PR #265 |
| **Användbart för piloten** | En testare kan göra det i den publicerade appen | Se per marknad nedan |

**Sverige och internationella certifieringar** blir användbara för alla så snart PR:en är mergad,
migrationen 20261126090000 applicerad och appen synkad: alla 8 svenska definitioner (VU1, VU2, tre ordningsvaktsutbildningar,
OV, SV, personalgodkännande) och alla 14 internationella certifieringar.

**Storbritannien, Nordirland och Dubai** (44 definitioner) blir användbara för en testare som har
**pilotåtkomst till just den marknaden** (admin → användarens sida → *Pilotåtkomst*). Ägaren har
beslutat Route A: det redan registrerade pilotgodkännandet per definition gäller för uttryckligt
beviljade pilotmedlemmar. Inget mer godkännande behövs. Definitionerna är fortsatt **inte**
godkända för allmänheten, och ingen marknad aktiveras. Nordirland är en egen marknad (`GB-NI`)
med egen åtkomst. Abu Dhabi är stängt och erbjuds ingen.

Utan pilotåtkomst ser en användare en **tom** brittisk eller dubaisk katalog, med en förklaring.
Det är avsett. Exakta releasesteg: [pilot-approval-decisions.md](pilot-approval-decisions.md).

## Före testet (admin)

- [ ] PR #265 mergad; migrationen 20261126090000 applicerad; de fem verifieringsfrågorna i
      [pilot-approval-decisions.md](pilot-approval-decisions.md) körda (endast läsning); appen synkad.
- [ ] Öppna **Admin → Passport-katalog**. Kontrollera: *Valbar för alla* = 22, *Blockerad* = 0.
- [ ] Katalogsidan ska visa *Valbar för pilotmedlemmar i marknaden* = 44 och *Marknaden är stängd* = 7.
- [ ] För brittiska/dubaiska testare: ge pilotåtkomst till rätt marknad (`GB`, `GB-NI` eller `AE-DU`).
- [ ] Minst en granskare har rollen `passport_verifier` (eller är plattformsadmin).

## Testarens resa — Sverige

- [ ] Logga in, öppna **Security Passport → Lägg till merit**.
- [ ] Välj *Nationellt eller regionalt* → *Sverige*. Räknaren visar **8 av 8**. Ingen regionväljare visas.
- [ ] Filtrera på *Organisation: Länsstyrelsen* → 2 träffar. Tryck **Rensa filter** → 8 igen.
- [ ] Sök `vu1` → en träff. Välj **VU1**.
      - Rollerna visar *Tillsynsmyndighet: Polismyndigheten* och *Utfärdare/Utbildare: anges på intyget*.
      - Fältet **Utfärdare enligt intyget** är obligatoriskt. Skriv utbildningsföretagets namn.
- [ ] Spara. Ladda om sidan. Meriten finns kvar med utfärdaren du angav.
- [ ] Lägg till **Skyddsvaktsförordnande (SV)**. Fältet **Vad förordnandet omfattar** är obligatoriskt
      och det går inte att spara utan det. Spara, ladda om: omfattningen finns kvar.
- [ ] Lägg till **Ordningsvaktsförordnande (OV)**: utfärdare är Polismyndigheten och kan inte ändras.

## Testarens resa — internationell certifiering

- [ ] *Internationellt* → räknaren visar **14**. Sök `cpp` eller `(ISC)²` → rätt certifiering hittas.
- [ ] Spara. Meriten visas med **jordglob** och *utan land*, även om ditt arbetsland är Sverige.
- [ ] Byt arbetsland i profilen. Den internationella meriten har fortfarande inget land; OV är fortfarande svensk.

## Testarens resa — Storbritannien och Dubai (kräver pilotåtkomst till marknaden)

- [ ] Storbritannien: välj land (räknaren visar **13**) → välj licens → *Gäller i: United Kingdom*. Spara, ladda om.
      Filtrerar du på *Nordirland* ligger de landsomfattande SIA-licenserna kvar i listan.
- [ ] Dubai: land *Förenade Arabemiraten*, regionfilter *Dubai* (valfritt sökfilter, inte förvalt).
      Välj ett **SIRA-kort**: fältet **Licensierat företag som kortet är knutet till** är obligatoriskt.
      Spara, ladda om: *Dubai* och företaget finns kvar.
- [ ] En **SIRA-kurs** är en egen merit: ange utbildningscentret som står på intyget. Att en kurs
      går att spara säger ingenting om kortet.

## Underlag, granskning och delning

- [ ] Bifoga ett dokument (PDF/JPG/PNG/HEIC, högst 8 MB). Status blir *Dokument bifogat* — **inte** verifierad.
- [ ] Begär granskning. Granskaren ser begäran i kön, med definitionens kod, angiven utfärdare,
      område, omfattning och underlaget.
- [ ] Skapa en delning med **två** valda meriter. Mottagaren ser bara de två.
      En scopad merit visas som *begränsad omfattning* utan att texten lämnas ut i en anonym delning.
- [ ] Återkalla delningen. Länken slutar fungera direkt.

## Kända begränsningar att rapportera, inte felanmäla

- Dubai: arabiska namn saknas på alla definitioner, och SIRA:s portal har aldrig svarat källkontrollen.
- Dubai: ett SIRA-kort utfärdas av SIRA och är knutet till företaget. En kurs certifieras av ett
  SIRA-godkänt utbildningscenter som du själv anger; SIRA kan inte anges som kursutfärdare.
- Sverige är `grandfathered`, inte `approved`: samma juridiska granskningsskuld kvarstår.
- Yrkesväljaren i profilen visas först efter att arbetsstatus valts (”Var är du i dag?”).
