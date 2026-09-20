const STORAGE_KEY = "moe_bio_editor_state";

function saveState() {
  try {
    const data = {
      canvas: state.canvas,
      elements: state.elements,
      grid: state.grid,
      assets: state.assets
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save state:", e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);

    if (data.canvas) {
      state.canvas = { ...state.canvas, ...data.canvas };
    }
    if (data.elements && Array.isArray(data.elements)) {
      state.elements = data.elements;
    }
    if (data.grid) {
      state.grid = { ...state.grid, ...data.grid };
    }
    if (data.assets && Array.isArray(data.assets)) {
      state.assets = data.assets;
    }
  } catch (e) {
    console.warn("Failed to load state:", e);
  }
}
