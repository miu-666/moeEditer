let resizeMoveHandler = null;
let resizeUpHandler = null;

function startResize(e, handle) {
  if (state.crop && state.crop.active) return;

  const domEl = handle.closest(".canvas-element");
  if (!domEl) return;

  const id = domEl.dataset.elementId;
  const el = getElementById(id);
  if (!el) return;

  state.resize.active = true;
  state.resize.elementId = id;
  state.resize.handle = handle.dataset.handle;
  state.resize.startX = e.clientX;
  state.resize.startY = e.clientY;
  state.resize.startWidth = el.width;
  state.resize.startHeight = el.height;
  state.resize.startLeft = el.x;
  state.resize.startTop = el.y;
  // Last known pointer position: auto-scroll replays the resize from here while
  // the pointer is standing still (same contract as state.drag).
  state.resize.pointerX = e.clientX;
  state.resize.pointerY = e.clientY;

  if (el.type === "image" && el.content && el.content.crop) {
    // Locked, a cropped image scales like a real photo: keep the frame shape.
    state.resize.aspectRatio = el.width / el.height;
  } else if (el.type === "image" && el.content && el.content.src) {
    const img = domEl.querySelector("img");
    if (img && img.naturalWidth && img.naturalHeight) {
      state.resize.aspectRatio = img.naturalWidth / img.naturalHeight;
    } else {
      state.resize.aspectRatio = el.width / el.height;
    }
  } else {
    state.resize.aspectRatio = null;
  }

  e.preventDefault();
  e.stopPropagation();

  resizeMoveHandler = (ev) => onResizeMove(ev, domEl);
  resizeUpHandler = (ev) => onResizeUp(ev, domEl);

  document.addEventListener("pointermove", resizeMoveHandler);
  document.addEventListener("pointerup", resizeUpHandler);
  document.addEventListener("pointercancel", resizeUpHandler);
}

function onResizeMove(e, domEl) {
  if (!state.resize.active) return;
  e.preventDefault();

  state.resize.pointerX = e.clientX;
  state.resize.pointerY = e.clientY;

  applyResize(domEl);
  updateAutoScroll(e.clientY);
}

// Re-runs the resize maths without a fresh pointer event. Called by auto-scroll
// once per frame while the pointer rests near the viewport edge.
function reapplyResize() {
  const id = state.resize.elementId;
  if (!id) return;
  const node = document.querySelector(`[data-element-id="${id}"]`);
  if (node) applyResize(node);
}

function applyResize(domEl) {
  const el = getElementById(state.resize.elementId);
  if (!el) return;

  // Screen pixels -> page units (see page.js `toCanvasDelta`).
  const dx = toCanvasDelta(state.resize.pointerX - state.resize.startX);
  const dy = toCanvasDelta(state.resize.pointerY - state.resize.startY);
  const handle = state.resize.handle;

  let newWidth = state.resize.startWidth;
  let newHeight = state.resize.startHeight;
  let newX = state.resize.startLeft;
  let newY = state.resize.startTop;

  if (handle.includes("e")) {
    newWidth = state.resize.startWidth + dx;
  }
  if (handle.includes("w")) {
    newWidth = state.resize.startWidth - dx;
    newX = state.resize.startLeft + dx;
  }
  if (handle.includes("s")) {
    newHeight = state.resize.startHeight + dy;
  }
  if (handle.includes("n")) {
    newHeight = state.resize.startHeight - dy;
    newY = state.resize.startTop + dy;
  }

  // Minimum size
  newWidth = Math.max(20, newWidth);
  newHeight = Math.max(20, newHeight);

  // Maintain aspect ratio for images, unless the user unlocked it.
  // Cropped images can stretch too: their geometry is stored as ratios, so the
  // photo follows the frame instead of leaving gaps.
  if (el.type === "image" && state.resize.aspectRatio && el.style.lockAspectRatio !== false) {
    if (handle.includes("n") || handle.includes("s")) {
      newWidth = newHeight * state.resize.aspectRatio;
      if (handle.includes("w")) {
        newX = state.resize.startLeft + state.resize.startWidth - newWidth;
      }
    } else {
      newHeight = newWidth / state.resize.aspectRatio;
      if (handle.includes("n")) {
        newY = state.resize.startTop + state.resize.startHeight - newHeight;
      }
    }
  }

  // Snap
  newWidth = snapToGrid(newWidth);
  newHeight = snapToGrid(newHeight);
  newX = snapToGrid(newX);
  newY = snapToGrid(newY);

  // Clamp to the page. In long mode the bottom limit is the safety ceiling, so
  // dragging the south handle grows the page instead of squashing the element.
  if (newX < 0) {
    newWidth += newX;
    newX = 0;
  }
  if (newY < 0) {
    newHeight += newY;
    newY = 0;
  }
  if (newX + newWidth > state.canvas.width) {
    newWidth = state.canvas.width - newX;
  }
  const bottomLimit = isLongPage() ? getPageMaxHeight() : state.canvas.height;
  if (newY + newHeight > bottomLimit) {
    newHeight = bottomLimit - newY;
  }

  el.width = newWidth;
  el.height = newHeight;
  el.x = newX;
  el.y = newY;

  domEl.style.width = newWidth + "px";
  domEl.style.height = newHeight + "px";
  domEl.style.left = newX + "px";
  domEl.style.top = newY + "px";

  // Long page: grow only. The reclaim happens on pointerup.
  growCanvasIfNeeded(el.y, el.height);

  updatePropertiesSizeFields();
}

function onResizeUp(e, domEl) {
  const el = getElementById(state.resize.elementId);
  const cancelled = e.type === "pointercancel";

  state.resize.active = false;
  state.resize.elementId = null;
  state.resize.handle = null;

  document.removeEventListener("pointermove", resizeMoveHandler);
  document.removeEventListener("pointerup", resizeUpHandler);
  document.removeEventListener("pointercancel", resizeUpHandler);

  resizeMoveHandler = null;
  resizeUpHandler = null;

  stopAutoScroll();

  if (cancelled && el) {
    // Same rule as drag: the browser taking the gesture over means it was a
    // scroll, so a half-finished resize has to be undone rather than kept.
    el.x = state.resize.startLeft;
    el.y = state.resize.startTop;
    el.width = state.resize.startWidth;
    el.height = state.resize.startHeight;
    if (domEl) {
      domEl.style.left = el.x + "px";
      domEl.style.top = el.y + "px";
      domEl.style.width = el.width + "px";
      domEl.style.height = el.height + "px";
    }
    updatePropertiesSizeFields();
    syncPageHeight();
    saveState();
    return;
  }

  // Reclaim any height the page no longer needs (long mode only).
  syncPageHeight();
  saveState();
  pushHistory();
}

function updatePropertiesSizeFields() {
  const wInput = document.getElementById("prop-width");
  const hInput = document.getElementById("prop-height");
  const el = getSelectedElement();
  if (el && wInput) wInput.value = Math.round(el.width);
  if (el && hInput) hInput.value = Math.round(el.height);
}
