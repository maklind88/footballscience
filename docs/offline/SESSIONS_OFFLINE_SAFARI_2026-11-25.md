# Sessions offline i installerad Safari

Kandidatbas `8abf1158fd0bbe3107a3e257fb1deb1b61eb5757`.
Verifieringen gäller Safari 26.2 på macOS 26.2 (25C56). Den lokala
signeraren och testservern använder syntetiska identiteter och arbetsdata.

## Reproducerat fel och rättning

Safari kunde spara en kvitterad version och en separat väntande ändring
genom vanliga Sessions. Förberedelsen av kodpaketet stannade i workern.
En separat diagnostisk körning rapporterade `TypeError` vid iteration
över `response.body`. Stöd för asynkron iteration över
`ReadableStream` infördes i Safari 26.4.
[WebKits versionsanteckningar](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/#readablestream-async-iteration)

Den lokala rättningen använder `getReader()`. Den räknar bytes under
läsningen, avbryter överskridna svar och frigör läsaren. Samma gränser,
integritetskontroller och lagringsvillkor gäller. Det var den enda
ändringen i produktkod.

## Vad installerad Safari visar

- Vanliga Sessions sparade en kvitterad lokal datumkopia och en osynkad
  ändring. Samma vyn förberedde datumet genom den riktiga knappen.
- Den förberedda appfliken stängdes. Den syntetiska TCP-servern stängdes och
  en oberoende begäran till den nekades. En ny flik gick direkt till samma
  Sessions-adress. Den visade rätt datum, kvitterad kopia och osynkad
  version separat, i läsläge och med samma verifierade kodpaket.
- En annan datumadress gav besked om saknad åtkomst. Den kvitterade
  kopian, journalen, arbetskopiorna och historiken jämfördes efter att
  onlineeditorn stängts och var oförändrade genom offlineöppningen.
  När onlineeditorns eget avslut tillförde en vanlig historikkopia
  kontrollerades de tidigare raderna separat.
- En ny SafariDriver-session på samma testadress saknade den sparade
  syntetiska inloggningen, förberedelsen och service workern. Det
  avgränsar resultatet till en ny flik inom samma Safari-process.
  Automationsfönster använder en separat datalagring som börjar tom
  för varje session. [WebKit om automationsisolering](https://webkit.org/blog/6900/webdriver-support-in-safari-10/#safari-exclusive-safeguards)

En full Safari-omstart med bibehållen lagring kräver en beständig separat
testprofil som kan stängas och startas utan påverkan på användarens
fönster. Inget sådant testkonto eller test-VM fanns tillgängligt här.
Ingen fysisk mobil fanns tillgänglig. Mobilens omstart, lagring och
offlineåtkomst är öppna verifieringspunkter.

Kör det isolerade native-provet från denna arbetskopia med SafariDriver
redan behörigt att öppna egna automationsfönster.

```bash
node qa/sessions-offline-start-safari.mjs /private/tmp/fs-sessions-safari-evidence.json
npx playwright test --config=qa/playwright.sessions-offline-start.config.mjs
npm run qa:static
```

Provet använder loopback, en disponibel signerare och syntetisk auth endast
under onlineförberedelsen. Offlineöppningen får inga injicerade data eller
appfiler. Ingen deploy, kompakt skrivning eller behandling av verkligt
sparat eller osynkat arbete ingår.

## Kontrollresultat

- Installerad Safari 26.2. Fyra kontroller godkända inom det avgränsade
  automationsprovet. Ny dokumentladdning utan fungerande origin,
  osynkad version synlig vid öppning av dess panel och oförändrade
  kontrollsummor från stängd editor till offlinevisning.
- Chromium och Playwright-WebKit. 22 godkända och två överhoppade
  kvot- och kraschprov som kräver Chromium CDP.
- Statiska kontroller och Git diff-kontroll godkända.
- Testad worker SHA-256
  `b6b218fececfcac3e0b81ece8ed63844313ebd2e033757e8f637047341375b51`.

## Full omstart med en beständig Safari-profil

Den 25 november 2026 verifierades produktkandidaten
`060d5310d0616fcabfa5948d32e5ed77e89e8613` i installerad Safari 26.2
på macOS 26.2. Provet använde den separata vanliga profilen
`FS Sessions Offline QA 1125` och en isolerad syntetisk loopback-server.
Safari hade noll öppna fönster när profilen skapades. Den enda öppna
Safari-vyn vid avslut var testprofilens passiva kontrollsida.

| Kontroll | Observerat resultat |
| --- | --- |
| Förberedelse | Vanliga Sessions sparade syntetisk ändring A centralt och behöll ändring B osynkad. Förberedelsen utfärdade exakt en läsbehörighet för `team-ncc-first` och datumet 2026-11-25. |
| Full Safari-omstart | Safaris menyval Avsluta Safari stängde PID `52968`. En oberoende processkontroll fann sedan noll Safari-processer. Nästa start gav PID `24883`. Profilmarkören visade samma testprofil före och efter. |
| Nätbortfall | Testservern stängdes före den nya Safari-starten. TCP till testadressen gav `ECONNREFUSED` före navigering och efter verifieringen. Den ordinarie Sessions-adressen användes i den nya processen. |
| Läsvy | Sessions visade rätt lag och datum, offline-läsläge och den kvitterade versionen. Den osynkade versionen gick att fälla ut separat. Appens tillgänglighetsträd hade noll redigeringsfält. |
| Arbetsbevarande | Samma SHA-256 före och efter omstart. Kontrollsumman täcker den kvitterade kopian, journalen, lokala Sessions-data, tillhörande manifestpost och 24 historikposter. |
| Versionsidentitet | Samma förberedda testpaket `49161e8e964ff3a6ede2e0e5a8d83ab9e9237ac3fb3706bbfba27b8ebdd84426`. |

SHA-256 för skyddat syntetiskt arbete vid båda mättillfällena:
`89b2a6d4e40b623dd79084f100ccecb2ee328a8dca22d4de1a811add6432753a`.

Onlineförberedelsen använde samma syntetiska fixture som den tidigare
Safari-körningen. Så snart editorn hade stängts lästes baslinjen från
en passiv sida. Efter omstart öppnade Safari ordinarie Sessions utan
injicerad startkod. Web Inspector användes därefter enbart för att
göra skrivskyddade mätningar och markera deras resultat i testflikens
titel. En separat UI-kontroll läste innehållet i Safaris
tillgänglighetsträd. Provet använde varken SafariDriver eller
användarens vanliga Safari-profiler. Den beständiga testprofilen
lämnades kvar. Ingen produktkod, deploy, kompakt skrivning eller
verkligt sparat eller osynkat arbete ändrades under uppföljningen.
