// Surface decoration shared by anything that can carry a frame: background,
// inner border, outer border and shadow. Colours are stored as hex plus a
// separate 0..1 alpha so the colour pickers keep working and transparency is
// an explicit choice instead of a magic value.
const SURFACE_DEFAULTS = {
  backgroundColor: "transparent",
  backgroundAlpha: 1,
  borderColor: "#333333",
  borderWidth: 0,
  borderAlpha: 1,
  borderOuterWidth: 0,
  borderOuterColor: "#333333",
  borderOuterAlpha: 1,
  // Shadow is fully parameterised: X/Y push it around, B blurs its edge, S
  // spreads it (positive fattens the shadow, negative shrinks it). No presets —
  // every slider means exactly one thing.
  shadowX: 0,
  shadowY: 0,
  shadowBlur: 0,
  shadowSpread: 0,
  shadowColor: "#000000",
  shadowAlpha: 0.2
};

const DEFAULT_STYLES = {
  text: {
    fontSize: 18,
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
    fontWeight: "normal",
    color: "#333333",
    textAlign: "left",
    opacity: 1,
    borderRadius: 0,
    lineHeight: 1.4
  },
  image: {
    ...SURFACE_DEFAULTS,
    borderRadius: 0,
    opacity: 1,
    // `lockAspectRatio` only governs dragging; `imageFit` says how the photo sits
    // inside the frame. They used to be conflated across two element types.
    lockAspectRatio: true,
    imageFit: "contain",
    cropShape: "none",
    boxStyle: "default",
    paddingH: 0,
    paddingV: 0
  },
  sticker: {
    fontSize: 32,
    color: "#333333",
    opacity: 1
  },
  divider: {
    color: "#333333",
    opacity: 1,
    lineWidth: 2
  },
  textbox: {
    ...SURFACE_DEFAULTS,
    fontSize: 14,
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
    fontWeight: "normal",
    color: "#333333",
    textAlign: "center",
    opacity: 1,
    borderWidth: 2,
    borderRadius: 4,
    paddingH: 12,
    paddingV: 12,
    lineHeight: 1.4,
    boxStyle: "default",
    // A Box holds one or two "columns" (`single` / `columns` / `rows`), and each
    // column carries its own title + body. That is why the title lives on the
    // column and not on the box: side by side, both halves need their own.
    layout: "single",
    split: 0.5,
    gap: 12,
    titleFontSize: 16,
    titleFontWeight: "bold",
    titleColor: "#333333",
    titleGap: 6
  },
  label: {
    ...SURFACE_DEFAULTS,
    fontSize: 12,
    fontWeight: "600",
    color: "#333333",
    borderWidth: 2,
    borderRadius: 4,
    opacity: 1,
    letterSpacing: 1,
    textTransform: "uppercase"
  }
};

const DEFAULT_CONTENT = {
  text: "Double click to edit",
  image: { src: "" },
  sticker: "✦",
  divider: "",
  // Always two columns, even when only the first is on screen: switching
  // layout back and forth must never drop what the user typed.
  textbox: { columns: [{ title: "", body: "Your text here" }, { title: "", body: "" }] },
  label: "LABEL"
};

const DEFAULT_DIMENSIONS = {
  text: { width: 200, height: 40 },
  image: { width: 150, height: 150 },
  sticker: { width: 50, height: 50 },
  divider: { width: 200, height: 10 },
  textbox: { width: 150, height: 100 },
  label: { width: 80, height: 30 }
};

// --- Surface helpers (background / borders / shadow) ------------------------

function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

// hex + a separate alpha -> a CSS/canvas colour. Alpha 0 means transparent,
// which is the explicit way to clear a colour (no magic "#ffffff" values).
function withAlpha(color, alpha) {
  if (!color || color === "transparent") return "transparent";
  const a = (alpha === undefined || alpha === null) ? 1 : Number(alpha);
  if (!isFinite(a) || a <= 0) return "transparent";
  if (a >= 1) return color;
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.round(a * 1000) / 1000})`;
}

// The four shadow numbers, normalised. Every consumer (CSS string, canvas
// export) reads them from here so the two can never disagree.
function readShadow(style) {
  const s = style || {};
  return {
    x: Number(s.shadowX) || 0,
    y: Number(s.shadowY) || 0,
    blur: Math.max(0, Number(s.shadowBlur) || 0),
    spread: Number(s.shadowSpread) || 0,
    color: withAlpha(
      s.shadowColor || "#000000",
      s.shadowAlpha === undefined ? 0.2 : s.shadowAlpha
    )
  };
}

// Padding is stored per axis so a box can breathe sideways without growing
// vertically: `paddingH` = left/right, `paddingV` = top/bottom. Older records
// only carry the single `padding` value, which then applies to both axes.
function readPadding(style, fallback) {
  const s = style || {};
  const f = fallback === undefined ? 12 : Number(fallback);
  const legacy = s.padding === undefined || s.padding === null ? null : Number(s.padding);
  const pick = (axis) => {
    const v = s[axis] === undefined || s[axis] === null ? null : Number(s[axis]);
    if (v !== null && isFinite(v)) return Math.max(0, v);
    if (legacy !== null && isFinite(legacy)) return Math.max(0, legacy);
    return f;
  };
  return { h: pick("paddingH"), v: pick("paddingV") };
}

function applyPadding(style, content, fallback) {
  const p = readPadding(style, fallback);
  content.style.padding = `${p.v}px ${p.h}px`;
  return p;
}

function hasShadow(style) {
  const sh = readShadow(style);
  if (sh.color === "transparent") return false;
  return sh.x !== 0 || sh.y !== 0 || sh.blur !== 0 || sh.spread !== 0;
}

function buildShadow(style) {
  if (!hasShadow(style)) return "";
  const sh = readShadow(style);
  return `${sh.x}px ${sh.y}px ${sh.blur}px ${sh.spread}px ${sh.color}`;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// The shape outlines in a 0..100 box. These are the same numbers the CSS
// clip-paths and the SVG clipPath defs in index.html use, so an outline drawn
// from one of these sits exactly on the edge of the clipped photo.
const SHAPE_PATHS_100 = {
  heart: "M50 100 C10 68.2 0 45.5 0 28.4 C0 11.4 15 0 30 0 C40 0 47 8 50 17 C53 8 60 0 70 0 C85 0 100 11.4 100 28.4 C100 45.5 90 68.2 50 100 Z",
  star: "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z",
  diamond: "M50 0 L100 50 L50 100 L0 50 Z",
  arch: "M0 100 L0 30 Q50 0 100 30 L100 100 Z"
};

// One shape as an SVG node laid out in a w × h box. Returns null for the plain
// rectangle (and for an unknown shape), so callers can fall back to a rect.
function shapeSvgNode(shape, w, h) {
  if (!shape || shape === "none" || shape === "rect" || shape === "square") return null;

  if (shape === "circle") {
    const node = document.createElementNS(SVG_NS, "ellipse");
    node.setAttribute("cx", w / 2);
    node.setAttribute("cy", h / 2);
    node.setAttribute("rx", w / 2);
    node.setAttribute("ry", h / 2);
    return node;
  }

  if (shape === "rounded") {
    // Matches `inset(0 round 20%)`: the radius is 20% of each side.
    const node = document.createElementNS(SVG_NS, "rect");
    node.setAttribute("x", 0);
    node.setAttribute("y", 0);
    node.setAttribute("width", w);
    node.setAttribute("height", h);
    node.setAttribute("rx", w * 0.2);
    node.setAttribute("ry", h * 0.2);
    return node;
  }

  const d = SHAPE_PATHS_100[shape];
  if (!d) return null;
  const node = document.createElementNS(SVG_NS, "path");
  node.setAttribute("d", d);
  node.setAttribute("transform", `scale(${w / 100} ${h / 100})`);
  return node;
}

// Background and inner border go on the content box; the outer border and the
// shadow go on the wrapper, so a clip-path on the content cannot eat them.
// The outer border is a spread-only box-shadow rather than an outline, because
// .canvas-element.selected already owns the outline.
//
// With a shape on, though, a box-shadow spread can only ever grow a rounded
// rectangle, so a circular photo would keep a rectangular frame and a
// rectangular shadow. Those two move to the SVG layer instead — see
// syncShapeLayer() — and the wrapper keeps only what a spread can express.
function applySurface(el, domEl, content, shape) {
  const s = el.style || {};
  const radius = Number(s.borderRadius) || 0;

  content.style.backgroundColor = withAlpha(s.backgroundColor, s.backgroundAlpha);
  content.style.border = (Number(s.borderWidth) > 0)
    ? `${s.borderWidth}px solid ${withAlpha(s.borderColor, s.borderAlpha)}`
    : "none";
  content.style.borderRadius = radius + "px";

  const outer = Number(s.borderOuterWidth) || 0;
  const layers = [];
  if (outer > 0 && !shape) {
    // The spread is what makes the ring. box-shadow already grows the corner
    // radius by the spread automatically, so the wrapper keeps the content
    // radius — adding `outer` here would double the rounding.
    layers.push(`0px 0px 0px ${outer}px ${withAlpha(s.borderOuterColor, s.borderOuterAlpha)}`);
  }
  const shadow = shape ? "" : buildShadow(s);
  if (shadow) layers.push(shadow);

  domEl.style.borderRadius = radius + "px";
  domEl.style.boxShadow = layers.join(", ");
}

// The outer border and the shadow of a *shaped* element, drawn as SVG so both
// follow the outline the photo is clipped to. Sits under the content box, so it
// reads as a frame around the photo rather than a filled block behind it.
function syncShapeLayer(el, domEl, shape) {
  const s = el.style || {};
  const w = Math.max(1, el.width);
  const h = Math.max(1, el.height);
  const outer = Number(s.borderOuterWidth) || 0;
  const outerColor = withAlpha(s.borderOuterColor, s.borderOuterAlpha);
  const shadow = hasShadow(s) ? readShadow(s) : null;

  const needRing = outer > 0 && outerColor !== "transparent";
  const needShadow = !!shadow && shadow.color !== "transparent";

  let layer = null;
  for (const child of Array.from(domEl.children)) {
    if (child.classList && child.classList.contains("element-shape-layer")) {
      layer = child;
      break;
    }
  }

  if (!shape || (!needRing && !needShadow)) {
    if (layer) layer.remove();
    return;
  }

  if (!layer) {
    layer = document.createElementNS(SVG_NS, "svg");
    layer.setAttribute("class", "element-shape-layer");
    layer.setAttribute("preserveAspectRatio", "none");
    domEl.insertBefore(layer, domEl.firstChild);
  }
  layer.setAttribute("viewBox", `0 0 ${w} ${h}`);
  layer.style.width = "100%";
  layer.style.height = "100%";

  // Dragging a slider fires an update per pointermove. Nothing below depends on
  // anything but these values, so an unchanged signature can be skipped.
  const signature = [
    shape, w, h, outer, outerColor,
    needShadow ? `${shadow.x},${shadow.y},${shadow.blur},${shadow.spread},${shadow.color}` : ""
  ].join("|");
  if (layer.getAttribute("data-shape-sig") === signature) return;
  layer.setAttribute("data-shape-sig", signature);

  while (layer.firstChild) layer.removeChild(layer.firstChild);

  // The shadow goes underneath. A spread grows the silhouette first, the same
  // way the exporter grows the shape's box, so the two stay in step.
  if (needShadow) {
    const node = shapeSvgNode(shape, w, h);
    if (node) {
      const spread = Number(shadow.spread) || 0;
      const group = document.createElementNS(SVG_NS, "g");
      if (spread) {
        const sx = (w + spread * 2) / w;
        const sy = (h + spread * 2) / h;
        group.setAttribute(
          "transform",
          `translate(${w / 2} ${h / 2}) scale(${sx} ${sy}) translate(${-w / 2} ${-h / 2})`
        );
      }
      group.setAttribute(
        "style",
        `filter: drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color})`
      );
      node.setAttribute("fill", shadow.color);
      group.appendChild(node);
      layer.appendChild(group);
    }
  }

  // The ring is a centred stroke: half of it lands under the photo and is
  // hidden, so only the outer half shows — exactly an `outer` px frame.
  if (needRing) {
    const node = shapeSvgNode(shape, w, h);
    if (node) {
      node.setAttribute("fill", "none");
      node.setAttribute("stroke", outerColor);
      node.setAttribute("stroke-width", outer * 2);
      node.setAttribute("vector-effect", "non-scaling-stroke");
      layer.appendChild(node);
    }
  }
}

// Crop geometry, expressed as ratios of the element box (percent for CSS, px
// for canvas export). Storing ratios instead of absolute pixels means the photo
// keeps filling its frame when the frame is stretched out of proportion.
// Legacy records (absolute offsetX/offsetY + one uniform scale) still read fine.
function getCropGeometry(el) {
  const crop = el.content && el.content.crop;
  if (!crop) return null;

  let dw;
  let dh;
  let ix;
  let iy;

  if (typeof crop.iw === "number") {
    dw = crop.iw * el.width;
    dh = crop.ih * el.height;
    ix = crop.ix * el.width;
    iy = crop.iy * el.height;
  } else {
    const scale = crop.scale || 1;
    dw = (el.content.naturalWidth || el.width) * scale;
    dh = (el.content.naturalHeight || el.height) * scale;
    ix = crop.offsetX || 0;
    iy = crop.offsetY || 0;
  }

  return {
    dw,
    dh,
    ix,
    iy,
    left: (ix / el.width) * 100,
    top: (iy / el.height) * 100,
    width: (dw / el.width) * 100,
    height: (dh / el.height) * 100
  };
}

// How the photo sits inside the frame. Legacy records have no `imageFit` and
// only the old overloaded `lockAspectRatio` to go on.
function readImageFit(el) {
  const s = (el && el.style) || {};
  if (s.imageFit === "cover" || s.imageFit === "contain" || s.imageFit === "fill") {
    return s.imageFit;
  }
  return s.lockAspectRatio === false ? "fill" : "contain";
}

// The crop shape is a single field: `style.cropShape`. Picking a shape from the
// panel or from inside crop mode writes to the same place, so there is only ever
// one answer to "what shape is this photo". Records cropped before that split
// still carry the shape next to the geometry.
function getImageShape(el) {
  const s = (el && el.style) || {};
  if (s.cropShape && s.cropShape !== "none") return s.cropShape;
  const legacy = el && el.content && el.content.crop && el.content.crop.shape;
  if (legacy && legacy !== "rect" && legacy !== "square") return legacy;
  return "";
}

// The rect the photo actually occupies: the element box minus its inner border
// and padding. Preview and export both place the photo here, so the two cannot
// drift apart when padding or a border is added on top of a crop.
function getPictureArea(el) {
  const s = (el && el.style) || {};
  const border = Math.max(0, Number(s.borderWidth) || 0);
  const pad = readPadding(s, 0);
  return {
    x: el.x + border + pad.h,
    y: el.y + border + pad.v,
    width: Math.max(1, el.width - (border + pad.h) * 2),
    height: Math.max(1, el.height - (border + pad.v) * 2),
    border,
    padH: pad.h,
    padV: pad.v
  };
}

// Placement for a cropped photo, in percent of the element's padding box — that
// is what an absolutely positioned child resolves its percentages against. The
// crop geometry is scaled down into the picture area, so padding and borders
// shrink the photo instead of being silently ignored.
function getCropPlacement(el) {
  const geo = getCropGeometry(el);
  if (!geo) return null;

  const s = (el && el.style) || {};
  const border = Math.max(0, Number(s.borderWidth) || 0);
  const pad = readPadding(s, 0);
  const refW = Math.max(1, el.width - border * 2);
  const refH = Math.max(1, el.height - border * 2);
  const kx = Math.max(0, el.width - (border + pad.h) * 2) / el.width;
  const ky = Math.max(0, el.height - (border + pad.v) * 2) / el.height;

  return {
    left: ((pad.h + geo.ix * kx) / refW) * 100,
    top: ((pad.v + geo.iy * ky) / refH) * 100,
    width: ((geo.dw * kx) / refW) * 100,
    height: ((geo.dh * ky) / refH) * 100
  };
}

function getClipPath(shape) {
  // Percentage based shapes scale with the element. Path based shapes are
  // referenced from the inline SVG clipPath defs so they scale too.
  switch (shape) {
    case "circle":
      // ellipse() rather than circle(): circle() keeps a single radius so a
      // stretched window would still render a round shape and leave gaps.
      return "ellipse(50% 50% at 50% 50%)";
    case "rounded":
      return "inset(0 round 20%)";
    case "heart":
      return "url(#clip-heart)";
    case "star":
      return "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";
    case "diamond":
      return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "arch":
      return "url(#clip-arch)";
    case "none":
    case "rect":
    case "square":
    default:
      return null;
  }
}

// --- Box columns (side-by-side / stacked halves) ---------------------------

// Deep copy for default content, because a Box now stores an object. Sharing
// the DEFAULT_CONTENT literal would make every new box edit the same array.
function cloneContent(content) {
  if (content === null || typeof content !== "object") return content;
  if (Array.isArray(content)) return content.map(cloneContent);
  const out = {};
  for (const key of Object.keys(content)) out[key] = cloneContent(content[key]);
  return out;
}

// A Box always answers with exactly two {title, body} columns, whatever shape
// the record is in. Records written before Boxes had columns stored the body as
// a plain string; `getBoxColumns` reads those too, so nothing has to be
// migrated before it can be rendered.
function getBoxColumns(el) {
  const content = el && el.content;
  const stored = content && typeof content === "object" && Array.isArray(content.columns)
    ? content.columns
    : null;
  const legacyBody = typeof content === "string" ? content : "";
  const source = stored || [{ title: "", body: legacyBody }, { title: "", body: "" }];

  return [0, 1].map(i => {
    const column = source[i] || {};
    const align = column.align;
    return {
      title: column.title === undefined || column.title === null ? "" : String(column.title),
      body: column.body === undefined || column.body === null ? "" : String(column.body),
      // "" means "inherit the box's textAlign". Kept through the read so that
      // writing a column's text never drops its alignment.
      align: align === "left" || align === "center" || align === "right" ? align : ""
    };
  });
}

// The single write path for a column's own fields (`title` / `body` / `align`).
// Rewrites the whole array so the stored record always keeps the canonical
// two-column shape.
function setBoxColumn(el, index, part, value) {
  if (part !== "title" && part !== "body" && part !== "align") return;
  if (index !== 0 && index !== 1) return;
  const columns = getBoxColumns(el);
  if (part === "align") {
    const align = value === "left" || value === "center" || value === "right" ? value : "";
    columns[index].align = align;
  } else {
    columns[index][part] = String(value === undefined || value === null ? "" : value);
  }
  el.content = { columns };
}

// A column's horizontal align: its own value if it has one, otherwise the box's.
// Every record written before columns could align themselves has no `align`, so
// this falls back to `style.textAlign` and those pages render exactly as before.
function readColumnAlign(column, style) {
  const own = column && column.align;
  if (own === "left" || own === "center" || own === "right") return own;
  const fallback = (style || {}).textAlign;
  return fallback === "center" || fallback === "right" ? fallback : "left";
}

// Resolved layout settings with defaults filled in. Records saved before Boxes
// had a layout carry none of these fields, so every reader comes through here
// rather than touching `style` directly.
function readBoxLayout(style) {
  const s = style || {};
  const num = (value, fallback) => {
    const n = Number(value);
    return value === undefined || value === null || value === "" || !isFinite(n) ? fallback : n;
  };
  const layout = s.layout === "columns" || s.layout === "rows" ? s.layout : "single";

  return {
    layout,
    isSplit: layout !== "single",
    split: Math.min(0.85, Math.max(0.15, num(s.split, 0.5))),
    gap: Math.max(0, num(s.gap, 12)),
    titleFontSize: Math.max(8, num(s.titleFontSize, 16)),
    // Same "normal" / "bold" vocabulary as the body font weight.
    titleFontWeight: s.titleFontWeight === "normal" ? "normal" : "bold",
    titleColor: s.titleColor || "#333333",
    titleGap: Math.max(0, num(s.titleGap, 6)),
    // Where a column's text block sits vertically. Records saved before this
    // field existed fall back to the old look — a single-column Box centres,
    // a split Box starts at the top — so old pages are unchanged.
    vAlign: (s.vAlign === "top" || s.vAlign === "middle" || s.vAlign === "bottom")
      ? s.vAlign
      : (layout === "single" ? "middle" : "top")
  };
}

function getBoxLayout(el) {
  return readBoxLayout(el && el.style).layout;
}

// How many of the two columns are on screen. A single-column Box renders only
// the first one; the second stays in the data.
function visibleBoxColumnCount(el) {
  return getBoxLayout(el) === "single" ? 1 : 2;
}

// Anything that changes the *shape* of a Box's DOM — the layout, or whether a
// column has a title at all — needs a re-render rather than a text update. The
// signature is stashed on the content node and compared on every update.
function boxStructureSignature(el) {
  const count = visibleBoxColumnCount(el);
  const titles = getBoxColumns(el).slice(0, count).map(c => (c.title ? "1" : "0")).join("");
  return `${getBoxLayout(el)}|${titles}`;
}

function createElement(type, overrides = {}) {
  const dims = DEFAULT_DIMENSIONS[type] || { width: 100, height: 100 };
  const el = {
    id: generateId(),
    type,
    x: overrides.x ?? 50,
    // Long mode: a new element lands under the existing content so blocks keep
    // stacking downwards. Still absolutely positioned, still freely draggable.
    y: overrides.y ?? getNewElementY(),
    width: overrides.width ?? dims.width,
    height: overrides.height ?? dims.height,
    rotation: 0,
    zIndex: state.elements.length + 1,
    content: cloneContent(overrides.content === undefined ? DEFAULT_CONTENT[type] : overrides.content),
    style: { ...(DEFAULT_STYLES[type] || {}), ...(overrides.style || {}) }
  };

  state.elements.push(el);
  renderElementToCanvas(el);
  setSelectedElementId(el.id);
  // Long mode: make room for the new element before the state is captured.
  syncPageHeight();
  saveState();
  pushHistory();
  return el;
}

function deleteElement(id) {
  const idx = state.elements.findIndex(e => e.id === id);
  if (idx === -1) return;

  state.elements.splice(idx, 1);

  const domEl = document.querySelector(`[data-element-id="${id}"]`);
  if (domEl) domEl.remove();

  if (state.selectedElementId === id) {
    setSelectedElementId(null);
  }

  // Long mode: the page shrinks back when the last block on it goes away.
  syncPageHeight();
  saveState();
  pushHistory();
}

function duplicateElement(id) {
  const el = state.elements.find(e => e.id === id);
  if (!el) return;

  const copy = {
    ...el,
    id: generateId(),
    x: el.x + 20,
    y: el.y + 20,
    zIndex: state.elements.length + 1,
    content: typeof el.content === "object" ? JSON.parse(JSON.stringify(el.content)) : el.content,
    style: { ...el.style }
  };

  state.elements.push(copy);
  renderElementToCanvas(copy);
  setSelectedElementId(copy.id);
  syncPageHeight();
  saveState();
  pushHistory();
  return copy;
}

function updateElement(id, data) {
  const el = state.elements.find(e => e.id === id);
  if (!el) return;

  if (data.x !== undefined) el.x = data.x;
  if (data.y !== undefined) el.y = data.y;
  if (data.width !== undefined) el.width = data.width;
  if (data.height !== undefined) el.height = data.height;
  if (data.rotation !== undefined) el.rotation = data.rotation;
  if (data.zIndex !== undefined) el.zIndex = data.zIndex;
  if (data.content !== undefined) el.content = data.content;
  if (data.style) el.style = { ...el.style, ...data.style };

  updateElementDOM(el);
}

function getElementById(id) {
  return state.elements.find(e => e.id === id);
}

function getSelectedElement() {
  return getElementById(state.selectedElementId);
}

function bringToFront(id) {
  const el = getElementById(id);
  if (!el) return;
  const maxZ = state.elements.reduce((max, e) => Math.max(max, e.zIndex), 0);
  el.zIndex = maxZ + 1;
  updateElementDOM(el);
  saveState();
}

function sendToBack(id) {
  const el = getElementById(id);
  if (!el) return;
  const minZ = state.elements.reduce((min, e) => Math.min(min, e.zIndex), 0);
  el.zIndex = minZ - 1;
  updateElementDOM(el);
  saveState();
}

// --- Image element -----------------------------------------------------------
// One element type for photos. The frame (background / borders / radius /
// padding / shape clip) hangs off .element-content, the photo itself is an <img>
// inside it. Both the initial render and every later property change go through
// these two helpers, so there is a single implementation to keep correct.

const IMAGE_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24'%3E%3Cpath fill='%23ccc' d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/%3E%3C/svg%3E";

function applyImageFrame(el, domEl, content) {
  const s = el.style || {};
  const shape = getImageShape(el);

  applySurface(el, domEl, content, shape);
  content.style.opacity = s.opacity;
  applyPadding(s, content, 0);
  content.style.position = "relative";
  content.style.overflow = "hidden";
  content.style.display = "flex";
  content.style.alignItems = "center";
  content.style.justifyContent = "center";

  // The shape clips the whole frame, not just the photo: that is what keeps the
  // inner border readable as a ring on a circular / heart crop.
  const clip = getClipPath(shape);
  content.style.clipPath = clip || "none";
  content.style.webkitClipPath = clip || "none";

  // A shaped frame cannot get its outer border or shadow from the wrapper's
  // box-shadow, so both are drawn on their own layer here.
  syncShapeLayer(el, domEl, shape);
}

function syncImageContent(el, content) {
  const s = el.style || {};
  const src = el.content && el.content.src;
  const crop = (el.content && el.content.crop) || null;

  let img = content.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    content.appendChild(img);
  }

  if (src) {
    if (img.getAttribute("src") !== src) img.src = src;
    img.style.opacity = "1";
  } else if (!img.getAttribute("src")) {
    img.src = IMAGE_PLACEHOLDER;
    img.style.opacity = "0.6";
  }
  img.style.display = "block";
  img.style.pointerEvents = "none";

  const place = crop ? getCropPlacement(el) : null;
  if (place) {
    // Cropped: the element box is the crop window and the photo sits inside it
    // with percentage geometry, so it follows when the box is stretched.
    img.style.position = "absolute";
    img.style.left = place.left + "%";
    img.style.top = place.top + "%";
    img.style.width = place.width + "%";
    img.style.height = place.height + "%";
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";
    // The stylesheet default (contain) would letterbox the photo inside the
    // window we just sized; fill makes it cover exactly that window.
    img.style.objectFit = "fill";
    img.style.borderRadius = "0px";
  } else {
    img.style.position = "";
    img.style.left = "";
    img.style.top = "";
    img.style.maxWidth = "";
    img.style.maxHeight = "";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = readImageFit(el);
    img.style.borderRadius = (Number(s.borderRadius) || 0) + "px";
  }

  return img;
}

// --- Box column DOM ---------------------------------------------------------

// Builds the two columns of a Box. `layout: "single"` only renders the first
// one — the second one stays in the data so switching layout back and forth
// never loses text. No nesting: a column holds text, never another element.
function applyBoxBody(el, body) {
  const meta = readBoxLayout(el.style);
  body.className = `box-body layout-${meta.layout} valign-${meta.vAlign}`;
  // One variable drives both the first column's width and the divider position.
  body.style.setProperty("--split", (meta.split * 100) + "%");
  body.style.setProperty("--box-gap", meta.gap + "px");
  body.style.setProperty("--title-gap", meta.titleGap + "px");
  return meta;
}

function buildBoxTextNode(el, domEl, index, part, text, meta, align) {
  const node = document.createElement("div");
  node.className = part === "title" ? "box-title" : "box-text";
  node.dataset.col = String(index);
  node.dataset.part = part;
  node.textContent = text;
  applyBoxTextNodeStyle(el, node, part, meta, align);

  // `data-col` / `data-part` is how a blur finds its way back into the record.
  node.addEventListener("focus", () => domEl.classList.add("editing"));
  node.addEventListener("blur", () => {
    domEl.classList.remove("editing");
    node.contentEditable = "false";
    const value = node.textContent;
    setBoxColumn(el, index, part, value);
    // Emptying the title on the canvas removes it from view; a new one is typed
    // in the properties panel. No re-render here, so focus is never stolen.
    if (part === "title" && value.trim() === "") node.style.display = "none";
    saveState();
  });
  node.addEventListener("keydown", (e) => {
    if (e.key === "Escape") node.blur();
    e.stopPropagation();
  });

  return node;
}

function applyBoxTextNodeStyle(el, node, part, meta, align) {
  const isTitle = part === "title";
  node.style.fontSize = ((isTitle ? meta.titleFontSize : Number(el.style.fontSize) || 14)) + "px";
  node.style.fontFamily = el.style.fontFamily;
  node.style.fontWeight = isTitle ? meta.titleFontWeight : el.style.fontWeight;
  node.style.color = isTitle ? meta.titleColor : el.style.color;
  node.style.lineHeight = el.style.lineHeight;
  // Title and body follow the column, so one control aligns the whole column.
  node.style.textAlign = align || el.style.textAlign;
}

function buildBoxColumn(el, domEl, index, column, meta) {
  const node = document.createElement("div");
  node.className = "box-column";
  node.dataset.col = String(index);

  const align = readColumnAlign(column, el.style);
  // No title means no title line at all, rather than an empty one taking space.
  if (column.title) node.appendChild(buildBoxTextNode(el, domEl, index, "title", column.title, meta, align));
  node.appendChild(buildBoxTextNode(el, domEl, index, "body", column.body, meta, align));

  return node;
}

function renderElementToCanvas(el) {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  const domEl = document.createElement("div");
  domEl.className = `canvas-element element-${el.type}`;
  domEl.dataset.elementId = el.id;
  domEl.style.left = el.x + "px";
  domEl.style.top = el.y + "px";
  domEl.style.width = el.width + "px";
  domEl.style.height = el.height + "px";
  domEl.style.zIndex = el.zIndex;

  const content = document.createElement("div");
  content.className = "element-content";

  switch (el.type) {
    case "text": {
      const inner = document.createElement("div");
      inner.className = "text-inner";
      inner.textContent = el.content;
      inner.style.fontSize = el.style.fontSize + "px";
      inner.style.fontFamily = el.style.fontFamily;
      inner.style.fontWeight = el.style.fontWeight;
      inner.style.color = el.style.color;
      inner.style.textAlign = el.style.textAlign;
      inner.style.opacity = el.style.opacity;
      inner.style.lineHeight = el.style.lineHeight;
      inner.contentEditable = "false";
      inner.style.width = "100%";
      inner.style.height = "100%";
      inner.style.overflow = "hidden";
      inner.style.cursor = "move";

      inner.addEventListener("focus", () => {
        domEl.classList.add("editing");
        inner.style.cursor = "text";
      });
      inner.addEventListener("blur", () => {
        domEl.classList.remove("editing");
        inner.contentEditable = "false";
        inner.style.cursor = "move";
        el.content = inner.textContent;
        saveState();
      });
      inner.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          inner.blur();
        }
        e.stopPropagation();
      });

      // Double-click to edit
      domEl.addEventListener("dblclick", () => {
        inner.contentEditable = "true";
        inner.focus();
        // Place cursor at end
        const range = document.createRange();
        range.selectNodeContents(inner);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });

      content.appendChild(inner);
      break;
    }
    case "image": {
      content.className = `element-content box-style-${el.style.boxStyle || "default"}`;
      applyImageFrame(el, domEl, content);
      content.dataset.cropMode = el.content && el.content.crop ? "1" : "0";
      syncImageContent(el, content);
      break;
    }
    case "sticker": {
      content.textContent = el.content;
      content.style.fontSize = el.style.fontSize + "px";
      content.style.color = el.style.color;
      content.style.opacity = el.style.opacity;
      break;
    }
    case "divider": {
      const line = document.createElement("div");
      line.className = "divider-line";
      line.style.background = el.style.color;
      line.style.height = el.style.lineWidth + "px";
      line.style.opacity = el.style.opacity;
      content.appendChild(line);
      break;
    }
    case "textbox": {
      content.className = `element-content box-style-${el.style.boxStyle || "default"}`;
      applySurface(el, domEl, content);
      content.style.opacity = el.style.opacity;
      applyPadding(el.style, content, 12);

      const meta = readBoxLayout(el.style);
      const body = document.createElement("div");
      applyBoxBody(el, body);

      const columns = getBoxColumns(el).slice(0, meta.isSplit ? 2 : 1);
      columns.forEach((column, i) => body.appendChild(buildBoxColumn(el, domEl, i, column, meta)));

      if (meta.isSplit) {
        const splitter = document.createElement("div");
        splitter.className = "column-splitter";
        splitter.title = meta.layout === "columns" ? "拖动调整左右比例" : "拖动调整上下比例";
        body.appendChild(splitter);
      }

      content.dataset.structure = boxStructureSignature(el);
      content.appendChild(body);

      // Double-click anywhere in the frame edits the nearest text; on the
      // padding it falls through to the body, which is what a Box is for.
      domEl.addEventListener("dblclick", (e) => {
        if (e.target.classList.contains("column-splitter")) return;
        const node = e.target.closest(".box-title, .box-text") || content.querySelector(".box-text");
        if (!node) return;
        node.style.display = "";
        node.contentEditable = "true";
        node.focus();
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });

      break;
    }
    case "label": {
      content.textContent = el.content;
      applySurface(el, domEl, content);
      content.style.fontSize = el.style.fontSize + "px";
      content.style.fontWeight = el.style.fontWeight;
      content.style.color = el.style.color;
      content.style.opacity = el.style.opacity;
      content.style.letterSpacing = el.style.letterSpacing + "px";
      content.style.textTransform = el.style.textTransform;
      break;
    }
  }

  domEl.appendChild(content);

  // Resize handles
  ["nw", "ne", "sw", "se"].forEach(dir => {
    const handle = document.createElement("div");
    handle.className = `resize-handle ${dir}`;
    handle.dataset.handle = dir;
    domEl.appendChild(handle);
  });

  canvas.appendChild(domEl);
}

function rerenderElement(el) {
  const old = document.querySelector(`[data-element-id="${el.id}"]`);
  const wasSelected = state.selectedElementId === el.id;
  if (old) old.remove();

  renderElementToCanvas(el);

  if (wasSelected) {
    const node = document.querySelector(`[data-element-id="${el.id}"]`);
    if (node) node.classList.add("selected");
  }
}

function updateElementDOM(el) {
  const domEl = document.querySelector(`[data-element-id="${el.id}"]`);
  if (!domEl) return;

  domEl.style.left = el.x + "px";
  domEl.style.top = el.y + "px";
  domEl.style.width = el.width + "px";
  domEl.style.height = el.height + "px";
  domEl.style.zIndex = el.zIndex;

  const content = domEl.querySelector(".element-content");
  if (!content) return;

  switch (el.type) {
    case "text": {
      const inner = content.querySelector(".text-inner");
      if (inner) {
        // Only update content if not currently editing
        if (!domEl.classList.contains("editing")) {
          inner.textContent = el.content;
        }
        inner.style.fontSize = el.style.fontSize + "px";
        inner.style.fontFamily = el.style.fontFamily;
        inner.style.fontWeight = el.style.fontWeight;
        inner.style.color = el.style.color;
        inner.style.textAlign = el.style.textAlign;
        inner.style.opacity = el.style.opacity;
        inner.style.lineHeight = el.style.lineHeight;
      }
      break;
    }
    case "image": {
      const crop = el.content && el.content.crop;
      const needsRerender = (crop ? "1" : "0") !== content.dataset.cropMode;
      if (needsRerender) {
        rerenderElement(el);
        return;
      }

      content.className = `element-content box-style-${el.style.boxStyle || "default"}`;
      applyImageFrame(el, domEl, content);
      syncImageContent(el, content);
      break;
    }
    case "sticker": {
      content.textContent = el.content;
      content.style.fontSize = el.style.fontSize + "px";
      content.style.color = el.style.color;
      content.style.opacity = el.style.opacity;
      break;
    }
    case "divider": {
      const line = content.querySelector(".divider-line");
      if (line) {
        line.style.background = el.style.color;
        line.style.height = el.style.lineWidth + "px";
        line.style.opacity = el.style.opacity;
      }
      break;
    }
    case "textbox": {
      // Adding a title, or switching layout, changes how many nodes exist —
      // that needs a rebuild, not a text update.
      if (content.dataset.structure !== boxStructureSignature(el)) {
        rerenderElement(el);
        return;
      }

      content.className = `element-content box-style-${el.style.boxStyle || "default"}`;
      applySurface(el, domEl, content);
      content.style.opacity = el.style.opacity;
      applyPadding(el.style, content, 12);

      const body = content.querySelector(".box-body");
      const meta = body ? applyBoxBody(el, body) : readBoxLayout(el.style);
      const columns = getBoxColumns(el);

      content.querySelectorAll(".box-title, .box-text").forEach(node => {
        // Never overwrite the node someone is typing into on the canvas — but do
        // keep updating every other node, which a class-level guard would skip.
        if (node.isContentEditable) return;

        const index = Number(node.dataset.col) || 0;
        const part = node.dataset.part;
        if (!columns[index]) return;

        const text = columns[index][part];
        if (node.textContent !== text) node.textContent = text;
        if (part === "title") node.style.display = text ? "" : "none";
        applyBoxTextNodeStyle(el, node, part, meta, readColumnAlign(columns[index], el.style));
      });
      break;
    }
    case "label": {
      content.textContent = el.content;
      applySurface(el, domEl, content);
      content.style.fontSize = el.style.fontSize + "px";
      content.style.fontWeight = el.style.fontWeight;
      content.style.color = el.style.color;
      content.style.opacity = el.style.opacity;
      content.style.letterSpacing = el.style.letterSpacing + "px";
      content.style.textTransform = el.style.textTransform;
      break;
    }
  }
}

function renderAllElements() {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;
  canvas.innerHTML = "";
  state.elements.forEach(el => renderElementToCanvas(el));
}

function migrateOldElementTypes() {
  // Convert legacy "box" type into "textbox"
  state.elements.forEach(el => {
    if (el.type === "box") {
      el.type = "textbox";
      if (!el.style) el.style = {};
      if (!el.style.boxStyle) el.style.boxStyle = "default";
    }
    if (!el.style) el.style = {};

    // Box content used to be one string. It is a pair of {title, body} columns
    // now, so the same element can be split without a second type. Records that
    // are already structured are left alone — only a missing shape is filled in.
    if (el.type === "textbox") {
      if (typeof el.content === "string") {
        el.content = { columns: [{ title: "", body: el.content }, { title: "", body: "" }] };
      } else if (!el.content || typeof el.content !== "object" || !Array.isArray(el.content.columns)) {
        el.content = { columns: [{ title: "", body: "" }, { title: "", body: "" }] };
      }
    }

    // "imagebox" was Image plus a frame. The frame is part of Image now, so the
    // two types collapse into one. Its free-resize behaviour is preserved with
    // lockAspectRatio: false, and its photo still covers the frame.
    const wasImageBox = el.type === "imagebox";
    if (wasImageBox) el.type = "image";

    // Remove legacy crop fields
    if (el.type === "image") {
      if (!el.style.cropShape) {
        const hadCrop = el.style.cropTop || el.style.cropRight || el.style.cropBottom || el.style.cropLeft;
        el.style.cropShape = hadCrop ? "circle" : "none";
      }
      delete el.style.cropTop;
      delete el.style.cropRight;
      delete el.style.cropBottom;
      delete el.style.cropLeft;

      // Fit used to be inferred from the aspect-ratio switch on a bare image and
      // stated outright on an image box. Store it explicitly, guessing once so
      // existing work keeps its look.
      if (el.style.imageFit === undefined) {
        if (wasImageBox) el.style.imageFit = "cover";
        else el.style.imageFit = el.style.lockAspectRatio === false ? "fill" : "contain";
      }
      if (el.style.lockAspectRatio === undefined) el.style.lockAspectRatio = !wasImageBox;

      // The crop shape used to live next to the crop geometry. Move it to the
      // single shape field so there is only one answer.
      const crop = el.content && el.content.crop;
      if (crop && crop.shape) {
        const shape = crop.shape === "square" || crop.shape === "rect" ? "none" : crop.shape;
        if (!el.style.cropShape || el.style.cropShape === "none") el.style.cropShape = shape;
        delete crop.shape;
      }
    }

    // Shadow used to be one `shadowSize` slider whose meaning flipped with the
    // soft / hard mode (blur radius vs. offset). Split it into explicit X / Y /
    // Blur / Spread so each slider has exactly one job. Old records keep their
    // look: soft size N -> 0 / round(0.3N) / N, hard size N -> round(0.3N) flat.
    // Only rewrite the trio when the trio itself is missing — records saved
    // after the split already carry a hand-tuned shadow worth keeping.
    const hasSplitShadow =
      el.style.shadowX !== undefined &&
      el.style.shadowY !== undefined &&
      el.style.shadowBlur !== undefined;
    if (!hasSplitShadow) {
      let legacy = Number(el.style.shadowSize);
      let legacyStyle = el.style.shadowStyle;
      // Even older records only carried the shadow in the boxStyle class name.
      if (!(legacy > 0)) {
        if (el.style.boxStyle === "shadow-soft") {
          legacy = 20;
          legacyStyle = "soft";
        } else if (el.style.boxStyle === "shadow-hard") {
          legacy = 12;
          legacyStyle = "hard";
        }
      }
      if (legacy > 0 && legacyStyle === "hard") {
        const offset = Math.round(legacy * 0.3);
        Object.assign(el.style, { shadowX: offset, shadowY: offset, shadowBlur: 0 });
      } else if (legacy > 0) {
        Object.assign(el.style, { shadowX: 0, shadowY: Math.round(legacy * 0.3), shadowBlur: legacy });
      } else {
        Object.assign(el.style, { shadowX: 0, shadowY: 0, shadowBlur: 0 });
      }
    }
    if (el.style.shadowSpread === undefined) el.style.shadowSpread = 0;
    delete el.style.shadowSize;
    delete el.style.shadowStyle;

    // Padding used to be one number for all four sides. Split it into H / V so
    // the two axes can be tuned independently; old records keep their look.
    if (el.style.padding !== undefined) {
      const legacy = Number(el.style.padding) || 0;
      if (el.style.paddingH === undefined) el.style.paddingH = legacy;
      if (el.style.paddingV === undefined) el.style.paddingV = legacy;
      delete el.style.padding;
    }
  });
}
