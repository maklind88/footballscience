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

## Provet för automatisk historik

För att godkänna Desktop för vanligt arbete måste samma test köras med riktiga klientvägar och syntetiska arbetsdata på varje erbjuden plattform:

1. Starta den installerade appen i en ren testprofil och verifiera roll och lag online. Underlaget ska innehålla en äldre Sessions-post som aldrig tidigare öppnats på enheten.
2. Vänta på ett verifierat besked om att historiken är tillgänglig. Gå offline och gör en tillåten ändring. Kontrollera att appen kvitterar den som beständigt lokal.
3. Stäng av nätet, starta om operativsystemet och öppna appen från ikonen. Lås upp med gällande enhetspolicy. Verifiera den tidigare oöppnade posten, samma lag och den osynkade ändringen.
4. Koppla upp igen. Verifiera en servereffekt per operation även när det första svaret försvinner. Kontrollera bevarat arbete vid konflikt, avslag och full disk.

Historikprovet är godkännandekravet för en full kedja. Dagens typade native-Sessions stödjer en vald syntetisk post. Det automatiska nedladdningsflödet för hela Sessions-historiken, kopplingen till den ordinarie produktens sparväg, faktisk enhetsupplåsning och konflikten mellan två verkliga klienter behöver egna bevis innan distribution.
