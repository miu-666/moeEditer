function initDrag() {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  canvas.addEventListener("pointerdown", onPointerDown);
}

let dragMoveHandler = null;
let dragUpHandler = null;

function onPointerDown(e) {
  if (state.crop && state.crop.active) return;

  const target = e.target;

  // The divider inside a split Box has its own drag handler (columns.js).
  if (target.classList.contains("column-splitter")) return;

  // Check if clicking a resize handle
  if (target.classList.contains("resize-handle")) {
    e.preventDefault();
    e.stopPropagation();
    startResize(e, target);
    return;
  }

  // Find the closest canvas-element
  const elementNode = target.closest(".canvas-element");
  if (!elementNode) {
    // Clicked on empty canvas area
    setSelectedElementId(null);
    return;
  }

  const id = elementNode.dataset.elementId;
  const el = getElementById(id);
  if (!el) return;

  // Clicking inside a text area that is being edited places the caret instead
  // of moving the element. A Box has one such node per column now.
  const inTextNode = target.classList.contains("text-inner") || target.closest(".box-title, .box-text");
  if (inTextNode && elementNode.classList.contains("editing")) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  // If clicking on text-inner but not editing, still allow drag
  // Just select first if not selected
  const wasSelected = state.selectedElementId === id;
  if (!wasSelected) {
    setSelectedElementId(id);
  }

  // Start drag
  state.drag.active = true;
  state.drag.elementId = id;
  state.drag.wasSelected = wasSelected;
  state.drag.startX = e.clientX;
  state.drag.startY = e.clientY;
  state.drag.elStartX = el.x;
  state.drag.elStartY = el.y;
  // Last known pointer position: auto-scroll replays the drag from here while
  // the pointer is standing still.
  state.drag.pointerX = e.clientX;
  state.drag.pointerY = e.clientY;

  dragMoveHandler = (ev) => onPointerMove(ev, id, elementNode);
  dragUpHandler = (ev) => onPointerUp(ev, elementNode);

  document.addEventListener("pointermove", dragMoveHandler);
  document.addEventListener("pointerup", dragUpHandler);
  document.addEventListener("pointercancel", dragUpHandler);
}

function onPointerMove(e, id, elementNode) {
  if (!state.drag.active) return;
  e.preventDefault();

  state.drag.pointerX = e.clientX;
  state.drag.pointerY = e.clientY;

  applyDragPosition(id, elementNode);
  updateAutoScroll(e.clientY);
}

function applyDragPosition(id, elementNode) {
  const el = getElementById(id);
  if (!el) return;

  // Pointer deltas arrive in screen pixels, element coordinates are page units.
  // A scaled-down canvas would otherwise move slower than the finger.
  const dx = toCanvasDelta(state.drag.pointerX - state.drag.startX);
  const dy = toCanvasDelta(state.drag.pointerY - state.drag.startY);

  let newX = state.drag.elStartX + dx;
  let newY = state.drag.elStartY + dy;

  // Clamp to the page. In long mode the bottom is the safety ceiling rather
  // than the current page height, so an element can be dragged past the bottom
  // edge and the page grows to follow it.
  newX = Math.max(0, Math.min(newX, state.canvas.width - el.width));
  newY = clampPageY(newY, el.height);

  // Smart alignment
  const { snappedX, snappedY, guides } = checkAlignment(el, newX, newY);
  newX = snappedX;
  newY = snappedY;
  if (guides.length > 0) {
    renderGuides(guides);
  } else {
    clearGuides();
  }

  // Snap to grid
  newX = snapToGrid(newX);
  newY = snapToGrid(newY);

  // Alignment and snapping can both nudge past an edge, so clamp once more.
  newX = Math.max(0, Math.min(newX, state.canvas.width - el.width));
  newY = clampPageY(newY, el.height);

  el.x = newX;
  el.y = newY;

  elementNode.style.left = newX + "px";
  elementNode.style.top = newY + "px";

  // Long page: grow under the pointer if the element now hangs past the bottom.
  // Never shrinks here — that happens once on pointerup.
  growCanvasIfNeeded(el.y, el.height);

  // Update properties panel if visible
  updatePropertiesPositionFields();
}

// Re-runs the drag maths without a fresh pointer event. Called by auto-scroll
// once per frame while the pointer rests near the viewport edge.
function reapplyDrag() {
  const id = state.drag.elementId;
  if (!id) return;
  const node = document.querySelector(`[data-element-id="${id}"]`);
  if (node) applyDragPosition(id, node);
}

function onPointerUp(e, elementNode) {
  if (!state.drag.active) return;

  const id = state.drag.elementId;
  // A cancelled pointer means the browser took the gesture over. On touch that
  // is a page scroll: the block was not meant to move.
  const cancelled = e.type === "pointercancel";
  const undoSelection = !state.drag.wasSelected;

  state.drag.active = false;
  state.drag.elementId = null;
  state.drag.wasSelected = false;

  document.removeEventListener("pointermove", dragMoveHandler);
  document.removeEventListener("pointerup", dragUpHandler);
  document.removeEventListener("pointercancel", dragUpHandler);

  dragMoveHandler = null;
  dragUpHandler = null;

  stopAutoScroll();
  clearGuides();

  if (cancelled) {
    // The few pixels that arrived before the cancel must not leave the block
    // nudged, and the selection this same gesture made has to go back too —
    // otherwise a swipe over a block would select it, and the *next* swipe
    // (with the block now selected, hence touch-action:none) would drag it
    // instead of scrolling. Rolling both back is what keeps "swipe scrolls"
    // true however many times you swipe over the same block.
    const el = getElementById(id);
    if (el) {
      el.x = state.drag.elStartX;
      el.y = state.drag.elStartY;
      if (elementNode) {
        elementNode.style.left = el.x + "px";
        elementNode.style.top = el.y + "px";
      }
      updatePropertiesPositionFields();
    }
    if (undoSelection && state.selectedElementId === id) setSelectedElementId(null);
    // Reclaims any height the aborted drag grew the page by.
    syncPageHeight();
    saveState();
    return;
  }

  // The drag is over, so it is safe to reclaim any height the page no longer
  // needs (long mode only).
  syncPageHeight();
  saveState();
  pushHistory();
}

function updatePropertiesPositionFields() {
  const xInput = document.getElementById("prop-x");
  const yInput = document.getElementById("prop-y");
  const el = getSelectedElement();
  if (el && xInput) xInput.value = Math.round(el.x);
  if (el && yInput) yInput.value = Math.round(el.y);
}
