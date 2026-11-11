# Förklarbar lagringstillväxt och beviskrav före kompakta writes

Ägare: System/Security, gemensam lokal lagring, diagnostik och backupimport.
Branch: `codex/storage-growth-observability-20261111`.
Bas/main: `92fdbf47a8347e8633267fa7b96ec40fb33c6e07`, hämtad igen under arbetet.
Medical, Sessions, Library och övriga moduler behåller sina data, writes,
behörighetsregler, konflikthantering och replay. Ingen modul eller release tas över.

## Beslut

Färdigställ en avgränsad diagnostik- och bevarandekorrigering. Aktivera **inte**
kompakt produktlagring ännu. Det krävs en återställningsväg för varje format som
en writer accepterar; att kunna avkoda och ladda ned en review-fil räcker inte.
Historiska kopior ska inte migreras eller raderas i denna etapp.

Implementeringsresultatet nedan är lokalt verifierat. Användaren har därefter
uttryckligen auktoriserat deploy av diagnostiken och bevarandekorrigeringen,
utan kompakt skrivning eller radering av sparat/osynkat arbete. Release går via
Safe Lane. Slutlig releaseevidens dokumenteras separat efter produktionskontroll.

## Riktad produktionskontroll för denna release

`qa/helpers/storage-growth-live-probe.mjs` körs av ordinarie autentiserad
`production.live.spec.mjs` med live-QA-admin. Den öppnar verklig Storage health,
inspekterar en syntetisk pending/prepared-historikpost i en disponibel profil,
och verifierar att posten är byte-oförändrad samt att compact-databasen inte
skapats. Muterande API-anrop spärras i testfliken efter inloggning.

Samma serverade data-safety-modul provas mot en separat Storage-instans och en
syntetisk IDB-databas: ett injicerat kvotfel före restore ska stoppa ersättning,
bevara pending-metadata och ge noll nya central-write-anrop. Det är ett beteende-
prov av livekod med isolerad testlagring, inte en import i användarens riktiga
arbetsyta eller ett försök att fylla datorns fysiska disk. Ingen teststädning
raderar användardata. Kompakt writer aktiveras inte ens för denna kontroll.

Den identiska kontrollen passerade lokalt i Chromium och WebKit: 2 passed,
8,9 sekunder. Live-specens registreringskontroll kräver att det nya testet finns.
Produktionsresultatet är ännu inte känt vid releaseförberedelsen.

## Produktändringar

1. Storage health använder den **befintliga** retentionens positiva
   kvittenspredikat, med samma schema/hashfunktion som runtime. Varje inspekterad
   snapshot får en primär förklaring: senaste-referens, modulåterställning,
   recovery-innehåll, pending/prepared, deletion-metadata, manuell/restore,
   kvitterad automatisk historik eller okänt/overifierat format.
   Flera skydd kan gälla samtidigt; kategorierna är inte en raderingslista.
2. Den kända compact-databasen inventeras readonly när den redan finns.
   Binärbyte räknas separat utan dekomprimering eller JSON-expansion av bytearrayer.
   Samlingar utanför den kända modellen ger ofullständigt resultat och okänd total.
   Saknad information blir inte noll eller ett godkännande att radera.
3. Resultatet av den senaste rotationskontrollen i denna flik syns separat från
   sparresultatet. `limited` innebär att just det försöket inte raderade några
   kopior. Ett lyckat snapshot betyder inte att tillväxten är begränsad.
   Statusen är endast i minnet; ingen ny växande diagnostiklogg skrivs.
4. Konto-/teambyte invaliderar Storage health även under async-läsning eller
   A→B→A. Redan visade uppgifter och review-knappen tas bort. En försenad
   review-callback får inte återöppna vyn eller ersätta kontobytesbeskedet.
5. Backupimport stoppar **före ersättning** om `before-restore` inte lyckades.
   Före korrigeringen reproducerade testet att `unsynced original` ersattes av
   `replacement` trots `QuotaExceededError` i snapshot-skrivningen.
   Efter korrigeringen kvarstår original och pending-metadata, utan nya
   central-write-anrop. Även transaktionsabort testas. Vanlig lyckad import och
   användarens avbryt fungerar fortsatt.

Retentionens urval/radering, deduplicering, kompakta läsgränser, central synk och
modulernas sparning är oförändrade. Importfixen ändrar inte importens övriga
metadata-/synksemantik och gör inte en flernyckelsimport atomisk.

## Isolerad kedja och ärliga stoppkrav

Den tidigare QA-writern/codec återanvänds byte-exakt från
`eb3205743bd1480e424173c5be1649a671582636`. Filerna ligger under `qa/prototypes/`,
utesluts av `.vercelignore` och importeras inte av produkten.

Testet fångar **35 unika pending-generationer från riktig data-safety-runtime**,
lagrar fristående komprimerade envelopes atomiskt i en separat `qa-lossless-*`
databas och läser samtliga med produktens kompatibla läsare. En readonly
namnmappning gör att läsaren kan konsumera QA-databasen; detta bevisar formatet,
inte produktdiscovery eller autentisering. Hela envelope, inklusive metadata,
är exakt identiskt. Samma-id/annat-innehåll, injicerad kvot och överstor version
avvisas utan att tidigare generationer förändras. Exakt retry skapar ingen ny rad.

Följande motexempel är **inte godkända produktförmågor**, även när deras tester
passerar genom att påvisa begränsningen:

| Krav före aktivering | Evidens | Beslut |
| --- | --- | --- |
| Komplett återställning | Riktig pending-kopia kan avkodas exakt, men review-formatet nekas av riktig import och lämnar originalet orört | Ingen review→restore-genväg; definiera explicit återställning/replay |
| Stora befintliga arbeten | En giltig legacy-envelope med 8 MiB payload kan lagras, men compact-läsaren ger `limited` på envelope inklusive metadata | Writer får aldrig acceptera något läsaren inte kan återställa; börja med bevisad delmängd och oförändrad legacy-väg för övriga |
| Kall offline-start | Riktig app laddas, aktuell service worker registreras, sista fliken stängs, nätet stängs av och ny flik öppnas; appen blir inte redo. Sentineln finns kvar efter återanslutning | Varm offline-läsning är inte kallstart; nuvarande worker hanterar push, inte appens offline-skal |
| Behörig återställning | Nuvarande full-copy review är admin-only. QA-writerns syntetiska scope utgör ingen autentisering | Ingen breddning av roller eller automatisk replay; återställning måste använda respektive moduls faktiska åtkomstkontrakt |
| Äldre klienter/rollback | Nuvarande kompatibilitetssvit bevaras; denna etapp aktiverar inga nya produktwrites | Framtida rollout måste hantera gamla läsare och behålla nya läsare vid write-avstängning |
| Begränsad total tillväxt | Fristående komprimering minskar representation, inte antalet unika generationer | Ingen garanti om obegränsat offlinearbete på ändlig lagring; skyddat arbete får inte rensas automatiskt |

Det finns ingen ny produktflagga som kan råka slå på writern. Ingen full dubbel-
skrivning införs. För nästa writer-kandidat krävs ett explicit acceptanskontrakt:
ny generation → beständig kopia → behörig läsning → separat återställt utkast →
modulens granskning/replay. Kvittens, originalägare, revisionsbas och pending får
inte normaliseras bort. Behåll enkel fristående komprimering som förstaval;
delade block införs bara om mätningar på representativt material motiverar det.

## Mätgränser

JSON-storlek är en UTF-16-uppskattning, binärpayload anges separat. Ingen av dem
är fysisk diskanvändning, indexoverhead, prognos eller ett centralt arkivbevis.
Inventeringen är en punktmätning och ingen permanent telemetri. Den läser kända
databaser över konton, utan att returnera innehåll, id, ägare, nycklar eller råa fel.
Övriga databaser, Cache Storage, media och andra lagringsytor är fortfarande
utanför detaljinventeringen; browserns origin-estimat har ett annat scope.

Befintliga scannergränser är 3 000 rader, cirka 100 MiB uppskattat innehåll och
två sekunders timeout per databas. En redan materialiserad stor IDB-rad eller
synkron JSON/hashberäkning kan överskrida arbetsbudgeten innan kontrollen körs.
Senaste-posten läses även för referenser. Detta är inte en hård CPU/RAM-gräns.
Rotationsgränserna och dess bevarandepolicy ändras inte.

Kvotprov i denna nya kedja är injicerade fel, inte bevis för varje enhets fysiska
diskgräns. OS-krasch/fsync, browser eviction, obegränsad offlinebehörighet och
serverkonflikter är inte certifierade här. Inga riktiga användarprofiler används.

## Verifiering

Slutresultat: **365 passed, 0 failed, 0 skipped**, 1,9 minuter, i den samlade
Chromium/WebKit-/kontraktskonfigurationen. Där ingår 28 nya testfall över de två
webbläsarna. `npm run qa:static`, explicita syntaxkontroller för de nya filerna
och `git diff --check` är godkända. Arkitekturkontrollen rapporterar befintliga
storleksvarningar, inga fel. Detta är lokal verifiering; ingen produktion,
serverbehörighetsmodell eller fysisk användarlagring har provats här.

Reproducera med:

```sh
npx playwright test --config=qa/playwright.snapshot-history.config.mjs
npm run qa:static
git diff --check
```

Snabb riktad kedja: `qa/playwright.storage-growth.config.mjs`.
Den första breda körningen gav 335 passed och två textförväntningsfel i
auth-ABA-provet. Efter det avsiktliga starkare kontobytesbeteendet kräver provet
exakt besked, tom tidigare diagnostik, borttagen review-knapp och ingen öppnad
historikvy. Riktad omkontroll av produktens historik/Storage health: 48 passed.
Inga dataskyddskontroller togs bort eller gjordes valfria.

Lokala loggar: `/private/tmp/storage-growth-final-20261111.log`,
`/private/tmp/storage-growth-static-final-20261111.log` och det ursprungliga
reproducerade felet i `/private/tmp/storage-growth-red-20261111.log`.
Sammanfattningen bevaras i intilliggande `.results.json`; temporära loggar kan
försvinna vid systemstädning. Git-commiten bevarar kod, test och rapport.
