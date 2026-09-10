const ACCESS_CODE = "huiyi"
const DB_NAME = "memory-library"
const MAX_EDGE = 1280

const TAG_TYPES = [
  { type: "people", label: "人物" },
  { type: "place", label: "地点" },
  { type: "content", label: "内容" },
  { type: "custom", label: "自定义" }
]

const state = {
  tab: "library",
  photos: [],
  tags: [],
  memories: [],
  selectMode: false,
  selectedIds: [],
  filter: { key: "all" },
  lastImported: [],
  view: null
}

let dbPromise = null
let memoryOnly = false
const memoryDb = { photos: [], tags: [], memories: [] }
const urlCache = new Map()

function $(id) {
  return document.getElementById(id)
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("IndexedDB 打开超时")), 4000)
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore("photos", { keyPath: "id" })
      db.createObjectStore("tags", { keyPath: "id" })
      db.createObjectStore("memories", { keyPath: "id" })
    }
    req.onsuccess = () => {
      clearTimeout(timer)
      resolve(req.result)
    }
    req.onerror = () => {
      clearTimeout(timer)
      memoryOnly = true
      resolve(null)
    }
  }).catch(() => {
    memoryOnly = true
    return null
  })
  return dbPromise
}

function storeOp(name, mode, fn) {
  return openDb().then((db) => {
    if (!db) return null
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode)
      const store = tx.objectStore(name)
      const result = fn(store)
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
    })
  })
}

function getAll(name) {
  return openDb().then((db) => {
    if (memoryOnly || !db) return memoryDb[name].slice()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, "readonly")
      const req = tx.objectStore(name).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  })
}

function putItem(name, item) {
  return openDb().then((db) => {
    if (memoryOnly || !db) {
      const list = memoryDb[name]
      const index = list.findIndex((row) => row.id === item.id)
      if (index > -1) list[index] = item
      else list.push(item)
      return
    }
    return storeOp(name, "readwrite", (store) => store.put(item))
  })
}

function deleteItem(name, id) {
  return openDb().then((db) => {
    if (memoryOnly || !db) {
      memoryDb[name] = memoryDb[name].filter((row) => row.id !== id)
      return
    }
    return storeOp(name, "readwrite", (store) => store.delete(id))
  })
}

async function loadAll() {
  const [photos, tags, memories] = await Promise.all([
    getAll("photos"),
    getAll("tags"),
    getAll("memories")
  ])
  state.photos = photos.sort((a, b) => (b.shotAt || 0) - (a.shotAt || 0))
  state.tags = tags
  state.memories = memories.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

function photoUrl(photo) {
  if (!photo || !photo.blob) return ""
  if (!urlCache.has(photo.id)) urlCache.set(photo.id, URL.createObjectURL(photo.blob))
  return urlCache.get(photo.id)
}

function monthKey(ts) {
  const d = new Date(ts || 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(ts) {
  const d = new Date(ts || 0)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

function formatTime(ts) {
  const d = new Date(ts || 0)
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const src = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(src)
        resolve({
          blob: blob || file,
          width: canvas.width,
          height: canvas.height
        })
      }, "image/jpeg", 0.82)
    }
    img.onerror = () => {
      URL.revokeObjectURL(src)
      resolve({ blob: file, width: 0, height: 0 })
    }
    img.src = src
  })
}

function filteredPhotos() {
  return state.photos.filter((photo) => {
    if (state.filter.key === "month") return monthKey(photo.shotAt) === state.filter.monthKey
    if (state.filter.tagId) return (photo.tagIds || []).includes(state.filter.tagId)
    if (state.filter.inMemory === "yes") return (photo.memoryIds || []).length > 0
    if (state.filter.inMemory === "no") return !(photo.memoryIds || []).length
    return true
  })
}

function groupPhotos(photos) {
  const groups = []
  const map = {}
  photos.forEach((photo) => {
    const key = monthKey(photo.shotAt)
    if (!map[key]) {
      map[key] = { key, label: monthLabel(photo.shotAt), photos: [] }
      groups.push(map[key])
    }
    map[key].photos.push(photo)
  })
  return groups
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function render() {
  const titles = {
    library: ["照片库", `共 ${state.photos.length} 张 · 照片只存在这台设备的浏览器里`],
    memories: ["回忆集", "把一段日子收成一集"],
    import: ["导入", "从本机选择照片。网页不会上传原图到服务器。"],
    mine: ["精选回忆库", "小范围预览版 · 静态网页，不扫整机相册"]
  }
  if (!state.view) {
    $("page-title").textContent = titles[state.tab][0]
    $("page-sub").textContent = titles[state.tab][1]
  }
  $("manage-btn").classList.toggle("hidden", state.tab !== "library" || !state.photos.length || !!state.view)
  $("manage-btn").textContent = state.selectMode ? "完成" : "管理"

  if (state.view && state.view.type === "photo") return renderPhoto(state.view.id)
  if (state.view && state.view.type === "memory") return renderMemory(state.view.id)
  if (state.view && state.view.type === "memory-edit") return renderMemoryEdit(state.view)
  if (state.view && state.view.type === "tags") return renderTags(state.view.ids)
  if (state.tab === "library") return renderLibrary()
  if (state.tab === "memories") return renderMemories()
  if (state.tab === "import") return renderImport()
  return renderMine()
}

function renderLibrary() {
  const photos = filteredPhotos()
  const groups = groupPhotos(photos)
  if (!state.photos.length) {
    $("main").innerHTML = emptyHtml("库还是空的", "先导入一批值得留下的照片。", "去导入", "import")
    return
  }
  $("main").innerHTML = `
    <div class="chips">
      ${chip("all", "全部")}${chip("month", "时间")}${chip("place", "地点")}${chip("people", "人物")}${chip("content", "内容")}${chip("inMemory", "入集")}
    </div>
    ${groups.length ? groups.map((group) => `
      <div class="month">${escapeHtml(group.label)}</div>
      ${photoGrid(group.photos)}
    `).join("") : `<div class="empty"><h2>没有符合条件的照片</h2><p>换一个筛选，或先打标签。</p></div>`}
    ${state.selectMode ? `
      <div class="batch">
        <button class="btn ghost" data-act="batch-tag" type="button">打标签</button>
        <button class="btn primary" data-act="batch-memory" type="button">加入回忆集</button>
        <button class="btn danger" data-act="batch-delete" type="button">删除</button>
      </div>` : ""}
  `
}

function chip(key, label) {
  return `<button class="chip ${state.filter.key === key ? "on" : ""}" data-filter="${key}" type="button">${label}</button>`
}

function photoGrid(photos) {
  return `<div class="grid">${photos.map((photo) => `
    <button class="cell" data-photo="${photo.id}" type="button">
      <img src="${photoUrl(photo)}" alt="" />
      ${state.selectMode ? `<span class="check ${state.selectedIds.includes(photo.id) ? "on" : ""}"></span>` : ""}
    </button>`).join("")}</div>`
}

function emptyHtml(title, desc, action, tab) {
  return `<div class="empty"><h2>${title}</h2><p>${desc}</p>${action ? `<button class="btn primary" data-tab="${tab}" type="button">${action}</button>` : ""}</div>`
}

function renderMemories() {
  if (!state.memories.length) {
    $("main").innerHTML = emptyHtml(
      "还没有回忆集",
      state.photos.length ? "从库里挑一组照片做成一集。" : "先导入照片，再收成回忆集。",
      state.photos.length ? "创建回忆集" : "去导入",
      state.photos.length ? "" : "import"
    )
    if (state.photos.length) {
      $("main").querySelector(".btn").dataset.act = "new-memory"
      $("main").querySelector(".btn").removeAttribute("data-tab")
    }
    return
  }
  $("main").innerHTML = `
    <div style="text-align:right;margin-bottom:8px"><button class="text-btn" data-act="new-memory" type="button">新建</button></div>
    ${state.memories.map((memory) => {
      const cover = state.photos.find((p) => p.id === memory.coverPhotoId) || state.photos.find((p) => memory.photoIds.includes(p.id))
      return `<article class="card memory" data-open-memory="${memory.id}">
        ${cover ? `<img class="cover" src="${photoUrl(cover)}" alt="" />` : `<div class="cover"></div>`}
        <div class="meta"><h3>${escapeHtml(memory.title)}</h3><p>${memory.photoIds.length} 张</p></div>
      </article>`
    }).join("")}
  `
}

function renderImport() {
  $("main").innerHTML = `
    <section class="card hero">
      <p class="kicker">不会上传到服务器</p>
      <h2>从本机选择照片</h2>
      <p>网页可以一次多选。图片会压成预览图，只存在你的浏览器里。关掉电脑也不影响别人打开这个网站，但每个人看到的是自己浏览器里的库。</p>
      <label class="btn primary block">
        选择照片
        <input id="file-input" type="file" accept="image/*" multiple hidden />
      </label>
    </section>
    ${state.lastImported.length ? `
      <div class="last-grid">
        <div class="month">刚刚导入 ${state.lastImported.length} 张</div>
        ${photoGrid(state.lastImported)}
        <div class="row-btns" style="margin-top:12px">
          <button class="btn ghost" data-act="tag-last" type="button">去打标签</button>
          <button class="btn primary" data-act="memory-last" type="button">做成回忆集</button>
        </div>
      </div>` : ""}
  `
}

function renderMine() {
  $("main").innerHTML = `
    <div class="stats">
      <div class="card stat"><b>${state.photos.length}</b><span>照片</span></div>
      <div class="card stat"><b>${state.memories.length}</b><span>回忆集</span></div>
      <div class="card stat"><b>${state.tags.length}</b><span>标签</span></div>
    </div>
    <section class="card list">
      <h3>这版能做</h3>
      <p>导入精选照片并压成预览图</p>
      <p>按时间 / 标签 / 是否入集筛选</p>
      <p>做成回忆集、打标签、库内删除</p>
    </section>
    <section class="card list">
      <h3>这版不做</h3>
      <p class="muted">扫描整机相册</p>
      <p class="muted">把照片存到网站服务器上</p>
      <p class="muted">删除手机系统相册原图</p>
    </section>
    <button class="btn danger block" data-act="clear" type="button">清空本机回忆库</button>
  `
}

function renderPhoto(id) {
  const photo = state.photos.find((item) => item.id === id)
  if (!photo) {
    state.view = null
    return render()
  }
  const tags = state.tags.filter((tag) => (photo.tagIds || []).includes(tag.id))
  $("page-title").textContent = "照片"
  $("page-sub").textContent = formatTime(photo.shotAt)
  $("main").innerHTML = `
    <div class="detail">
      <img class="hero-img" src="${photoUrl(photo)}" alt="" />
      <section class="card kv">
        <div class="kv-row"><span>拍摄时间</span><span>${formatTime(photo.shotAt)}</span></div>
        <div class="kv-row"><span>标签</span><button class="text-btn" data-act="edit-tags" data-ids="${photo.id}" type="button">编辑</button></div>
        <div class="tags">${tags.length ? tags.map((tag) => `<span class="tag">${escapeHtml(typeLabel(tag.type))} · ${escapeHtml(tag.name)}</span>`).join("") : `<span class="muted">还没有标签</span>`}</div>
      </section>
      <div class="row-btns" style="margin-top:16px">
        <button class="btn primary" data-act="photo-memory" data-id="${photo.id}" type="button">加入回忆集</button>
        <button class="btn danger" data-act="photo-delete" data-id="${photo.id}" type="button">从库中删除</button>
      </div>
      <button class="btn plain block" data-act="back" type="button" style="margin-top:8px">返回</button>
    </div>
  `
}

function renderMemory(id) {
  const memory = state.memories.find((item) => item.id === id)
  if (!memory) {
    state.view = null
    return render()
  }
  const photos = memory.photoIds.map((pid) => state.photos.find((p) => p.id === pid)).filter(Boolean)
  $("page-title").textContent = memory.title
  $("page-sub").textContent = `${photos.length} 张`
  $("main").innerHTML = `
    ${memory.description ? `<p class="sub">${escapeHtml(memory.description)}</p>` : ""}
    ${photoGrid(photos)}
    <div class="row-btns" style="margin-top:16px">
      <button class="btn ghost" data-act="edit-memory" data-id="${memory.id}" type="button">编辑</button>
      <button class="btn danger" data-act="delete-memory" data-id="${memory.id}" type="button">删除回忆集</button>
    </div>
    <button class="btn plain block" data-act="back" type="button" style="margin-top:8px">返回</button>
  `
}

function renderMemoryEdit(view) {
  const memory = view.id ? state.memories.find((item) => item.id === view.id) : null
  const selected = view.photoIds || (memory ? memory.photoIds.slice() : [])
  $("page-title").textContent = memory ? "编辑回忆集" : "新建回忆集"
  $("page-sub").textContent = "从库中勾选照片"
  $("main").innerHTML = `
    <section class="card form">
      <input id="mem-title" class="input" placeholder="给这集起个名字" value="${escapeHtml(memory ? memory.title : "")}" />
      <textarea id="mem-desc" placeholder="可以写一句当时的话">${escapeHtml(memory ? memory.description : "")}</textarea>
    </section>
    <div class="month">已选 ${selected.length} 张</div>
    <div class="grid">
      ${state.photos.map((photo) => `
        <button class="cell" data-toggle-photo="${photo.id}" type="button">
          <img src="${photoUrl(photo)}" alt="" />
          <span class="check ${selected.includes(photo.id) ? "on" : ""}"></span>
        </button>`).join("")}
    </div>
    <button class="btn primary block" data-act="save-memory" type="button" style="margin-top:16px">保存回忆集</button>
    <button class="btn plain block" data-act="back" type="button" style="margin-top:8px">取消</button>
  `
}

function renderTags(ids) {
  $("page-title").textContent = "打标签"
  $("page-sub").textContent = `将应用到 ${ids.length} 张照片`
  $("main").innerHTML = TAG_TYPES.map((group) => {
    const tags = state.tags.filter((tag) => tag.type === group.type)
    return `<section style="margin-top:20px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${group.label}</strong>
        <button class="text-btn" data-act="add-tag" data-type="${group.type}" type="button">添加</button>
      </div>
      <div class="chips">
        ${tags.length ? tags.map((tag) => `<button class="chip ${ids.every((id) => (state.photos.find((p) => p.id === id)?.tagIds || []).includes(tag.id)) ? "on" : ""}" data-toggle-tag="${tag.id}" type="button">${escapeHtml(tag.name)}</button>`).join("") : `<span class="muted">还没有${group.label}标签</span>`}
      </div>
    </section>`
  }).join("") + `
    <button class="btn primary block" data-act="save-tags" type="button" style="margin-top:20px">完成</button>
  `
}

function typeLabel(type) {
  return (TAG_TYPES.find((item) => item.type === type) || {}).label || type
}

function showSheet(title, items, onPick) {
  const mask = document.createElement("div")
  mask.className = "sheet"
  mask.innerHTML = `<div class="sheet-card"><h3>${escapeHtml(title)}</h3>${items.map((item, i) => `<button class="sheet-item" data-i="${i}" type="button">${escapeHtml(item.label)}</button>`).join("")}</div>`
  mask.addEventListener("click", (event) => {
    if (event.target === mask) mask.remove()
    const btn = event.target.closest("[data-i]")
    if (!btn) return
    onPick(items[Number(btn.dataset.i)])
    mask.remove()
  })
  document.body.appendChild(mask)
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"))
  if (!files.length) return
  const imported = []
  for (const file of files) {
    const packed = await compressImage(file)
    const photo = {
      id: uid("p"),
      blob: packed.blob,
      name: file.name,
      importedAt: Date.now(),
      shotAt: file.lastModified || Date.now(),
      width: packed.width,
      height: packed.height,
      tagIds: [],
      memoryIds: []
    }
    await putItem("photos", photo)
    imported.push(photo)
  }
  state.lastImported = imported
  await loadAll()
  render()
}

async function deletePhotos(ids) {
  for (const id of ids) {
    urlCache.delete(id)
    await deleteItem("photos", id)
  }
  for (const memory of state.memories) {
    memory.photoIds = memory.photoIds.filter((id) => !ids.includes(id))
    if (ids.includes(memory.coverPhotoId)) memory.coverPhotoId = memory.photoIds[0] || null
    await putItem("memories", memory)
  }
  await loadAll()
}

function selectedOr(ids) {
  return ids && ids.length ? ids : state.selectedIds.slice()
}

function bindEvents() {
  if ($("gate-btn")) $("gate-btn").addEventListener("click", unlock)
  if ($("gate-input")) {
    $("gate-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") unlock()
    })
  }
  if ($("manage-btn")) {
    $("manage-btn").addEventListener("click", () => {
      state.selectMode = !state.selectMode
      state.selectedIds = []
      render()
    })
  }
  const tabbar = document.querySelector(".tabbar")
  if (tabbar) {
    tabbar.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]")
      if (!tab) return
      switchTab(tab.dataset.tab)
    })
  }
  if ($("main")) {
    $("main").addEventListener("click", onMainClick)
    $("main").addEventListener("change", async (event) => {
      if (event.target.id === "file-input") await importFiles(event.target.files)
    })
  }
}

function unlock() {
  const value = $("gate-input").value.trim()
  if (value !== ACCESS_CODE) {
    $("gate-error").classList.remove("hidden")
    return
  }
  sessionStorage.setItem("ml_ok", "1")
  $("gate").classList.add("hidden")
  $("app").classList.remove("hidden")
}

function switchTab(tab) {
  state.tab = tab
  state.view = null
  state.selectMode = false
  state.selectedIds = []
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("on", btn.dataset.tab === tab))
  render()
}

async function onMainClick(event) {
  const tabBtn = event.target.closest("[data-tab]")
  if (tabBtn) return switchTab(tabBtn.dataset.tab)

  const filterBtn = event.target.closest("[data-filter]")
  if (filterBtn) return onFilter(filterBtn.dataset.filter)

  const photoBtn = event.target.closest("[data-photo]")
  if (photoBtn) return onPhoto(photoBtn.dataset.photo)

  const togglePhoto = event.target.closest("[data-toggle-photo]")
  if (togglePhoto && state.view && state.view.type === "memory-edit") {
    const id = togglePhoto.dataset.togglePhoto
    const ids = state.view.photoIds.slice()
    const i = ids.indexOf(id)
    if (i > -1) ids.splice(i, 1)
    else ids.push(id)
    state.view.photoIds = ids
    render()
    return
  }

  const toggleTag = event.target.closest("[data-toggle-tag]")
  if (toggleTag && state.view && state.view.type === "tags") {
    const tagId = toggleTag.dataset.toggleTag
    for (const id of state.view.ids) {
      const photo = state.photos.find((item) => item.id === id)
      if (!photo) continue
      const set = new Set(photo.tagIds || [])
      if (set.has(tagId)) set.delete(tagId)
      else set.add(tagId)
      photo.tagIds = Array.from(set)
      await putItem("photos", photo)
    }
    await loadAll()
    render()
    return
  }

  const openMemory = event.target.closest("[data-open-memory]")
  if (openMemory) {
    state.view = { type: "memory", id: openMemory.dataset.openMemory }
    render()
    return
  }

  const act = event.target.closest("[data-act]")
  if (act) await onAction(act.dataset.act, act.dataset)
}

function onFilter(key) {
  if (key === "all") {
    state.filter = { key: "all" }
    render()
    return
  }
  if (key === "month") {
    const months = [...new Set(state.photos.map((p) => monthKey(p.shotAt)))].sort().reverse()
    showSheet("按时间", months.map((m) => ({ label: monthLabel(m + "-01"), monthKey: m })), (item) => {
      state.filter = { key: "month", monthKey: item.monthKey }
      render()
    })
    return
  }
  if (key === "inMemory") {
    showSheet("是否已入集", [
      { label: "已加入回忆集", inMemory: "yes" },
      { label: "尚未入集", inMemory: "no" }
    ], (item) => {
      state.filter = { key: "inMemory", inMemory: item.inMemory }
      render()
    })
    return
  }
  const tags = state.tags.filter((tag) => tag.type === key)
  if (!tags.length) {
    alert("还没有这类标签")
    return
  }
  showSheet(`按${typeLabel(key)}`, tags.map((tag) => ({ label: tag.name, tagId: tag.id })), (item) => {
    state.filter = { key, tagId: item.tagId }
    render()
  })
}

function onPhoto(id) {
  if (state.selectMode) {
    const i = state.selectedIds.indexOf(id)
    if (i > -1) state.selectedIds.splice(i, 1)
    else state.selectedIds.push(id)
    render()
    return
  }
  state.view = { type: "photo", id }
  render()
}

async function onAction(act, dataset) {
  if (act === "back") {
    state.view = null
    render()
    return
  }
  if (act === "new-memory") {
    state.view = { type: "memory-edit", photoIds: [] }
    render()
    return
  }
  if (act === "tag-last") {
    state.view = { type: "tags", ids: state.lastImported.map((p) => p.id) }
    render()
    return
  }
  if (act === "memory-last") {
    state.view = { type: "memory-edit", photoIds: state.lastImported.map((p) => p.id) }
    render()
    return
  }
  if (act === "batch-tag") {
    if (!state.selectedIds.length) return alert("请先选择照片")
    state.view = { type: "tags", ids: state.selectedIds.slice() }
    state.selectMode = false
    render()
    return
  }
  if (act === "batch-memory") {
    if (!state.selectedIds.length) return alert("请先选择照片")
    state.view = { type: "memory-edit", photoIds: state.selectedIds.slice() }
    state.selectMode = false
    render()
    return
  }
  if (act === "batch-delete") {
    if (!state.selectedIds.length) return alert("请先选择照片")
    if (!confirm("只删除这个浏览器里的副本，不影响手机相册原图。")) return
    await deletePhotos(state.selectedIds)
    state.selectedIds = []
    state.selectMode = false
    render()
    return
  }
  if (act === "edit-tags") {
    state.view = { type: "tags", ids: dataset.ids.split(",") }
    render()
    return
  }
  if (act === "add-tag") {
    const name = prompt(`添加${typeLabel(dataset.type)}`)
    if (!name || !name.trim()) return
    const tag = { id: uid("t"), type: dataset.type, name: name.trim() }
    await putItem("tags", tag)
    await loadAll()
    render()
    return
  }
  if (act === "save-tags") {
    state.view = null
    state.tab = "library"
    render()
    return
  }
  if (act === "save-memory") {
    const title = $("mem-title").value.trim() || "未命名回忆集"
    const description = $("mem-desc").value.trim()
    const photoIds = (state.view.photoIds || []).slice()
    if (!photoIds.length) return alert("请至少加入一张照片")
    const memory = state.view.id
      ? state.memories.find((item) => item.id === state.view.id)
      : { id: uid("m"), createdAt: Date.now() }
    memory.title = title
    memory.description = description
    memory.photoIds = photoIds
    memory.coverPhotoId = photoIds[0]
    await putItem("memories", memory)
    for (const photo of state.photos) {
      const set = new Set(photo.memoryIds || [])
      if (photoIds.includes(photo.id)) set.add(memory.id)
      else set.delete(memory.id)
      photo.memoryIds = Array.from(set)
      await putItem("photos", photo)
    }
    await loadAll()
    state.view = { type: "memory", id: memory.id }
    state.tab = "memories"
    render()
    return
  }
  if (act === "edit-memory") {
    const memory = state.memories.find((item) => item.id === dataset.id)
    state.view = { type: "memory-edit", id: memory.id, photoIds: memory.photoIds.slice() }
    render()
    return
  }
  if (act === "delete-memory") {
    if (!confirm("照片仍留在库里，只去掉这一集。")) return
    await deleteItem("memories", dataset.id)
    for (const photo of state.photos) {
      photo.memoryIds = (photo.memoryIds || []).filter((id) => id !== dataset.id)
      await putItem("photos", photo)
    }
    await loadAll()
    state.view = null
    render()
    return
  }
  if (act === "photo-memory") {
    state.view = { type: "memory-edit", photoIds: [dataset.id] }
    render()
    return
  }
  if (act === "photo-delete") {
    if (!confirm("只删除这个浏览器里的副本。")) return
    await deletePhotos([dataset.id])
    state.view = null
    render()
    return
  }
  if (act === "clear") {
    if (!confirm("将清空这个浏览器里的回忆库。")) return
    const db = await openDb()
    if (memoryOnly || !db) {
      memoryDb.photos = []
      memoryDb.tags = []
      memoryDb.memories = []
    } else {
      await Promise.all(["photos", "tags", "memories"].map((name) => new Promise((resolve) => {
        const tx = db.transaction(name, "readwrite")
        tx.objectStore(name).clear()
        tx.oncomplete = resolve
      })))
    }
    urlCache.forEach((url) => URL.revokeObjectURL(url))
    urlCache.clear()
    state.lastImported = []
    await loadAll()
    render()
  }
}

async function runSelfTest() {
  sessionStorage.setItem("ml_ok", "1")
  $("gate").classList.add("hidden")
  $("app").classList.remove("hidden")
  const canvas = document.createElement("canvas")
  canvas.width = 40
  canvas.height = 40
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#b85c38"
  ctx.fillRect(0, 0, 40, 40)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8))
  const file = new File([blob], "selftest.jpg", { type: "image/jpeg", lastModified: Date.now() })
  await importFiles([file])
  const photo = state.photos[0]
  const tag = { id: uid("t"), type: "people", name: "自测" }
  await putItem("tags", tag)
  photo.tagIds = [tag.id]
  await putItem("photos", photo)
  const memory = { id: uid("m"), title: "自测回忆集", description: "", photoIds: [photo.id], coverPhotoId: photo.id, createdAt: Date.now() }
  await putItem("memories", memory)
  await loadAll()
  const ok = state.photos.length >= 1 && state.memories.some((item) => item.title === "自测回忆集") && state.tags.some((item) => item.name === "自测")
  const text = `${ok ? "SELFTEST_OK" : "SELFTEST_FAIL"} photos=${state.photos.length} memories=${state.memories.length}`
  document.title = text
  document.body.insertAdjacentHTML("afterbegin", `<pre id="selftest-result">${text}</pre>`)
  switchTab("library")
}

function shouldSelfTest() {
  return window.FORCE_SELFTEST === true || new URLSearchParams(location.search).get("selftest") === "1"
}

async function boot() {
  bindEvents()
  const selftest = shouldSelfTest()
  try {
    await loadAll()
  } catch (error) {
    if (selftest) {
      document.title = `SELFTEST_FAIL load ${error && error.message}`
      document.body.insertAdjacentHTML("afterbegin", `<pre id="selftest-result">SELFTEST_FAIL load ${error && error.message}</pre>`)
      return
    }
    throw error
  }
  if (selftest) {
    try {
      await runSelfTest()
    } catch (error) {
      document.title = `SELFTEST_FAIL ${error && error.message}`
      document.body.insertAdjacentHTML("afterbegin", `<pre id="selftest-result">SELFTEST_FAIL ${error && error.message}</pre>`)
    }
    return
  }
  if (sessionStorage.getItem("ml_ok") === "1") {
    $("gate").classList.add("hidden")
    $("app").classList.remove("hidden")
  }
  render()
}

boot()
