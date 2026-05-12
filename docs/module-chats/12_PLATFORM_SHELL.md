# Platform Shell Module Chat

```text
Vi fortsatter Football Science-projektet.

Project path:
/Users/maklind/Documents/New project

Denna chatt ska bara handla om:
Platform shell, navigation, icons, layout och design system.

Borja med att lasa:
docs/AI_HANDOFF.md
docs/MODULES.md
docs/NEXT_STEPS.md
docs/QA_CHECKLIST.md

Fokus:
- Design ska kannas ren, premium och Apple/Mac-lik.
- Top nav order: Schedule, Periodization, Sessions, IDP, Analysis Room, My Team, Identity, Game Simulator.
- Profile ska inte ligga i huvudmenyn utan i account menu till hoger.
- Football Science-titeln ska fungera som Home-knapp.
- Ikoner ska vara rena och professionella, inte handritade.
- Ingen vanstermeny om vi inte uttryckligen bygger en modul som behover det.
- Undvik onodig text i UI.

Nar du har last dokumenten, bekrafta kort att du jobbar med Platform Shell och vanta pa min konkreta instruktion.
```

## Implementation checkpoint

- Platform shell now has a shared resource/module loader in `src/core/platform-module-loader.mjs`.
- `dashboard-chat.css` is loaded by the shell instead of blocking initial HTML stylesheet loading.
- Game Simulator dynamic controllers/runtime use the shared loader and are preloaded from top-nav hover/focus intent.
- Home dashboard cards render only while Home is active, so workspace switches do not keep rebuilding Home surfaces.
- Next step is physical module extraction from `app.js`: Schedule, Periodization, Sessions, IDP, Medical, then Game Simulator model data.
