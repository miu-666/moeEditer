// Edge auto-scroll, shared by drag and resize.
//
// A long page is taller than the window, so dragging a block towards the bottom
// would otherwise mean: let go, scroll, grab it again. Instead the canvas area
// scrolls on its own while the pointer rests near an edge, and the *origin* of
// the running interaction is shifted by exactly the distance the content moved
// — so the element (or the edge being resized) stays glued to the cursor
// instead of stalling at the edge.
//
// Both interactions measure themselves the same way — a fixed origin
// (`state.drag.startY` / `state.resize.startY`) subtracted from the last known
// pointer position — so one compensation works for either. Only the "re-apply"
// step differs, which is the single branch in reapplyCanvasInteraction().

const AUTOSCROLL_EDGE = 64;      // px from the viewport edge where it starts
const AUTOSCROLL_MAX_STEP = 18;  // px per frame, reached at the very edge

let autoScrollFrame = null;
let autoScrollStep = 0;

function canvasScrollArea() {
  return document.querySelector(".canvas-area");
}

// Scroll speed for a pointer at this height, negative for upwards. Zero unless
// the pointer is inside one of the edge bands.
function autoScrollStepFor(clientY) {
  const area = canvasScrollArea();
  if (!area) return 0;
  const rect = area.getBoundingClientRect();
  const topEdge = rect.top + AUTOSCROLL_EDGE;
  const bottomEdge = rect.bottom - AUTOSCROLL_EDGE;
  if (clientY < topEdge) {
    return -Math.min(1, (topEdge - clientY) / AUTOSCROLL_EDGE) * AUTOSCROLL_MAX_STEP;
  }
  if (clientY > bottomEdge) {
    return Math.min(1, (clientY - bottomEdge) / AUTOSCROLL_EDGE) * AUTOSCROLL_MAX_STEP;
  }
  return 0;
}

function isCanvasInteractionActive() {
  return state.drag.active || state.resize.active;
}

function updateAutoScroll(clientY) {
  autoScrollStep = autoScrollStepFor(clientY);
  if (autoScrollStep !== 0) {
    if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(runAutoScroll);
  } else {
    stopAutoScroll();
  }
}

function stopAutoScroll() {
  if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
  autoScrollFrame = null;
  autoScrollStep = 0;
}

function runAutoScroll() {
  autoScrollFrame = null;
  if (!isCanvasInteractionActive() || autoScrollStep === 0) return;

  const area = canvasScrollArea();
  if (!area) return;

  const before = area.scrollTop;
  area.scrollTop = before + autoScrollStep;
  const moved = area.scrollTop - before;

  if (moved !== 0) {
    // The content slid under a stationary pointer, so the origin of the running
    // interaction moves with it. Recomputing through the normal path also keeps
    // clamping, snapping and page growth working while the scroll runs.
    if (state.drag.active) state.drag.startY -= moved;
    if (state.resize.active) state.resize.startY -= moved;
    reapplyCanvasInteraction();
  }

  autoScrollFrame = requestAnimationFrame(runAutoScroll);
}

// Re-runs the maths of whichever interaction is running, without a fresh
// pointer event.
function reapplyCanvasInteraction() {
  if (state.drag.active) reapplyDrag();
  else if (state.resize.active) reapplyResize();
}
