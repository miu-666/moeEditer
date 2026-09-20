function handleAssetUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  Array.from(files).forEach(file => {
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const asset = {
        id: generateId(),
        type: "image",
        name: file.name,
        src: ev.target.result,
        createdAt: Date.now()
      };
      state.assets.push(asset);
      renderAssets();
      saveState();
    };
    reader.readAsDataURL(file);
  });

  e.target.value = "";
}

function renderAssets() {
  const grid = document.getElementById("assets-grid");
  if (!grid) return;

  grid.innerHTML = "";

  if (state.assets.length === 0) {
    grid.innerHTML = '<div class="assets-empty">No assets yet</div>';
    return;
  }

  state.assets.forEach(asset => {
    const item = document.createElement("div");
    item.className = "asset-item";
    item.title = asset.name;

    const img = document.createElement("img");
    img.src = asset.src;
    img.alt = asset.name;
    item.appendChild(img);

    // Delete button (shows on hover)
    const delBtn = document.createElement("button");
    delBtn.className = "asset-delete";
    delBtn.textContent = "×";
    delBtn.title = "Delete";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteAsset(asset.id);
    });
    item.appendChild(delBtn);

    // Click to add to canvas (with correct aspect ratio)
    item.addEventListener("click", () => {
      const tmpImg = new Image();
      tmpImg.onload = () => {
        const maxSize = 200;
        const ratio = tmpImg.naturalWidth / tmpImg.naturalHeight;
        let w, h;
        if (tmpImg.naturalWidth > tmpImg.naturalHeight) {
          w = Math.min(tmpImg.naturalWidth, maxSize);
          h = w / ratio;
        } else {
          h = Math.min(tmpImg.naturalHeight, maxSize);
          w = h * ratio;
        }
        createElement("image", {
          width: Math.round(w),
          height: Math.round(h),
          content: { src: asset.src }
        });
      };
      tmpImg.src = asset.src;
    });

    grid.appendChild(item);
  });
}

function deleteAsset(id) {
  state.assets = state.assets.filter(a => a.id !== id);
  renderAssets();
  saveState();
}
