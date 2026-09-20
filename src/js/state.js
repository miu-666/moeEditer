const state = {
  // `canvas` is the Page. Two modes share it:
  //   mode "fixed" → the user owns `height` (ratio preset or the Height field)
  //   mode "long"  → `syncPageHeight()` derives `height` from the content
  // Whatever writes it, `state.canvas.height` always equals "the current page
  // height", which is what drag / resize / crop / export keep reading.
  canvas: {
    mode: "fixed",
    ratio: "custom",
    width: 600,
    height: 900,
    background: "#ffffff",
    backgroundImage: null,
    minHeight: 900,
    bottomGap: 80,
    maxHeight: 20000
  },
  elements: [],
  selectedElementId: null,
  grid: {
    enabled: false,
    snap: false,
    size: 8
  },
  assets: [],
  history: {
    stack: [],
    index: -1,
    max: 50
  },
  drag: {
    active: false,
    elementId: null,
    startX: 0,
    startY: 0,
    elStartX: 0,
    elStartY: 0,
    // Whether the element was already selected when this drag began. A gesture
    // that the browser cancels (it took over as a scroll) must put the selection
    // back too, or the next swipe over the same block becomes a drag.
    wasSelected: false,
    // Last pointer position. Auto-scroll replays the drag from here while the
    // pointer rests at the edge of the viewport.
    pointerX: 0,
    pointerY: 0
  },
  crop: {
    active: false,
    elementId: null,
    shape: "none",
    draft: null
  },
  resize: {
    active: false,
    elementId: null,
    handle: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    startLeft: 0,
    startTop: 0,
    // Last pointer position. Auto-scroll replays the resize from here while the
    // pointer rests at the edge of the viewport (same contract as state.drag).
    pointerX: 0,
    pointerY: 0,
    aspectRatio: 1
  },
  // Dragging the divider between the two halves of a split Box.
  split: {
    active: false,
    elementId: null,
    axis: "x",
    startClient: 0,
    startSplit: 0.5,
    extent: 1
  }
};

function setCanvasBackground(color) {
  state.canvas.background = color;
  const canvas = document.getElementById("canvas");
  if (canvas) canvas.style.backgroundColor = color;
}

function setCanvasBackgroundImage(src) {
  state.canvas.backgroundImage = src;
  const canvas = document.getElementById("canvas");
  if (canvas) {
    if (src) {
      canvas.style.backgroundImage = `url("${src}")`;
      canvas.style.backgroundSize = "cover";
      canvas.style.backgroundPosition = "center";
    } else {
      canvas.style.backgroundImage = "none";
    }
  }
}

function setGridEnabled(enabled) {
  state.grid.enabled = enabled;
  const canvas = document.getElementById("canvas");
  if (canvas) {
    canvas.classList.toggle("grid-enabled", enabled);
  }
}

function setGridSnap(snap) {
  state.grid.snap = snap;
}

function setSelectedElementId(id) {
  const prevId = state.selectedElementId;
  state.selectedElementId = id;

  // Update DOM selection states
  document.querySelectorAll(".canvas-element.selected").forEach(el => {
    el.classList.remove("selected");
  });

  if (id) {
    const domEl = document.querySelector(`[data-element-id="${id}"]`);
    if (domEl) domEl.classList.add("selected");
  }

  // Notify properties panel
  if (typeof renderPropertiesPanel === "function") {
    renderPropertiesPanel();
  }
}

function snapToGrid(value) {
  if (!state.grid.snap) return value;
  const size = state.grid.size;
  return Math.round(value / size) * size;
}

function generateId() {
  return "el_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}
