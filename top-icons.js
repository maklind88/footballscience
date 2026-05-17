const paths = {
home: '<path d="M3 11.2 12 3l9 8.2M5.5 10.4V21h4.2v-5.6h4.6V21h4.2V10.4"/>',
"game-simulator": '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.5L2 14.3a3 3 0 0 0 5.1 2.4L9.8 14h4.4l2.7 2.7a3 3 0 0 0 5.1-2.4l-.7-5.8a4 4 0 0 0-4-3.5Z"/>',
schedule: '<path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
gameplan: '<rect x="4" y="3" width="16" height="18" rx="2.2"/><path d="M8 7h8M8 11h8M8 15h4M15 15l1.4 1.4L19 13.5"/>',
periodization: '<path d="M21 12a9 9 0 0 0-15.5-6.2L3 8M3 3v5h5M3 12a9 9 0 0 0 15.5 6.2L21 16M21 21v-5h-5"/><circle cx="12" cy="12" r="2.5"/>',
"team-identity": '<path d="M7 4c5.3 3 5.3 13 10 16M17 4C11.7 7 11.7 17 7 20M8.5 7h7M9.7 11h4.6M9.7 15h4.6M8.5 19h7"/>',
"session-planner": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M3 12h4M17 12h4"/><circle cx="12" cy="12" r="2.4"/>',
"player-profiles": '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 8.2h10M7 15.8h10"/><circle cx="8" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="16" cy="12" r="1.7"/><path d="M8 13.7v1.1M12 13.7v1.1M16 13.7v1.1"/>',
scouting: '<circle cx="11" cy="11" r="6"/><path d="m16 16 5 5M8.5 11h5M11 8.5v5"/>',
"transfer-room": '<rect x="3.5" y="5" width="17" height="14" rx="2.2"/><path d="M7 9h10M7 13h6M16 14.5 19 17l-3 2.5"/>',
"analysis-room": '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M7.5 14.5l3-3 2.2 2.2 3.8-5"/>',
staff: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
"medical-team": '<path d="M12 20.6 5.7 14.8C2.7 12 2.4 7.2 5.9 5.2c2.1-1.2 4.6-.5 6.1 1.5 1.5-2 4-2.7 6.1-1.5 3.2 1.8 3.3 6 1 8.9M18 10.5v8M14 14.5h8"/>',
admin: '<path d="M12 3 5 6v5c0 4.6 2.9 8.6 7 10 4.1-1.4 7-5.4 7-10V6l-7-3Zm-2.7 9.1 1.9 1.9 3.8-4.1"/>',
"my-profile": '<path d="M19 21a7 7 0 0 0-14 0"/><circle cx="12" cy="7" r="4"/>',
};

export function getTopIconSvg(workspaceId) {
return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[workspaceId] ?? '<circle cx="12" cy="12" r="8"/>'}</svg>`;
}
