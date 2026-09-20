function toggleGrid() {
  setGridEnabled(!state.grid.enabled);
  saveState();
}

function toggleSnap() {
  setGridSnap(!state.grid.snap);
  saveState();
}
