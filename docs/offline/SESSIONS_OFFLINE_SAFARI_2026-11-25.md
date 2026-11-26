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
