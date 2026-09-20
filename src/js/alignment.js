const ALIGN_THRESHOLD = 5;

function checkAlignment(currentEl, newX, newY) {
  const guides = [];
  let snappedX = newX;
  let snappedY = newY;

  // Current element edges
  const curLeft = newX;
  const curRight = newX + currentEl.width;
  const curCenterX = newX + currentEl.width / 2;
  const curTop = newY;
  const curBottom = newY + currentEl.height;
  const curCenterY = newY + currentEl.height / 2;

  state.elements.forEach(other => {
    if (other.id === currentEl.id) return;

    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oCenterX = other.x + other.width / 2;
    const oTop = other.y;
    const oBottom = other.y + other.height;
    const oCenterY = other.y + other.height / 2;

    // Vertical alignment (x-axis)
    const xChecks = [
      { cur: curLeft, other: oLeft, guide: oLeft },
      { cur: curRight, other: oRight, guide: oRight },
      { cur: curCenterX, other: oCenterX, guide: oCenterX },
      { cur: curLeft, other: oRight, guide: oRight },
      { cur: curRight, other: oLeft, guide: oLeft }
    ];

    for (const check of xChecks) {
      if (Math.abs(check.cur - check.other) < ALIGN_THRESHOLD) {
        const offset = check.other - check.cur;
        snappedX = newX + offset;
        guides.push({ type: "vertical", x: check.guide });
        break;
      }
    }

    // Horizontal alignment (y-axis)
    const yChecks = [
      { cur: curTop, other: oTop, guide: oTop },
      { cur: curBottom, other: oBottom, guide: oBottom },
      { cur: curCenterY, other: oCenterY, guide: oCenterY },
      { cur: curTop, other: oBottom, guide: oBottom },
      { cur: curBottom, other: oTop, guide: oTop }
    ];

    for (const check of yChecks) {
      if (Math.abs(check.cur - check.other) < ALIGN_THRESHOLD) {
        const offset = check.other - check.cur;
        snappedY = newY + offset;
        guides.push({ type: "horizontal", y: check.guide });
        break;
      }
    }
  });

  return { snappedX, snappedY, guides };
}

function renderGuides(guides) {
  clearGuides();
  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  const layer = document.createElement("div");
  layer.className = "alignment-guides";
  layer.id = "alignment-guides";

  guides.forEach(g => {
    const line = document.createElement("div");
    if (g.type === "vertical") {
      line.className = "guide guide-vertical";
      line.style.left = g.x + "px";
    } else {
      line.className = "guide guide-horizontal";
      line.style.top = g.y + "px";
    }
    layer.appendChild(line);
  });

  canvas.appendChild(layer);
}

function clearGuides() {
  const layer = document.getElementById("alignment-guides");
  if (layer) layer.remove();
}
