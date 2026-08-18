const panelAngles = Object.freeze([0, 72, 144, 216, 288]);
const centerPanelPath = "M0-.62.59-.19.36.5-.36.5-.59-.19Z";
const edgePanelPath = "M-.36-1.53 0-1.65.36-1.53.27-1.2-.27-1.2Z";
const seamPath = "M0-.62V-1.2";

function renderRotatedPaths(path, attributes) {
  return panelAngles
    .map((angle) => `<path d="${path}" transform="rotate(${angle})" ${attributes}></path>`)
    .join("");
}

export function renderSetPieceBoardBallSymbol() {
  return `<g class="spr-board-ball-symbol" transform="scale(.67)">
    <circle r="1.65" class="spr-ball-token"></circle>
    <path d="${centerPanelPath}" class="spr-ball-panel"></path>
    ${renderRotatedPaths(edgePanelPath, 'class="spr-ball-panel"')}
    ${renderRotatedPaths(seamPath, 'class="spr-ball-seam"')}
  </g>`;
}

export function renderSetPieceToolBallSymbol() {
  return `<g class="spr-tool-soccer-ball" transform="translate(12 12) scale(5.05)">
    <circle r="1.65" fill="none" stroke="currentColor" stroke-width=".25"></circle>
    <path d="${centerPanelPath}" fill="currentColor" stroke="none"></path>
    ${renderRotatedPaths(edgePanelPath, 'fill="currentColor" stroke="none"')}
    ${renderRotatedPaths(seamPath, 'fill="none" stroke="currentColor" stroke-width=".14"')}
  </g>`;
}
