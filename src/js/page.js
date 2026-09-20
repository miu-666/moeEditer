// Page geometry — the only place that knows how tall the page should be.
//
// One canvas element backs both page modes:
//   fixed → the user owns `state.canvas.height` (ratio preset or Height field)
//   long  → the height is derived from the content: max(element bottom) + bottomGap
//
// The invariant both modes keep is that `state.canvas.height` always equals the
// current page height. drag / resize / crop / export all read that value, so
// nothing else has to know which mode is active.

const PAGE_RATIOS = {
  "1:1": 1,
  "3:4": 3 / 4,
  "4:3": 4 / 3,
  "9:16": 9 / 16
};

// Safety ceiling. Nothing stops the user from dragging an element down forever,
// but the page will not follow past this point.
const DEFAULT_MAX_PAGE_HEIGHT = 20000;
const DEFAULT_MIN_PAGE_HEIGHT = 900;
const DEFAULT_BOTTOM_GAP = 80;

function isLongPage() {
  return state.canvas.mode === "long";
}

function getPageMaxHeight() {
  const max = Number(state.canvas.maxHeight);
  return max > 0 ? max : DEFAULT_MAX_PAGE_HEIGHT;
}

function getPageBottomGap() {
  const gap = Number(state.canvas.bottomGap);
  return Number.isFinite(gap) ? gap : DEFAULT_BOTTOM_GAP;
}

function getPageMinHeight() {
  const min = Number(state.canvas.minHeight);
  return min > 0 ? min : DEFAULT_MIN_PAGE_HEIGHT;
}

// Lowest edge of any element. Zero on an empty page.
function computeContentBottom() {
  let bottom = 0;
  for (const el of state.elements) {
    bottom = Math.max(bottom, (Number(el.y) || 0) + (Number(el.height) || 0));
  }
  return bottom;
}

// Writes the page size to the DOM. Cheap enough to call on every pointermove.
function applyCanvasSize() {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;
  canvas.style.width = state.canvas.width + "px";
  canvas.style.height = state.canvas.height + "px";
  applyCanvasScale();
  syncContentEndMarker();
}

// --- Canvas viewport scale --------------------------------------------------
//
// The page is authored at a fixed width and every element coordinate lives in
// that space — export, saved state and history all depend on it staying put. On
// a narrow screen that width does not fit, so the canvas is scaled down for
// *display only*: the DOM gets a CSS transform, and every pointer delta is
// divided by the same factor before it reaches a coordinate (drag / resize /
// crop all come through `toCanvasDelta`). Nothing else has to know.
//
// The scale only ever shrinks: on a wide screen it is exactly 1 and the canvas
// is laid out as before.

let canvasScale = 1;
// Width the current scale was derived from, so the layout read below can be
// skipped on the pointermove path (applyCanvasSize runs there).
let scaleMeasuredWidth = 0;

// Screen pixels -> page units. Any pointer delta that ends up as an element
// coordinate has to come through here, or a scaled canvas moves at the wrong
// speed under the finger.
function toCanvasDelta(value) {
  return canvasScale > 0 ? value / canvasScale : value;
}

// Measured once. 0 with overlay scrollbars (every phone), 15-17px on a desktop
// using classic ones.
let scrollbarWidth = null;

function getScrollbarWidth() {
  if (scrollbarWidth !== null) return scrollbarWidth;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:-9999px;left:0;width:100px;height:100px;overflow:scroll;";
  document.body.appendChild(probe);
  scrollbarWidth = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return scrollbarWidth;
}

function computeCanvasScale() {
  const area = document.querySelector(".canvas-area");
  const width = Number(state.canvas.width) || 600;
  if (!area) return 1;

  const cs = getComputedStyle(area);
  const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  // Room for a scrollbar is reserved whether or not one is showing right now.
  // Without that, the width this is computed from depends on the scale itself:
  // shrink enough to lose the scrollbar, the area gets wider, the scale grows,
  // the scrollbar comes back — and the two keep chasing each other. Overlay
  // scrollbars (phones) measure 0, so nothing is reserved there.
  const gutter = area.offsetWidth > area.clientWidth ? 0 : getScrollbarWidth();
  const available = area.clientWidth - padding - gutter;
  // Before first layout the area has no width yet; 1 is the safe answer.
  if (!(available > 0)) return 1;

  return Math.min(1, available / width);
}

function applyCanvasScale(force) {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  const width = Number(state.canvas.width) || 600;
  if (force || width !== scaleMeasuredWidth) {
    canvasScale = computeCanvasScale();
    scaleMeasuredWidth = width;
  }

  const wrapper = canvas.parentElement;
  if (canvasScale === 1) {
    canvas.style.transform = "";
    canvas.style.transformOrigin = "";
  } else {
    canvas.style.transform = `scale(${canvasScale})`;
    canvas.style.transformOrigin = "0 0";
  }

  // Resize handles are sized in CSS with calc(... / var(--canvas-scale)) so they
  // keep a constant on-screen size however far the canvas is scaled down.
  canvas.style.setProperty("--canvas-scale", String(canvasScale));

  // A transform does not change the layout box, so the scroll area the wrapper
  // provides has to be set by hand — otherwise the page would still scroll as
  // if the canvas were full size.
  if (wrapper) {
    wrapper.style.width = width * canvasScale + "px";
    wrapper.style.height = state.canvas.height * canvasScale + "px";
  }
}

// A drawer opening, a phone rotating or a URL bar sliding away all change the
// available width without a window `resize`, so the observer is the reliable
// trigger. `force` because the canvas width itself did not change.
function initCanvasScaleObserver() {
  applyCanvasScale(true);
  const area = document.querySelector(".canvas-area");
  if (!area || typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", () => applyCanvasScale(true));
    return;
  }
  const observer = new ResizeObserver(() => applyCanvasScale(true));
  observer.observe(area);
}

// --- Content end marker -----------------------------------------------------

// In long mode the page keeps going past the last block into the bottom gap, so
// nothing on screen says where the artwork actually stops. This draws that line.
// It is a DOM decoration only — the exporter renders from `state`, so the line
// never ends up in the PNG.
const CONTENT_END_MARKER_ID = "content-end-marker";

function syncContentEndMarker() {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  const marker = document.getElementById(CONTENT_END_MARKER_ID);
  const bottom = Math.round(computeContentBottom());

  // Fixed mode has a page edge the user set themselves; an empty page has no
  // content to end. Both cases mean no line.
  if (!isLongPage() || bottom <= 0) {
    if (marker) marker.remove();
    return;
  }

  if (!marker) {
    const node = document.createElement("div");
    node.className = "content-end-marker";
    node.id = CONTENT_END_MARKER_ID;
    node.innerHTML = '<span class="content-end-label">内容结束</span>';
    canvas.appendChild(node);
    node.style.top = bottom + "px";
    return;
  }

  // Re-created after every `renderAllElements` (which clears the canvas), so
  // the cache is just a cheap guard against pointless style writes.
  if (marker.style.top !== bottom + "px") marker.style.top = bottom + "px";
}

// Keeps the Height field honest while the page grows on its own.
function refreshPageHeightField() {
  const input = document.getElementById("canvas-height");
  if (input && input.value !== String(Math.round(state.canvas.height))) {
    input.value = Math.round(state.canvas.height);
  }
}

// Recompute the page height from the content. Long mode only — in fixed mode the
// height belongs to the user and this is a no-op.
function syncPageHeight() {
  if (!isLongPage()) return;
  // The content bottom can move while the page height stays put (a shorter
  // block, a deleted one, the minimum height doing its job). The end line still
  // has to follow, so it is refreshed before the early return below.
  syncContentEndMarker();
  const target = Math.min(
    getPageMaxHeight(),
    Math.max(getPageMinHeight(), Math.round(computeContentBottom() + getPageBottomGap()))
  );
  if (target === state.canvas.height) return;
  state.canvas.height = target;
  applyCanvasSize();
  refreshPageHeightField();
}

// Called during a drag / resize: grow if the element hangs past the bottom, but
// never shrink. Shrinking under the pointer makes the page jitter, so the
// reclaim happens once, on pointerup, via syncPageHeight().
function growCanvasIfNeeded(y, height) {
  if (!isLongPage()) return;
  const need = Math.min(
    getPageMaxHeight(),
    Math.round((Number(y) || 0) + (Number(height) || 0) + getPageBottomGap())
  );
  if (need > state.canvas.height) {
    state.canvas.height = need;
    applyCanvasSize();
    refreshPageHeightField();
  }
}

// Long mode has no hard bottom, but it stops at the ceiling so an element can
// never be dragged into a region the page refuses to grow into.
function clampPageY(y, height) {
  if (!isLongPage()) {
    return Math.max(0, Math.min(y, state.canvas.height - (Number(height) || 0)));
  }
  return Math.max(0, Math.min(y, getPageMaxHeight() - (Number(height) || 0)));
}

// Fixed mode: apply a ratio preset. Width stays, height follows.
function applyPageRatio(ratio) {
  state.canvas.ratio = ratio;
  const r = PAGE_RATIOS[ratio];
  if (r) {
    state.canvas.height = Math.round(state.canvas.width / r);
    applyCanvasSize();
    refreshPageHeightField();
  }
}

// Any manual size change drops the ratio back to "custom" — otherwise the panel
// would claim 3:4 while showing a box that is not.
function markRatioCustom() {
  state.canvas.ratio = "custom";
}

// Where a brand-new element lands when the caller gave no position. In long mode
// that is just below the existing content, so "add a block" keeps stacking
// downwards. The element stays absolutely positioned and fully draggable.
function getNewElementY() {
  if (!isLongPage()) return 50;
  const bottom = computeContentBottom();
  if (bottom <= 0) return 50;
  return Math.round(Math.min(bottom + 20, Math.max(0, getPageMaxHeight() - 100)));
}

// --- Tidy into a list -------------------------------------------------------

// "Stack it neatly" is a button, not a layout engine: free placement stays the
// rule, and this just re-lays what is already there out in one pass. Long mode
// only — a fixed page has a bottom the user chose, and a stack would run past it.
const TIDY_TOP = 40;
const TIDY_LEFT = 40;
const TIDY_GAP = 24;

// Returns false when there is nothing to do, so the caller can skip the history
// entry for a click that changed nothing.
function tidyIntoList() {
  if (!isLongPage() || state.elements.length === 0) return false;

  // Reading order: top to bottom, and left to right for elements on the same line.
  const ordered = state.elements.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  let cursor = TIDY_TOP;

  for (const el of ordered) {
    // A very wide block would hang off a narrow page, so the shared left edge
    // gives way to keeping the element inside.
    el.x = Math.max(0, Math.min(TIDY_LEFT, state.canvas.width - el.width));
    el.y = cursor;
    cursor += el.height + TIDY_GAP;
    updateElementDOM(el);
  }

  syncPageHeight();
  return true;
}
