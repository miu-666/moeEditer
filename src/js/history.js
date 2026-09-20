function pushHistory() {
  const snapshot = {
    elements: JSON.parse(JSON.stringify(state.elements)),
    canvas: JSON.parse(JSON.stringify(state.canvas)),
    grid: JSON.parse(JSON.stringify(state.grid))
  };

  // If we're not at the end (undoed before), drop the rest
  if (state.history.index < state.history.stack.length - 1) {
    state.history.stack = state.history.stack.slice(0, state.history.index + 1);
  }

  state.history.stack.push(snapshot);
  state.history.index++;

  // Enforce max size
  if (state.history.stack.length > state.history.max) {
    state.history.stack.shift();
    state.history.index--;
  }
}

function undo() {
  if (state.history.index <= 0) return;
  if (state.crop && state.crop.active) exitCropMode(false);

  state.history.index--;
  applySnapshot(state.history.stack[state.history.index]);
}

function redo() {
  if (state.history.index >= state.history.stack.length - 1) return;
  if (state.crop && state.crop.active) exitCropMode(false);

  state.history.index++;
  applySnapshot(state.history.stack[state.history.index]);
}

function applySnapshot(snapshot) {
  state.elements = JSON.parse(JSON.stringify(snapshot.elements));
  state.canvas = JSON.parse(JSON.stringify(snapshot.canvas));
  state.grid = JSON.parse(JSON.stringify(snapshot.grid));
  state.selectedElementId = null;

  // Re-render everything
  const canvas = document.getElementById("canvas");
  if (canvas) {
    canvas.style.width = state.canvas.width + "px";
    canvas.style.height = state.canvas.height + "px";
    canvas.style.backgroundColor = state.canvas.background;
    if (state.canvas.backgroundImage) {
      canvas.style.backgroundImage = `url("${state.canvas.backgroundImage}")`;
      canvas.style.backgroundSize = "cover";
      canvas.style.backgroundPosition = "center";
    } else {
      canvas.style.backgroundImage = "none";
    }
    canvas.classList.toggle("grid-enabled", state.grid.enabled);
  }

  renderAllElements();
  // Long mode: the snapshot stores a derived height, so re-derive it. Runs
  // before the panel re-renders so the Height field shows the real value.
  syncPageHeight();
  renderPropertiesPanel();

  // Update grid/snap button labels
  const btnGrid = document.getElementById("btn-grid");
  if (btnGrid) btnGrid.textContent = state.grid.enabled ? "Grid: ON" : "Grid: OFF";
  const btnSnap = document.getElementById("btn-snap");
  if (btnSnap) btnSnap.textContent = state.grid.snap ? "Snap: ON" : "Snap: OFF";

  saveState();
}

function initHistory() {
  // Push initial state
  pushHistory();
}
