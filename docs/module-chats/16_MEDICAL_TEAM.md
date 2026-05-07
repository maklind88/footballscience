# Medical Team Module Chat

```text
Vi fortsatter Football Science-projektet.

Project path:
/Users/maklind/Documents/New project

Denna chatt ska bara handla om modulen:
Medical Team.

Borja med att lasa:
docs/AI_HANDOFF.md
docs/MODULES.md
docs/NEXT_STEPS.md
docs/QA_CHECKLIST.md

Fokus:
- Medical Team ska vara en egen modul for det medicinska teamets arbete.
- Modulen ska pa sikt kunna hanga ihop med spelare, availability, skador, rehab, return to play, belastning, match/traningsstatus och kommunikation mellan staff.
- Hantera medicinsk information varsamt och med tydlig roll/permission-tanke for framtiden.
- Hall layouten ren, premium och professionell.
- Undvik fakeinnehall och onodig forklaringstext i UI.

Forsta konkreta instruktionen:
- Bygg en Medical Team-oversikt for hela truppen.
- Medical staff ska kunna rekommendera spelarens deltagande i traning kommande dagar.
- Deltagande ska kunna vara 0%, 10%, 25%, 50%, 75%, 100%.
- Status ska skapa en daterad logg per spelare och kunna bakatdateras.
- Varje spelare ska ha fritextkommentar kopplad till status.
- Skapa spelarprofiler redan nu med nummer, namn, position och bild-URL sa IDP senare kan ateranvanda samma spelare.
- Medical Team ska visa medicinsk availability/narvaro, inte fotbolls-IDP-innehall.
- Hall strukturen enkel att bygga vidare med skador, rehab, RTP, belastning och permissions.
- NC Courage 2026 roster URL anvandes som forsta rosterkalla: https://www.nccourage.com/2026-roster
- Den officiella sidan gav namn, positionsgrupper och rosterbilder. Trojnummer ligger inte som stabil strukturerad text dar, sa nummer ska vara redigerbara/importerbara.
- Efter feedback byggdes vyn om for effektivitet: tat truppmatris, mindre spelarbilder, command board och spelarpopup for rekommendation/logg/profil.
- Availability Plan lades till for langre skador/restriktioner: medical kan satta injury/reason, body area, duration i dagar/veckor/manader, status, procent, fas, review date och note. Planen appliceras automatiskt pa framtida datum tills slutdatum.
- Nasta steg byggde vidare med RTP-faser: Medical restriction, Rehab, Modified team, Full training, Match available.
- Review alerts visar spelare som behover ny medical review inom 7 dagar.
- Clearance checklist finns per availability plan: doctor, physio och performance sign-off, plus load gates for strength, GPS/load, pain response, wellness och psychological readiness.
- Full training/match availability blockeras eller faller tillbaka till modified om clearance inte ar klar.
- Coach-safe view visar bara availability, procent och kommentar som medical aktivt godkant att dela.
- Session Planner visar medical availability for valt traningsdatum sa coachen ser spelare pa 0/10/25/50/75% direkt nar passet planeras.
- Daily Medical Huddle visar forandringar sedan igar, managed today, oppna rekommendationer, review pressure och coach-godkanda handover-notes.
- Bulk Recommendation finns pa roster-niva: medical kan markera flera spelare och applicera samma datum, procent, RTP phase, intern note och valfri coach-safe note.
- Coach-Safe Handover visar en ren coachvy med managed players och endast kommentarer som explicit ar godkanda att dela, plus copy action.
- Spelarpopupen har Medical Profile summary med current status, RTP phase, active plan, review date, 7-day average, log entries, clearance sign-offs och load gates.
- Session Planner visar block gate/warnings: hur manga matchar vald blockniva, ligger under blocknivan, ar 0% eller saknar medical entry.
```
