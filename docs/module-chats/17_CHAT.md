# Chat Module Chat

```text
Vi fortsatter Football Science-projektet.

Project path:
/Users/maklind/Documents/New project

Denna chatt ska bara handla om modulen:
Chat.

Riktning:
- Chatten ar en egen modul, inte en Home Dashboard-funktion.
- Chatten ska inga i menyn till vanster som global chat entry point.
- Utveckla den befintliga chatten, inte ett nytt koncept.
- Chatten ar database-primary via `/api/chat` och `chat_*`-tabeller.
- Bevara befintlig kompatibilitetsdata i `football-dashboard-chat-v1`, men behandla den inte som kanonisk write path.
- Bevara team chat, DM, unread, mentions, read receipts, replies, reactions, pinned messages, priorities, notifications och admin actions.
- Chatten ska vara staff-only: admin, club-admin, team-admin, coach, scout, analyst, performance och medical. Guest ska inte ha chat-access.
- Designen ska bli renare, snyggare och mer professionell utan att bli rorig eller overforklarande.
- Nya features ska inte byggas forran aktiv miljo har verifierad chat-migration, attachment storage, realtime och `npm run qa:chat`.

Borja med att lasa:
AGENTS.md
docs/AI_HANDOFF.md
docs/CURRENT_OPERATING_PLAN.md
docs/CODEX_TEAM_ROSTER.md
docs/LIVE_FIRST_WORKFLOW.md
docs/DEPLOYMENT.md
docs/module-chats/COMMON_SPECIALIST_RULES.md
docs/MODULE_CONTRACTS.md
docs/MODULES.md
docs/CHAT_API_CONTRACT.md
src/modules/chat/chat.mjs
src/modules/chat/chat-adapter.mjs

Nar du har last dokumenten, bekrafta kort att du jobbar med Chat-modulen och vanta pa min konkreta instruktion.
```
