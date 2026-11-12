# Separat Sessions-utkast från sparad historik

Ägare: System/Security, gemensam historik och separat lokal utkastlagring.
Sessions Planner äger fortsatt sina data, behörigheter, editor, sparjournal,
konfliktlösning och central replay. Ingen modulkod ändras; endast publika
Sessions-kontrakt konsumeras. Medical och Librarys återställning lämnas orörd.

Branch: `codex/history-recovery-draft-20261112`.
Implementeringsbas: `98a8682642534cdcf0c5b1f97a126dfc9492a923` (föregående QA-prov).
Produktbas/origin-main vid start: `62116896cfa43b8f6c3b08beaf37ea5a8d8b46c1`.
Användaren har beställt implementation och lokal verifiering, inte en release.

## Beslut och avgränsning

Bygg en uttrycklig väg från en verifierad historikkopia till ett **separat,
beständigt granskningsutkast** för Sessions Planner. Återställ inte in i den
aktiva planen eller dess arbetskopia. Den befintliga automatiska Sessions-
återställningen kan ändra planens state och används därför inte här.

Utkastet är en oföränderlig kopia att öppna, granska och ladda ned. Det är inte
en redigerbar Sessions-plan eller en köad synkoperation. Att tillämpa eller redigera
utkastet genom Sessions befintliga konflikt-/sparflöde är ett separat produktsteg;
ingen sådan förmåga påstås vara färdig av denna leverans.

Ingen kompakt writer aktiveras. Inga befintliga kopior migreras eller rensas.
Det nya utkastet lagras okomprimerat i en separat databas och uppstår bara efter
ett uttryckligt klick. Det här är en återställningsförmåga, inte en besparing av
lagringsutrymme: en ny unik återställningskopia använder extra utrymme.

## Produktflöde

1. Aktiv, autentiserad admin öppnar **Storage health → Review saved browser copies**.
2. Historik med Sessions-innehåll erbjuder **Create separate Sessions draft**.
3. Kopian läses på nytt via produktens kompatibilitetsläsare. Den måste vara exakt
   samma kopia som visades, tillhöra aktuellt scope och vara läsbar med nuvarande
   behörighet. Sessions-innehållet valideras mot modulens publika datumkontrakt
   med högst 366 datum och kontraktets gräns på 200 block per datum. Kopior som
   kräver modulernas särskilda recovery-format lämnas i sina befintliga flöden.
4. Sessions-värdet och dess fullständiga ursprungliga manifestpost kopieras
   oförändrat. Id, tid och SHA-256 för källans fulla envelope bevaras som proveniens.
   Övriga modulers innehåll kopieras inte in i utkastet.
5. Payload och katalogpost skrivs i samma IndexedDB-transaktion. Sparbesked ges
   först på `transaction.oncomplete`. Retry av samma källa ger samma utkast.
6. **Review recovery drafts** öppnar tidigare utkast efter omladdning. Datum,
   blocktitlar och text kan granskas; nedladdningen innehåller det fullständiga
   utkastet. En separat schemaform hindrar att filen förväxlas med en vanlig
   plattformsbackup eller godkänd synkoperation.

Visning begränsas till 30 datum med kortade textförhandsvisningar. Hela värdet,
inklusive tombstones, taktik och okända bevarade Sessions-fält, finns i kopian.
Inga fält normaliseras bort för att få import/replay att lyckas.

## Behörighet och bevarande

- Befintlig admin-only-gräns för full historik behålls: aktiv admin, ingen dev-mode,
  aktuell central read-scope. Dessutom krävs Sessions befintliga `canEditSessionPlanner`.
  Ingen ny rättighet ges till coach, medical, team-admin eller gäst.
- Läsa, lista, skapa och ladda ned kontrollerar aktuell åtkomst. Scope-/rollbyte
  och auth A→B→A invaliderar vyn och dess generation samt avbryter pågående
  transaktioner via AbortSignal. Försenad avkodning får inte publicera innehåll.
- Om ett byte inträffar efter en faktisk commit kan en oföränderlig kopia redan
  tillhöra det gamla scopet. Den raderas inte som kompensation och visas inte
  för den nya användaren. Åtkomstkontrollerna är klientens befintliga modell,
  inte serverautentisering av en browserdatabas mot en användare med diskåtkomst.
- Varken aktiv Sessions-state, native storage, manifest, minnesutkast, sparjournal,
  källhistorik eller centrala writes berörs av den nya tjänsten.
- Utkastets entry bevarar principalScope, pendingCentralSync, localWritePrepared,
  pendingBaseRevision, serverRevision, hash och övriga fält exakt. Dessa är
  **källans** metadata, inte en ny central kvittens för utkastet.

## Lagringskontrakt

Databas: `football-science-history-drafts-v1`, version 1. Separata stores:
`drafts` och `catalog`. Ingen uppgradering av en befintlig produktdatabas.
Read-only listning skapar inte databasen när den saknas. Okänt schema avvisas.

Deterministiskt id består av SHA-256 över innehåll, scope och källproveniens.
Skapandetid deltar inte i retry-identiteten. Parallella försök serialiseras i
en gemensam readwrite-transaktion. En identisk kopia återanvänds endast om även
den faktiska payloaden och katalogen stämmer. Korrupt kopia repareras inte tyst.

Budget: högst 32 kopior totalt per browserorigin, högst 16 MiB logiskt JSON-innehåll
inklusive katalogmetadata och högst 8 MiB per kopia. Browserns verkliga kvot kan
stoppa tidigare. Gränserna stoppar nya kopior utan automatisk eviction/radering;
de är ingen garanti för obegränsad historik. Inga nya växande diagnostikloggar.
Timeout avbryter transaktionen och sena öppningar får inte skriva i bakgrunden.

Storage health inventerar den nya databasen read-only med egna kategorier.
Den visar antal och uppskattade storlekar, aldrig innehåll, scope eller id.
Utkasten ingår inte i serverns backup eller den vanliga localStorage-backupen;
egen nedladdning är en uttrycklig export. Browserlagring kan fortfarande försvinna
vid profilrensning, eviction eller enhetsfel.

## Tester och observerade begränsningar

**Slutresultat: 425 passed, 0 failed, 0 skipped**, 5,5 minuter, Chromium och
WebKit samt befintliga API-kontrakt. Där ingår 58 nya körningar: 36 isolerade
lagrings-/bevarandefall och 22 full-app-/behörighetsfall. `npm run qa:static`,
explicit syntax för de berörda filerna och `git diff --check` passerade.
Statisk kontroll rapporterar befintliga storleksvarningar och avsaknad av lokal
releasekonfiguration; den är inte produktionsverifiering. Ingen release kördes.

Verifierat:

- Båda historikformaten, inklusive pooled/standalone-avkodning, ger byte-exakt
  Sessions-värde och exakt källmetadata i ett separat återöppningsbart utkast.
- Riktig app med lokal auth-fixture: noll nya serverwrites från återställningen,
  oförändrat aktivt värde och manifest. Minnesbaserat osparat arbete och en
  beständig pending-journal kontrolleras separat, med noll central effekt.
- Quota-fel i payload/katalog, abort efter request-success, kapacitetsgräns,
  transaktionstimeout, ändrad källa, malformed Sessions, korrupt utkast och
  konto-/behörighetsbyte avvisas utan att skriva över tidigare kopior.
- Två samtidiga flikar ger en kopia för samma källa, separata kopior för nya
  versioner. Stängning under aktiv transaktion ger hela eller ingen ny kopia;
  tidigare utkast består och retry ger ingen dubblett.
- Read-only-listning skapar ingen frånvarande databas. Storage health räknar
  den nya lagringen utan att visa innehåll, id eller scope.
- Omladdning och återöppning, redan laddad offlinevy, admin-only-åtkomst,
  auth A→B→A samt spärrad export efter rollbyte.

Reproducera:

```sh
npx playwright test --config=qa/playwright.snapshot-history.config.mjs
# Enbart de 58 nya kontrollerna:
npx playwright test --config=qa/playwright.recovery-draft.config.mjs
npm run qa:static
git diff --check
```

Slutlogg: `/private/tmp/history-recovery-verified-20261112.log`.
Statisk logg: `/private/tmp/history-recovery-static-final-20261112.log`.
Sammanfattning och produktfilernas SHA-256 finns i intilliggande `.results.json`.
Temporära loggar/skärmbilder kan städas av operativsystemet; Git bevarar rapport,
kod och reproducerbara tester. Desktop- och mobilstorlek inspekterades visuellt
från den riktiga testappen.

Testerna använder disponibla profiler och syntetiska data; inga riktiga
användarflikar, cacheposter eller konton ändras. Full-app-proven kör verklig
auth-/behörighets-/Sessions-kod med lokal HTTP-fixture, inte produktionskonton.
QuotaExceededError är injicerat; datorns fysiska disk fylls inte.

Ett första test av pågående osparat arbete stoppades i själva fixtureförberedelsen:
historiken skulle skrivas efter att testet gjort den befintliga sparjournalen
full. Historiken skapas nu före felet. Därefter verifierades oförändrat
minnesarbete, pending-journal och noll central effekt i båda webbläsarna.

Den första samlade regressionen gav 419 passed och sex fel: två offlineprov
stängde nätet innan historikens lazy-load var färdig, och fyra diagnostikprov
valde sista databasen i stället för den kompakta samlingen. Offlineprovet kräver
nu synlig färdigladdad åtgärd före nätavbrott. Diagnostikproven väljer samlingen
med namn; samma data-/bevarandeassertioner behålls. Sex riktade omprov passerade,
följt av hela slutkörningen med 425 passed. Inga kontroller för dataskydd togs bort.

Ett separat fynd i mobilnavigationen: vid 390 × 844 täcker chatt-launchern
profilknappen, så pointer-klick kan inte öppna Storage health. Ingen force-click,
DOM-döljning eller produktfix införs här. Mobilprovet för återställningsdialogen
öppnar den i desktopläge och byter sedan till mobilstorlek. Det verifierar den
nya dialogens layout/offlinefunktion, **inte mobilens ingångsnavigering**. Fyndet
behöver en avgränsad UI-korrigering innan mobilflödet kan godkännas i sin helhet.

Offlineprovet gäller en redan laddad vy. Kall offline-start är fortfarande ett
separat kvarvarande plattformsproblem. Utkastsformatet ger inte automatisk replay,
samredigering eller obegränsat offlinearbete. Kompakt skrivning förblir avstängd.
