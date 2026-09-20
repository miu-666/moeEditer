document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  // Load saved state
  loadState();

  // Migrate legacy element types
  migrateOldElementTypes();

  // Init canvas
  initCanvas();

  // Long mode stores a derived height, so recompute it on load
  syncPageHeight();

  // Apply loaded grid state
  setGridEnabled(state.grid.enabled);

  // Render elements from loaded state
  renderAllElements();

  // Init history (push initial state)
  initHistory();

  // Init drag
  initDrag();

  // Narrow-screen drawers + canvas viewport scale
  initMobileChrome();
  initCanvasScaleObserver();

  // Init the divider inside split Boxes
  initColumns();

  // Bind component buttons
  document.querySelectorAll(".component-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      // On a phone the components live in a drawer, so adding one has to give
      // the canvas back — otherwise the new block lands out of sight.
      closeDrawers();
      if (type === "image") {
        triggerImageUpload();
      } else {
        createElement(type);
      }
    });
  });

  // Bind Grid button
  const btnGrid = document.getElementById("btn-grid");
  if (btnGrid) {
    btnGrid.textContent = state.grid.enabled ? "Grid: ON" : "Grid: OFF";
    btnGrid.addEventListener("click", () => {
      toggleGrid();
      btnGrid.textContent = state.grid.enabled ? "Grid: ON" : "Grid: OFF";
    });
  }

  // Bind Snap button
  const btnSnap = document.getElementById("btn-snap");
  if (btnSnap) {
    btnSnap.textContent = state.grid.snap ? "Snap: ON" : "Snap: OFF";
    btnSnap.addEventListener("click", () => {
      toggleSnap();
      btnSnap.textContent = state.grid.snap ? "Snap: ON" : "Snap: OFF";
    });
  }

  // Bind New button
  const btnNew = document.getElementById("btn-new");
  if (btnNew) {
    btnNew.addEventListener("click", () => {
      if (state.crop && state.crop.active) exitCropMode(false);
      if (confirm("Clear canvas and start new?")) {
        state.elements = [];
        state.selectedElementId = null;
        renderAllElements();
        // "New" clears the content but keeps the page setup (mode / width / ratio).
        syncPageHeight();
        renderPropertiesPanel();
        saveState();
      }
    });
  }

  // Bind Export button
  const btnExport = document.getElementById("btn-export");
  if (btnExport) {
    btnExport.addEventListener("click", exportPNG);
  }

  // Bind upload button
  const btnUpload = document.getElementById("btn-upload");
  const fileUpload = document.getElementById("file-upload");
  if (btnUpload && fileUpload) {
    btnUpload.addEventListener("click", () => fileUpload.click());
    fileUpload.addEventListener("change", handleAssetUpload);
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", onKeyDown);

  // Canvas click for deselect
  const canvas = document.getElementById("canvas");
  if (canvas) {
    canvas.addEventListener("pointerdown", (e) => {
      if (state.crop && state.crop.active) return;
      if (e.target === canvas) {
        setSelectedElementId(null);
      }
    });
  }

  // Render initial properties panel
  renderPropertiesPanel();

  // Render assets
  renderAssets();
}

function triggerImageUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      const img = new Image();
      img.onload = () => {
        const maxSize = 200;
        const ratio = img.naturalWidth / img.naturalHeight;
        let w, h;
        if (img.naturalWidth > img.naturalHeight) {
          w = Math.min(img.naturalWidth, maxSize);
          h = w / ratio;
        } else {
          h = Math.min(img.naturalHeight, maxSize);
          w = h * ratio;
        }
        const natural = {
          src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        };
        createElement("image", {
          width: Math.round(w),
          height: Math.round(h),
          content: natural
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function onKeyDown(e) {
  // While cropping, only Escape is meaningful
  if (state.crop && state.crop.active) {
    if (e.key === "Escape") {
      e.preventDefault();
      exitCropMode(false);
    }
    return;
  }

  // Undo / Redo
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" || e.key === "Z") {
      // Don't undo if editing text
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      redo();
      return;
    }
  }

  // Delete / Backspace
  if ((e.key === "Delete" || e.key === "Backspace") && state.selectedElementId) {
    // Don't delete if editing text
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) {
      return;
    }
    deleteElement(state.selectedElementId);
    return;
  }

  // Duplicate
  if ((e.key === "d" || e.key === "D") && e.ctrlKey && state.selectedElementId) {
    e.preventDefault();
    duplicateElement(state.selectedElementId);
    return;
  }

  // Copy / Paste
  if (e.key === "c" && e.ctrlKey && state.selectedElementId) {
    const el = getSelectedElement();
    if (el) {
      localStorage.setItem("moe_clipboard", JSON.stringify(el));
    }
    return;
  }

  if (e.key === "v" && e.ctrlKey) {
    const clipboard = localStorage.getItem("moe_clipboard");
    if (clipboard) {
      try {
        const data = JSON.parse(clipboard);
        data.x = (data.x || 0) + 20;
        data.y = (data.y || 0) + 20;
        createElement(data.type, data);
      } catch (err) {
        // ignore
      }
    }
    return;
  }
}

// --- Narrow-screen drawers --------------------------------------------------
//
// Above the breakpoint both sidebars are ordinary columns and none of this
// matters. Below it they are drawers, so something has to record which one is
// open — the body class is what the scrim and the CSS transitions key off.
// The close button is injected instead of sitting in the markup, so the desktop
// DOM stays exactly as it was and no extra CSS is needed to hide it there.

function initMobileChrome() {
  document.querySelectorAll(".sidebar").forEach(sidebar => {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "drawer-close";
    close.setAttribute("aria-label", "Close panel");
    close.textContent = "\u00d7";
    close.addEventListener("click", closeDrawers);
    sidebar.appendChild(close);
  });

  const fabComponents = document.getElementById("fab-components");
  if (fabComponents) {
    fabComponents.addEventListener("click", () => openDrawer("left"));
  }

  const fabProperties = document.getElementById("fab-properties");
  if (fabProperties) {
    fabProperties.addEventListener("click", () => openDrawer("right"));
  }

  const scrim = document.getElementById("drawer-scrim");
  if (scrim) scrim.addEventListener("click", closeDrawers);

  // Escape already means "leave crop mode"; this is the other thing it can
  // mean, and both are safe to run.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawers();
  });
}

function openDrawer(side) {
  closeDrawers();
  document.body.classList.add(side === "left" ? "drawer-left" : "drawer-right");
}

function closeDrawers() {
  document.body.classList.remove("drawer-left", "drawer-right");
}
