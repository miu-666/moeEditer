function initCanvas() {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  canvas.style.width = state.canvas.width + "px";
  canvas.style.height = state.canvas.height + "px";
  canvas.style.backgroundColor = state.canvas.background;
  if (state.canvas.backgroundImage) {
    canvas.style.backgroundImage = `url("${state.canvas.backgroundImage}")`;
    canvas.style.backgroundSize = "cover";
    canvas.style.backgroundPosition = "center";
  }
}

// Compact "colour + transparency" control: swatch, alpha slider, percentage.
// Alpha lives as 0..1 in state but the slider runs 0..100 for a nicer feel.
function colorAlphaRow(color, alpha, colorField, alphaField) {
  // "transparent" reads as alpha 0 rather than as an opaque white swatch, so
  // the slider always tells the truth about what is on screen.
  const isTransparent = !color || color === "transparent";
  const hex = isTransparent ? "#ffffff" : color;
  const pct = isTransparent ? 0 : Math.round((alpha === undefined || alpha === null ? 1 : Number(alpha)) * 100);
  return `
    <div class="color-alpha">
      <input type="color" class="color-input" value="${hex}" data-field="${colorField}">
      <input type="range" class="alpha-range" min="0" max="100" step="1" value="${pct}" data-field="${alphaField}" data-unit="%">
      <span class="alpha-value">${pct}%</span>
    </div>
  `;
}

// One Box column: an optional title above a body. The field name carries the
// column index so `onPropertyInput` can route it back without extra state.
function columnFields(index, label, column, align) {
  return `
    <div class="property-group">
      <label class="property-label">${label}</label>
      <input type="text" class="property-input box-title-input" id="prop-col${index}-title" placeholder="Title" value="${escapeHtml(column.title)}" data-field="box.${index}.title">
      <textarea class="property-input box-body-input" id="prop-col${index}-body" rows="3" placeholder="Body" data-field="box.${index}.body">${escapeHtml(column.body)}</textarea>
      <div class="segmented" style="margin-top:6px;">
        <button class="segmented-btn ${align === "left" ? "active" : ""}" data-colalign="left" data-col="${index}" title="这一栏的标题与正文左对齐">L</button>
        <button class="segmented-btn ${align === "center" ? "active" : ""}" data-colalign="center" data-col="${index}" title="这一栏的标题与正文居中">C</button>
        <button class="segmented-btn ${align === "right" ? "active" : ""}" data-colalign="right" data-col="${index}" title="这一栏的标题与正文右对齐">R</button>
      </div>
    </div>
  `;
}

// A slider with a tiny inline prefix, used for widths under a colour row.
function slimRange(prefix, value, field, min, max, title, unit) {
  return `
    <div class="range-wrapper slim"${title ? ` title="${title}"` : ""}>
      <span class="range-prefix">${prefix}</span>
      <input type="range" class="range-input" min="${min}" max="${max}" value="${value}"${unit ? ` data-unit="${unit}"` : ""} data-field="${field}">
      <span class="range-value">${value}${unit || ""}</span>
    </div>
  `;
}

// Text typed on the canvas goes back into panel inputs and textareas, so a
// quote or an angle bracket must not be able to break the panel's markup.
function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Every slider does exactly one thing, so no preset buttons are needed:
//   X / Y  move the shadow        S  spreads it (fatter / thinner)
//   B      blurs its edge
function shadowGroup(style) {
  const x = Number(style.shadowX) || 0;
  const y = Number(style.shadowY) || 0;
  const blur = Math.max(0, Number(style.shadowBlur) || 0);
  const spread = Number(style.shadowSpread) || 0;
  return `
    <div class="property-group">
      <label class="property-label">Shadow</label>
      ${colorAlphaRow(style.shadowColor || "#000000", style.shadowAlpha, "style.shadowColor", "style.shadowAlpha")}
      ${slimRange("X", x, "style.shadowX", -40, 40, "横向偏移，负数向左")}
      ${slimRange("Y", y, "style.shadowY", -40, 40, "纵向偏移，负数向上")}
      ${slimRange("B", blur, "style.shadowBlur", 0, 40, "模糊半径，0 = 边缘锐利")}
      ${slimRange("S", spread, "style.shadowSpread", -30, 30, "粗细：正数让阴影比元素胖一圈，负数瘦一圈")}
    </div>
  `;
}

function renderPropertiesPanel() {
  const panel = document.getElementById("properties-panel");
  if (!panel) return;

  const el = getSelectedElement();

  if (!el) {
    const bg = state.canvas.background;
    const hasBgImage = !!state.canvas.backgroundImage;
    const isLong = isLongPage();
    const ratios = ["1:1", "3:4", "4:3", "9:16", "custom"];
    const gap = getPageBottomGap();
    panel.innerHTML = `
      <h3 class="panel-title">Page</h3>
      <div class="property-group">
        <label class="property-label">Page Mode</label>
        <div class="segmented">
          <button class="segmented-btn ${isLong ? "" : "active"}" data-pagemode="fixed">固定画布</button>
          <button class="segmented-btn ${isLong ? "active" : ""}" data-pagemode="long">纵向长页</button>
        </div>
        <p class="property-hint">${isLong ? "高度随内容自动增长，适合长图 / 主页" : "宽高固定，适合单张卡片"}</p>
      </div>
      ${isLong ? "" : `
      <div class="property-group">
        <label class="property-label">Ratio</label>
        <div class="segmented">
          ${ratios.map(r => `
            <button class="segmented-btn ${state.canvas.ratio === r ? "active" : ""}" data-ratio="${r}" title="${r === "custom" ? "自定义比例" : r}">${r === "custom" ? "自定" : r}</button>
          `).join("")}
        </div>
      </div>`}
      <div class="property-group">
        <label class="property-label">Size</label>
        <div class="property-row">
          <div class="property-group">
            <label class="property-label">Width</label>
            <input type="number" class="property-input" id="canvas-width" value="${state.canvas.width}" min="200" max="2000">
          </div>
          <div class="property-group">
            <label class="property-label">Height</label>
            <input type="number" class="property-input" id="canvas-height" value="${Math.round(state.canvas.height)}" min="200" max="5000" ${isLong ? 'readonly title="纵向长页模式下高度由内容决定"' : ""}>
          </div>
        </div>
      </div>
      ${isLong ? `
      <div class="property-group">
        <label class="property-label">Bottom Gap</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="canvas-bottom-gap" min="10" max="400" step="10" value="${gap}">
          <span class="range-value">${gap}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Layout</label>
        <button class="btn btn-secondary" id="canvas-tidy" style="width:100%;" ${state.elements.length ? "" : "disabled"}>整理成列表</button>
        <p class="property-hint">按纵向位置重排：统一左对齐、间距 ${TIDY_GAP}px。可撤销</p>
      </div>` : ""}
      <div class="property-group">
        <label class="property-label">Background Color</label>
        <div class="color-wrapper">
          <input type="color" class="color-input" id="canvas-bg-color" value="${bg}">
          <span>${bg}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Background Image</label>
        <button class="btn btn-secondary btn-upload" id="canvas-bg-upload">${hasBgImage ? "Change Image" : "Upload Image"}</button>
        ${hasBgImage ? '<button class="btn btn-secondary" id="canvas-bg-clear" style="margin-top:6px;width:100%;">Clear Image</button>' : ""}
        <input type="file" id="canvas-bg-file" accept="image/*" hidden>
      </div>
    `;

    // Page mode. Switching never touches the elements: fixed → long immediately
    // re-derives the height from the content, long → fixed freezes it as a
    // user-owned value (and drops the ratio, which no longer describes the box).
    panel.querySelectorAll("[data-pagemode]").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.pagemode;
        if (state.canvas.mode === mode) return;
        state.canvas.mode = mode;
        if (mode === "long") {
          syncPageHeight();
        } else {
          markRatioCustom();
          applyCanvasSize();
        }
        saveState();
        pushHistory();
        renderPropertiesPanel();
      });
    });

    panel.querySelectorAll("[data-ratio]").forEach(btn => {
      btn.addEventListener("click", () => {
        const ratio = btn.dataset.ratio;
        if (ratio === "custom") {
          markRatioCustom();
        } else {
          applyPageRatio(ratio);
        }
        saveState();
        pushHistory();
        renderPropertiesPanel();
      });
    });

    const bgColor = document.getElementById("canvas-bg-color");
    if (bgColor) {
      bgColor.addEventListener("input", (e) => {
        setCanvasBackground(e.target.value);
        e.target.parentElement.querySelector("span").textContent = e.target.value;
        saveState();
      });
    }

    const bgUpload = document.getElementById("canvas-bg-upload");
    const bgFile = document.getElementById("canvas-bg-file");
    if (bgUpload && bgFile) {
      bgUpload.addEventListener("click", () => bgFile.click());
      bgFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          setCanvasBackgroundImage(ev.target.result);
          saveState();
          renderPropertiesPanel();
        };
        reader.readAsDataURL(file);
      });
    }

    const bgClear = document.getElementById("canvas-bg-clear");
    if (bgClear) {
      bgClear.addEventListener("click", () => {
        setCanvasBackgroundImage(null);
        saveState();
        renderPropertiesPanel();
      });
    }

    const cw = document.getElementById("canvas-width");
    const ch = document.getElementById("canvas-height");
    if (cw) {
      cw.addEventListener("change", (e) => {
        const val = Math.max(120, parseInt(e.target.value, 10) || 600);
        state.canvas.width = val;
        // A fixed page keeps its ratio: width drives height. A long page has a
        // derived height, so width alone changes.
        if (!isLongPage() && state.canvas.ratio !== "custom") {
          applyPageRatio(state.canvas.ratio);
        } else {
          applyCanvasSize();
          if (isLongPage()) syncPageHeight();
        }
        saveState();
        e.target.value = state.canvas.width;
      });
    }
    if (ch) {
      ch.addEventListener("change", (e) => {
        if (isLongPage()) {
          // Read-only in long mode; snap the field back to the derived value.
          refreshPageHeightField();
          return;
        }
        const val = Math.max(120, parseInt(e.target.value, 10) || 900);
        state.canvas.height = val;
        markRatioCustom();
        applyCanvasSize();
        saveState();
        renderPropertiesPanel();
      });
    }

    const cg = document.getElementById("canvas-bottom-gap");
    if (cg) {
      cg.addEventListener("input", (e) => {
        state.canvas.bottomGap = parseInt(e.target.value, 10) || 0;
        const readout = e.target.parentElement.querySelector(".range-value");
        if (readout) readout.textContent = state.canvas.bottomGap;
        syncPageHeight();
        saveState();
      });
    }

    // One-click tidy-up. Positions only — nothing is resized, restyled or
    // reordered in z, and the whole pass is a single undo step.
    const tidyBtn = document.getElementById("canvas-tidy");
    if (tidyBtn) {
      tidyBtn.addEventListener("click", () => {
        if (!tidyIntoList()) return;
        saveState();
        pushHistory();
        renderPropertiesPanel();
      });
    }

    return;
  }

  let html = `<h3 class="panel-title">Properties</h3>`;

  // Common: Position & Size
  html += `
    <div class="property-row">
      <div class="property-group">
        <label class="property-label">X</label>
        <input type="number" class="property-input" id="prop-x" value="${Math.round(el.x)}" data-field="x">
      </div>
      <div class="property-group">
        <label class="property-label">Y</label>
        <input type="number" class="property-input" id="prop-y" value="${Math.round(el.y)}" data-field="y">
      </div>
    </div>
    <div class="property-row">
      <div class="property-group">
        <label class="property-label">Width</label>
        <input type="number" class="property-input" id="prop-width" value="${Math.round(el.width)}" data-field="width">
      </div>
      <div class="property-group">
        <label class="property-label">Height</label>
        <input type="number" class="property-input" id="prop-height" value="${Math.round(el.height)}" data-field="height">
      </div>
    </div>
  `;

  // Type-specific properties
  if (el.type === "text") {
    html += `
      <div class="property-group">
        <label class="property-label">Content</label>
        <textarea class="property-input" id="prop-content" rows="3" data-field="content">${el.content}</textarea>
      </div>
      <div class="property-group">
        <label class="property-label">Font Size</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-fontSize" min="8" max="120" value="${el.style.fontSize}" data-field="style.fontSize">
          <span class="range-value">${el.style.fontSize}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Weight</label>
        <div class="segmented">
          <button class="segmented-btn ${el.style.fontWeight === "normal" ? "active" : ""}" data-weight="normal">Normal</button>
          <button class="segmented-btn ${el.style.fontWeight === "bold" ? "active" : ""}" data-weight="bold">Bold</button>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Color</label>
        <div class="color-wrapper">
          <input type="color" class="color-input" id="prop-color" value="${el.style.color}" data-field="style.color">
          <span>${el.style.color}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Align</label>
        <div class="segmented">
          <button class="segmented-btn ${el.style.textAlign === "left" ? "active" : ""}" data-align="left">L</button>
          <button class="segmented-btn ${el.style.textAlign === "center" ? "active" : ""}" data-align="center">C</button>
          <button class="segmented-btn ${el.style.textAlign === "right" ? "active" : ""}" data-align="right">R</button>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Opacity</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-opacity" min="0" max="1" step="0.05" value="${el.style.opacity}" data-field="style.opacity">
          <span class="range-value">${Math.round(el.style.opacity * 100)}%</span>
        </div>
      </div>
    `;
  } else if (el.type === "image") {
    // One panel for one element type: photo, frame and crop all live here. The
    // crop shape is the same field the crop mode writes, so the grid and the
    // toolbar can never disagree.
    const s = el.style;
    const crop = el.content && el.content.crop;
    const shape = getImageShape(el);
    const locked = s.lockAspectRatio !== false;
    const fit = readImageFit(el);
    const boxStyles = ["default", "dashed"];
    const shapes = ["none", "rounded", "circle", "heart", "star", "diamond", "arch"];
    const shapeLabels = {
      "": "矩形",
      none: "矩形",
      rounded: "圆角",
      circle: "圆形",
      heart: "心形",
      star: "星形",
      diamond: "菱形",
      arch: "拱形"
    };
    const padding = readPadding(s, 0);

    html += `
      <div class="property-group">
        <label class="property-label">Image</label>
        <button class="btn btn-secondary btn-upload" id="btn-change-image">${el.content && el.content.src ? "替换图片" : "上传图片"}</button>
        <input type="file" id="image-file" accept="image/*" hidden>
      </div>
      <div class="property-group">
        <label class="property-label">Crop</label>
        <button class="btn btn-secondary btn-upload" id="btn-crop">${crop ? "重新裁剪" : "裁剪"}</button>
        ${crop ? `<div class="crop-info">已裁剪 · ${shapeLabels[shape] || shapeLabels.none}</div>
        <button class="btn btn-secondary" id="btn-crop-clear" style="margin-top:6px;width:100%;">清除裁剪</button>`
        : `<p class="property-hint">框内重新构图：拖动图片，决定留下哪一块</p>`}
      </div>
      <div class="property-group">
        <label class="property-label">Shape</label>
        <div class="shape-grid">
          ${shapes.map(item => `
            <button class="shape-btn ${(shape || "none") === item ? "active" : ""}" data-shape="${item}" title="${shapeLabels[item]}">
              <span class="shape-preview shape-${item}"></span>
            </button>
          `).join("")}
        </div>
        <p class="property-hint">只换轮廓，不动图片内容</p>
      </div>
    `;

    // Fit only matters while the whole photo is on show; a crop decides what is
    // visible instead.
    if (!crop) {
      html += `
        <div class="property-group">
          <label class="property-label">Image Fit</label>
          <div class="segmented">
            <button class="segmented-btn ${fit === "cover" ? "active" : ""}" data-fit="cover">Cover</button>
            <button class="segmented-btn ${fit === "contain" ? "active" : ""}" data-fit="contain">Contain</button>
            <button class="segmented-btn ${fit === "fill" ? "active" : ""}" data-fit="fill">Fill</button>
          </div>
        </div>
      `;
    }

    html += `
      <div class="property-group">
        <label class="property-label">Frame</label>
        <div class="style-grid">
          ${boxStyles.map(style => `
            <button class="style-btn ${s.boxStyle === style ? "active" : ""}" data-boxstyle="${style}" title="${style}">
              <span class="style-preview style-${style}"></span>
            </button>
          `).join("")}
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Lock Aspect Ratio</label>
        <div class="segmented">
          <button class="segmented-btn ${locked ? "active" : ""}" data-aspect="true">锁定</button>
          <button class="segmented-btn ${!locked ? "active" : ""}" data-aspect="false">自由</button>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Padding</label>
        ${slimRange("H", padding.h, "style.paddingH", 0, 60, "左右内边距")}
        ${slimRange("V", padding.v, "style.paddingV", 0, 60, "上下内边距")}
      </div>
      <div class="property-group">
        <label class="property-label">Background</label>
        ${colorAlphaRow(s.backgroundColor, s.backgroundAlpha, "style.backgroundColor", "style.backgroundAlpha")}
      </div>
      <div class="property-group">
        <label class="property-label">${shape ? "Inner Border (跟随形状)" : "Inner Border"}</label>
        ${colorAlphaRow(s.borderColor, s.borderAlpha, "style.borderColor", "style.borderAlpha")}
        ${slimRange("W", s.borderWidth || 0, "style.borderWidth", 0, 20)}
      </div>
      <div class="property-group">
        <label class="property-label">Outer Border</label>
        ${colorAlphaRow(s.borderOuterColor || "#333333", s.borderOuterAlpha, "style.borderOuterColor", "style.borderOuterAlpha")}
        ${slimRange("W", s.borderOuterWidth || 0, "style.borderOuterWidth", 0, 20)}
      </div>
      ${shadowGroup(s)}
    `;

    // A shape owns the corners, so Radius would be a dead control while one is on.
    if (!shape) {
      html += `
        <div class="property-group">
          <label class="property-label">Radius</label>
          <div class="range-wrapper">
            <input type="range" class="range-input" id="prop-radius" min="0" max="${Math.min(el.width, el.height) / 2}" value="${s.borderRadius}" data-field="style.borderRadius">
            <span class="range-value">${s.borderRadius}</span>
          </div>
        </div>
      `;
    }

    html += `
      <div class="property-group">
        <label class="property-label">Opacity</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-opacity" min="0" max="1" step="0.05" value="${s.opacity}" data-field="style.opacity">
          <span class="range-value">${Math.round(s.opacity * 100)}%</span>
        </div>
      </div>
    `;
  } else if (el.type === "sticker") {
    html += `
      <div class="property-group">
        <label class="property-label">Content</label>
        <input type="text" class="property-input" id="prop-content" value="${el.content}" data-field="content">
      </div>
      <div class="property-group">
        <label class="property-label">Size</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-fontSize" min="12" max="120" value="${el.style.fontSize}" data-field="style.fontSize">
          <span class="range-value">${el.style.fontSize}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Color</label>
        <div class="color-wrapper">
          <input type="color" class="color-input" id="prop-color" value="${el.style.color}" data-field="style.color">
          <span>${el.style.color}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Opacity</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-opacity" min="0" max="1" step="0.05" value="${el.style.opacity}" data-field="style.opacity">
          <span class="range-value">${Math.round(el.style.opacity * 100)}%</span>
        </div>
      </div>
    `;
  } else if (el.type === "divider") {
    html += `
      <div class="property-group">
        <label class="property-label">Color</label>
        <div class="color-wrapper">
          <input type="color" class="color-input" id="prop-color" value="${el.style.color}" data-field="style.color">
          <span>${el.style.color}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Line Width</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-lineWidth" min="1" max="20" value="${el.style.lineWidth}" data-field="style.lineWidth">
          <span class="range-value">${el.style.lineWidth}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Opacity</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-opacity" min="0" max="1" step="0.05" value="${el.style.opacity}" data-field="style.opacity">
          <span class="range-value">${Math.round(el.style.opacity * 100)}%</span>
        </div>
      </div>
    `;
  } else if (el.type === "textbox") {
    const boxStyles = ["default", "dashed"];
    const padding = readPadding(el.style, 12);
    const meta = readBoxLayout(el.style);
    const columns = getBoxColumns(el);
    const layoutOptions = [
      { id: "single", label: "单栏", title: "一栏：标题 + 正文" },
      { id: "columns", label: "左右分栏", title: "左右两栏，分隔线可以拖" },
      { id: "rows", label: "上下分栏", title: "上下两栏，分隔线可以拖" }
    ];
    const colLabels = meta.layout === "rows" ? ["上栏", "下栏"] : ["左栏", "右栏"];

    html += `
      <div class="property-group">
        <label class="property-label">Layout</label>
        <div class="segmented">
          ${layoutOptions.map(o => `<button class="segmented-btn ${meta.layout === o.id ? "active" : ""}" data-layout="${o.id}" title="${o.title}">${o.label}</button>`).join("")}
        </div>
      </div>
    `;

    if (meta.isSplit) {
      html += `
        <div class="property-group">
          <label class="property-label">Split</label>
          ${slimRange("◧", Math.round(meta.split * 100), "style.split", 15, 85, "第一栏的占比，也可以直接拖画布上的分隔线", "%")}
        </div>
        <div class="property-group">
          <label class="property-label">Column Gap</label>
          ${slimRange("G", meta.gap, "style.gap", 0, 40, "两栏之间的距离")}
        </div>
      `;
    }

    // Both columns are always offered, so switching layout never hides text the
    // user has already written — the second one is simply not drawn on canvas
    // while the box is a single column. Each column carries its own align, so
    // there is no box-level control that could contradict what a column says.
    html += columnFields(0, meta.isSplit ? colLabels[0] : "Content", columns[0],
      readColumnAlign(columns[0], el.style));
    if (meta.isSplit) html += columnFields(1, colLabels[1], columns[1],
      readColumnAlign(columns[1], el.style));

    html += `
      <div class="property-group">
        <label class="property-label">Style</label>
        <div class="style-grid">
          ${boxStyles.map(style => `
            <button class="style-btn ${el.style.boxStyle === style ? "active" : ""}" data-boxstyle="${style}" title="${style}">
              <span class="style-preview style-${style}"></span>
            </button>
          `).join("")}
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Font Size</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-fontSize" min="8" max="48" value="${el.style.fontSize}" data-field="style.fontSize">
          <span class="range-value">${el.style.fontSize}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Text Color</label>
        <div class="color-wrapper">
          <input type="color" class="color-input" id="prop-color" value="${el.style.color}" data-field="style.color">
          <span>${el.style.color}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Title</label>
        ${slimRange("S", meta.titleFontSize, "style.titleFontSize", 8, 48, "标题字号")}
        <div class="color-wrapper" style="margin-top:6px;">
          <input type="color" class="color-input" id="prop-titleColor" value="${meta.titleColor}" data-field="style.titleColor">
          <span>${meta.titleColor}</span>
        </div>
        <div class="segmented" style="margin-top:6px;">
          <button class="segmented-btn ${meta.titleFontWeight === "normal" ? "active" : ""}" data-titleweight="normal">常规</button>
          <button class="segmented-btn ${meta.titleFontWeight !== "normal" ? "active" : ""}" data-titleweight="bold">加粗</button>
        </div>
        ${slimRange("↕", meta.titleGap, "style.titleGap", 0, 40, "标题与正文之间的距离")}
      </div>
      <div class="property-group">
        <label class="property-label">V Align</label>
        <div class="segmented">
          <button class="segmented-btn ${meta.vAlign === "top" ? "active" : ""}" data-valign="top" title="文字贴住栏的上边">T</button>
          <button class="segmented-btn ${meta.vAlign === "middle" ? "active" : ""}" data-valign="middle" title="文字在栏内垂直居中">M</button>
          <button class="segmented-btn ${meta.vAlign === "bottom" ? "active" : ""}" data-valign="bottom" title="文字贴住栏的下边">B</button>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Padding</label>
        ${slimRange("H", padding.h, "style.paddingH", 0, 60, "左右内边距")}
        ${slimRange("V", padding.v, "style.paddingV", 0, 60, "上下内边距")}
      </div>
      <div class="property-group">
        <label class="property-label">Background</label>
        ${colorAlphaRow(el.style.backgroundColor, el.style.backgroundAlpha, "style.backgroundColor", "style.backgroundAlpha")}
      </div>
      <div class="property-group">
        <label class="property-label">Inner Border</label>
        ${colorAlphaRow(el.style.borderColor, el.style.borderAlpha, "style.borderColor", "style.borderAlpha")}
        ${slimRange("W", el.style.borderWidth || 0, "style.borderWidth", 0, 20)}
      </div>
      <div class="property-group">
        <label class="property-label">Outer Border</label>
        ${colorAlphaRow(el.style.borderOuterColor || "#333333", el.style.borderOuterAlpha, "style.borderOuterColor", "style.borderOuterAlpha")}
        ${slimRange("W", el.style.borderOuterWidth || 0, "style.borderOuterWidth", 0, 20)}
      </div>
      ${shadowGroup(el.style)}
      <div class="property-group">
        <label class="property-label">Radius</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-radius" min="0" max="${Math.min(el.width, el.height) / 2}" value="${el.style.borderRadius}" data-field="style.borderRadius">
          <span class="range-value">${el.style.borderRadius}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Opacity</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-opacity" min="0" max="1" step="0.05" value="${el.style.opacity}" data-field="style.opacity">
          <span class="range-value">${Math.round(el.style.opacity * 100)}%</span>
        </div>
      </div>
    `;
  } else if (el.type === "label") {
    html += `
      <div class="property-group">
        <label class="property-label">Content</label>
        <input type="text" class="property-input" id="prop-content" value="${el.content}" data-field="content">
      </div>
      <div class="property-group">
        <label class="property-label">Font Size</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-fontSize" min="8" max="48" value="${el.style.fontSize}" data-field="style.fontSize">
          <span class="range-value">${el.style.fontSize}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Color</label>
        <div class="color-wrapper">
          <input type="color" class="color-input" id="prop-color" value="${el.style.color}" data-field="style.color">
          <span>${el.style.color}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Border Color</label>
        <div class="color-wrapper">
          <input type="color" class="color-input" id="prop-borderColor" value="${el.style.borderColor}" data-field="style.borderColor">
          <span>${el.style.borderColor}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Radius</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-radius" min="0" max="${Math.min(el.width, el.height) / 2}" value="${el.style.borderRadius}" data-field="style.borderRadius">
          <span class="range-value">${el.style.borderRadius}</span>
        </div>
      </div>
      <div class="property-group">
        <label class="property-label">Opacity</label>
        <div class="range-wrapper">
          <input type="range" class="range-input" id="prop-opacity" min="0" max="1" step="0.05" value="${el.style.opacity}" data-field="style.opacity">
          <span class="range-value">${Math.round(el.style.opacity * 100)}%</span>
        </div>
      </div>
    `;
  }

  // Common actions
  html += `
    <div class="property-group" style="margin-top: 20px; display: flex; gap: 8px;">
      <button class="btn btn-secondary" id="btn-front" style="flex: 1;">置顶</button>
      <button class="btn btn-secondary" id="btn-back" style="flex: 1;">置底</button>
    </div>
    <div class="property-group" style="display: flex; gap: 8px;">
      <button class="btn btn-secondary" id="btn-duplicate" style="flex: 1;">Duplicate</button>
      <button class="btn btn-secondary" id="btn-delete" style="flex: 1; color: #d44;">Delete</button>
    </div>
  `;

  panel.innerHTML = html;

  // Bind property inputs
  panel.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("input", onPropertyInput);
    input.addEventListener("change", () => {
      saveState();
      pushHistory();
    });
  });

  // Bind segmented buttons
  panel.querySelectorAll("[data-weight]").forEach(btn => {
    btn.addEventListener("click", () => {
      updateElement(el.id, { style: { fontWeight: btn.dataset.weight } });
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  panel.querySelectorAll("[data-align]").forEach(btn => {
    btn.addEventListener("click", () => {
      updateElement(el.id, { style: { textAlign: btn.dataset.align } });
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  panel.querySelectorAll("[data-valign]").forEach(btn => {
    btn.addEventListener("click", () => {
      // Only a class on .box-body changes, so the canvas updates in place and
      // the page height does not move.
      updateElement(el.id, { style: { vAlign: btn.dataset.valign } });
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  panel.querySelectorAll("[data-colalign]").forEach(btn => {
    btn.addEventListener("click", () => {
      // Per column, so it lands in content rather than style. `updateElement`
      // still drives the canvas and the DOM node re-reads its align in place —
      // no rebuild, no lost focus.
      setBoxColumn(el, Number(btn.dataset.col), "align", btn.dataset.colalign);
      updateElement(el.id, {});
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  panel.querySelectorAll("[data-aspect]").forEach(btn => {
    btn.addEventListener("click", () => {
      const locked = btn.dataset.aspect === "true";
      updateElement(el.id, { style: { lockAspectRatio: locked } });
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  panel.querySelectorAll("[data-shape]").forEach(btn => {
    btn.addEventListener("click", () => {
      updateElement(el.id, { style: { cropShape: btn.dataset.shape } });
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  panel.querySelectorAll("[data-boxstyle]").forEach(btn => {
    btn.addEventListener("click", () => {
      // Frame style only. The shadow is owned by its own sliders, so switching
      // the frame style never wipes a shadow the user just tuned.
      updateElement(el.id, { style: { boxStyle: btn.dataset.boxstyle } });
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  panel.querySelectorAll("[data-layout]").forEach(btn => {
    btn.addEventListener("click", () => {
      // The panel itself gains or loses the second column's fields, so it has to
      // be rebuilt; `updateElementDOM` re-renders the canvas on its own because
      // the box's DOM shape changed.
      updateElement(el.id, { style: { layout: btn.dataset.layout } });
      syncPageHeight();
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  panel.querySelectorAll("[data-titleweight]").forEach(btn => {
    btn.addEventListener("click", () => {
      updateElement(el.id, { style: { titleFontWeight: btn.dataset.titleweight } });
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  panel.querySelectorAll("[data-fit]").forEach(btn => {
    btn.addEventListener("click", () => {
      updateElement(el.id, { style: { imageFit: btn.dataset.fit } });
      saveState();
      pushHistory();
      renderPropertiesPanel();
    });
  });

  // Image crop
  const cropBtn = document.getElementById("btn-crop");
  if (cropBtn) {
    cropBtn.addEventListener("click", () => enterCropMode(el.id));
  }

  const cropClearBtn = document.getElementById("btn-crop-clear");
  if (cropClearBtn) {
    cropClearBtn.addEventListener("click", () => clearCrop(el.id));
  }

  // Replace the photo. Natural size is refreshed too, otherwise a re-crop would
  // work from the old photo's proportions.
  const changeImgBtn = document.getElementById("btn-change-image");
  const imageFile = document.getElementById("image-file");
  if (changeImgBtn && imageFile) {
    changeImgBtn.addEventListener("click", () => imageFile.click());
    imageFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target.result;
        const probe = new Image();
        probe.onload = () => {
          updateElement(el.id, {
            content: {
              ...el.content,
              src,
              naturalWidth: probe.naturalWidth,
              naturalHeight: probe.naturalHeight
            }
          });
          saveState();
          pushHistory();
          renderPropertiesPanel();
        };
        probe.onerror = () => {
          updateElement(el.id, { content: { ...el.content, src } });
          saveState();
          pushHistory();
          renderPropertiesPanel();
        };
        probe.src = src;
      };
      reader.readAsDataURL(file);
    });
  }

  // Bind action buttons
  const frontBtn = document.getElementById("btn-front");
  if (frontBtn) frontBtn.addEventListener("click", () => bringToFront(el.id));

  const backBtn = document.getElementById("btn-back");
  if (backBtn) backBtn.addEventListener("click", () => sendToBack(el.id));

  const dupBtn = document.getElementById("btn-duplicate");
  if (dupBtn) dupBtn.addEventListener("click", () => duplicateElement(el.id));

  const delBtn = document.getElementById("btn-delete");
  if (delBtn) delBtn.addEventListener("click", () => deleteElement(el.id));
}

function onPropertyInput(e) {
  const el = getSelectedElement();
  if (!el) return;

  const field = e.target.dataset.field;
  let value = e.target.value;

  // Live readout for the slider that just moved. Alpha sliders already run
  // 0..100, opacity is a 0..1 float.
  const readout = e.target.parentElement?.querySelector(".range-value, .alpha-value");
  if (readout) {
    if (e.target.dataset.unit === "%") {
      readout.textContent = Math.round(parseFloat(value)) + "%";
    } else if (field === "style.opacity") {
      readout.textContent = Math.round(parseFloat(value) * 100) + "%";
    } else {
      readout.textContent = value;
    }
  }

  if (field === "x" || field === "y" || field === "width" || field === "height") {
    value = parseInt(value, 10) || 0;
    updateElement(el.id, { [field]: value });
    // Long mode: typing a Y / Height can push the bottom edge of the page.
    syncPageHeight();
  } else if (field === "content") {
    updateElement(el.id, { content: value });
  } else if (field.startsWith("box.")) {
    // Box column text: "box.<column>.<title|body>".
    const [, columnIndex, part] = field.split(".");
    setBoxColumn(el, Number(columnIndex), part, value);
    // The canvas node needs the new text; `updateElementDOM` rebuilds the box
    // when a title appears or disappears and updates the text otherwise.
    updateElement(el.id, {});
  } else if (field.startsWith("style.")) {
    const styleKey = field.slice(6);
    const numFields = ["fontSize", "borderRadius", "lineWidth", "borderWidth", "borderOuterWidth", "shadowX", "shadowY", "shadowBlur", "shadowSpread", "letterSpacing", "paddingH", "paddingV", "gap", "titleFontSize", "titleGap"];
    const floatFields = ["opacity"];
    // Stored 0..1, shown as a percentage.
    const percentFields = ["split"];
    if (numFields.includes(styleKey)) value = parseInt(value, 10) || 0;
    else if (floatFields.includes(styleKey)) value = parseFloat(value) || 0;
    else if (percentFields.includes(styleKey)) value = Math.min(0.85, Math.max(0.15, (parseFloat(value) || 0) / 100));
    else if (/Alpha$/.test(styleKey)) value = Math.min(1, Math.max(0, (parseFloat(value) || 0) / 100));

    // Colours are stored exactly as picked. Transparency is controlled by the
    // paired alpha slider instead of being inferred from the colour value.
    updateElement(el.id, { style: { [styleKey]: value } });
  }

  saveState();
}
