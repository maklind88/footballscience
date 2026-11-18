# Mobilåtkomst, dubblettskydd och uppgraderingsguide

## Ägarskap och omfattning
System/Security äger denna release. Användaren överförde 2026-11-18 det avgränsade mobilåtkomstfelet till denna chatt och auktoriserade deploy. Berörda gränser: Chat/plattformsskalets launcher och Storage health. Sessions äger fortsatt primärdata, journal, synk och återställningskontrakt.

Ren releasebranch: `codex/history-mobile-release-20261118`.
Bas: `119e93488e8d218e7e26dd457c3aa2c1dd5addd5`.
Källkandidat: `cc4f2381c9f27f4b7d555f512f9a0dc430375248`.

Releasen är isolerad från källkandidatens tidigare experiment. Ingen aktiveringskoordinator, uppgraderingsutfärdare, offline-worker, kompakt capture-koppling eller äldre orelaterade branchändringar ingår.

## Beteende
Mobilens chattlauncher placeras ovanför navigeringsraden med skalets befintliga CSS-variabel. Tidigare sparade positioner och dragning begränsas till utrymmet ovanför den faktiska nedre navigeringsraden. Passiv omplacering skriver inte om användarens sparade position. Desktop och chattens dataflöden behålls.

Storage health innehåller guiden Prepare older tabs for upgrade. Den kan exportera och lokalt jämföra denna fliks aktuella Sessions-minnesutkast via befintliga behörighetskontroller. Den kan inte godkänna hela fliken för stängning. Konto-/team-/livscykeländring ogiltigförklarar resultatet. Ingen automatisk omladdning, stängning, synk, import, radering eller migrering utförs.

Kompaktwriterns dubblettskydd kontrollerar även återförsök av äldre exakta versioner och konkurrerande A/B-commits. Dess fyra moduler ingår som en avstängd, oinkopplad kandidat. `enabled` är false som standard, inget produktionsanrop skapar writern och befintlig capture-kod har ingen writer-injektion. Den experimentella independent-policyn kan endast väljas vid direkt konstruktion och är inte produktionskonfigurerad. Detta är inte en aktivering eller ett löfte om minskad tillväxt för nya unika versioner live.

## Mobilutredning
Chromium reproducerade att standardlaunchern täckte profilknappen. Den nya placeringen och klampningen gör vanlig touch via profilmeny → Storage health → guide möjlig även med en sparad position över menyn och efter skärmrotation.

WebKits tidigare installationsförslag var ett separat ofullständigt testförlopp. Det slutliga produktprovet väntar på förslaget och stänger det med dess normala knapp innan navigering. Ingen force-click, borttagning av DOM-element eller produktändring i installationsfunktionen används.

Första nya mobilprovets Chromium-navigering lyckades, men testet väntade på fel stängknappsnamn. Selektorn rättades till den befintliga Close storage health; den misslyckade loggen finns kvar. Detta var ett testfel, inte produktfix.

## Verifiering
Den riktade konfigurationen `qa/playwright.history-mobile-release.config.mjs` omfattar 78 fall i Chromium och WebKit: mobilåtkomst, exakt utkast/journal-bevarande, full lagring, offline, filjämförelse, behörighetsbyte, livscykel, dubbletter, samtidiga flikar, avbrutna transaktioner och avstängd writer. Första körningen med isolerad Playwright 1.64.0: 78 passed. Projektets låsta 1.59.1 verifieras separat före release.

Testerna är namngivna .smoke.spec.mjs så Chromium-fallen även ingår i ordinarie full QA/CI. De gamla experimentens blandversions-/kallstartsprov är inte denna releases verifiering och har inte flyttats in för att kräva aktiveringskod.

Alla lokala data är syntetiska. Mobilproven bevarar exakt Sessions-minnesutkast eller pending-journal, primärvärde och sparad launcherposition; centrala fixtureeffekter är noll. Användares verkliga data och äldre flikar berörs inte.

## Kvarvarande begränsningar
Kompakt skrivning förblir avstängd. Guiden kan inte läsa eller säkra en annan gammal fliks minne, och ny kod kan inte retroaktivt reparera en gammal klients raderingsfel. Ingen historisk städning eller datareparation ingår. Hela plattformens lagrings-/offlineprogram är inte färdigt genom denna release.

Produktions-SHA, deployment-URL och efterkontroller dokumenteras i releaseevidens efter den officiella Safe Lane-körningen. Ingen produktionsverifiering påstås före genomförd release.

### Låst WebKit och nätavbrottsmodell
Första körningen med Playwright 1.59.1 gav 77 passed och ett misslyckat offline-filprov. En fristående 18-byte-fil lästes online men File.text() gav NotReadableError när context.setOffline(true) användes, även för en bufferfil utan appkod. För guideprovet blockeras nu alla sidans nätanrop med internetdisconnected och ett explicit misslyckat fetch-anrop krävs. Riktig nedladdning, läsning från disk, val av samma fil, jämförelse och alla bevarandeassertioner är kvar. Den ursprungliga fulla offlinekontrollen passerade med 1.64.0. Inga produktionskontroller eller behörighetsgränser försvagas.

Slutlig riktad verifiering på låst Playwright 1.59.1: 78 unika fall godkända (77 i första körningen och det korrigerade nätavbrottsprovet i en omkörning av de fyra produktfallen). 37 Chat-kontraktsfall samt qa:static/syntax/diff-check godkända. Befintliga arkitekturstorleksvarningar kvarstår.

En ny autentiserad, läsande livekontroll ingår i officiell staging/production-QA: vanlig mobil touch till guiden, ingen horisontell överströmning, inget importerat kompaktwriter-modul och blockering av alla centrala app-state-skrivningar i dess isolerade profil. Den skapar inga användarutkast eller historikposter och ändrar inget befintligt arbete.

## Uppdaterad releasebas
Den första fullständiga lokala Safe Lane-körningen på bas 119e93488 gav 4 755 passed och 3 skipped. Releasevakten stoppade därefter staging eftersom DM/Schedule-releasen använde releasevägen. Ingen main/staging/produktion ändrades av denna kandidat; endast den isolerade kandidatbranchen pushades.

Staging för DM/Schedule c28089b791f084cc75885f6010f6e4aa349e9ebc passerade och samma version integrerades i main. Kandidaten ombaserades utan konflikter på denna nya exakta bas. De relevanta ändringarna berör chattens inbox-refresh och DOM-reconciliation samt QA/releasekontroller, inte lagringens producer eller våra launcherfiler. Eftersom widgeten är gemensam verifieras mobil-/guideintegration igen och en ny full Safe Lane-körning krävs före publicering.

En tidigare avbruten lokal full-QA-körning saknade FFmpeg-binär eftersom beroenden först installerades utan installationsskript. Binären installerades med projektets låsta paket, båda fallerade FFmpeg-testen passerade, och hela QA:n kördes sedan från början med resultatet ovan. Ingen videokod eller kontroll ändrades för att dölja miljöfelet.

Mobil-/guideomkontrollen på c28089b: 8 passed i Chromium och WebKit (standard/sparad launcherposition samt minnesutkast/pending). Kandidatens produktfiler var oförändrade av ombaseringen.
