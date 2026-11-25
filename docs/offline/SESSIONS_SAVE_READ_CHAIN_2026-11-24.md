# Sessions och Medical genom den ordinarie appen

Slutlig bas `d490f2a26620b3dc7183a34edc8eab75ce805240` från `origin/main`.
De första proven kördes på `28498130b67fa7c964bbd955727150dcc26ec477`.
Mellan baserna ändrades endast Video Analysis och dess QA.
System/Security äger den gemensamma spar- och läsgränsen. Sessions och Medical
behåller sina datakällor, behörighetsregler och domänkonflikter. Evidensen gäller
lokal kandidat i isolerad miljö och syntetiska konton.

Den tidigare Sessions-kandidaten `cfd92d500` kunde bevara en lokal datumbas
i samma transaktion som exakt kvitterad journalrad avslutades. Det minskar
risken att en mottagen serverkvittens lämnar en tom lokal återställningsväg.
Men kvittens och lokal lagring hanterades som ett gemensamt skrivutfall i skalet.
Den här kandidaten kopplar därför den atomiska kontrollpunkten till Sessions
och gör dess delutfall synliga genom den befintliga sparstatusen.

| Situation | Användarens besked och förväntat resultat |
| --- | --- |
| Ingen lokal transaktion lyckades | Senaste ändringen finns endast i fliken. Den får aldrig visas som sparad och kan inte rekonstrueras efter en processkrasch. |
| Journalen är beständig och serverkvittot saknas | Sparat lokalt. Central sparning väntar på bekräftelse. Samma operation kan återförsökas. |
| Rätt version är kvitterad men den lokala kontrollpunkten nekas | Sparat centralt. Den lokala återställningskopian kunde inte uppdateras. Journalraden behålls. |
| Äldre kvittens och nyare lokal version | Kvittensen gäller endast sin operation. Senaste ändringen behåller sin egen status. |
| Faktisk konflikt | Behåll originalet och visa granskningsorsaken. Andra klienter ser den centralt accepterade versionen. |
| Framgångsrik läsning men cacheunderhåll nekas | Den lästa versionen visas. Ett cachefel ger ingen tom ersättningsdata. |

Den accepterade basen är datumvis och bunden till ägaren. Den är en intern lokal
kontrollpunkt och kan inte ersätta den aktiva editorn eller hela kalendern.
Kandidaten från `728d15b35` för separat kall återställning ingår inte. Den kompakta
writern aktiveras inte. Ingen historisk migrering, bearbetning av verkliga
användardata eller deploy ingår.

## Verifieringsgräns

Sessions-provet kör den riktiga editorn, localStorage, IndexedDB, HTTP-rutten
`api/app-state.js`, dess ordinarie åtkomstkontroll och den riktiga
PostgreSQL-funktionen för Sessions-kvitton. PostgreSQL är en ny disponibel lokal
instans över privat Unix-socket. Den använder projektets avgränsade basmigrationer
och Sessions-kvittensmigrationen. Supabase Auth, PostgREST-transport och
objektlagring ersätts i fixturen. De godkänden syntetiska aktörerna går genom
produktens API-policy. Testet certifierar därmed varken Supabase Auth-tjänsten,
full produktionstopologi eller alla tenant-scope från verkliga medlemskap.

Full localStorage och fullt originutrymme utlöses i disponibla Chromium-profiler.
Kvoten begränsas med CDP. Processkrasch körs i just den disponibla profilen.
Det särskilda felet i kontrollpunkten injiceras för att bevisa det precisa
utfallet även när en liten verklig skrivning ibland fortfarande skulle rymmas.
Mätningarna visar vad som överlever browserprocessen i denna miljö, med andra
resultat möjliga vid fysisk diskförlust, operativsystemets krasch eller
webbläsarens borttagning av originlagring.

Medical läser en syntetisk rekommendation som lagrats via ordinarie Medical-API
och dess lokala PostgreSQL-funktion. Det verkliga app-state-API:ts läspolicy och
coach-projektion följer med till separata läsare, genom Medical först och Sessions
först. QA ändrar inte den kliniska policyn. Se körresultaten för exakt vilka
tillstånd som styrks i UI respektive vid API-gränsen.

## Återkörning

Använd PostgreSQL 17 med `initdb`, `pg_ctl` och `psql` tillgängliga i samma mapp.
Sätt `FS_RECOVERY_PG_BIN` till den mappen. Kör från denna arbetskopia efter att
projektets Node-beroenden och Playwright Chromium/WebKit installerats.

```bash
npx playwright test --config=qa/playwright.session-saving-chain.config.mjs
npx playwright test --config=qa/playwright.medical-confirmation.config.mjs qa/medical-saving-chain.native-browser.spec.mjs
node --test qa/session-save-receipts-integration-native.test.mjs
npm run qa:static
```

Det nya Sessions-provet tillhör befintligt PostgreSQL-arbetsflöde och ska köras
vid ändringar i berörda spar- och läsvägar. Även det nya Medical-provet upptäcks
av sitt befintliga native-arbetsflöde. De använder lokalen syntetiska miljöer och
kräver inga produktionshemligheter. CI-resultat kräver en framtida körning.

Sessions-evidensen innehåller millisekunder mellan serverns kvittens och första
verifierad visning i oberoende klient, mellan databascommit och visning,
äldsta pending-ålder samt antal review-orsaker. Mätningen inkluderar uppstart
av en ny klient. Ett tappat svar räknas aldrig som levererad kvittens. Endast
aggregerade provresultat publiceras från den dedikerade reportern.

## Tolkning och kvarvarande gränser

- Full appstart i en ny Chromium-process utan nät gav ett separat blockerat
  navigationsutfall. Det godkända testet verifierar begränsningen. Det ger
  inget offlinegodkännande för Sessions-editorn.
- Ett tidigt WebKit-prov höll svaret innan testdatabasen började arbeta och
  passerade klientens befintliga deadline. Det gav ingen levererad
  Medical-läsning. Slutprovet håller leveransen medan servern arbetar och
  verifierar HTTP-svaret före visningskontrollen. Produktens deadline ändrades
  inte. Det tidiga utfallet visar varför UI behöver ett särskilt besked när
  Medical-läsningen uteblir eller är otillgänglig.
- App-state-API:t skiljer mellan behörig frånvaro och policynekad läsning
  genom `absentKeys` respektive utelämning. Vyerna har kvar en begränsning i
  hur uteblivet nät-/behörighetssvar förklaras jämfört med en saknad
  rekommendation. Det kräver ett separat, scopebundet lästillstånd genom
  Shell och konsumentvyn. Den globala kompatibilitetslagringen var underlag
  för detta prov. Riktig lagpartitionering och fysisk mobil är inte verifierade.
- Tidiga Sessions-prov avslöjade flera begränsningar i testflödet. En större
  kvotallokering kan nekas samtidigt som en liten journalrad ryms. Den negativa
  grenen växlar därför efter uppmätt kvotfel till ett precist nekat journalanrop.
  UUID-rader hämtas i nyckelordning från IndexedDB, så tappat-kvitto-provet
  kopplar nu efterföljaren till det faktiska SQL-kvittot. Testet väntar på
  Sessions egen verifierade baslinje, så andra modulers uppstart avgör inte
  om Sessions-vyn får användas i provet.
- Drift, produktionsbehörighet, verklig Supabase-transport och prestandamål
  återstår att verifiera där de ska användas. Testets tider är lokala mätningar
  inklusive klientuppstart och normal väntan i den disponibla miljön.

## Slutresultat

| Prov | Utfall |
| --- | --- |
| Riktig Sessions-editor, API och PostgreSQL | 10 godkända, 0 fel, 0 överhoppade |
| Medical från registrering till båda produktvyerna på samma slutbas | 2 godkända, Chromium och WebKit |
| Sessions kontrakt och befintlig Chromium-regression efter fixen för två flikar | 237 + 20 godkända |
| Separata Sessions-API- och PostgreSQL-kvittensprov | 17 + 8 godkända |
| Befintlig Medical native-regression på den första basen | 20 godkända |
| Sanerad diagnostik, `qa:static`, release-regler, syntax och diff-check | Godkända |

Sessions från kvittens till visning på en oberoende klient mättes till
1874–3547 ms i de 8 observationer där detta intervall gick att
mäta. Äldsta väntande operation var 166 ms i den uppmätta kön.
De två konfliktfallen visade sammanlagt 2 verkliga
konflikter. I Medical mättes 4283–23062 ms i fyra
observationer. Tiderna inkluderar klientuppstart och används inte som
prestandamål. [Sanerade mätvärden och källhashar](SESSIONS_SAVE_READ_CHAIN_2026-11-24.json).
