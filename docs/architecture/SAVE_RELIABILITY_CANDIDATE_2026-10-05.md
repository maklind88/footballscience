# Sparsäkerhet: första rättningskandidaten

Status 2026-10-05: implementerad och pushad som [PR #252](https://github.com/maklind88/footballscience/pull/252). Ingen driftändring,
migrering, återställning av användardata eller release är utförd.

## Ansvar och bas

System / Security äger denna kandidat: delad central återläsning och Medicals
befintliga mergekontrakt i API och lokal återhämtning. Medical Room äger kliniska
regler och återställningsbeslut; Squad äger medlemskap; Sessions äger tränings-
och konfliktgränssnittet. Dessa domänflöden ändras inte här.

Aktuell bas: `cf3195a4d9a71792ecd336eb57980338da96d18e`, kontrollerad mot hämtad
`origin/main` 2026-10-05. Kandidatgren: `codex/save-reliability-20261003`.
Safe Lane krävs vid eventuell release. Användaren har godkänt implementering,
men har ännu inte gett ett direkt Deploy/Live-kommando i denna chatt.

## Rättningar

1. **Medical väljer inte längre version efter aktivitetsdatum.** `date`,
   `startDate` och `lastDatabaseSyncAt` tas bort ur jämförelsen av ändringstid.
   Framtida rekommendationer kunde tidigare låta äldre innehåll vinna.
   Vid lika ändringstid behålls centrala fältvärden. Oberoende tillägg bevaras.
2. **En gammal kopia återaktiverar inte en centralt arkiverad post.** Både API:s
   merge av gamla revisioner och webbläsarens återhämtning bevarar central
   arkivering/radering. Uppdatering på aktuell revision kan fortfarande göra en
   avsiktlig återställning enligt befintligt behörighetskontrollerat flöde.
3. **Misslyckad central läsning får begränsade återförsök.** Lyckad läsning och
   senaste försök har skilda tider. Falskt resultat, avvisat promise och synkront
   fel behandlas som fel. Tre automatiska återförsök sker efter 5, 10 och 20
   sekunder; därefter får ordinarie händelser försöka efter backoff. Dolda vyer
   läses inte. Kontots/lagets kontext och bryggans autentiserade läskontext kontrolleras före återförsök och återspelning
   av väntande skrivningar. Normal lyckad polling och skydd för öppen redigering
   behåller sina befintliga intervall.

## Verifiering

- Medical API och återhämtningsmerge: **40 godkända tester**. Före rättningen
  misslyckades 21 av de 27 nya regressionsfallen; efter rättningen passerar alla.
- Delad återläsning, återförsök, kopplingar och läsisolation: **49 godkända**.
  De nio nya återförsökstesterna misslyckades före rättningen.
- Sessions durable save, kvitton, backup, delad synk, data safety och databas-
  källa: **281 godkända**. Detta är lokala kontrakttester, med simulerade API/DB-svar.
- Sessions verkliga IndexedDB och Chromium: **14 godkända**, inklusive två
  flikar, omladdning, bevarande av nyare ändringar och lokal konfliktgranskning.
- Central versionshantering och offlineåterhämtning i Chromium: **84 godkända**.
  Här ingår tappade kvitton, konto-/organisationsbyte, stängd webbläsarprofil och
  återspelning samt två isolerade Sessions-klienter mot en syntetisk HTTP-backend.
- Totalt för ovanstående riktade testomgångar: **468 godkända**.
- Syntax, plattformssäkerhet, Supabase-migreringslint, lagringsregister,
  arkitekturbudget och diffkontroll passerar. Befintliga storleksvarningar kvarstår.

Testloggar finns lokalt i `/private/tmp/fs-save-{medical-after,read-after,
core-regression,session-browser,central-browser}.log`. Inga hemligheter eller produktionsdata
användes i regressionerna.

GitHubs fulla QA för produktcommit `4cada38c849b1bcf552ab602320e425e134124dc`
passerade: 3 252 API-tester och 473 Chromium-tester, med tre överhoppade tester.
Statik, säkerhet och CodeQL är gröna. [QA-körning](https://github.com/maklind88/footballscience/actions/runs/37312966974).

Kompletterande WebKit-körning gav först 105 godkända och ett misslyckat test.
Det senare reproducerades tre gånger på oförändrad main och tre gånger på
kandidaten. En räknare visade att testets simulerade IndexedDB-fel aldrig
aktiverades. Testet ändrar nu `IDBFactory.prototype.open` i sin isolerade
webbläsarkontext och kräver att felinjektionen verkligen används. Samtliga
tidigare krav på synligt centralinnehåll, cacheläge och frånvaro av skrivningar
behålls. Ingen produktkod ändras av denna testkorrigering.

Det korrigerade lagringsfelstestet passerade tre gånger vardera i Chromium och
WebKit. En senare full WebKit-körning fick en separat 60-sekunders timeout vid
initial `page.goto` i ett Medical-test; spåret innehöll inga nätverksposter.
Det fallet passerade sedan tre isolerade repetitioner utan ändrad kod,
tidsgräns eller assertions. Orsaken till den enstaka sidöppningsstörningen är
inte fastställd.

Slutkörningen avbröts efter ytterligare tidsgränsfel under kraftigt förhöjd
datorbelastning (rapporterat enminutsmedel 91,33). Terminalt resultat: fyra
godkända, tre misslyckade, ett avbrutet och 98 inte körda. Belastningen är en
möjlig förklaring, inte ett bevis att alla fel är miljöfel. WebKit-matrisen var
då **inte slutgodkänd**. Testkorrigeringen bevarades lokalt och PR behölls som
utkast medan relevanta kontroller återstod.
Detta var status vid det tidigare avbrottet. Se uppföljningen nedan.

### Uppföljning efter återupptagen verifiering

Vid normal datorbelastning passerade samtliga **106 WebKit-tester** på
`6a788244`, utan ändrade tidsgränser eller assertions. Detta ersätter den tidigare
ofullständiga verifieringen; det bevisar inte grundorsaken till tidigare timeouts.

Granskningen mot ny main visade ytterligare ett kontextfall: organisationen kan
ändras i autentiseringsuppgifterna utan ändrad användarprofil. Tre nya tester
reproducerade att återförsök och dess throttle då kunde använda föregående
kontext. Rättningen i `96c302f4` inkluderar bryggans `getReadScope()` i jämförelsen.
Alla tre tester passerar efter ändringen. Senaste main förenades utan konflikter
med kandidaten i `eb958f963b455e006359cd50f1624329feb77c6e`. På den versionen har
`qa:static`, **385 berörda API-kontrakt** och hela matrisens **106 WebKit-tester**
passerat. Den sista WebKit-körningen slutfördes utan fel, överhopp eller retries
på 3,4 minuter. Loggar: `/private/tmp/fs-save-final-static.log`,
`/private/tmp/fs-save-final-api.log`, `/private/tmp/fs-save-webkit-integrated.log`.
Denna dokumentuppdatering ändrar ingen produkt- eller testkod. GitHubs fulla QA
ska också passera på den pushade slutversionen före releasebedömning.

Live kunde öppnas 2026-10-05 men visade inloggning. Inget autentiserat
produktionsprov eller test med två verkliga konton har genomförts här. Native
PostgreSQL 17-integrationen är ännu inte verifierad i denna miljö. Playwright
WebKit är inte ett test av fysiska Safari/iPad-enheter.

## Kvarvarande arbete, i ordning

| Prioritet | Arbete och ansvar | Godkännandekrav |
| --- | --- | --- |
| Nu | Medical/Squad: spåra arkivering vid borttagning ur truppen | Skilj medlemskap från klinisk historik. Bevisa vad som händer vid borttagning/återinträde och bevara audit. Ingen generell återställning utan granskning av berörda poster. |
| Nu | Sessions: spåra användarens faktiska lokala review | Samma konto, lag, datum och revision; jämför central version med bevarad kö. Visa båda versionerna utan tyst överskrivning eller radering. |
| Nu | Simulator, Schedule och Appearance: kontrollera sparbesked | Visa centralt sparat först efter kvitto för rätt operation/innehåll; visa lokalt väntande eller fel vid nät-/kvotfel. Respektive modulägare implementerar. |
| Snart | System + berörda moduler: synlig central revision | Mät tiden från accepterat kvitto till kollegans vy. Testa öppen redigering/dialog så färska data inte försvinner eller tyst skriver över lokalt arbete. Besluta mål innan polling ändras. |
| Snart | Medical/Periodization + System: klientklockor och konflikter | Versionskontroll för avsiktliga operationer. Testa felställd klocka, samma fält och olika fält. Nuvarande rättning av datum löser inte all klockskevhet. |
| Snart | FS Player + System: sammansatt videosparande | Avbruten skrivning mitt i playlist/review/sections/items ger ingen falsk fullständig framgång; transaktion eller explicit återhämtningsbar delstatus. |
| Snart | System: backupens faktiska täckning | Fastställ driftsatt DB/Storage-läge. Återställ tabeller, app-state och media i isolerad miljö och jämför revisioner; verifiera även felande kompatibilitetsspegel. |
| Därefter | System + varje modulägare: hållbar offlinekö | En modul åt gången; idempotenta operationer, konto/lag/roll-isolation och kvittobunden borttagning. Testa processavslut, kvotfel, återanslutning och äldre klient efter release. |
| Därefter | System + Desktop: offlineöppning | Definiera förberedda arbetsytor/media, autentiseringsgränser och kallstart. Befintlig notifierings-service-worker bevisar inte offlineöppning av appen. |

Lokala Sessions-tester visar avsiktligt att konfliktposter hålls återhämtningsbara
men inte får dölja accepterade centrala värden. De bevisar inte att användarens
rapporterade review är korrekt. Det kräver ett identifierat incidentexempel.

## Gemensam godkännandematris för varje modul

Varje modul behöver en ansvarig, dokumenterad datakälla, skrivoperation,
kvittobeteende, synlig revision, konflikthantering, köomfattning och backupväg.
Testa minst: två användare på olika respektive samma fält; två flikar; offline
under sparande; servern accepterar men svaret tappas; omstart; nät återkommer;
konto/lag/roll ändras; lagringskvot tar slut; central läsning misslyckas;
arkivering möter gammal klient; återställning möter kvarvarande klientkö.

Modulen är godkänd först när accepterat arbete återvisas, ingen annan användares
arbete skrivs över tyst och väntande arbete går att återfinna efter avbrott.
Gröna enhetstester ensamma certifierar inte hela plattformens offline- eller
fleranvändarstöd. Produktionsverifiering tillkommer efter auktoriserad release.
