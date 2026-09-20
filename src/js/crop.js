// Crop mode for image elements.
// The element's x/y/width/height IS the crop window, and content.crop stores
// how the image sits inside that window (offset + scale).

const MIN_CROP = 24;
const CROP_OUTLINE_COLOR = "#534ab7";

// The shapes the crop window can take. One list, shared by the crop toolbar and
// the properties panel, so the two can never drift into different vocabularies.
// The geometry itself lives in shapeSvgNode() / getClipPath(), which the canvas
// rendering uses too.
const CROP_SHAPES = [
  { id: "none", label: "矩形", title: "长方形裁剪框，宽高随意" },
  { id: "circle", label: "圆形", title: "正圆 / 椭圆" },
  { id: "heart", label: "心形", title: "心形，宽高随意拉伸" },
  { id: "star", label: "星形", title: "五角星" },
  { id: "diamond", label: "菱形", title: "菱形" },
  { id: "arch", label: "拱形", title: "上圆下方的拱形" },
  { id: "rounded", label: "圆角", title: "圆角矩形" }
];

// A shape is purely a clip now; keeping the frame square is its own button, so
// one control never means two things.
function normaliseShape(shape) {
  return (shape === "rect" || shape === "square" || !shape) ? "none" : shape;
}

function shapeDraft(d) {
  return normaliseShape(d.shape);
}

function enterCropMode(id) {
  const el = getElementById(id);
  if (!el || el.type !== "image") return;
  if (!el.content || !el.content.src) {
    alert("这张图片还没有内容，先上传一张图再裁剪");
    return;
  }

  if (el.content.naturalWidth && el.content.naturalHeight) {
    startCrop(el);
    return;
  }

  // Older elements never persisted the natural size, probe it once.
  const probe = new Image();
  probe.onload = () => {
    el.content.naturalWidth = probe.naturalWidth;
    el.content.naturalHeight = probe.naturalHeight;
    saveState();
    startCrop(el);
  };
  probe.onerror = () => alert("图片加载失败，无法裁剪");
  probe.src = el.content.src;
}

function startCrop(el) {
  const nw = el.content.naturalWidth;
  const nh = el.content.naturalHeight;
  const saved = el.content.crop;
  let draft;

  if (saved) {
    // Reopen from whatever the element looks like right now, so a frame that
    // was stretched since the last crop opens at its on-screen proportions.
    const geo = getCropGeometry(el);
    draft = {
      x: el.x,
      y: el.y,
      w: el.width,
      h: el.height,
      offsetX: geo.ix,
      offsetY: geo.iy,
      scaleX: nw ? geo.dw / nw : 1,
      scaleY: nh ? geo.dh / nh : 1,
      shape: normaliseShape(getImageShape(el))
    };
  } else {
    // Start from the exact rect the image occupies today (contain), so nothing jumps.
    const scale = Math.min(el.width / nw, el.height / nh);
    const dw = nw * scale;
    const dh = nh * scale;

    draft = {
      x: Math.round(el.x + (el.width - dw) / 2),
      y: Math.round(el.y + (el.height - dh) / 2),
      w: Math.round(dw),
      h: Math.round(dh),
      offsetX: 0,
      offsetY: 0,
      scaleX: scale,
      scaleY: scale,
      shape: normaliseShape(getImageShape(el))
    };
  }

  state.crop.active = true;
  state.crop.elementId = el.id;
  state.crop.shape = draft.shape;
  state.crop.draft = draft;

  const domEl = document.querySelector(`[data-element-id="${el.id}"]`);
  if (domEl) domEl.classList.add("cropping");

  clearGuides();
  setSelectedElementId(el.id);
  buildCropOverlay();
  renderCropOverlay();
  renderCropToolbar();
}

function buildCropOverlay() {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  const el = getElementById(state.crop.elementId);
  if (!el) return;

  const existing = document.getElementById("crop-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "crop-overlay";
  overlay.id = "crop-overlay";

  const ghost = document.createElement("img");
  ghost.className = "crop-ghost";
  ghost.id = "crop-ghost";
  ghost.draggable = false;
  ghost.src = el.content.src;
  overlay.appendChild(ghost);

  const win = document.createElement("div");
  win.className = "crop-window";
  win.id = "crop-window";
  const clipImg = document.createElement("img");
  clipImg.className = "crop-clip-img";
  clipImg.id = "crop-clip-img";
  clipImg.draggable = false;
  clipImg.src = el.content.src;
  win.appendChild(clipImg);
  overlay.appendChild(win);

  const hit = document.createElement("div");
  hit.className = "crop-window-hit";
  hit.id = "crop-window-hit";
  hit.addEventListener("pointerdown", startCropPan);
  overlay.appendChild(hit);

  const ns = "http://www.w3.org/2000/svg";
  const outline = document.createElementNS(ns, "svg");
  outline.setAttribute("id", "crop-outline");
  outline.setAttribute("class", "crop-outline");
  overlay.appendChild(outline);

  ["nw", "ne", "sw", "se"].forEach(dir => {
    const handle = document.createElement("div");
    handle.className = `crop-handle crop-handle-${dir}`;
    handle.dataset.cropHandle = dir;
    handle.addEventListener("pointerdown", (e) => startCropResize(e, dir));
    overlay.appendChild(handle);
  });

  canvas.appendChild(overlay);
}

function renderCropOverlay() {
  const d = state.crop.draft;
  const el = getElementById(state.crop.elementId);
  if (!d || !el) return;

  const dw = el.content.naturalWidth * d.scaleX;
  const dh = el.content.naturalHeight * d.scaleY;

  const ghost = document.getElementById("crop-ghost");
  if (ghost) {
    ghost.style.left = (d.x + d.offsetX) + "px";
    ghost.style.top = (d.y + d.offsetY) + "px";
    ghost.style.width = dw + "px";
    ghost.style.height = dh + "px";
  }

  const win = document.getElementById("crop-window");
  if (win) {
    win.style.left = d.x + "px";
    win.style.top = d.y + "px";
    win.style.width = d.w + "px";
    win.style.height = d.h + "px";
    const clip = getClipPath(d.shape);
    win.style.clipPath = clip || "none";
    win.style.webkitClipPath = clip || "none";
  }

  const clipImg = document.getElementById("crop-clip-img");
  if (clipImg) {
    clipImg.style.left = d.offsetX + "px";
    clipImg.style.top = d.offsetY + "px";
    clipImg.style.width = dw + "px";
    clipImg.style.height = dh + "px";
  }

  const hit = document.getElementById("crop-window-hit");
  if (hit) {
    hit.style.left = d.x + "px";
    hit.style.top = d.y + "px";
    hit.style.width = d.w + "px";
    hit.style.height = d.h + "px";
  }

  renderCropOutline();
  positionCropHandles();
}

function renderCropOutline() {
  const d = state.crop.draft;
  const svg = document.getElementById("crop-outline");
  if (!svg || !d) return;

  const ns = "http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox", `0 0 ${d.w} ${d.h}`);
  svg.style.left = d.x + "px";
  svg.style.top = d.y + "px";
  svg.style.width = d.w + "px";
  svg.style.height = d.h + "px";

  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Same builder the canvas and the shape layer use, so the dashed guide always
  // sits on the outline the photo will actually keep.
  let shape = shapeSvgNode(normaliseShape(d.shape), d.w, d.h);
  if (!shape) {
    shape = document.createElementNS(ns, "rect");
    shape.setAttribute("x", 0);
    shape.setAttribute("y", 0);
    shape.setAttribute("width", d.w);
    shape.setAttribute("height", d.h);
  }

  shape.setAttribute("fill", "none");
  shape.setAttribute("stroke", CROP_OUTLINE_COLOR);
  shape.setAttribute("stroke-width", "1.5");
  shape.setAttribute("stroke-dasharray", "6 4");
  shape.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(shape);
}

function positionCropHandles() {
  const d = state.crop.draft;
  const overlay = document.getElementById("crop-overlay");
  if (!overlay || !d) return;

  overlay.querySelectorAll(".crop-handle").forEach(handle => {
    const dir = handle.dataset.cropHandle;
    handle.style.left = (dir.includes("w") ? d.x : d.x + d.w) + "px";
    handle.style.top = (dir.includes("n") ? d.y : d.y + d.h) + "px";
  });
}

function renderCropToolbar() {
  const existing = document.getElementById("crop-toolbar");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.className = "crop-toolbar";
  bar.id = "crop-toolbar";

  const shapes = document.createElement("div");
  shapes.className = "crop-toolbar-group";
  CROP_SHAPES.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "crop-shape-btn" + (shapeDraft(state.crop.draft) === item.id ? " active" : "");
    btn.textContent = item.label;
    btn.title = item.title;
    btn.addEventListener("click", () => setCropShape(item.id));
    shapes.appendChild(btn);
  });

  // Keeping the window square is its own button: a shape should only ever mean
  // "what outline", never "snap my width and height".
  const square = document.createElement("button");
  square.className = "crop-shape-btn";
  square.textContent = "1:1";
  square.title = "把裁剪框摆成正方形，之后仍可自由拉伸";
  square.addEventListener("click", () => snapCropToSquare());
  shapes.appendChild(square);

  const hint = document.createElement("span");
  hint.className = "crop-hint";
  hint.textContent = "拖控制点自由拉宽高 · 按住 Shift 保持 1:1";
  shapes.appendChild(hint);

  const actions = document.createElement("div");
  actions.className = "crop-toolbar-group";

  const cancel = document.createElement("button");
  cancel.className = "btn btn-secondary";
  cancel.textContent = "取消";
  cancel.addEventListener("click", () => exitCropMode(false));
  actions.appendChild(cancel);

  const done = document.createElement("button");
  done.className = "btn btn-primary";
  done.textContent = "完成";
  done.addEventListener("click", () => exitCropMode(true));
  actions.appendChild(done);

  bar.appendChild(shapes);
  bar.appendChild(actions);
  document.body.appendChild(bar);
}

function snapCropToSquare() {
  const d = state.crop.draft;
  if (!d) return;
  const size = Math.min(d.w, d.h);
  d.x += (d.w - size) / 2;
  d.y += (d.h - size) / 2;
  d.w = size;
  d.h = size;
  clampCropDraft();
  renderCropOverlay();
}

function startCropPan(e) {
  if (!state.crop.active) return;
  e.preventDefault();
  e.stopPropagation();

  const d = state.crop.draft;
  const el = getElementById(state.crop.elementId);
  if (!d || !el) return;

  const startX = e.clientX;
  const startY = e.clientY;
  const startOffsetX = d.offsetX;
  const startOffsetY = d.offsetY;
  // Where the window itself sat. Anchoring the second half of the gesture here
  // (rather than accumulating) keeps back-and-forth dragging from drifting.
  const baseX = d.x;
  const baseY = d.y;

  const move = (ev) => {
    // The draft lives in page units, the pointer in screen pixels.
    const wantX = toCanvasDelta(ev.clientX - startX);
    const wantY = toCanvasDelta(ev.clientY - startY);

    // First choice: slide the photo inside the window. That is what cropping is
    // usually about, and once the frame is smaller than the photo it is the only
    // thing that can move.
    d.offsetX = startOffsetX + wantX;
    d.offsetY = startOffsetY + wantY;
    clampCropDraft();

    // Whatever the clamp refused becomes a move of the whole window instead.
    // Without this the gesture dies as soon as the photo exactly fills the frame
    // — which is precisely how every crop opens — so dragging appeared to do
    // absolutely nothing.
    const leftoverX = (startOffsetX + wantX) - d.offsetX;
    const leftoverY = (startOffsetY + wantY) - d.offsetY;
    if (leftoverX !== 0 || leftoverY !== 0) {
      d.x = baseX + leftoverX;
      d.y = baseY + leftoverY;
      clampCropDraft();
    }

    renderCropOverlay();
  };

  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}

function startCropResize(e, dir) {
  if (!state.crop.active) return;
  e.preventDefault();
  e.stopPropagation();

  const d = state.crop.draft;
  const startX = e.clientX;
  const startY = e.clientY;
  const base = { x: d.x, y: d.y, w: d.w, h: d.h, offsetX: d.offsetX, offsetY: d.offsetY };

  const move = (ev) => {
    const dx = toCanvasDelta(ev.clientX - startX);
    const dy = toCanvasDelta(ev.clientY - startY);

    let x = base.x;
    let y = base.y;
    let w = base.w;
    let h = base.h;

    if (dir.includes("e")) w = base.w + dx;
    if (dir.includes("w")) {
      w = base.w - dx;
      x = base.x + dx;
    }
    if (dir.includes("s")) h = base.h + dy;
    if (dir.includes("n")) {
      h = base.h - dy;
      y = base.y + dy;
    }

    w = Math.max(MIN_CROP, w);
    h = Math.max(MIN_CROP, h);

    // Width and height are independent by default. Hold Shift to keep them equal.
    if (ev.shiftKey) {
      const size = Math.max(w, h);
      if (dir.includes("w")) x = base.x + base.w - size;
      if (dir.includes("n")) y = base.y + base.h - size;
      w = size;
      h = size;
    }

    // Moving a top/left edge shifts the window, compensate so the image stays put.
    let offsetX = base.offsetX;
    let offsetY = base.offsetY;
    if (dir.includes("w")) offsetX = base.offsetX - (x - base.x);
    if (dir.includes("n")) offsetY = base.offsetY - (y - base.y);

    d.x = x;
    d.y = y;
    d.w = w;
    d.h = h;
    d.offsetX = offsetX;
    d.offsetY = offsetY;

    clampCropDraft();
    renderCropOverlay();
  };

  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}

function clampCropDraft() {
  const d = state.crop.draft;
  const el = getElementById(state.crop.elementId);
  if (!d || !el) return;

  const dw = el.content.naturalWidth * d.scaleX;
  const dh = el.content.naturalHeight * d.scaleY;

  d.w = Math.min(d.w, dw, state.canvas.width);
  d.h = Math.min(d.h, dh, state.canvas.height);
  d.w = Math.max(MIN_CROP, d.w);
  d.h = Math.max(MIN_CROP, d.h);

  d.x = Math.max(0, Math.min(d.x, state.canvas.width - d.w));
  d.y = Math.max(0, Math.min(d.y, state.canvas.height - d.h));

  // The image must always cover the window, no empty gaps.
  d.offsetX = Math.min(0, Math.max(d.w - dw, d.offsetX));
  d.offsetY = Math.min(0, Math.max(d.h - dh, d.offsetY));
}

function setCropShape(shape) {
  const d = state.crop.draft;
  if (!d) return;

  // Draft only. The overlay draws the outline live, and the element itself is
  // written when the crop is applied — cancelling must leave the shape alone.
  d.shape = normaliseShape(shape);
  state.crop.shape = d.shape;

  renderCropOverlay();
  renderCropToolbar();
}

function exitCropMode(apply) {
  const el = getElementById(state.crop.elementId);
  const d = state.crop.draft;

  if (apply && el && d) {
    el.x = Math.round(d.x);
    el.y = Math.round(d.y);
    el.width = Math.round(d.w);
    el.height = Math.round(d.h);
    const round = (v) => Math.round(v * 10000) / 10000;
    const dw = el.content.naturalWidth * d.scaleX;
    const dh = el.content.naturalHeight * d.scaleY;
    // Geometry only — the shape lives in el.style.cropShape.
    el.content.crop = {
      ix: round(d.offsetX / d.w),
      iy: round(d.offsetY / d.h),
      iw: round(dw / d.w),
      ih: round(dh / d.h)
    };
    el.style.cropShape = shapeDraft(d);
  }

  state.crop.active = false;
  state.crop.elementId = null;
  state.crop.shape = "none";
  state.crop.draft = null;

  const overlay = document.getElementById("crop-overlay");
  if (overlay) overlay.remove();
  const bar = document.getElementById("crop-toolbar");
  if (bar) bar.remove();
  document.querySelectorAll(".canvas-element.cropping").forEach(node => node.classList.remove("cropping"));

  if (el) {
    if (apply) {
      rerenderElement(el);
      saveState();
      pushHistory();
    }
    setSelectedElementId(el.id);
  } else {
    renderPropertiesPanel();
  }
}

function clearCrop(id) {
  const el = getElementById(id);
  if (!el || !el.content) return;
  el.content.crop = null;
  saveState();
  pushHistory();
  rerenderElement(el);
  renderPropertiesPanel();
}
