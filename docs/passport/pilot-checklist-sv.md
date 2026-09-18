# Security Passport — pilotchecklista (svenska)

Gäller PR #264 (`claude/passport-part2-card-finish`). Läs först **Läget** — det avgör vad en
testare faktiskt kan göra i dag.

## Läget: fyra olika saker

| | Vad det betyder | Status |
|---|---|---|
| **Implementerat** | Koden och migrationerna finns på grenen och är bevisade lokalt och i CI | Ja, allt nedan |
| **Mergat** | PR #264 är sammanslagen till `main` | **Nej** — utkast |
| **Applicerat hostat** | Migrationerna 20261124090000, 20261125090000 och 20261126090000 körda mot ägarens Supabase-projekt | **Nej** — väntar på merge |
| **Användbart för piloten** | En testare kan göra det i den publicerade appen | Se per marknad nedan |

**Sverige och internationella certifieringar** blir användbara för alla så snart PR:en är mergad
och migrationerna applicerade: alla 8 svenska definitioner (VU1, VU2, tre ordningsvaktsutbildningar,
OV, SV, personalgodkännande) och alla 14 internationella certifieringar.

**Storbritannien, Nordirland och Dubai** kräver dessutom två separata beslut per testare/definition:

1. **Pilotåtkomst** för den namngivna testaren (admin → användarens sida → *Pilotåtkomst*).
2. **Godkännande av definitionen** (`is_active`), per definition, genom granskad migration.
   Ingen av de 44 definitionerna är godkänd. Exakt lista med källor:
   [catalogue-coverage-matrix.md](catalogue-coverage-matrix.md), avsnittet *Outstanding approval
   decisions*. Medlemskap öppnar en marknad men godkänner ingen definition.

Utan båda ser testaren en **tom** brittisk eller dubaisk katalog. Det är avsett, inte ett fel.
Abu Dhabi är stängt och erbjuds ingen.

## Före testet (admin)

- [ ] PR #264 mergad; de tre migrationerna applicerade; verifierings-SQL i `supabase/release-state.json` körd.
- [ ] Öppna **Admin → Passport-katalog**. Kontrollera: *Valbar för alla* = 22, *Blockerad* = 0.
- [ ] För brittiska/dubaiska testare: pilotåtkomst given **och** de definitioner som ska testas godkända.
      Kontrollera på katalogsidan att de står som *Valbar för pilotmedlemmar*.
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

## Testarens resa — Storbritannien och Dubai (endast med åtkomst + godkänd definition)

- [ ] Storbritannien: välj land → välj licens → *Gäller i: United Kingdom*. Spara, ladda om.
      Filtrerar du på *Nordirland* ligger de landsomfattande SIA-licenserna kvar i listan.
- [ ] Dubai: land *Förenade Arabemiraten*, regionfilter *Dubai* (valfritt sökfilter, inte förvalt).
      Välj ett **SIRA-kort**: fältet **Licensierat företag som kortet är knutet till** är obligatoriskt.
      Spara, ladda om: *Dubai* och företaget finns kvar.
- [ ] En **SIRA-kurs** är en egen merit. Att en kurs går att spara säger ingenting om kortet.

## Underlag, granskning och delning

- [ ] Bifoga ett dokument (PDF/JPG/PNG/HEIC, högst 8 MB). Status blir *Dokument bifogat* — **inte** verifierad.
- [ ] Begär granskning. Granskaren ser begäran i kön, med definitionens kod, angiven utfärdare,
      område, omfattning och underlaget.
- [ ] Skapa en delning med **två** valda meriter. Mottagaren ser bara de två.
      En scopad merit visas som *begränsad omfattning* utan att texten lämnas ut i en anonym delning.
- [ ] Återkalla delningen. Länken slutar fungera direkt.

## Kända begränsningar att rapportera, inte felanmäla

- Dubai: arabiska namn saknas på alla definitioner, och SIRA:s portal har aldrig svarat källkontrollen.
- Dubai: för fyra generella utbildningar (brand, HLR, People of Determination, fitness) är frågan om
  vem som faktiskt utfärdar intyget öppen för granskaren. Ingen utfärdare har hittats på.
- Sverige är `grandfathered`, inte `approved`: samma juridiska granskningsskuld kvarstår.
- Yrkesväljaren i profilen visas först efter att arbetsstatus valts (”Var är du i dag?”).
