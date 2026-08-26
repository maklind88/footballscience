export const CODE_PIP_MIN_WIDTH = 360;
export const CODE_PIP_MIN_HEIGHT = 220;
export const CODE_PIP_MARGIN = 8;
export const CODE_PIP_BOUND_MARGIN = 0;
export const CODE_MODE_LAYOUT_VERSION = 5;

const CODE_TIMELINE_PIP_MIN_WIDTH = 420;
const CODE_TIMELINE_PIP_MIN_HEIGHT = 96;
const CODE_WINDOW_PIP_MIN_WIDTH = 240;
const CODE_WINDOW_PIP_MIN_HEIGHT = 220;

export function codePipConfig(target = "video") {
  if (target === "timeline") {
    return {
      target: "timeline",
      stateKey: "timelinePip",
      minWidth: CODE_TIMELINE_PIP_MIN_WIDTH,
      minHeight: CODE_TIMELINE_PIP_MIN_HEIGHT,
      cssPrefix: "--video-analysis-code-timeline-pip",
    };
  }
  if (target === "code-window") {
    return {
      target: "code-window",
      stateKey: "codeWindowPip",
      minWidth: CODE_WINDOW_PIP_MIN_WIDTH,
      minHeight: CODE_WINDOW_PIP_MIN_HEIGHT,
      cssPrefix: "--video-analysis-code-window-pip",
    };
  }
  return {
    target: "video",
    stateKey: "pip",
    minWidth: CODE_PIP_MIN_WIDTH,
    minHeight: CODE_PIP_MIN_HEIGHT,
    cssPrefix: "--video-analysis-code-pip",
  };
}
