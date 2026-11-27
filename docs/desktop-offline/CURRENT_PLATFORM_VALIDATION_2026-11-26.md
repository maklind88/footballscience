# Desktop mot den aktuella plattformen

Utgångspunkt `4bdc62e7d53231ba17ccd89d6409564c8a7662f6` från main och Tauri-källan från `3034f17929223885cae537953b500aafd9e4bbad`. System och Säkerhet ansvarar för integrationsgränsen. FS Desktop APP äger distributionsskalet och dess OS-stöd. Platform Shell äger den gemensamma startytan. Sessions äger centrala uppgifter, revisioner och sparregler.

Den ursprungliga Tauri-appen bygger det aktuella gemensamma webbgränssnittet som ett verifierat kodpaket. Operativsystemets skal och den befintliga lokala datamodellen ligger kvar bakom Tauri-bryggan. Testpaketen har ett eget app-ID och använder syntetisk identitet med ett minnesvalv. Den gamla databaskatalogen och HTTP-hanterarna används endast i disponibla testmiljöer under `desktop/fs-desktop-spike/local-integration`. De ingår inte i projektets publika API eller migrationskatalog.

## Säkerhetsgräns i kandidaten

- Den aktiva installerade vyn kräver Tauri-bryggan och giltig lokal identitet. En saknad brygga får inte starta webbens utvecklingsinloggning.
- Desktop lägger inga riktiga tokens i webbgränssnittets lagring. Den gamla webbläsarjournalen och offlinebehörigheten används bara i webbmiljön. Webbläsarens vanliga inloggning behåller sina ordinarie vägar.
- Direkt JavaScript-brygga till webb-API:t kan bara läsa i den här kandidaten. Native-Sessions testoperationer använder separat typad kö mot en disponibel testserver.
- Bygg- och verifieringsflödet publicerar inga paket och har inga produktionsuppgifter. Originalet i den separata Desktop-grenen kan användas för att jämföra historiska resultat.

## Samma prov på varje operativsystem

Testmatrisen omfattar Windows x64, macOS arm64 och Ubuntu 24.04 x64. Den kör JavaScript- och Rust-kontrakten, verifierar signerad frontend och provar omstart utan testserver. Windows-provet kör osignerade testbinärer. Linux-provet använder Xvfb och appfilen från ett extraherat testpaket. macOS-provet startar den paketerade körbara filen från en isolerad testmiljö. Kontraktet kräver att samtliga fyra fönsterroller omfattar alla tre operativsystem och endast tillåter sina lokala kommandon.

På Linux kräver varje flyktigt WebKit-fönster egna registreringar av appens protokoll. Den lokala rättningen i den låsta Tauri-runtimeversionen behåller separat flyktig lagring, verifierad navigering och de befintliga kommandogränserna. Den första felfria verifieringen på Linux måste gå hela vägen från start till bekräftelse av den signerade versionen och omstart utan testserver.

Ett grönt processprov visar att den signerade appversionen kan starta igen, att felaktiga kandidater avvisas och att en förifylld syntetisk Sessions-post kan läsas. Ett separat Mac-prov ändrade revisionen direkt i en tillfällig SQLite-fil och verifierade den nya revisionen efter processomstart utan testserver. Installation i ett användarkonto, verklig enhetsupplåsning, kallstart från ikonen efter OS-omstart och automatisk historik är andra godkännandepunkter.

Det fristående WebKitGTK-provet laddar HTML och en JavaScript-modul från ett lokalt protokoll i tre fönster i samma process. Det kontrollerar huvudfönstret, ett dolt flyktigt kandidatfönster och ett synligt flyktigt återställningsfönster. [Utfall för Ubuntu-kontrollen](https://github.com/maklind88/footballscience/actions/runs/45931138195/job/140283778124)

Att begära första navigeringen efter Tauri-registreringen öppnade fortfarande inget innehåll i den paketerade Ubuntu-appen. Den försöksändringen är borttagen. Diagnostiken jämför nu även sen protokollregistrering i råprovet och fångar WebKits egna laddningssignaler i Linux-testbygget. [Utfall för paketerad Ubuntu-start](https://github.com/maklind88/footballscience/actions/runs/45931623739/job/140285414082)

## Native sparning vid processomstart

Två separata Rust-testprocesser använder samma tillfälliga SQLite-databas och ett filvalv med syntetiska uppgifter. Den första processen sparar en ändring och sänder den till Desktop-prototypens lokala HTTP-server. Servern tillämpar ändringen och stänger anslutningen före kvittot. Den andra processen återställer läsbehörigheten, läser tillbaka samma revision och behåller den osynkade posten tills nya synkuppgifter finns. Återsändningen ger kvittot `already-applied`. Servern verifierar två anrop, en tillämpning och en oförändrad revision efter det andra anropet.

Provet körs med `cargo test --manifest-path desktop/fs-desktop-spike/src-tauri/Cargo.toml --lib --locked authority::race_tests::native_process_restart_replays_one_operation_under_restored_authority -- --exact` efter `npm ci` i `desktop/fs-desktop-spike`. Det använder prototypens testtabeller i disponibel PGlite. Paketerad Sessions-UI, operativsystemets nyckellager och produktens ordinarie `/api/app-state` återstår i det sammanhängande provet.

Den separata webbsuiten `qa/playwright.session-saving-chain.config.mjs` gav 10 godkända med PostgreSQL 17.12 i en tillfällig Unix-socketbaserad testmiljö. Den kör den ordinarie Sessions-vyn, API-hanteraren och SQL-kvittenserna. Provet fastställer en jämförelse för Desktop-kopplingen.

## Provet för automatisk historik

För att godkänna Desktop för vanligt arbete måste samma test köras med riktiga klientvägar och syntetiska arbetsdata på varje erbjuden plattform:

1. Starta den installerade appen i en ren testprofil och verifiera roll och lag online. Underlaget ska innehålla en äldre Sessions-post som aldrig tidigare öppnats på enheten.
2. Vänta på ett verifierat besked om att historiken är tillgänglig. Gå offline och gör en tillåten ändring. Kontrollera att appen kvitterar den som beständigt lokal.
3. Stäng av nätet, starta om operativsystemet och öppna appen från ikonen. Lås upp med gällande enhetspolicy. Verifiera den tidigare oöppnade posten, samma lag och den osynkade ändringen.
4. Koppla upp igen. Verifiera en servereffekt per operation även när det första svaret försvinner. Kontrollera bevarat arbete vid konflikt, avslag och full disk.

Historikprovet är godkännandekravet för en full kedja. Dagens typade native-Sessions stödjer en vald syntetisk post. Det automatiska nedladdningsflödet för hela Sessions-historiken, kopplingen till den ordinarie produktens sparväg, faktisk enhetsupplåsning och konflikten mellan två verkliga klienter behöver egna bevis innan distribution.
