# Kallstart för Sessions i läsläge

Lokal kandidat på bas `58c9b92bcc619d084a0855b13503ed9266a302f4`.
System/Security ansvarar för startpaket, åtkomst och bevarande. Sessions
äger datumdata, kvitton, journal och konfliktregler. Shell äger den gemensamma
webbstarten och workern. Appens befintliga pushflöde används fortsatt.

## Flöde

1. Användaren öppnar ett datum med en serverkvitterad lokal kopia i Sessions.
2. **Prepare offline access** hämtar endast statisk kod för just läsläget.
   En komplett version verifieras med SHA-256, skrivs i en separat databas
   och läses tillbaka innan den kan väljas för kallstart.
3. App-state läser aktivt konto, accepterat medlemskap och befintlig
   Sessions-policy. En signerad läsbehörighet binder ursprung, inloggning,
   konto, organisation, lag och datum. Giltigheten följer det kortaste av
   den exakta tokenens återstående tid och en timme.
4. Efter avstängd webbläsare och nätbortfall öppnar
   `/?workspace=session-planner` en separat statisk startfil för den vanliga
   Sessions-adressen. Vyn återanvänder Sessions ordinarie rubrik, fältrenderare
   och stilar. Den kvitterade kopian och osynkade eller granskade versioner
   hämtas tillsammans i en skrivskyddad transaktion och visas separat.
5. Vid återanslutning väljer användaren **Open Sessions online** för att
   återgå till den vanliga appen. Den ordinarie synkningen äger fortsättningen.

Testnycklar skapas i minnet på testservern. Incheckat verifieringsregister
är tomt. Ingen livekonfiguration, produktionsnyckel, kompakt skrivning
eller separat återställningsvy aktiveras av ändringen.

## Bevarande och gränser

- Kodpaketet innehåller bara statiska resurser. Offline-dokumentet kan
  varken anropa API:t eller starta bakgrundssynk. Historik, kvittensbas,
  arbetskopior, journal och produktcache läses eller lämnas orörda.
- Paket byts först efter integritetskontroll och beständig skrivning.
  Öppna offlineflikar hämtar resterande moduler från sin egen version.
  Fel under hämtning eller kvotavslag på nästa paket lämnar föregående
  version valbar. Vid åtta paket eller 32 MiB stoppas ytterligare
  förberedelse. Kandidaten innehåller ingen rensningsfunktion för paket.
- Behörigheten måste stämma med den enda sparade inloggningen. Känt avslag
  vid ny förberedelse, observerat byte av konto/lag och utloggning spärrar
  den berörda förberedelsen. Oläslig, utgången eller felaktig åtkomst visar
  ett besked utan att ta bort arbetsdata. Omedelbar fjärrspärr när enheten
  saknar nät och operativsystemets beständighet efter diskförlust ligger
  utanför dessa prov.
- Första avgränsningen kräver en serverkvitterad datumkopia på samma
  webbläsarprofil. Ett pass som endast lästs centralt saknar den sortens
  lokal kopia. En session utanför datumet, kliniska paneler, redigering
  och kallstart från appens allmänna startadress ingår inte. Stöd i
  installerad Safari och fysisk mobil kräver egna enhetsprov.

## Återkörning

Kör från den isolerade arbetskopian. Playwright behöver Chromium och
WebKit. PostgreSQL-provet behöver en lokal PostgreSQL 17-binärmapp med
`initdb`, `pg_ctl` och `psql`; provet startar en tillfällig instans.

```bash
npx playwright test --config=qa/playwright.sessions-offline-start.config.mjs
npx playwright test --config=qa/playwright.config.mjs --project=api-contracts \
  qa/sessions-offline-access.api.spec.mjs qa/sessions-offline-grant.api.spec.mjs \
  qa/session-planner-module-contract.api.spec.mjs
FS_RECOVERY_PG_BIN=/path/to/postgresql/17/bin \
  npx playwright test --config=qa/playwright.session-saving-chain.config.mjs
npm run qa:static
git diff --check
```

Webbläsarprovet startar riktig Sessions-kod och använder en verklig
webbläsarprofil samt en lokal server som stängs före kallstarten. Onlineauth
och kvittenssvar är syntetiska där. Kodpaketet och den signerade tillåtelsen
byggs med produktkod. Serverkontraktet kör riktiga app-state-rutten med
syntetiska Supabase-svar och avvisar varje oväntad begäran. Den separata
PostgreSQL-sviten täcker den riktiga kvittensfunktionen och synkreglerna.

## Resultat

| Kontroll | Utfall |
| --- | --- |
| Kallstart, bevarande, kodversioner och återanslutning i Chromium/WebKit | 22 godkända, 2 överhoppade Chromium-specifika kvot-/kraschprov i WebKit |
| Sessions, offlinebehörighet, app-state och chattnotiser | 27 godkända |
| Sessions verkliga PostgreSQL-kvittens, sparning och konflikter | 10 godkända |
| `qa:static` och Git diff-kontroll | Godkända |

Efter stoppad TCP-origin och omstart utan injicerad startkod visar samma
Sessions-adress rätt kvitterad version, osynkad version och eventuell
granskningsversion. Kontrollsummor för skyddade lokala poster och historik
är lika före och efter. Offline-dokumentet gör noll API-anrop. När
testservern kom tillbaka gick exakt den väntande operationens ID genom
den vanliga kön och fick en central effekt i det syntetiska systemet.

Chromium nådde `QuotaExceededError` i både localStorage och IndexedDB.
Efter avsiktlig processkrasch kunde den tidigare förberedda vyn fortfarande
öppnas. En ny kodgeneration som nekades kvot lämnade den tidigare
verifierade generationen användbar. En öppen flik fortsatte med sin
kodversion när en annan flik förberedde nästa generation.

Lokalt kodpaket utan testnyckel omfattar 21 filer och 540 110 byte.
Paketets ID är
`2383b61d11f080fe7cec2e503cb5fce1b1734298ce924b51e9f74f287c961264`.
Testpaketen innehåller alltid tillfälliga verifieringsnycklar för den
disponibla loopen och får därför andra identifierare.
