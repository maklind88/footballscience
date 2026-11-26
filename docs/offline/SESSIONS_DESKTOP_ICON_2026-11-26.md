# Sessions kallstart från Desktop-ikonen

Desktop-kandidaten bygger på `main` `4bac0dc49c72834ad74fa00108f52b80e02e296d` och de tre lokala Sessions-committarna till och med `a1aa3575e1cacbc934ab39a825e0446358869890`. Den installerade Chrome-webbappen använder `/?workspace=home`. Workern hanterar även startsidan utan sökparametrar.

När startsidan går att nå gäller nätverkssvaret, inklusive HTTP 401 och 403. Vid nätbortfall används en komplett, verifierad Sessions-version. **Open prepared Sessions offline** visas efter kontroll av lokal kopia och giltig åtkomst för samma konto, lag och datum. Passet visas när länken öppnar ordinarie Sessions-adress i läsläge. Ett äldre paket utan stöd för Desktop-start visar ett återanslutningsbesked. Ordinarie Sessions-adress kan fortfarande öppna den äldre, giltiga kopian.

Offlinevyn innehåller inga redigeringsfält. Den visar den serverkvitterade kopian för sig och låter användaren öppna den osynkade versionen separat. Vanliga Sessions sparning och synkning ligger utanför offlinevyn. Vyn anropar inget API. Paketet utan testnyckel omfattar 21 filer, 540 847 byte och har ID `3c73c532968b37c1c7809ba5f4595c259b2e8a42b3c9717be9309aefbc9759c9`.

## Webbläsarprov

```bash
npx playwright test --config=qa/playwright.sessions-offline-start.config.mjs
npm run qa:static
git diff --check
```

Chromium och WebKit öppnar båda startadresserna från en ny webbläsarprocess efter att testservern har stängts. Proven täcker byte av konto, känt serveravslag, utgången behörighet, äldre eller saknat paket och kontroll av oförändrade arbetskopior, kvittenser, journal och historik. Chromium provar även nekade skrivningar i localStorage och IndexedDB följt av en avsiktlig krasch i webbläsaren. Det provet kräver Chromium CDP.

Desktop-proven gav 17 godkända och ett överhoppat. Direktstart, kodpaket och återanslutning gav 22 godkända och två överhoppade. De tre överhoppen är kvot- och kraschprov som kräver Chromium CDP och är därför undantagna i WebKit. `qa:static` och `git diff --check` passerade.

Samtliga profiler och arbetsdata i dessa prov är syntetiska. Onlineförberedelsen använder den riktiga Sessions-editorn med syntetisk inloggning och centrala svar från en lokal testserver. Workern och den signerade läsbehörigheten använder produktkod med disponibla testnycklar. Ingen produktionssättning, cache-rensning, ändring av verkligt arbete eller aktivering av kompakt skrivning ingår.

## Installerad Chrome-ikon på macOS

Den 26 november 2026 kördes provet med Google Chrome 158.0.8127.37 och macOS 26.2 (25C56). Chrome installerade en separat webbapp från ett loopback-ursprung och knöt den till en egen tillfällig `--user-data-dir`. Manifestet använde samma ID-beräkning från startadressen som den befintliga Desktop-installationen. Chrome genererade den körbara `app_mode_loader` och genvägen `/?workspace=home`.

| Kontroll | Utfall |
| --- | --- |
| Förberedelse | Ordinarie Sessions-editor sparade en kvitterad och en osynkad syntetisk ändring. Provet lade även in en historikpost. Exakt ett datum förbereddes. |
| Hel omstart | Chrome-process 10090 avslutades. Loopback-servern stängdes. En ny start genom macOS `open` på den installerade testappen startade webbläsarprocess 10721 och appstartaren 10717 i samma testprofil. |
| Läsning från ikonen | Första vyn visade endast länken till förberett arbete. Ett klick öppnade `/?workspace=session-planner&date=2026-10-14`, med rätt lag, datum och kvitterad kopia. Den osynkade ändringen gick att fälla ut separat. |
| Arbetsbevarande | Efter stängning av testappen lästes samma profil från en passiv testsida. SHA-256 för Sessions kvittenser, journal, lokala arbetskopior, manifestpost och historik matchade före och efter. Testningen läste databasen i en skrivskyddad transaktion. |

SHA-256 för skyddat syntetiskt arbete vid båda mättillfällena var `679605b3ea5c478481bf7cb6d794bcda78f606d720cc917dd0a9a5c0732c6b03`. Testpaketets ID var `803f84a013f1e2b852affc32f66af4f68b3ffd118bc3d81a2cb878f44096a513` och workerns SHA-256 var `36c224c0f3354407c6d2ad4c491d16064b35cb5b698682831480b4140d31eead`.

För det manuella ikonprovet, starta `startSessionsOfflineStartFixture` med ett unikt appnamn i testmanifestet och installera appen från loopback-adressen i en separat Chrome-profil. För den äldre ikonidentiteten tar testmanifestet bort det explicita `id`. Förbered syntetiskt arbete med `makeSyntheticWork`, `prepareOffline` och `addSyntheticHistoricalVersion` i `qa/helpers/sessions-offline-start-browser.mjs`. Stäng editorn och ta baslinjen med `readProtectedWork` från testsidan. Stäng sedan hela testprocessen och loopback-servern. Starta enbart den installerade testappen via dess ikon, välj **Open prepared Sessions offline** och öppna även den väntande versionen. Stäng testappen och starta samma testprofil på den passiva testsidan igen för den sista jämförelsen.

Resultatfilen `/private/tmp/fs-desktop-native-shim.9PlYhW/candidate-legacy-8.json` innehåller process-ID, observerade adresser och kontrollsummor från denna körning. Skärmbilderna `installed-app-cold-10706-{1,2,4}.png` finns i `/private/tmp/fs-sessions-desktop-offline-TNkoHp/`. DOM-proven verifierar separat att läsvyn saknar redigeringsfält. Den befintliga Desktop-ikonen och användarens vanliga Chrome-profil användes inte i provet.

En andra separat Chrome-profil verifierade det aktuella manifest-ID:t `/?app=football-science` med samma startadress `/?workspace=home`. Förberedelseprocess 10801 avslutades före start via ikonen. Den nya Chrome-processen var 10831 och appstartaren 10825. Båda versionerna av arbetet gick att läsa i sin egen panel från samma datumadress offline. SHA-256 för det skyddade arbetet matchade före och efter, `176118cd9534cd69794943c958e087ade879414305694d718bf256da2d9731c7`. Resultatfilen är `/private/tmp/fs-desktop-native-shim.9PlYhW/candidate-modern-4.json` och motsvarande bilder finns i underkatalogen `six/`. Testprocesserna stängdes och de två testikonerna flyttades till sina egna tillfälliga testmappar.
