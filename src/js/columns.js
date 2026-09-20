// Dragging the divider inside a split Box. Deliberately the same shape as
// resize.js: the pointerdown picks the divider, the move / up handlers live on
// `document` so the drag survives the pointer leaving the element.
//
// drag.js also bails out on `.column-splitter`, so the two never fight over the
// same gesture.

const MIN_SPLIT = 0.15;
const MAX_SPLIT = 0.85;

function initColumns() {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;
  canvas.addEventListener("pointerdown", onSplitterDown);
}

let splitMoveHandler = null;
let splitUpHandler = null;

function onSplitterDown(e) {
  if (state.crop && state.crop.active) return;
  if (!e.target.classList.contains("column-splitter")) return;

  const domEl = e.target.closest(".canvas-element");
  if (!domEl) return;

  const el = getElementById(domEl.dataset.elementId);
  if (!el || el.type !== "textbox") return;

  const meta = readBoxLayout(el.style);
  if (!meta.isSplit) return;

  const body = e.target.parentElement;
  if (!body) return;

  const rect = body.getBoundingClientRect();
  const axis = meta.layout === "columns" ? "x" : "y";
  const extent = axis === "x" ? rect.width : rect.height;
  if (!(extent > 0)) return;

  e.preventDefault();
  e.stopPropagation();

  state.split.active = true;
  state.split.elementId = el.id;
  state.split.axis = axis;
  state.split.startClient = axis === "x" ? e.clientX : e.clientY;
  state.split.startSplit = meta.split;
  state.split.extent = extent;

  // Without this the cursor flips back to the element's own `move` halfway
  // through the drag whenever the pointer leaves the 11px divider.
  document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";

  splitMoveHandler = (ev) => onSplitterMove(ev, el, body);
  splitUpHandler = () => onSplitterUp();

  document.addEventListener("pointermove", splitMoveHandler);
  document.addEventListener("pointerup", splitUpHandler);
  document.addEventListener("pointercancel", splitUpHandler);
}

function onSplitterMove(e, el, body) {
  if (!state.split.active) return;
  e.preventDefault();

  const client = state.split.axis === "x" ? e.clientX : e.clientY;
  const delta = (client - state.split.startClient) / state.split.extent;
  const split = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, state.split.startSplit + delta));

  el.style.split = Math.round(split * 1000) / 1000;
  // Writing the variable directly keeps the drag off the re-render path.
  body.style.setProperty("--split", (el.style.split * 100) + "%");

  const slider = document.querySelector('.range-input[data-field="style.split"]');
  if (slider) {
    const percent = Math.round(el.style.split * 100);
    slider.value = percent;
    const readout = slider.parentElement?.querySelector(".range-value");
    if (readout) readout.textContent = percent + "%";
  }
}

function onSplitterUp() {
  if (!state.split.active) return;

  state.split.active = false;
  state.split.elementId = null;

  document.removeEventListener("pointermove", splitMoveHandler);
  document.removeEventListener("pointerup", splitUpHandler);
  document.removeEventListener("pointercancel", splitUpHandler);
  splitMoveHandler = null;
  splitUpHandler = null;

  document.body.style.cursor = "";
  saveState();
  pushHistory();
}
