// Browser canvas bitmaps have hard size limits. Chrome / Edge allow roughly
// 268M px, but Safari and iOS cap out near 16.7M px — a 600×30000 long page
// (18M px) fails there, and it fails *silently* (blank image, no error). Long
// pages therefore export scaled down to fit instead of coming back empty.
// One slice-free render, no multi-image export: that would be over-engineering.
const MAX_EXPORT_PIXELS = 16e6;

function exportPNG() {
  const canvasEl = document.getElementById("canvas");
  if (!canvasEl) return;

  const pageW = Math.max(1, Math.round(state.canvas.width));
  const pageH = Math.max(1, Math.round(state.canvas.height));
  const scale = Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / (pageW * pageH)));

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = Math.max(1, Math.round(pageW * scale));
  tempCanvas.height = Math.max(1, Math.round(pageH * scale));
  const ctx = tempCanvas.getContext("2d");
  // Everything below draws in page coordinates, so one scale call is enough.
  if (scale < 1) ctx.scale(scale, scale);

  if (scale < 1) {
    showExportNotice(
      `页面 ${pageW}×${pageH} 超出浏览器画布上限，已按 ${Math.round(scale * 100)}% 导出（${tempCanvas.width}×${tempCanvas.height}）`
    );
  }

  // Fill background
  ctx.fillStyle = state.canvas.background;
  ctx.fillRect(0, 0, pageW, pageH);

  // Sort elements by zIndex
  const sorted = [...state.elements].sort((a, b) => a.zIndex - b.zIndex);

  let pending = sorted.length;
  if (pending === 0) {
    downloadCanvas(tempCanvas);
    return;
  }

  sorted.forEach(el => {
    renderElementToExportCanvas(ctx, el, () => {
      pending--;
      if (pending === 0) {
        downloadCanvas(tempCanvas);
      }
    });
  });
}

function renderElementToExportCanvas(ctx, el, onDone) {
  ctx.save();
  ctx.globalAlpha = el.style.opacity ?? 1;

  if (el.type === "text") {
    // Wrapped at the element's own width, the way .element-text wraps in the
    // preview. The old "one fillText per \n" behaviour ignored wrapping, which
    // is invisible on a wide box and obvious on a tall narrow one.
    drawTextBlock(ctx, el.content, el.x, el.y, el.width, {
      fontSize: el.style.fontSize,
      fontWeight: el.style.fontWeight,
      color: el.style.color,
      align: el.style.textAlign,
      lineHeight: el.style.lineHeight,
      fontFamily: el.style.fontFamily
    });

    ctx.restore();
    onDone();
  } else if (el.type === "textbox") {
    // Mirrors .element-textbox: the frame first, then each column's title and
    // body inside the padded content box.
    drawBoxFrame(ctx, el);

    const s = el.style || {};
    const meta = readBoxLayout(s);
    const pad = readPadding(s, 12);
    const bw = Number(s.borderWidth) || 0;
    const area = {
      x: el.x + pad.h + bw,
      y: el.y + pad.v + bw,
      width: el.width - (pad.h + bw) * 2,
      height: el.height - (pad.v + bw) * 2
    };

    const rects = boxColumnRects(meta, area);
    getBoxColumns(el).slice(0, rects.length).forEach((column, i) => {
      drawBoxColumn(ctx, column, rects[i], meta, s);
    });

    ctx.restore();
    onDone();
  } else if (el.type === "image") {
    // The frame is a box, so it exports even before a photo is chosen.
    const shape = getImageShape(el);
    if (!el.content || !el.content.src) {
      drawBoxFrame(ctx, el, shape);
      ctx.restore();
      onDone();
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const s = el.style || {};
      const area = getPictureArea(el);
      const crop = el.content.crop;

      // Background, borders and shadow. The shape clips the frame, which is what
      // makes the inner border read as a ring on a circular crop.
      drawBoxFrame(ctx, el, shape);

      // The photo, clipped to the same shape the frame was clipped to.
      ctx.save();
      if (!clipToShape(ctx, el.x, el.y, el.width, el.height, shape)) {
        roundRect(ctx, el.x, el.y, el.width, el.height, Math.max(0, Number(s.borderRadius) || 0));
        ctx.clip();
      }

      if (crop && el.content.naturalWidth && el.content.naturalHeight) {
        // Crop geometry is stored relative to the element box, so remap it onto
        // the (inset) picture area — padding and borders shrink the photo here
        // exactly like they do in the editor.
        const geo = getCropGeometry(el);
        const kx = area.width / el.width;
        const ky = area.height / el.height;
        ctx.drawImage(img, area.x + geo.ix * kx, area.y + geo.iy * ky, geo.dw * kx, geo.dh * ky);
      } else {
        drawFittedImage(ctx, img, area, readImageFit(el));
      }

      ctx.restore();
      ctx.restore();
      onDone();
    };
    img.onerror = () => {
      ctx.restore();
      onDone();
    };
    img.src = el.content.src;


  } else if (el.type === "sticker") {
    // Mirrors .element-sticker .element-content, which is a flex box centring a
    // single run of text in the element box. Without this branch a sticker was
    // placed, styled and then silently dropped from the PNG.
    const ss = el.style || {};
    const fontSize = Number(ss.fontSize) || 32;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = ss.color || "#333333";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.content || "", el.x + el.width / 2, el.y + el.height / 2);
    ctx.restore();
    onDone();

  } else if (el.type === "divider") {
    // Mirrors .element-divider: .divider-line is `width: 100%` with the property
    // panel's `lineWidth` as its height, centred vertically in the box and
    // rounded by the 1px the CSS gives it. Same story as the sticker — it used
    // to vanish from the export.
    const ds = el.style || {};
    const lineWidth = Math.max(1, Number(ds.lineWidth) || 2);
    ctx.fillStyle = ds.color || "#333333";
    const lineY = el.y + (el.height - lineWidth) / 2;
    roundRect(ctx, el.x, lineY, el.width, lineWidth, Math.min(1, lineWidth / 2, el.width / 2));
    ctx.fill();
    ctx.restore();
    onDone();

  } else if (el.type === "label") {
    const ls = el.style || {};
    const lb = Number(ls.borderWidth) || 0;
    const lbColor = withAlpha(ls.borderColor, ls.borderAlpha);
    if (lb > 0 && lbColor !== "transparent") {
      // Inset by half so it reads as a CSS border rather than a centred stroke.
      ctx.strokeStyle = lbColor;
      ctx.lineWidth = lb;
      roundRect(ctx, el.x + lb / 2, el.y + lb / 2, el.width - lb, el.height - lb, Math.max(0, (ls.borderRadius || 0) - lb / 2));
      ctx.stroke();
    }
    ctx.font = `${el.style.fontWeight} ${el.style.fontSize}px sans-serif`;
    // The editor gets both of these from CSS — `text-transform: uppercase` and
    // `letter-spacing: 1px` on `.element-label .element-content`. Canvas2D has
    // no transform equivalent so it is applied by hand; `letterSpacing` is a
    // real context property in current engines and merely inert on older ones,
    // where the only loss is the tracking.
    ctx.letterSpacing = (Number(ls.letterSpacing) || 0) + "px";
    ctx.fillStyle = el.style.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(applyTextTransform(el.content, ls.textTransform), el.x + el.width / 2, el.y + el.height / 2);
    ctx.restore();
    onDone();
  } else {
    ctx.restore();
    onDone();
  }
}

// --- Shadow helpers ---------------------------------------------------------

function shadowEnabled(style) {
  const sh = readShadow(style);
  if (sh.color === "transparent") return false;
  return sh.x !== 0 || sh.y !== 0 || sh.blur !== 0 || sh.spread !== 0;
}

function applyShadow(ctx, style) {
  const sh = readShadow(style);
  ctx.shadowColor = sh.color;
  ctx.shadowBlur = sh.blur;
  ctx.shadowOffsetX = sh.x;
  ctx.shadowOffsetY = sh.y;
  // ctx.shadow* has no spread. Callers grow the caster silhouette instead.
}

function clearShadow(ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// --- Shape paths ------------------------------------------------------------

function traceRoundRect(t, x, y, w, h, r, ry) {
  const rx = Math.max(0, Math.min(r, w / 2, h / 2));
  const ryv = Math.max(0, Math.min(ry === undefined ? r : ry, w / 2, h / 2));
  t.moveTo(x + rx, y);
  t.lineTo(x + w - rx, y);
  t.quadraticCurveTo(x + w, y, x + w, y + ryv);
  t.lineTo(x + w, y + h - ryv);
  t.quadraticCurveTo(x + w, y + h, x + w - rx, y + h);
  t.lineTo(x + rx, y + h);
  t.quadraticCurveTo(x, y + h, x, y + h - ryv);
  t.lineTo(x, y + ryv);
  t.quadraticCurveTo(x, y, x + rx, y);
  t.closePath();
}

// The `star` polygon, in the same 0..100 space the CSS clip-path uses, so a
// stretched box stretches the star instead of keeping it round.
const STAR_POINTS_100 = [
  [50, 0], [61, 35], [98, 35], [68, 57], [79, 91],
  [50, 70], [21, 91], [32, 57], [2, 35], [39, 35]
];

// Returns a Path2D for a crop shape, or null when the shape is a plain rect.
// Having a path object (instead of clipping straight away) lets the exporter
// fill the silhouette first so it can cast a shadow, then clip and draw.
function shapePath(shape, x, y, w, h) {
  if (!shape || shape === "none" || shape === "rect" || shape === "square") return null;

  const p = new Path2D();
  if (shape === "circle") {
    // Ellipse so a stretched window exports as an oval, matching the preview.
    p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === "rounded") {
    // inset(0 round 20%) rounds by 20% of each axis, not one shared radius.
    traceRoundRect(p, x, y, w, h, w * 0.2, h * 0.2);
  } else if (shape === "heart") {
    drawHeartPath(p, x, y, w, h);
  } else if (shape === "star") {
    STAR_POINTS_100.forEach(([px, py], i) => {
      const cx = x + (px / 100) * w;
      const cy = y + (py / 100) * h;
      if (i === 0) p.moveTo(cx, cy);
      else p.lineTo(cx, cy);
    });
    p.closePath();
  } else if (shape === "diamond") {
    p.moveTo(x + w / 2, y);
    p.lineTo(x + w, y + h / 2);
    p.lineTo(x + w / 2, y + h);
    p.lineTo(x, y + h / 2);
    p.closePath();
  } else if (shape === "arch") {
    p.moveTo(x, y + h);
    p.lineTo(x, y + h * 0.3);
    p.quadraticCurveTo(x + w * 0.5, y, x + w, y + h * 0.3);
    p.lineTo(x + w, y + h);
    p.closePath();
  } else {
    return null;
  }
  return p;
}

// Fill the silhouette, using a plain rect when there is no shape.
function fillSilhouette(ctx, shape, x, y, w, h, radius) {
  const p = shapePath(shape, x, y, w, h);
  if (p) {
    ctx.fill(p);
  } else if (Number(radius) > 0) {
    // No shape clip, but the frame is rounded, so the ring must be too.
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  traceRoundRect(ctx, x, y, w, h, r);
}

function clipToShape(ctx, x, y, w, h, shape) {
  const p = shapePath(shape, x, y, w, h);
  if (!p) return false;
  ctx.clip(p);
  return true;
}

// Mirrors the #clip-heart path so preview and export match.
function drawHeartPath(ctx, x, y, w, h) {
  const sx = w / 100;
  const sy = h / 100;
  ctx.moveTo(x + 50 * sx, y + 100 * sy);
  ctx.bezierCurveTo(x + 10 * sx, y + 68.2 * sy, x, y + 45.5 * sy, x, y + 28.4 * sy);
  ctx.bezierCurveTo(x, y + 11.4 * sy, x + 15 * sx, y, x + 30 * sx, y);
  ctx.bezierCurveTo(x + 40 * sx, y, x + 47 * sx, y + 8 * sy, x + 50 * sx, y + 17 * sy);
  ctx.bezierCurveTo(x + 53 * sx, y + 8 * sy, x + 60 * sx, y, x + 70 * sx, y);
  ctx.bezierCurveTo(x + 85 * sx, y, x + 100 * sx, y + 11.4 * sy, x + 100 * sx, y + 28.4 * sy);
  ctx.bezierCurveTo(x + 100 * sx, y + 45.5 * sy, x + 90 * sx, y + 68.2 * sy, x + 50 * sx, y + 100 * sy);
  ctx.closePath();
}

// Draws the photo inside a rect, honouring the fit mode. `cover` overflows and
// relies on the caller's clip, which is what the editor's overflow:hidden does.
function drawFittedImage(ctx, img, area, fit) {
  const iw = img.naturalWidth || area.width;
  const ih = img.naturalHeight || area.height;

  if (fit === "fill") {
    ctx.drawImage(img, area.x, area.y, area.width, area.height);
    return;
  }

  const imgRatio = iw / ih;
  const boxRatio = area.width / area.height;
  let w;
  let h;
  if (fit === "cover") {
    if (imgRatio > boxRatio) {
      h = area.height;
      w = h * imgRatio;
    } else {
      w = area.width;
      h = w / imgRatio;
    }
  } else if (imgRatio > boxRatio) {
    w = area.width;
    h = w / imgRatio;
  } else {
    h = area.height;
    w = h * imgRatio;
  }

  ctx.drawImage(img, area.x + (area.width - w) / 2, area.y + (area.height - h) / 2, w, h);
}

// Optional `shape` clips the frame itself, so a shape crops the background and
// the inner border as well as the photo — the same thing clip-path does on
// .element-content in the editor.
function drawBoxFrame(ctx, el, shape) {
  const s = el.style || {};
  const x = el.x;
  const y = el.y;
  const w = el.width;
  const h = el.height;
  const radius = shape ? 0 : (s.borderRadius || 0);

  const inner = Number(s.borderWidth) || 0;
  const outer = Number(s.borderOuterWidth) || 0;
  const bg = withAlpha(s.backgroundColor, s.backgroundAlpha);
  const innerColor = withAlpha(s.borderColor, s.borderAlpha);
  const outerColor = withAlpha(s.borderOuterColor, s.borderOuterAlpha);
  const sh = readShadow(s);
  const hasShadow = shadowEnabled(s);
  const hasOuter = outer > 0 && outerColor !== "transparent";

  // Canvas has no shadow `spread`, so a non-zero spread gets its own pass: a
  // caster grown (or shrunk) from the element box, painted in the shadow colour
  // so the extra ring reads as shadow rather than as a stray outline. The frame
  // is drawn on top of it afterwards.
  if (hasShadow && sh.spread !== 0) {
    const sw = Math.max(1, w + sh.spread * 2);
    const sh2 = Math.max(1, h + sh.spread * 2);
    applyShadow(ctx, s);
    ctx.fillStyle = sh.color;
    fillSilhouette(ctx, shape, x + (w - sw) / 2, y + (h - sh2) / 2, sw, sh2, Math.max(0, radius + sh.spread));
    clearShadow(ctx);
  }

  // Outer border is an outward ring. Without a spread it also carries the
  // shadow, which keeps the common case down to a single pass.
  if (hasOuter) {
    if (hasShadow && sh.spread === 0) applyShadow(ctx, s);
    ctx.fillStyle = outerColor;
    const ring = shapePath(shape, x - outer, y - outer, w + outer * 2, h + outer * 2);
    if (ring) {
      // even-odd: the grown silhouette minus the frame itself. Filling the
      // grown shape solid would be right only while the photo covers every
      // pixel of the frame — with padding, or a transparent frame, the middle
      // would show the border colour as a block instead of a ring.
      const hole = shapePath(shape, x, y, w, h);
      if (hole) ring.addPath(hole);
      ctx.fill(ring, "evenodd");
    } else {
      roundRect(ctx, x - outer, y - outer, w + outer * 2, h + outer * 2, radius + outer);
      ctx.fill();
    }
    clearShadow(ctx);
  }

  // Background. With no outer ring it casts the shadow itself. A transparent
  // background still casts one, because the wrapper carries a box-shadow in the
  // editor whether or not the box is filled — so the silhouette stands in for it.
  if (bg !== "transparent") {
    if (hasShadow && sh.spread === 0 && !hasOuter) applyShadow(ctx, s);
    ctx.fillStyle = bg;
    fillSilhouette(ctx, shape, x, y, w, h, radius);
    clearShadow(ctx);
  } else if (hasShadow && sh.spread === 0 && !hasOuter) {
    applyShadow(ctx, s);
    ctx.fillStyle = sh.color;
    fillSilhouette(ctx, shape, x, y, w, h, radius);
    clearShadow(ctx);
  }

  // Inner border, inset by half its width so it reads as sitting inside the
  // box the way a CSS border does. With a shape it follows the shape, which is
  // what the clip-path does to the border in the editor.
  if (inner > 0 && innerColor !== "transparent") {
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = inner;
    if (s.boxStyle === "dashed") ctx.setLineDash([6, 4]);
    const bx = x + inner / 2;
    const by = y + inner / 2;
    const bw = w - inner;
    const bh = h - inner;
    const p = shapePath(shape, bx, by, bw, bh);
    if (p) {
      ctx.stroke(p);
    } else {
      roundRect(ctx, bx, by, bw, bh, Math.max(0, radius - inner / 2));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  clearShadow(ctx);
}

// --- Text layout ------------------------------------------------------------

// Height the wrapped block will occupy, without drawing it. Needed before the
// drawing pass, because a single-column Box centres its title + body as one
// block. An empty string occupies nothing, so a Box with only a title stays
// tight instead of reserving a blank line.
function measureTextBlock(ctx, text, w, opts) {
  if (text === undefined || text === null || String(text) === "") return 0;
  const fontSize = Number(opts.fontSize) || 14;
  const lineHeightPx = fontSize * (Number(opts.lineHeight) || 1.4);
  ctx.font = `${opts.fontWeight === "bold" ? "bold " : ""}${fontSize}px ${opts.fontFamily || "sans-serif"}`;
  return wrapText(ctx, String(text), Math.max(1, w)).length * lineHeightPx;
}

// Wraps like the browser's `word-break: break-word`: an explicit \n breaks,
// spaces break words, and a single token wider than the line is cut per
// character (CJK text has no spaces, so that path is the common one).
function wrapText(ctx, text, maxWidth) {
  const limit = Math.max(1, maxWidth);
  const lines = [];
  const paragraphs = String(text === undefined || text === null ? "" : text).split("\n");

  for (const paragraph of paragraphs) {
    const atoms = paragraph.match(/\s+|\S+/g) || [];
    let line = "";

    for (const atom of atoms) {
      if (line !== "" && ctx.measureText(line + atom).width > limit) {
        lines.push(line.replace(/\s+$/, ""));
        line = atom.replace(/^\s+/, "");
      } else {
        line += atom;
      }

      // Whatever is on the line is still too wide: cut it into fitted chunks.
      // `line.length > 1` keeps a single oversized glyph from looping forever.
      while (ctx.measureText(line).width > limit && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > limit) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }

    lines.push(line.replace(/\s+$/, ""));
  }

  return lines;
}

// Draws a wrapped block whose top-left corner is (x, y) and whose width is w.
// Returns the height the block occupied.
function drawTextBlock(ctx, text, x, y, w, opts) {
  const fontSize = Number(opts.fontSize) || 14;
  const lineHeightPx = fontSize * (Number(opts.lineHeight) || 1.4);

  ctx.font = `${opts.fontWeight === "bold" ? "bold " : ""}${fontSize}px ${opts.fontFamily || "sans-serif"}`;
  ctx.fillStyle = opts.color || "#333333";
  ctx.textAlign = opts.align || "left";
  ctx.textBaseline = "alphabetic";

  const lines = wrapText(ctx, text, w);
  const blockH = lines.length * lineHeightPx;

  // Baseline of the first line box, keeping the same offset the plain text
  // element has always exported with.
  const firstBaseline = y + fontSize;
  const anchorX = ctx.textAlign === "center" ? x + w / 2 : (ctx.textAlign === "right" ? x + w : x);

  lines.forEach((line, i) => {
    ctx.fillText(line, anchorX, firstBaseline + i * lineHeightPx);
  });

  return blockH;
}

// CSS `text-transform`, applied by hand. `capitalize` lifts the first letter of
// each word and, like CSS, deliberately leaves the rest of the word alone.
function applyTextTransform(text, transform) {
  const s = String(text === undefined || text === null ? "" : text);
  if (transform === "uppercase") return s.toUpperCase();
  if (transform === "lowercase") return s.toLowerCase();
  if (transform === "capitalize") return s.replace(/(^|\s)(\S)/g, (m, lead, ch) => lead + ch.toUpperCase());
  return s;
}

// --- Box columns ------------------------------------------------------------

// The rects a Box divides its content area into, in page pixels. Mirrors the
// flex rules exactly: the first column takes `split` of the main axis and the
// second one takes what is left after the gap.
function boxColumnRects(meta, area) {
  const w = Math.max(1, area.width);
  const h = Math.max(1, area.height);

  if (!meta.isSplit) {
    return [{ x: area.x, y: area.y, width: w, height: h }];
  }

  if (meta.layout === "columns") {
    const first = w * meta.split;
    const second = Math.max(1, w - first - meta.gap);
    return [
      { x: area.x, y: area.y, width: first, height: h },
      { x: area.x + first + meta.gap, y: area.y, width: second, height: h }
    ];
  }

  const first = h * meta.split;
  const second = Math.max(1, h - first - meta.gap);
  return [
    { x: area.x, y: area.y, width: w, height: first },
    { x: area.x, y: area.y + first + meta.gap, width: w, height: second }
  ];
}

// Title above body, inside one column. The pair is placed by `vAlign`, which is
// the exporter's `justify-content` on .box-column.
function drawBoxColumn(ctx, column, rect, meta, style) {
  // Each column carries its own horizontal align; a column that never set one
  // falls back to the box's `textAlign`, which is all a record could have had
  // before this field existed.
  const align = readColumnAlign(column, style);
  const bodyOpts = {
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    color: style.color,
    align,
    lineHeight: style.lineHeight,
    fontFamily: style.fontFamily
  };
  const titleOpts = {
    fontSize: meta.titleFontSize,
    fontWeight: meta.titleFontWeight,
    color: meta.titleColor,
    align,
    lineHeight: style.lineHeight,
    fontFamily: style.fontFamily
  };

  const titleH = measureTextBlock(ctx, column.title, rect.width, titleOpts);
  const gap = titleH > 0 ? meta.titleGap : 0;
  const bodyH = measureTextBlock(ctx, column.body, rect.width, bodyOpts);

  // Mirror flex faithfully: a block taller than its column keeps its placement
  // (so it hangs out of the top) and is cut at the column's edges, which is what
  // `overflow: hidden` does in the preview. Snapping it back to the top when it
  // overflowed — the old behaviour — disagreed with the canvas exactly when the
  // user had the most text.
  const total = titleH + gap + bodyH;
  let top = rect.y;
  if (meta.vAlign === "middle") top = rect.y + (rect.height - total) / 2;
  else if (meta.vAlign === "bottom") top = rect.y + rect.height - total;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  if (titleH > 0) {
    drawTextBlock(ctx, column.title, rect.x, top, rect.width, titleOpts);
    top += titleH + gap;
  }
  if (bodyH > 0) {
    drawTextBlock(ctx, column.body, rect.x, top, rect.width, bodyOpts);
  }

  ctx.restore();
}

// Small non-blocking toast, used only when a long page had to be scaled down so
// the user is not left wondering why the file is smaller than the canvas.
function showExportNotice(message) {
  const node = document.createElement("div");
  node.className = "export-notice";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 6000);
}

function downloadCanvas(canvas) {
  const link = document.createElement("a");
  link.download = "moe-bio.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}
