# Historikvy med kompatibel läsning och befintlig behörighetskontroll

9 november 2026. Ägare: System/Security, gemensam lokal historik/review.
Branch: `codex/history-compatible-reader-20261109`.
Verifierad bas/main: `94a452c0432c77ca76d0b351f529a5f1f3d609c0`.
Tidigare adapterprototyp: `645b6b838ff0cb8651fc3b07db4b1e094cc9e0ff`.

## Resultat

Läsadaptern är inkopplad i produktens **Storage health → Review saved browser
copies**, i en isolerad lokal kandidat. Den befintliga samlingen läses som
tidigare. Om den uttryckligen kända compact-databasen redan finns kan samma
behöriga användare även välja **Additional saved copies**. Läsaren stöder både
fristående komprimerade envelopes och envelopes med delade innehållsblock.

**Inga befintliga sparningar, synkningar, kvittenser eller rotationsregler har
ändrats. Ingen användardata har migrerats, rensats eller skapats av läsaren.**
Ingen kompakt produktwriter införs. Inga riktiga användarprofiler har använts
för testning. Ingen push, staging-aktivering eller deploy har gjorts.

335 unika berörda testfall är godkända i Chromium/WebKit och kontraktssviten.
Statiska kontroller är godkända. Detta är lokal produktverifiering; produktion
och verkliga användarsessioner har inte verifierats för denna kandidat.

## Omfattning och ägarskap

System/Security äger historikens läsning och review-gräns. Medical, Sessions,
Exercise Library och övriga moduler fortsätter äga sitt innehåll, sina writes,
retries, behörigheter och återställningsflöden. Inga sådana modulimplementationer
ändras här. Authstore, auth-API, central read-scope och rollmodell ändras inte.

Produktändringar:

- `snapshot-compatible-reader.mjs`: gemensam källbunden list-/enkelpostläsning,
  åtkomstkontroll före/efter await, bounded discovery och ingen fallback.
- `snapshot-compact-history.mjs`: begränsad id-listning inom exakt scope.
- `snapshot-existing-read.mjs`: öppning av redan existerande databaser och
  readonly-läsning av envelope samt beroenden i samma transaktion.
- `snapshot-compact-codec.mjs`, `snapshot-compact-decode.mjs`: enbart avkodning
  och integritetskontroll, ingen writer eller komprimerings-/migreringsfunktion.
- `snapshot-history-dialog.mjs`: samma preview/review-export genom adaptern,
  explicit samlingsval när extra lagring finns och skydd mot sena svar från
  tidigare samlingsval. Inga kopior slås samman efter id.
- `data-safety-runtime-service.mjs`: endast callbacken som öppnar review ändras,
  för att avbryta öppning vid auth-event under lazy loading.

Hela runtime-filen utanför review-callbacken har jämförts byte-för-byte mot main
och är identisk. Befintlig `saveSnapshot`, retention, native writes, manifest,
central sync och backupimport är därmed oförändrade. QA-fixturens kompakta writer
ligger under `qa/`, utesluts av `.vercelignore` och importeras inte av produkten.

## Verkliga åtkomstgränser

Produktens entrypoint fortsätter använda `getSnapshotReviewScope`: endast aktiv
exakt `admin` med användar-id, `isDevMode() === false` och icke-tomt centralt
read-scope. Den bredare `isAdmin()`-gruppen (inklusive klubb-/lagadmin) används
inte för dessa fulla kopior. Scope kommer från den befintliga auth/central-bridgen
och omfattar användare, organisation, klubb, lag och roll.

Vyn kontrollerar samma getter före/efter asynkron läsning och export. Varje
`platform:user-change` invaliderar hela den öppna vyn och tar bort innehållet;
en periodisk scopekontroll fångar också ändrat läsläge. Vyns generation kan
inte återanvändas efter A→B→A. Nu bevakas auth-events även **före** den dynamiska
importen, så en pågående öppning inte kan passera ett konto-/åtkomstbyte.

Varje full kopia måste dessutom klara befintliga `isReviewableSnapshot`:
exakt ägare för payload och metadata, kända nycklar/envelope och inga oklara
separerade recovery-format. Compact-läsaren avvisar även metadata för otillåtna
nycklar. Okänt eller recovery-krävande innehåll lämnas oförändrat och ges inte
ut genom en mer tillåtande väg. Pending/prepared görs aldrig om till kvitterat.

Clinical Medical-text förhandsvisas inte i denna gemensamma vy. En behörig admins
review-fil innehåller den fullständiga godkända kopian och varnar för Medical-
innehåll som tidigare. Filen är fortsatt `football-science-snapshot-review-v1`,
`purpose: review-only`, utan top-level `storage`/`keys`. Ingen restore/sync sker.

Tester använder appens verkliga authstore och produktscope, men med simulerade
server-/authsvar. Detta är inte en granskning av Supabase/RLS eller ett bevis på
färsk serverbehörighet under obegränsad offlineperiod. Befintliga authregler
utökas inte; sådan backend/offline-policy måste behandlas separat.

## Lagringskontrakt och begränsningar

Legacy använder befintlig databas/store och befintlig `readSnapshotHistory`.
Det reserverade compact-läskontraktet är:
`football-science-snapshots-compact-v1`, stores `versions` och `blocks`, format 1.
Namnet är en läsgräns för framtida writes; denna kandidat skapar inte databasen.
Den läser inte prototypens `qa-*`-databaser på produktens vägnar.

Läsningen använder `indexedDB.databases()`, öppning utan versionsnummer,
abort-on-upgrade och readonly-transaktioner. Ett enumeration/open-race får inte
commit:a ett nytt schema. Native browser kan lämna en version-noll-placeholder
efter avbruten öppning; ingen sådan metadata rensas av applikationen.

Compact: högst 100 nycklar per sida, högst 256 blockreferenser och 8 MiB kodade
payloadbyte respektive deklarerade avkodade byte per version. Sidans avkodade
innehåll begränsas till 20 MiB. Id-sökning och enskild avkodning har tre sekunders
timeouts; sidloopen stoppar efter tidsbudget mellan versioner. Detta är inte en
hård tresekundersgräns för hela sidan, peak-RAM eller CPU. Värden måste först
materialiseras från IDB och en redan startad digest kan slutföras efter timeout.

En saknad/skadad kopia ger aldrig tomma standarddata eller en tyst annan kopia.
De två samlingarna har separat pagination. Samma id med olika innehåll förblir
två separata, uttryckligt valda kopior. Vid export läses samma källa/id på nytt
och jämförs exakt med den visade kopian. Ändrade rättigheter, innehåll eller
samlingsval stoppar nedladdningen.

Listan visar ofullständiga eller otillgängliga läsningar och att oklara kopior
kan finnas kvar. Om compact-discovery misslyckas nämns detta även när legacy
fortfarande går att läsa. Saknade block, okänt format, främmande ägare och
recovery-data räknas inte som bevis att något kan raderas.

## Testevidens

1. Befintlig historikvy: **52 passed**, 30,2 sekunder. Rollgränser, legacy-export,
   nätblockering, mobile/fokus, clinical privacy, pagination och readonly-beteende.
2. Inledande ny produktsvit: **26 passed**, 27,9 sekunder. Denna är en tidigare
   delmängd, inte extra oberoende fall utöver nedanstående.
3. Hela berörda lagrings-/historiksviten: **329 passed**, 1,5 minuter. Inkluderar
   30 nya produktfall och alla 299 tidigare berörda fall. Inga fel/överhoppningar.
4. Sex senare tillagda nät-/källvalsfall: **6 passed**, 4,3 sekunder. Därmed
   **335 unika fall**. Två av dessa upprepades med mobilbredd och screenshot:
   **2 passed**, 3,9 sekunder; de ska inte räknas som ytterligare unika fall.
5. `npm run qa:static`, syntaxkontroller och `git diff --check`: godkända.
   Arkitekturkontrollen rapporterar befintliga storleksvarningar, inga nya fel.
   Main hämtades igen efter verifieringen och var kvar på exakt bas-SHA.

Särskilt belagt i de nya fallen:

- Full app, båda kompressionslägena: admin öppnar och exporterar exakt pending-
  kopia. Coach, Medical, klubbadmin, lagadmin och guest får inte entrypointen,
  även när en compact-databas finns. Inga nya serverwrites från review/export.
- Ändring av riktig authstore från admin till coach mitt i färsk avkodning
  tar bort preview och ger noll nedladdningar. Ut-/återinloggning under den
  dynamiska importen lämnar Storage health öppet med retrybesked.
- En peer-flik med exakt runtime från `94a452c…` gör tio riktiga lokala pending-
  sparningar i legacy-format medan nya vyn läser 20 compact-kopior. Alla tio
  nya legacy-kopior, senaste native-värde och osparad peer-editor bevaras.
- 103 compact-kopior nås via två sidor. Alla mutationer/skrivtransaktioner
  förbjuds i testet: noll försök, och frånvarande legacy-databas skapas inte.
- Skadat innehåll, framtida format, främmande ägare och recovery-kopia läcker
  inte till preview eller review-fil. Ändring efter rendering stoppar export.
- Alla nätanrop blockeras efter kodladdning: båda compact-lägena går att läsa
  och ladda ned som exakt review-fil i Chromium/WebKit. Detta testar inte
  kall offline-start/service worker eller varje browsers verkliga nätläge.
- Två samlingar med samma id och olika payload laddas ned från vald källa;
  ingen deduplicering/fallback. Mobilvyn vid 390 px har ingen horisontell overflow.

Ingen produktion eller verklig användares lagring utsattes för testerna.

## Kvarvarande risk och nästa releasegräns

Redan laddade äldre flikar uppdateras inte av ny läskod. Historisk kod före
bevarandefixen kan fortfarande radera legacy-historik; tidigare motexempel
45→30 är inte löst av denna integration. Den äldre flik som verifierats här
är den nuvarande produktbasen med bevarandefixen. Ingen tvångsomladdning ingår.

Nya compact-writes, historisk ompackning, radering, generell lagringsbegränsning,
verkligt offlineauth-/serverkonfliktbeteende och full modulcertifiering är fortsatt
utanför denna kandidat. Eftersom inga nya kompakta kopior skrivs frigör detta
steg **inget utrymme**; det etablerar produktens läsberedskap.

Nästa release kan avse endast denna läsintegration. Den kräver användarens
direkta releasekommando, Safe Lane med aktuella guards och efterföljande
produktionsverifiering. Nya lagringsskrivningar får inte smygas in i den releasen.

## Artefakter

- `/private/tmp/history-compatible-existing-20261109.log`
- `/private/tmp/history-compatible-product-20261109.log`
- `/private/tmp/history-compatible-full-20261109.log`
- `/private/tmp/history-compatible-final-cases-20261109.log`
- `/private/tmp/history-compatible-mobile-20261109.log`
- `/private/tmp/history-compatible-static-20261109.log`
- `/private/tmp/history-compatible-collections-history-chromium.png`
- `/private/tmp/history-compatible-collections-history-webkit.png`

Reproducera: `npx playwright test --config=qa/playwright.snapshot-history.config.mjs`.
Den nuvarande konfigurationen inkluderar alla 335 fall. Aggregerad evidens finns
i `HISTORY_COMPATIBLE_READER_2026-11-09.results.json`.
