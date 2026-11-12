# Isolerat skriv- och återställningsprov för skyddad historik

Ägare: System/Security, gemensam lokal historik. Modulägarnas sparning,
behörigheter och replay ändras inte. Bas: `62116896cfa43b8f6c3b08beaf37ea5a8d8b46c1`,
kontrollerad mot hämtad origin/main före arbetet. Branch:
`codex/lossless-write-proof-20261112`. Endast QA-prototyp, tester och dokumentation.

## Beslut efter mätning

**Aktivera ingen produktwriter i denna etapp.** Fristående komprimering är det
enklare förstavalet för en kommande begränsad kandidat. Delade block är inte en
generell förbättring: de tillför metadata, beroenden och större felradie om ett
gemensamt block skadas. De motiveras först för uppmätt återanvändning av stora
oförändrade värden. Välj inte format dynamiskt i produkten på detta underlag.

Inget befintligt arbete har migrerats/raderats. Ingen produktflagga tillkommer.
Ingen dubbel lagring införs i produkten. QA-writern finns under `qa/prototypes/`,
utesluts av `.vercelignore` och används bara med `qa-lossless-*`-databaser i
disponibla testprofiler. Produktens `src/`, API, behörigheter och synk är oförändrade.
Den föregående produktreleasen berörs inte; denna testkandidat behöver ingen deploy.

## Vad som faktiskt mättes

Fyra deterministiska, syntetiska datamönster, 60 unika pending-generationer per
mönster och webbläsare. Verklig data-safety- och central-sync-runtime körs med
native Storage/IndexedDB, men servern och tidsgränserna är en deterministisk
testbrygga. Offlineförsök, retry, central kvittens och snapshot efter kvittens
ingår. Detta är inte en mätning av riktiga moduldata eller serverns databas.

Alla 60 pending-envelopes bevaras byte-exakt i originalhistoriken. De skrivs
dessutom i två separata QA-databaser: fristående respektive delade block.
Varje version läses med produktens verkliga kompatibilitetsläsare efter stängd
skrivanslutning: **960 exakta återläsningar** (60 × 4 × 2 format × 2 webbläsare).
Metadata för scope, revision, pending och prepared normaliseras aldrig bort.

Mätningen räknar UTF-8-serialiserat innehåll, nycklar, metadata, latest-kopior,
native Storage och binära komprimerade payloads. De testade IDB-samlingarna har
ingen sekundärindexering; intern primärindex-/sid-/transaktionsoverhead är inte
mätbar genom denna inventering och **ingår inte**. Resultaten är logiska byte,
inte fysisk diskanvändning, browserkvot eller garanterad besparing.

### Resultat vid generation 60 (Chromium)

| Syntetiskt mönster | Befintlig kedja, logiska byte | Fristående: framtida total | Delade block: framtida total | Slutsats |
| --- | ---: | ---: | ---: | --- |
| Stor repetitiv text | 9 765 209 | −64,34 % | −64,08 % | Fristående enklare och något mindre |
| Stort oförändrat brus + små ändringar | 6 134 610 | −15,80 % | −62,71 % | Delning har tydligt värde för just detta mönster |
| Två stora ändrade brusvärden varje gång | 12 163 931 | −15,93 % | −15,48 % | Delning tillför overhead utan återanvändning |
| Små värden | 105 032 | −9,10 % | **+34,07 %** | Delning förstorar totalen |

WebKit gav samma beslutsriktning; exakta checkpoints 1/10/30/60 för båda
webbläsarna finns i intilliggande `.results.json`. Komprimeringsbyte varierar
med browserimplementation och snapshot-id/tid. Procenttalen är observationer,
inte hårdkodade godkännandekrav eller löften för användarnas data.

"Framtida total" är ett beräknat alternativ där just testets 60 nya skyddade
generationer från början hade fått kompakt representation. Övrig historik,
latest och native Storage räknas fortsatt. Ingen sådan ersättning görs i provet.
Den faktiskt parallellt lagrade testkedjan är i stället **större vid varje
checkpoint**: originalkedja + kompakt historik. Att behålla dubbla fullständiga
representationer är därför inte en lösning på full lagring.

## Reproducerade brister och avgränsade korrigeringar

Två röda tester visade att den gamla QA-writern accepterade:

1. 257 referenser, trots att produktläsaren högst läser 256 block.
2. En ursprunglig envelope inom 8 MiB vars packade envelope och block tillsammans
   överskrider läsarens budget för avkodade byte.

QA-writern avvisar nu dessa före skrivtransaktionen och räknar både kodade och
avkodade byte. Befintliga versioner lämnas exakt orörda. Ett prov nära gränsen
(8 MiB minus 4 KiB payload) accepteras och återläses med verklig produktläsare
för båda formaten. Större arbeten ska fortsatt stanna i befintligt format.

Prototypen avgränsas dessutom till produktläsarens kända review-format.
Recovery-innehåll, främmande ägare, okända toppnivåfält och extra manifestposter
avvisas utan att ändra indata eller en redan bevarad legacy-kopia. Denna
formatkontroll är **inte autentisering**; testets tillåtna nycklar och scope är
syntetiska. Läsarens timeouts och enhetens minnesgräns är ytterligare begränsningar,
så strukturell admission är inte ett löfte att alla accepterade storlekar klarar
varje verklig enhet.

## Avbrott, samtidighet och återställning

- Injicerad kvot före skrivning och vid versionsskrivning efter blockrequests:
  inga kvarvarande halvkopior eller nya sparbesked; originalet exakt kvar.
- Abort efter framgångsrikt IDB-request men före transaktionscommit:
  append avvisas. Request-success räknas aldrig som sparat.
- Retry efter genomförd commit och ny anslutning: ingen extra version.
- Två flikar: identiska retries ger en insättning; samma id med olika innehåll
  ger en vinnare och en avvisning; 20 separata samtidiga versioner återläses exakt.
- Flikstängning under en aktiv IDB-transaktion: tidigare version är kvar;
  transaktionen får enligt testkontraktet lämna hela eller ingen ny version.
  I samtliga fyra observerade browser/format-fall blev den avbrutna versionen
  absent och databasdumpen oförändrad. Retry skapade en fullständig generation.
  Det är en verklig flikstängning, inte simulerad OS-krasch eller fsync-bevis.
- Återställning: produktläsaren rekonstruerar en komplett envelope som skrivs
  till en **separat QA-utkastdatabas**, stängs och återläses exakt. Originalet
  ändras inte. Fel scope kan inte läsa den via kompatibilitetsläsaren.
  Ingen automatisk import, central kvittens eller modulreplay görs.
- Redan öppen legacy-flik på basversionens runtime fortsätter spara 35 pending-
  generationer medan kompakt kopia finns separat. Efter QA-writer stängts kan
  nya läsaren fortfarande läsa kopian offline. Detta provar basversionen som
  äldre flik, inte samtliga historiska klienter eller rollback till en version
  utan kompatibilitetsläsaren.
- Offlineprovet laddar läsarmoduler online i en ny flik innan nätet stängs av.
  Det är inte kall offline-appstart. Det befintliga kallstarts-motexemplet ingår
  i sviten och bekräftar att appens nuvarande offline-skal inte är godkänt.

## Verifiering och begränsningar

**72 passed, 0 failed, 0 skipped, 0 flaky**, 44,6 sekunder i Chromium/WebKit.
56 nya scenariokörningar samt 16 tidigare readiness-körningar. Vissa tidigare
readiness-tester passerar genom att bekräfta en kvarvarande begränsning, exempelvis
nekad review-import och utebliven kall offline-start. Grön svit betyder därför
godkänt isolerat experiment, **inte godkänd produktaktivering**.

`npm run qa:static` nådde och passerade slutsteget architecture:budgets. Befintliga
storleksvarningar och saknad produktions-/stagingkonfiguration i lokal readiness
rapporteras; det är inte produktionsverifiering. Explicita syntaxkontroller av
alla nya QA-moduler samt `git diff --check` passerade.

Reproducera:

```sh
npx playwright test --config=qa/playwright.lossless-write.config.mjs
npm run qa:static
git diff --check
```

Ingen fysisk disk har fyllts, ingen riktig användarprofil har öppnats och inga
användarflikar har stängts eller laddats om. Inga server-/behörighetsgarantier,
browser eviction-garantier eller fullständiga offlinegarantier tillkommer.

## Nästa produktsteg och stoppkrav

1. Definiera och verifiera en explicit behörig väg från historikkopia till ett
   separat modulutkast, med bevarad ägare, pending och revisionsbas. Modulens
   befintliga granskning/konflikthantering ska styra eventuell återföring.
   Review-export får inte göras importerbar genom att kasta metadata.
2. Först därefter en begränsad skrivkandidat för **nya**, bevisat läsbara versioner,
   helst fristående komprimering. Befintlig historik och oadmitterade format
   behåller sin väg. Inget dolt dubbelskrivande och ingen automatisk rensning.
3. Bevisa läsaråtkomst efter omstart, roll-/kontobyte, write-avstängning och
   tillåten rollback. Äldre läsare får inte bli enda vägen till nya kopior.
4. Innan pilot: mät även faktisk browserkvot och resurskostnad i disponibel
   profil och fastställ ärligt beteende vid full lagring. Produktpiloten kräver
   egen releaseauktorisering och Safe Lane; den aktiveras inte av detta testarbete.

Fristående komprimering eller blockdelning begränsar inte antalet unika skyddade
versioner. Ett framtida centralt arkiv måste bevisa innehåll, ägare, läsbarhet och
återställning innan någon separat policy om lokal tillgänglighet kan övervägas.
Osynkat arbete får aldrig härledas till rensningsbar cache.
