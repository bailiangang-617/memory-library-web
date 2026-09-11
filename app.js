const ACCESS = {
  heziqing: "edit",
  hzq: "view"
}
const DB_NAME = "our-moments-v1"

const KINDS = [
  { type: "photo", label: "照片集" },
  { type: "letter", label: "电子信" }
]

const MONTHS = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]
const CN_NUM = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
const SEASONS = ["冬", "春", "夏", "秋"]

const state = {
  tab: "door",
  entries: [],
  view: null,
  compose: "photo",
  about: "us",
  openYears: {},
  fileId: "",
  slide: 0,
  dayKey: "",
  sheetGallery: [],
  sheetEntries: [],
  peek: -1,
  albumSwiped: false,
  draftFiles: [],
  draftUrls: [],
  draftTitle: "",
  draftWhen: "",
  draftBody: "",
  tale: { book: "", phase: "wall", index: 0, scenes: [] }
}

let dbPromise = null
let memoryOnly = false
const memoryDb = { entries: [] }
const urlCache = new Map()
let crop = null
let taleWait = 0

function $(id) {
  return document.getElementById(id)
}

function canWrite() {
  return sessionStorage.getItem("om_role") !== "view"
}

function rememberGate(code) {
  const role = ACCESS[code]
  sessionStorage.setItem("om_ok", code)
  sessionStorage.setItem("om_key", code)
  sessionStorage.setItem("om_role", role)
}

function gateOpen() {
  const code = sessionStorage.getItem("om_ok")
  if (code === "heziqing" || code === "hzq") return true
  if (code === "1") {
    rememberGate("heziqing")
    return true
  }
  return false
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function kindLabel(type) {
  if (type === "video") return "照片集"
  if (type === "chat") return "聊天"
  if (type === "note") return "一句话"
  return (KINDS.find((item) => item.type === type) || {}).label || type
}

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("IndexedDB 打开超时")), 4000)
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore("entries", { keyPath: "id" })
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

function getAll() {
  return openDb().then((db) => {
    if (memoryOnly || !db) return memoryDb.entries.slice()
    return new Promise((resolve, reject) => {
      const req = db.transaction("entries", "readonly").objectStore("entries").getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  })
}

async function persistEntry(entry) {
  if (!canWrite()) throw new Error("这本册子只能看")
  const packed = withWho(entry)
  if (Cloud.on()) return fromStored(await Cloud.save(packed))
  await putEntry(packed)
  return fromStored(packed)
}

function putEntry(entry) {
  return openDb().then((db) => {
    if (memoryOnly || !db) {
      const i = memoryDb.entries.findIndex((row) => row.id === entry.id)
      if (i > -1) memoryDb.entries[i] = entry
      else memoryDb.entries.push(entry)
      return
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite")
      tx.objectStore("entries").put(entry)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  })
}

function deleteEntry(id) {
  return openDb().then((db) => {
    if (memoryOnly || !db) {
      memoryDb.entries = memoryDb.entries.filter((row) => row.id !== id)
      return
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite")
      tx.objectStore("entries").delete(id)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  })
}

async function loadAll() {
  if (window.Cloud && Cloud.on()) {
    await Cloud.ready()
    state.entries = (await Cloud.list()).map(fromStored).sort((a, b) => (b.happenedAt || 0) - (a.happenedAt || 0))
    return
  }
  const entries = await getAll()
  state.entries = entries.map(fromStored).sort((a, b) => (b.happenedAt || 0) - (a.happenedAt || 0))
}

function fileUrl(file) {
  if (!file) return ""
  if (file.url) return file.url
  if (file.fileID) {
    const path = String(file.fileID).replace(/^cloud:\/\/[^/]+\//, "")
    if (path && path !== file.fileID) {
      return `https://7a69-ziqinghuiyilu-d0gzmlqwm75797fd9-1485207164.tcb.qcloud.la/${path}`
    }
  }
  if (!file.blob) return ""
  if (!urlCache.has(file.id)) urlCache.set(file.id, URL.createObjectURL(file.blob))
  return urlCache.get(file.id)
}

function inferWho(entry) {
  if (entry.who) return entry.who
  if (entry.type === "chat" || entry.type === "letter" || entry.type === "note") return "words"
  return "us"
}

function withWho(entry) {
  const who = inferWho(entry)
  const body = String(entry.body || "").replace(/\n\n<!--who:\w+-->$/, "")
  return { ...entry, who, body: `${body}\n\n<!--who:${who}-->` }
}

function fromStored(entry) {
  const raw = String(entry.body || "")
  const match = raw.match(/\n\n<!--who:(\w+)-->$/)
  return {
    ...entry,
    body: raw.replace(/\n\n<!--who:\w+-->$/, ""),
    who: match ? match[1] : inferWho(entry)
  }
}

function cnYear(year) {
  return String(year).split("").map((d) => CN_NUM[Number(d)] || d).join("")
}

function formatDay(ts) {
  const d = new Date(ts || Date.now())
  return `${MONTHS[d.getMonth()]}${d.getDate()}日`
}

function seasonOf(ts) {
  const month = new Date(ts || Date.now()).getMonth()
  if (month === 11 || month < 2) return 0
  if (month < 5) return 1
  if (month < 8) return 2
  return 3
}

function seasonLabel(ts) {
  const d = new Date(ts || Date.now())
  return `${cnYear(d.getFullYear())}  ·  ${SEASONS[seasonOf(ts)]}`
}

function seasonKey(ts) {
  const d = new Date(ts || Date.now())
  return `${d.getFullYear()}-${seasonOf(ts)}`
}

function groupedEntries(list) {
  const groups = []
  for (const entry of list) {
    const key = seasonKey(entry.happenedAt)
    const last = groups[groups.length - 1]
    if (!last || last.key !== key) {
      groups.push({ key, label: seasonLabel(entry.happenedAt), items: [entry] })
    } else {
      last.items.push(entry)
    }
  }
  return groups
}

function isBackdrop(entry) {
  return entry.id === "e_site_backdrop" || String(entry.body || "").includes("<!--backdrop-->")
}

function backdropEntry() {
  return state.entries.find(isBackdrop)
}

function backdropUrl() {
  const entry = backdropEntry()
  const file = (entry?.files || []).find((item) => item.mime && item.mime.startsWith("image/"))
  return fileUrl(file)
}

function applyBackdrop() {
  const url = backdropUrl()
  const layer = $("backdrop")
  const img = $("backdrop-img")
  document.body.classList.toggle("has-backdrop", !!url)
  if (layer) layer.classList.toggle("hidden", !url)
  if (img) img.src = url || ""
}

function backdropFrame() {
  const width = Math.max(window.innerWidth || 360, 280)
  const height = Math.min(window.innerHeight * 0.58, 560)
  return { width, height, ratio: width / Math.max(height, 1) }
}

function cropOpen() {
  return !!(crop && !$("cropper")?.classList.contains("hidden"))
}

async function fileToObjectUrl(file) {
  if (file.blob) return { url: URL.createObjectURL(file.blob), revoke: true, name: file.name, mime: file.mime || "image/jpeg" }
  const remote = fileUrl(file)
  if (!remote) throw new Error("这张照片打不开")
  try {
    const res = await fetch(remote)
    if (!res.ok) throw new Error("读不到这张照片")
    const blob = await res.blob()
    return { url: URL.createObjectURL(blob), revoke: true, name: file.name, mime: file.mime || blob.type || "image/jpeg" }
  } catch (error) {
    return { url: remote, revoke: false, name: file.name, mime: file.mime || "image/jpeg" }
  }
}

async function openBackdropCrop(file) {
  const image = file && file.mime && file.mime.startsWith("image/") ? file : null
  if (!image) return alert("请先选一张照片")
  const source = await fileToObjectUrl(image)
  const layer = $("cropper")
  if (!layer) return
  closeCropper()
  const frame = backdropFrame()
  crop = {
    url: source.url,
    revoke: source.revoke,
    name: source.name || "backdrop.jpg",
    mime: source.mime,
    nw: 0,
    nh: 0,
    dw: 0,
    dh: 0,
    ox: 0,
    oy: 0,
    winX: 0,
    winY: 0,
    winW: 0,
    winH: 0,
    zoom: 1,
    ratio: frame.ratio,
    drag: null,
    pinch: null
  }
  document.body.classList.add("has-cropper")
  layer.classList.remove("hidden")
  layer.innerHTML = `
    <div class="cropper-card">
      <p class="kicker">裁进封面</p>
      <h2>选能看见的这一条</h2>
      <p class="crop-size" id="crop-size"></p>
      <p class="muted">封面背景只会留下屏幕上方一条横幅。亮着的金框就是现在这台设备上实际能看见的范围，框外会被裁掉。可拖动金框，也可把框收小，再对准想留下的地方。</p>
      <div class="crop-board" id="crop-board">
        <img id="crop-full" alt="" />
        <div class="crop-frame" id="crop-frame"></div>
      </div>
      <label class="crop-zoom">
        <span>框里看得更近</span>
        <input id="crop-zoom" type="range" min="1" max="2.6" step="0.01" value="1" />
      </label>
      <div class="crop-live">
        <span>封面上会是这样</span>
        <div class="crop-live-bar" id="crop-live"><img id="crop-live-img" alt="" /></div>
      </div>
      <div class="row-btns">
        <button class="btn plain" data-act="crop-cancel" type="button">取消</button>
        <button class="btn primary" data-act="crop-ok" type="button">用这一条</button>
      </div>
    </div>
  `
  const img = $("crop-full")
  const live = $("crop-live-img")
  img.onload = () => {
    crop.nw = img.naturalWidth
    crop.nh = img.naturalHeight
    layoutCrop(true)
  }
  img.onerror = () => alert("这张照片打不开")
  img.src = crop.url
  if (live) live.src = crop.url
}

function closeCropper() {
  const layer = $("cropper")
  if (crop?.revoke && crop.url) URL.revokeObjectURL(crop.url)
  crop = null
  document.body.classList.remove("has-cropper")
  if (layer) {
    layer.classList.add("hidden")
    layer.innerHTML = ""
  }
}

function clampCrop() {
  if (!crop) return
  crop.winX = Math.min(Math.max(0, crop.winX), Math.max(0, crop.dw - crop.winW))
  crop.winY = Math.min(Math.max(0, crop.winY), Math.max(0, crop.dh - crop.winH))
}

function layoutCrop(reset) {
  if (!crop || !crop.nw) return
  const board = $("crop-board")
  const img = $("crop-full")
  const frame = $("crop-frame")
  const size = $("crop-size")
  if (!board || !img || !frame) return
  crop.ratio = backdropFrame().ratio
  const fit = Math.min(board.clientWidth / crop.nw, board.clientHeight / crop.nh)
  crop.dw = crop.nw * fit
  crop.dh = crop.nh * fit
  crop.ox = (board.clientWidth - crop.dw) / 2
  crop.oy = (board.clientHeight - crop.dh) / 2
  const maxW = crop.dw / crop.dh >= crop.ratio ? crop.dh * crop.ratio : crop.dw
  const maxH = maxW / crop.ratio
  crop.winW = maxW / crop.zoom
  crop.winH = maxH / crop.zoom
  if (reset) {
    crop.winX = (crop.dw - crop.winW) / 2
    crop.winY = Math.max(0, (crop.dh - crop.winH) * 0.28)
  }
  clampCrop()
  img.style.width = `${crop.dw}px`
  img.style.height = `${crop.dh}px`
  img.style.left = `${crop.ox}px`
  img.style.top = `${crop.oy}px`
  frame.style.width = `${crop.winW}px`
  frame.style.height = `${crop.winH}px`
  frame.style.left = `${crop.ox + crop.winX}px`
  frame.style.top = `${crop.oy + crop.winY}px`
  const live = backdropFrame()
  if (size) size.textContent = `现在这台设备上，封面能看见的大约是 ${Math.round(live.width)} × ${Math.round(live.height)} 的一条横幅。`
  layoutCropLive()
}

function layoutCropLive() {
  const bar = $("crop-live")
  const img = $("crop-live-img")
  if (!crop || !bar || !img || !crop.dw) return
  const scale = bar.clientWidth / crop.winW
  img.style.width = `${crop.dw * scale}px`
  img.style.height = `${crop.dh * scale}px`
  img.style.left = `${-crop.winX * scale}px`
  img.style.top = `${-crop.winY * scale}px`
}

function moveCropBy(dx, dy) {
  if (!crop) return
  crop.winX += dx
  crop.winY += dy
  clampCrop()
  layoutCrop(false)
}

function setCropZoom(zoom, aroundX, aroundY) {
  if (!crop) return
  const next = Math.min(2.6, Math.max(1, zoom))
  const cx = aroundX == null ? crop.winX + crop.winW / 2 : aroundX
  const cy = aroundY == null ? crop.winY + crop.winH / 2 : aroundY
  const px = (cx - crop.winX) / crop.winW
  const py = (cy - crop.winY) / crop.winH
  crop.zoom = next
  const maxW = crop.dw / crop.dh >= crop.ratio ? crop.dh * crop.ratio : crop.dw
  crop.winW = maxW / crop.zoom
  crop.winH = crop.winW / crop.ratio
  crop.winX = cx - crop.winW * px
  crop.winY = cy - crop.winH * py
  clampCrop()
  layoutCrop(false)
}

async function confirmCrop() {
  if (!crop) return
  const img = $("crop-full")
  if (!img || !crop.nw) throw new Error("照片还没准备好")
  const sx = crop.winX / crop.dw * crop.nw
  const sy = crop.winY / crop.dh * crop.nh
  const sw = crop.winW / crop.dw * crop.nw
  const sh = crop.winH / crop.dh * crop.nh
  const outW = Math.min(2000, Math.max(640, Math.round(sw)))
  const outH = Math.max(1, Math.round(outW / crop.ratio))
  const canvas = document.createElement("canvas")
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext("2d")
  try {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
  } catch (error) {
    throw new Error("这张云端照片没法在这里裁，请到写下里重新选一次文件。")
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
  if (!blob) throw new Error("裁剪失败")
  await saveBackdrop([{
    id: uid("f"),
    name: "backdrop.jpg",
    mime: "image/jpeg",
    blob
  }])
  closeCropper()
  render()
}

async function saveBackdrop(files) {
  const image = (files || []).find((item) => item.mime && item.mime.startsWith("image/"))
  if (!image) return alert("请先选一张照片")
  const prev = backdropEntry()
  await persistEntry({
    id: prev?.id || "e_site_backdrop",
    objectId: prev?.objectId,
    type: "note",
    title: "册子背景",
    body: "<!--backdrop-->",
    who: "words",
    happenedAt: Date.now(),
    createdAt: prev?.createdAt || Date.now(),
    files: [image]
  })
  await loadAll()
  applyBackdrop()
}

async function clearBackdrop() {
  const prev = backdropEntry()
  if (!prev) return
  if (Cloud.on()) await Cloud.remove(prev)
  else await deleteEntry(prev.id)
  await loadAll()
  applyBackdrop()
}

function bookEntries(who) {
  const list = state.entries.filter((item) => !isBackdrop(item))
  if (who === "her") return list.filter((item) => inferWho(item) === "her")
  return list.filter((item) => inferWho(item) !== "her")
}

function mediaFiles(entry) {
  return (entry.files || []).filter((file) => file.mime.startsWith("image/") || file.mime.startsWith("video/"))
}

function entryYear(entry) {
  return new Date(entry.happenedAt || Date.now()).getFullYear()
}

function dayKey(ts) {
  const d = new Date(ts || Date.now())
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function latestBookYear() {
  if (state.tab === "her") {
    const first = groupByYear(herCards())[0]
    return first && first.year
  }
  const first = usYearGroups(bookEntries("us"))[0]
  return first && first.year
}

function isYearOpen(year) {
  if (Object.prototype.hasOwnProperty.call(state.openYears, year)) return !!state.openYears[year]
  return year === latestBookYear()
}

function herCards() {
  return bookEntries("her").map((entry) => ({
    entry,
    year: entryYear(entry),
    cover: mediaFiles(entry)[0] || null,
    count: mediaFiles(entry).length
  }))
}

function groupByYear(cards) {
  const years = []
  for (const card of cards) {
    const last = years[years.length - 1]
    if (!last || last.year !== card.year) years.push({ year: card.year, items: [card] })
    else last.items.push(card)
  }
  return years
}

function usYearGroups(list) {
  const days = []
  for (const entry of list) {
    const key = dayKey(entry.happenedAt)
    const last = days[days.length - 1]
    if (!last || last.key !== key) days.push({ key, at: entry.happenedAt, entries: [entry] })
    else last.entries.push(entry)
  }
  const years = []
  for (const day of days) {
    const year = new Date(day.at).getFullYear()
    let block = years[years.length - 1]
    if (!block || block.year !== year) {
      block = { year, seasons: [] }
      years.push(block)
    }
    const key = seasonKey(day.at)
    let season = block.seasons[block.seasons.length - 1]
    if (!season || season.key !== key) {
      season = { key, label: seasonLabel(day.at), days: [] }
      block.seasons.push(season)
    }
    season.days.push(day)
  }
  return years
}

function dayMedia(day) {
  return day.entries.flatMap((entry) => mediaFiles(entry).map((file) => ({ entry, file })))
}

function prettyTitle(entry) {
  if (entry.title && entry.title !== kindLabel(entry.type)) return entry.title
  const line = String(entry.body || "").split("\n").find((item) => item.trim())
  return line || ""
}

function bindLookSwipe(onStep) {
  const stage = $("look-stage")
  if (!stage) return
  let startX = 0
  stage.addEventListener("touchstart", (event) => {
    startX = event.changedTouches[0].clientX
  }, { passive: true })
  stage.addEventListener("touchend", (event) => {
    const dx = event.changedTouches[0].clientX - startX
    if (dx > 50) onStep(-1)
    if (dx < -50) onStep(1)
  })
}

function coverPhoto(who) {
  const list = who ? bookEntries(who) : state.entries
  for (const entry of list) {
    const photo = (entry.files || []).find((file) => file.mime.startsWith("image/"))
    if (photo) return photo
  }
  return null
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function toDatetimeLocal(ts) {
  const d = new Date(ts || Date.now())
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

async function filesFromInput(list) {
  return Array.from(list || []).map((file) => ({
    id: uid("f"),
    name: file.name,
    mime: file.type || "application/octet-stream",
    blob: file
  }))
}

function stashForm() {
  if (!$("f-title")) return
  state.draftTitle = $("f-title").value
  state.draftWhen = $("f-when")?.value || ""
  state.draftBody = $("f-body")?.value || ""
}

function clearDraft() {
  (state.draftUrls || []).forEach((url) => URL.revokeObjectURL(url))
  state.draftFiles = []
  state.draftUrls = []
  state.draftTitle = ""
  state.draftWhen = ""
  state.draftBody = ""
}

function addDraftFiles(list) {
  Array.from(list || []).forEach((file) => {
    const exists = state.draftFiles.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)
    if (exists) return
    state.draftFiles.push(file)
    state.draftUrls.push(URL.createObjectURL(file))
  })
}

function removeDraft(index) {
  const url = state.draftUrls[index]
  if (url) URL.revokeObjectURL(url)
  state.draftFiles.splice(index, 1)
  state.draftUrls.splice(index, 1)
}

function draftThumb(file, url) {
  if (file.type.startsWith("image/")) return `<img src="${url}" alt="" />`
  if (file.type.startsWith("video/")) return `<video src="${url}" muted playsinline></video>`
  return `<span class="draft-doc">${escapeHtml(file.name)}</span>`
}

function draftPreviewHtml(emptyText) {
  if (!state.draftFiles.length) {
    return `<p id="f-picked" class="muted">${emptyText}</p>`
  }
  return `<div id="f-picked" class="draft-row">
    ${state.draftFiles.map((file, i) => `
      <span class="draft-item">
        ${draftThumb(file, state.draftUrls[i])}
        <button type="button" data-draft-remove="${i}" aria-label="去掉">×</button>
      </span>
    `).join("")}
    <p class="muted">${state.draftFiles.length} 份，会收成一组</p>
  </div>`
}

function render() {
  if (state.tab === "add") stashForm()
  applyBackdrop()
  const titles = {
    door: ["贺紫钦", "从第一张照片起"],
    us: ["我们", "从你递来的第一张照片起"],
    add: ["写下", "把那天再放进来"]
  }
  if (state.tab === "her") state.tab = "us"
  if (!canWrite() && state.tab === "add") state.tab = "door"
  $("app")?.classList.toggle("is-book", state.tab !== "add")
  $("app")?.classList.toggle("is-remember", state.tab === "us")
  document.body.classList.toggle("is-view", !canWrite())
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("on", btn.dataset.tab === state.tab))
  $("page-title").textContent = titles[state.tab][0]
  $("page-sub").textContent = titles[state.tab][1]
  if (state.tab === "add") renderAdd()
  else if (state.tab === "us") renderUs()
  else renderDoor()
  const main = $("main")
  if (main) {
    const telling = state.tab === "us" && (state.tale.phase === "intro" || state.tale.phase === "play")
    main.dataset.enter = telling ? "tale" : state.tab === "add" ? "write" : state.tab === "door" ? "door" : "book"
  }
}

function doorHtml(who, name, line) {
  const photo = coverPhoto(who)
  return `<button class="door ${photo ? "has-film" : ""}" data-tab="${who}" type="button">
    ${photo ? `<i class="door-film"><img src="${fileUrl(photo)}" alt="" /></i>` : ""}
    <span class="door-copy">
      <strong>${name}</strong>
      <em>${line}</em>
    </span>
  </button>`
}

function renderDoor() {
  $("main").innerHTML = `
    <section class="cover">
      <div class="cover-title">
        <p class="cover-mark">写给贺紫钦</p>
        <h2 class="cover-name">贺紫钦</h2>
        <div class="flourish" aria-hidden="true"><span></span></div>
        <p class="cover-line">花也买过，信也写过。其实很舍不得。</p>
      </div>
    </section>
    <div class="doors single">
      ${doorHtml("us", "看我们", "第一张照片，到如今")}
    </div>
    ${canWrite() && state.entries.some(isTrial) ? `<p class="sub" style="text-align:center;margin-top:22px"><button class="link" data-act="clear-demo" type="button">清掉试片</button></p>` : ""}
  `
}

function yearFold(year, count, unit) {
  const open = isYearOpen(year)
  return `<button class="year-fold ${open ? "on" : ""}" data-year="${year}" type="button">
    <b>${cnYear(year)}</b>
    <span>${count}${unit}</span>
  </button>`
}

function thumbMedia(file, count) {
  if (!file) return `<span class="thumb-empty">字</span>`
  const video = file.mime.startsWith("video/")
  return `<span class="thumb ${count > 1 ? "is-set" : ""}">
    ${video
      ? `<video src="${fileUrl(file)}" muted playsinline preload="metadata"></video><i class="play-dot" aria-hidden="true"></i>`
      : `<img src="${fileUrl(file)}" alt="" loading="lazy" />`}
    ${count > 1 ? `<i class="thumb-count">${count}</i>` : ""}
  </span>`
}

function polaroidHtml(card) {
  return `<button class="polaroid" data-open="${card.entry.id}" type="button">
    <span class="film">
      ${thumbMedia(card.cover, card.count)}
      <span class="film-cap"><i>${formatDay(card.entry.happenedAt)}</i></span>
    </span>
  </button>`
}

function splitRows(items, rows) {
  const out = Array.from({ length: rows }, () => [])
  if (!items.length) return out
  items.forEach((item, i) => out[i % rows].push(item))
  out.forEach((row, i) => {
    if (!row.length) row.push(items[i % items.length])
  })
  return out
}

function wallHtml(items, htmlFn) {
  if (!items.length) return ""
  const rows = 4
  return `<div class="wall" data-wall>
    ${splitRows(items, rows).map((row, i) => {
      const inner = row.map(htmlFn).join("")
      return `<div class="track" data-track data-dir="${i % 2 ? 1 : -1}" data-speed="${20 + (i % 3) * 6}">
        <div class="track-set">${inner}</div>
        <div class="track-set" aria-hidden="true">${inner}</div>
      </div>`
    }).join("")}
  </div>`
}

function taleDone(book) {
  return sessionStorage.getItem(`om_tale_${book}`) === "1"
}

function markTaleDone(book) {
  if (book) sessionStorage.setItem(`om_tale_${book}`, "1")
}

function taleExcerpt(text) {
  const raw = String(text || "").trim()
  if (raw.length <= 80) return raw
  return `${raw.slice(0, 78)}…`
}

function taleScenes(book) {
  if (book === "her") {
    return herCards()
      .filter((card) => card.cover)
      .slice(0, 4)
      .map((card) => ({
        date: formatDay(card.entry.happenedAt),
        title: prettyTitle(card.entry),
        body: taleExcerpt(card.entry.body),
        file: card.cover,
        open: card.entry.id
      }))
  }
  return usYearGroups(bookEntries("us"))
    .flatMap((block) => block.seasons.flatMap((season) => season.days))
    .filter((day) => dayMedia(day).length)
    .slice(0, 4)
    .map((day) => {
      const titled = day.entries.find((item) => prettyTitle(item)) || day.entries[0]
      const body = day.entries.map((item) => item.body).find((item) => item && item.trim()) || ""
      return {
        date: formatDay(day.at),
        title: prettyTitle(titled),
        body: taleExcerpt(body),
        file: dayMedia(day)[0].file,
        day: day.key
      }
    })
}

function stopTaleTimer() {
  window.clearTimeout(taleWait)
  taleWait = 0
}

function beginTale(book, replay) {
  const scenes = taleScenes(book)
  if (!scenes.length || prefersQuietMotion()) {
    state.tale = { book, phase: "wall", index: 0, scenes: [] }
    if (scenes.length) markTaleDone(book)
    return
  }
  if (!replay && taleDone(book)) {
    state.tale = { book, phase: "wall", index: 0, scenes }
    return
  }
  state.tale = { book, phase: "intro", index: 0, scenes }
}

function finishTale() {
  stopTaleTimer()
  const book = state.tale.book || "us"
  markTaleDone(book)
  state.tale = { book, phase: "wall", index: 0, scenes: state.tale.scenes || [] }
  render()
}

function taleGo() {
  stopTaleTimer()
  if (!state.tale.scenes.length) return finishTale()
  state.tale.phase = "play"
  state.tale.index = 0
  render()
}

function taleHold(scene) {
  const n = String(scene?.body || "").length
  return Math.min(6200, Math.max(3800, 3000 + n * 22))
}

function taleMediaHtml(scene) {
  const video = scene.file && scene.file.mime.startsWith("video/")
  const drift = state.tale.index % 2 ? "drift-b" : "drift-a"
  if (video) return `<video class="tale-media incoming" src="${fileUrl(scene.file)}" muted playsinline autoplay></video>`
  return `<img class="tale-media incoming ${drift}" src="${fileUrl(scene.file)}" alt="" />`
}

function taleWordsHtml(scene) {
  return `
    <p class="tale-date">${escapeHtml(scene.date)}</p>
    ${scene.title ? `<h2>${escapeHtml(scene.title)}</h2>` : ""}
    ${scene.body ? `<p>${escapeHtml(scene.body)}</p>` : ""}
  `
}

function paintTaleStage() {
  $("main").innerHTML = `
    <section class="tale tale-play">
      <div class="tale-stage" data-act="tale-next">
        <div class="tale-film" id="tale-film"></div>
        <div class="tale-veil"></div>
        <div class="tale-words" id="tale-words"></div>
        <i class="tale-bar" id="tale-bar"></i>
        <div class="tale-dots" id="tale-dots"></div>
        <button class="link quiet tale-skip" data-act="skip-tale" type="button">自己翻</button>
      </div>
    </section>
  `
}

function showTaleScene() {
  const tale = state.tale
  const scene = tale.scenes[tale.index]
  if (!scene) return finishTale()
  if (!$("tale-film")) paintTaleStage()
  const film = $("tale-film")
  const words = $("tale-words")
  const bar = $("tale-bar")
  const dots = $("tale-dots")
  film.querySelectorAll(".tale-media").forEach((el) => {
    el.classList.remove("live", "incoming")
    el.classList.add("leaving")
  })
  film.insertAdjacentHTML("beforeend", taleMediaHtml(scene))
  const incoming = film.querySelector(".tale-media.incoming")
  window.requestAnimationFrame(() => {
    incoming?.classList.add("live")
    incoming?.classList.remove("incoming")
  })
  window.setTimeout(() => {
    film.querySelectorAll(".tale-media.leaving").forEach((el) => el.remove())
  }, 1200)
  if (words) {
    words.classList.remove("is-on")
    words.innerHTML = taleWordsHtml(scene)
    window.requestAnimationFrame(() => words.classList.add("is-on"))
  }
  if (dots) {
    dots.innerHTML = tale.scenes.map((_, i) => `<i class="${i === tale.index ? "on" : ""}"></i>`).join("")
  }
  const hold = taleHold(scene)
  if (bar) {
    bar.classList.remove("run")
    bar.style.setProperty("--tale-hold", `${hold}ms`)
    void bar.offsetWidth
    bar.classList.add("run")
  }
  const video = incoming && incoming.tagName === "VIDEO"
  if (video) {
    incoming.addEventListener("ended", () => {
      if (state.tale.phase === "play") taleNext()
    }, { once: true })
    scheduleTale(7000, taleNext)
    return
  }
  scheduleTale(hold, taleNext)
}

function taleNext() {
  stopTaleTimer()
  if (state.tale.phase !== "play") return
  const words = $("tale-words")
  if (words) words.classList.remove("is-on")
  window.setTimeout(() => {
    if (state.tale.phase !== "play") return
    if (state.tale.index >= state.tale.scenes.length - 1) return finishTale()
    state.tale.index += 1
    showTaleScene()
  }, 420)
}

function scheduleTale(ms, fn) {
  stopTaleTimer()
  if (prefersQuietMotion()) return fn()
  taleWait = window.setTimeout(fn, ms)
}

function typeText(el, text, done) {
  if (!el) return done && done()
  el.textContent = ""
  el.classList.add("is-typing")
  let i = 0
  const step = () => {
    if (state.tale.phase !== "intro") return
    i += 1
    el.textContent = text.slice(0, i)
    if (i >= text.length) {
      el.classList.remove("is-typing")
      return done && done()
    }
    window.setTimeout(step, 52)
  }
  step()
}

function playIntroWords(her) {
  const line = $("tale-line")
  const guide = $("tale-guide")
  const last = $("tale-guide-b")
  const first = "其实很爱"
  const second = "从你把第一张照片递过来的那一日起，花开过，信写过，上海的风也吹过你的衣角。紫色戴在你手上，墙纸还是你。有过退票，有过沉默，分别的时候，还是说不完那句不舍。"
  const third = "你下厨的那天，日子忽然变得很轻。伴手礼你买得很开心，我却在旁边悄悄吃醋。先看最近走过的几页，再让整本册子自己往前流。"
  if (prefersQuietMotion()) {
    if (line) line.textContent = first
    if (guide) guide.textContent = second
    if (last) last.textContent = third
    scheduleTale(3200, taleGo)
    return
  }
  typeText(line, first, () => {
    window.setTimeout(() => {
      typeText(guide, second, () => {
        window.setTimeout(() => {
          typeText(last, third, () => scheduleTale(2000, taleGo))
        }, 480)
      })
    }, 380)
  })
}

function renderTale() {
  const tale = state.tale
  const her = tale.book === "her"
  if (tale.phase === "intro") {
    $("main").innerHTML = `
      <section class="tale tale-intro">
        <p class="cover-mark tale-fade">先看我们</p>
        <h2 class="cover-name tale-fade late">我们</h2>
        <div class="flourish tale-fade late" aria-hidden="true"><span></span></div>
        <div class="tale-letter">
          <p class="cover-line tale-type" id="tale-line"></p>
          <p class="tale-guide tale-type" id="tale-guide"></p>
          <p class="tale-guide tale-type soft" id="tale-guide-b"></p>
        </div>
      </section>
    `
    playIntroWords(her)
    return
  }
  showTaleScene()
}

function renderHer() {
  if (state.tale.book === "her" && (state.tale.phase === "intro" || state.tale.phase === "play")) {
    return renderTale()
  }
  const cards = herCards()
  $("main").innerHTML = `
    <section class="book-head">
      <button class="cover-mark" data-tab="door" type="button">回到封面</button>
      <h2 class="cover-name">紫钦</h2>
      <div class="flourish slim" aria-hidden="true"><span></span></div>
      <p class="cover-line">二月十七以后，她的样子便常常回来。</p>
      ${cards.length ? `<button class="link quiet" data-act="replay-tale" type="button">从头看</button>` : ""}
    </section>
    ${cards.length ? wallHtml(cards, polaroidHtml) : `<div class="empty"><p>她的样子，还等你放进来。</p></div>`}
  `
  bindWalls()
}

function capsuleHtml(day) {
  const media = dayMedia(day)
  const letter = media.length === 0
  const cover = media[0]
  return `<button class="capsule ${letter ? "is-letter" : ""}" data-day="${day.key}" type="button">
    <span class="film">
      ${thumbMedia(cover && cover.file, media.length)}
      <span class="film-cap"><i>${formatDay(day.at)}</i></span>
    </span>
  </button>`
}

function findDay(key) {
  return usYearGroups(bookEntries("us"))
    .flatMap((block) => block.seasons.flatMap((season) => season.days))
    .find((item) => item.key === key)
}

function albumWords(entries) {
  const blocks = (entries || []).map((entry) => {
    const title = prettyTitle(entry)
    const body = entry.body
    if (!title && !body) return ""
    return `<section class="sheet-letter">
      ${title ? `<h3>${escapeHtml(title)}</h3>` : ""}
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
    </section>`
  }).join("")
  return blocks
}

function editTitleValue(entry) {
  if (entry.title && entry.title !== kindLabel(entry.type)) return entry.title
  return ""
}

function sheetEditHtml() {
  const entries = state.sheetEntries || []
  if (!entries.length) return `<p class="muted">这一页还没有可以改的字。</p>`
  return `
    <div class="sheet-edit">
      <p class="muted">只改字和日子，照片还在原来的地方。</p>
      ${entries.map((entry, i) => `
        <section class="sheet-letter">
          ${entries.length > 1 ? `<p class="sheet-date">第${CN_NUM[i + 1] || (i + 1)}段</p>` : ""}
          <input class="input" data-edit-title="${entry.id}" placeholder="${titlePlaceholder(entry.type)}" value="${escapeHtml(editTitleValue(entry))}" />
          <input class="input" type="datetime-local" data-edit-when="${entry.id}" value="${escapeHtml(toDatetimeLocal(entry.happenedAt))}" />
          <textarea data-edit-body="${entry.id}" placeholder="${entry.type === "letter" ? "想在信旁边写一句也可以。" : "写给这一组的话，点开墙会显示在右边。"}">${escapeHtml(entry.body || "")}</textarea>
        </section>
      `).join("")}
      <div class="row-btns">
        <button class="btn plain" data-act="cancel-edit" type="button">不改了</button>
        <button class="btn primary" data-act="save-edit" type="button">改好了</button>
      </div>
    </div>
  `
}

function beginSheetEdit() {
  const words = document.querySelector(".sheet-words")
  if (!words) return
  $("sheet-more")?.classList.add("hidden")
  words.innerHTML = sheetEditHtml()
}

function cancelSheetEdit() {
  const words = document.querySelector(".sheet-words")
  if (!words) return
  const entries = state.sheetEntries || []
  words.innerHTML = `${albumWords(entries)}${entries.map((entry) => fileDocs(entry.files)).join("")}`
}

async function saveSheetEdit() {
  const entries = state.sheetEntries || []
  if (!entries.length) return
  const btn = document.querySelector("[data-act='save-edit']")
  if (btn) {
    btn.disabled = true
    btn.textContent = "正在改…"
  }
  const ids = entries.map((entry) => entry.id)
  for (const entry of entries) {
    const titleEl = document.querySelector(`[data-edit-title="${entry.id}"]`)
    const whenEl = document.querySelector(`[data-edit-when="${entry.id}"]`)
    const bodyEl = document.querySelector(`[data-edit-body="${entry.id}"]`)
    if (!titleEl) continue
    const title = titleEl.value.trim()
    const when = whenEl?.value ? new Date(whenEl.value).getTime() : entry.happenedAt
    await persistEntry({
      ...entry,
      title: title || kindLabel(entry.type),
      body: (bodyEl?.value || "").trim(),
      happenedAt: when,
      files: entry.files || []
    })
  }
  const viewId = state.view
  await loadAll()
  render()
  const first = state.entries.find((item) => item.id === (viewId || ids[0]))
  if (viewId && first) openEntrySheet(viewId)
  else if (first && inferWho(first) !== "her") openDaySheet(dayKey(first.happenedAt))
  else if (first) openEntrySheet(first.id)
}

function albumIndex() {
  const n = state.sheetGallery.length
  if (!n) return 0
  return Math.max(0, Math.min(state.slide, n - 1))
}

function albumMedia(file, className) {
  const url = fileUrl(file)
  const cls = className ? ` class="${className}"` : ""
  if (file.mime.startsWith("video/")) {
    return `<video${cls} src="${url}" muted playsinline preload="metadata"></video>`
  }
  return `<img${cls} src="${url}" alt="" />`
}

function albumStageHtml() {
  const gallery = state.sheetGallery
  if (!gallery.length) return `<p class="muted sheet-empty">这一天，只留下了字。</p>`
  const index = albumIndex()
  state.slide = index
  const tile = gallery[index]
  return `
    <div class="sheet-stage" id="sheet-stage">
      <button class="sheet-pic" data-peek="${index}" type="button">
        ${albumMedia(tile.file)}
      </button>
      ${gallery.length > 1 ? `
        <button class="sheet-nav prev" data-album-step="-1" type="button">‹</button>
        <button class="sheet-nav next" data-album-step="1" type="button">›</button>
        <div class="sheet-dots">${gallery.map((_, i) => `<i class="${i === index ? "on" : ""}"></i>`).join("")}</div>
      ` : ""}
    </div>
  `
}

function stepAlbum(step) {
  const n = state.sheetGallery.length
  if (n < 2) return
  state.slide = (albumIndex() + step + n) % n
  paintAlbumStage()
}

function fitAlbumMedia() {
  const stage = $("sheet-stage")
  const media = document.querySelector("#sheet-stage .sheet-pic img, #sheet-stage .sheet-pic video")
  if (!stage || !media) return
  const apply = () => {
    const w = media.naturalWidth || media.videoWidth
    const h = media.naturalHeight || media.videoHeight
    if (!w || !h) return
    stage.style.setProperty("--photo-ratio", `${w} / ${h}`)
  }
  if ((media.naturalWidth || media.videoWidth) > 0) apply()
  media.addEventListener("load", apply, { once: true })
  media.addEventListener("loadedmetadata", apply, { once: true })
}

function paintAlbumStage() {
  const host = $("sheet-photos")
  if (!host) return
  host.innerHTML = albumStageHtml()
  fitAlbumMedia()
  bindAlbumSwipe()
}

function bindAlbumSwipe() {
  const stage = $("sheet-stage")
  if (!stage) return
  let startX = 0
  let moved = false
  const start = (x) => {
    startX = x
    moved = false
  }
  const end = (x) => {
    const dx = x - startX
    if (Math.abs(dx) < 46) return
    state.albumSwiped = true
    stepAlbum(dx > 0 ? -1 : 1)
  }
  stage.addEventListener("touchstart", (event) => start(event.changedTouches[0].clientX), { passive: true })
  stage.addEventListener("touchend", (event) => end(event.changedTouches[0].clientX), { passive: true })
  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-album-step]")) return
    start(event.clientX)
  })
  stage.addEventListener("pointerup", (event) => {
    if (event.target.closest("[data-album-step]")) return
    end(event.clientX)
  })
  stage.addEventListener("pointermove", (event) => {
    if (event.buttons && Math.abs(event.clientX - startX) > 12) moved = true
  })
}

function closePeek() {
  state.peek = -1
  const peek = $("peek")
  if (!peek) return
  peek.classList.add("hidden")
  peek.innerHTML = ""
}

function openPeek(index) {
  const tile = state.sheetGallery[index]
  const peek = $("peek")
  if (!tile || !peek) return
  state.peek = index
  const file = tile.file
  peek.classList.remove("hidden")
  peek.innerHTML = `
    <button class="peek-close" data-act="close-peek" type="button">合上</button>
    ${file.mime.startsWith("video/")
      ? `<video class="peek-media" src="${fileUrl(file)}" controls playsinline autoplay></video>`
      : `<img class="peek-media" src="${fileUrl(file)}" alt="" />`}
  `
}

function closeSheet() {
  closePeek()
  const sheet = $("sheet")
  if (!sheet) return
  sheet.classList.add("hidden")
  sheet.innerHTML = ""
  document.body.classList.remove("has-sheet")
  state.view = null
  state.dayKey = ""
  state.fileId = ""
  state.slide = 0
  state.sheetGallery = []
  state.sheetEntries = []
}

function openSheet({ title, date, gallery, entries, deleteId }) {
  const sheet = $("sheet")
  if (!sheet) return
  state.sheetGallery = gallery || []
  state.sheetEntries = entries || []
  state.slide = 0
  state.peek = -1
  state.albumSwiped = false
  document.body.classList.add("has-sheet")
  sheet.classList.remove("hidden")
  sheet.innerHTML = `
    <div class="sheet-card">
      <div class="sheet-top">
        <div>
          <p class="sheet-date">${escapeHtml(date)}</p>
          ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
        </div>
        <div class="sheet-tools">
          ${canWrite() ? `<button class="link quiet" data-act="toggle-more" type="button">···</button>` : ""}
          <button class="link quiet" data-act="close-sheet" type="button">合上</button>
        </div>
      </div>
      ${canWrite() ? `<div class="sheet-more hidden" id="sheet-more">
        <button class="link" data-act="edit-words" type="button">改几个字</button>
        <button class="link" data-act="use-backdrop" type="button">用作背景</button>
        ${deleteId ? `<button class="link danger-link" data-act="delete" data-id="${deleteId}" type="button">删去这一页</button>` : ""}
      </div>` : ""}
      <div class="sheet-split">
        <aside class="sheet-photos" id="sheet-photos">${albumStageHtml()}</aside>
        <article class="sheet-words">
          ${albumWords(entries)}
          ${entries.map((entry) => fileDocs(entry.files)).join("")}
        </article>
      </div>
    </div>
    <div id="peek" class="peek hidden"></div>
  `
  fitAlbumMedia()
  bindAlbumSwipe()
}

function openEntrySheet(id) {
  const entry = state.entries.find((item) => item.id === id)
  if (!entry) return
  state.view = id
  state.dayKey = ""
  openSheet({
    title: prettyTitle(entry),
    date: formatDay(entry.happenedAt),
    gallery: mediaFiles(entry).map((file) => ({ entry, file })),
    entries: [entry],
    deleteId: entry.id
  })
}

function openDaySheet(key) {
  const day = findDay(key)
  if (!day) return
  state.dayKey = key
  state.view = null
  const titled = day.entries.find((item) => prettyTitle(item))
  openSheet({
    title: prettyTitle(titled || day.entries[0]),
    date: formatDay(day.at),
    gallery: dayMedia(day),
    entries: day.entries,
    deleteId: day.entries.length === 1 ? day.entries[0].id : ""
  })
}

function renderUs() {
  if (state.tale.book === "us" && (state.tale.phase === "intro" || state.tale.phase === "play")) {
    return renderTale()
  }
  const days = usYearGroups(bookEntries("us")).flatMap((block) => block.seasons.flatMap((season) => season.days))
  $("main").innerHTML = `
    <section class="book-head">
      <button class="cover-mark" data-tab="door" type="button">回到封面</button>
      <h2 class="cover-name">我们</h2>
      <div class="flourish slim" aria-hidden="true"><span></span></div>
      <p class="cover-line">从第一张照片起，到分别时的不舍。</p>
      ${days.length ? `<button class="link quiet" data-act="replay-tale" type="button">从头看</button>` : ""}
    </section>
    ${days.length ? wallHtml(days, capsuleHtml) : `<div class="empty"><p>从初见那一日写起，也好。</p></div>`}
  `
  bindWalls()
}

function renderAdd() {
  if (state.compose === "video" || state.compose === "chat" || state.compose === "note") state.compose = "photo"
  state.about = "us"
  const type = state.compose
  const kinds = KINDS
  const letterAccept = "image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  $("main").innerHTML = `
    <div class="compose-types">
      ${kinds.map((item) => `<button class="btn ${type === item.type ? "primary" : "plain"}" data-compose="${item.type}" type="button">${item.label}</button>`).join("")}
    </div>
    <section class="card form">
      <input id="f-title" class="input" placeholder="${titlePlaceholder(type)}" value="${escapeHtml(state.draftTitle || "")}" />
      <input id="f-when" class="input" type="datetime-local" value="${escapeHtml(state.draftWhen || toDatetimeLocal(Date.now()))}" />
      <textarea id="f-body" placeholder="${type === "photo" ? "写给她看的话，点开会在照片旁边。" : "想在信边再留一句。"}">${escapeHtml(state.draftBody || "")}</textarea>
      ${type === "photo" ? `<label class="btn ghost file-btn">${state.draftFiles.length ? "再放入照片或视频" : "放入照片或视频"}<input id="f-files" type="file" accept="image/*,video/*" multiple /></label>` : ""}
      ${type === "letter" ? `
        <div class="row-btns">
          <label class="btn ghost file-btn">拍下手写信<input id="f-camera" type="file" accept="image/*" capture="environment" multiple /></label>
          <label class="btn ghost file-btn">放入照片、Word 或 PDF<input id="f-files" type="file" accept="${letterAccept}" multiple /></label>
        </div>
      ` : ""}
      ${type === "photo" ? draftPreviewHtml("照片和视频可以放在同一组，墙上只占一格。") : draftPreviewHtml("可拍多页手写，也可放入 Word、PDF。")}
      <button class="btn primary" id="f-save" type="button">放进我们的册子</button>
    </section>
    <section class="card form">
      <p class="muted">封面背景是屏幕上方一条横幅。选好照片后，会标出这台设备上实际能看见的范围，你再拖框裁好。</p>
      ${backdropUrl() ? `<img class="backdrop-pick" src="${backdropUrl()}" alt="" />` : ""}
      <div class="row-btns">
        <label class="btn ghost file-btn">换封面背景<input id="f-backdrop" type="file" accept="image/*" /></label>
        ${backdropEntry() ? `<button class="btn plain" data-act="clear-backdrop" type="button">还原底色</button>` : ""}
      </div>
    </section>
  `
}

function titlePlaceholder(type) {
  if (type === "photo") return "想叫这一天什么"
  if (type === "letter") return "这一封，想叫它什么"
  return "想叫这一天什么"
}

function renderMine() {
  const count = (who) => state.entries.filter((item) => inferWho(item) === who).length
  $("main").innerHTML = `
    <section class="cover">
      <p class="cover-mark">只给你们</p>
      <h2 class="cover-name">我们</h2>
      <div class="flourish" aria-hidden="true"><span></span></div>
      <p class="cover-line">贺紫钦，和这本册子</p>
    </section>
    <div class="stats">
      <div class="card stat"><b>${count("her")}</b><span>紫钦</span></div>
      <div class="card stat"><b>${count("us")}</b><span>我们</span></div>
      <div class="card stat"><b>${count("words")}</b><span>字</span></div>
    </div>
    <section class="card list">
      <h3>可以放进来</h3>
      <p>紫钦的照片、视频</p>
      <p>两个人的合照、视频</p>
      <p>想留下的对话、信、一句话</p>
    </section>
    <button class="btn danger block" data-act="clear" type="button" style="margin-top:18px">清空这本册子</button>
  `
}

function lookThumbs(gallery, index) {
  if (gallery.length < 2) return ""
  return `<div class="look-thumbs">${gallery.map((tile, i) => `
    <button class="look-thumb ${i === index ? "on" : ""}" data-slide-to="${i}" type="button">
      ${tile.file.mime.startsWith("video/")
        ? `<video src="${fileUrl(tile.file)}" muted playsinline preload="metadata"></video>`
        : `<img src="${fileUrl(tile.file)}" alt="" />`}
    </button>`).join("")}</div>
    <p class="look-count">${index + 1} / ${gallery.length}</p>`
}

function lookStage(gallery) {
  const index = Math.max(0, Math.min(state.slide, gallery.length - 1))
  state.slide = index
  const tile = gallery[index]
  if (!tile) return ""
  const file = tile.file
  return `
    <div id="look-stage" class="look-stage">
      ${gallery.length > 1 ? `<button class="look-nav prev" data-slide-step="-1" type="button">‹</button>` : ""}
      <div class="media-frame">
        ${file.mime.startsWith("video/")
          ? `<video class="hero-img" src="${fileUrl(file)}" controls playsinline></video>`
          : `<img class="hero-img" src="${fileUrl(file)}" alt="" />`}
      </div>
      ${gallery.length > 1 ? `<button class="look-nav next" data-slide-step="1" type="button">›</button>` : ""}
    </div>
    ${lookThumbs(gallery, index)}
  `
}

function renderLookPage({ title, date, words, gallery, docs, deleteId }) {
  $("page-title").textContent = title
  $("page-sub").textContent = date
  $("main").innerHTML = `
    <div class="flourish" aria-hidden="true"><span></span></div>
    ${gallery.length ? lookStage(gallery) : ""}
    ${words}
    ${docs}
    <div class="row-btns" style="margin-top:16px">
      <button class="btn plain" data-act="back" type="button">返回</button>
      ${deleteId ? `<button class="btn danger" data-act="delete" data-id="${deleteId}" type="button">删除</button>` : ""}
    </div>
  `
  bindLookSwipe((step) => {
    if (!gallery.length) return
    state.slide = (state.slide + step + gallery.length) % gallery.length
    const next = gallery[state.slide]
    if (next) {
      state.view = next.entry.id
      state.fileId = next.file.id || ""
    }
    render()
  })
}

function fileDocs(files) {
  return (files || []).map((file) => {
    if (file.mime.startsWith("image/") || file.mime.startsWith("video/")) return ""
    if (file.mime === "application/pdf" || /\.pdf$/i.test(file.name)) {
      return `<iframe class="preview-frame" src="${fileUrl(file)}" title="${escapeHtml(file.name)}"></iframe>`
    }
    return `<section class="card form"><p>${escapeHtml(file.name)}</p><a class="btn ghost" href="${fileUrl(file)}" download="${escapeHtml(file.name)}">打开这封信</a></section>`
  }).join("")
}

function renderDetail(id) {
  const entry = state.entries.find((item) => item.id === id)
  if (!entry) {
    state.view = null
    return render()
  }
  if (inferWho(entry) === "her") {
    const gallery = mediaFiles(entry).map((file) => ({ entry, file }))
    if (state.fileId) {
      const found = gallery.findIndex((tile) => tile.file.id === state.fileId)
      if (found >= 0) state.slide = found
    }
    state.slide = Math.min(state.slide, Math.max(gallery.length - 1, 0))
    renderLookPage({
      title: prettyTitle(entry) || "紫钦",
      date: formatDay(entry.happenedAt),
      words: entry.body ? `<section class="letter-sheet">${escapeHtml(entry.body)}</section>` : "",
      gallery,
      docs: "",
      deleteId: entry.id
    })
    return
  }
  const gallery = mediaFiles(entry).map((file) => ({ entry, file }))
  state.slide = Math.min(state.slide, Math.max(gallery.length - 1, 0))
  renderLookPage({
    title: prettyTitle(entry) || (inferWho(entry) === "us" ? "我们" : "字"),
    date: formatDay(entry.happenedAt),
    words: entry.body ? `<section class="letter-sheet">${escapeHtml(entry.body)}</section>` : "",
    gallery,
    docs: fileDocs(entry.files),
    deleteId: entry.id
  })
}

function renderDayLook(key) {
  const days = usYearGroups(bookEntries("us")).flatMap((block) => block.seasons.flatMap((season) => season.days))
  const day = days.find((item) => item.key === key)
  if (!day) {
    state.dayKey = ""
    return render()
  }
  const gallery = dayMedia(day)
  const words = day.entries.filter((item) => item.body).map((item) => `<section class="letter-sheet">${escapeHtml(item.body)}</section>`).join("")
  const docs = day.entries.map((item) => fileDocs(item.files)).join("")
  const titled = day.entries.find((item) => prettyTitle(item))
  state.slide = Math.min(state.slide, Math.max(gallery.length - 1, 0))
  renderLookPage({
    title: prettyTitle(titled || day.entries[0]),
    date: formatDay(day.at),
    words,
    gallery,
    docs,
    deleteId: day.entries.length === 1 ? day.entries[0].id : ""
  })
}

function isTrial(entry) {
  if (isBackdrop(entry)) return false
  return !!entry.demo || String(entry.title || "").startsWith("试片")
}

let lingerWait = 0
const trackSeeds = new WeakMap()

function updateLinger() {
  const walls = Array.from(document.querySelectorAll("[data-wall]"))
  if (!walls.length) return
  for (const wall of walls) {
    const items = Array.from(wall.querySelectorAll(".polaroid, .capsule"))
    if (!items.length) continue
    const box = wall.getBoundingClientRect()
    const hovered = items.find((el) => el.matches(":hover"))
    let best = hovered || null
    let bestDist = Infinity
    if (!hovered) {
      const mid = box.left + box.width * 0.4
      for (const el of items) {
        const item = el.getBoundingClientRect()
        if (item.right < box.left || item.left > box.right) continue
        if (item.bottom < box.top || item.top > box.bottom) continue
        const dist = Math.abs((item.left + item.right) / 2 - mid)
        if (dist < bestDist) {
          bestDist = dist
          best = el
        }
      }
    }
    for (const el of items) el.classList.toggle("is-lingering", el === best)
  }
}

function fillTrackSet(track) {
  const wall = track.closest("[data-wall]")
  const set = track.querySelector(".track-set")
  if (!wall || !set || !set.children.length) return 0
  if (!trackSeeds.has(set)) trackSeeds.set(set, set.innerHTML)
  const seed = trackSeeds.get(set)
  const copies = Array.from(track.querySelectorAll(".track-set"))
  const need = Math.max(wall.clientWidth, 360) + 32
  let guard = 0
  while (set.offsetWidth < need && guard < 8) {
    set.insertAdjacentHTML("beforeend", seed)
    guard += 1
  }
  copies.forEach((copy, i) => {
    if (i && copy.innerHTML !== set.innerHTML) copy.innerHTML = set.innerHTML
  })
  return set.offsetWidth
}

function syncTrackMotion(track) {
  const width = fillTrackSet(track) || 480
  track.style.setProperty("--wall-dur", `${Math.max(12, width / 42)}s`)
}

function bindWalls() {
  document.querySelectorAll("[data-track]").forEach((track) => {
    syncTrackMotion(track)
    track.querySelectorAll("img").forEach((img) => {
      if (img.complete) return
      img.addEventListener("load", () => syncTrackMotion(track), { once: true })
    })
  })
  document.querySelectorAll("[data-wall]").forEach((wall) => {
    wall.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".polaroid, .capsule")) wall.classList.add("is-paused")
    })
    wall.addEventListener("pointerup", () => {
      window.setTimeout(() => wall.classList.remove("is-paused"), 1000)
    })
    wall.addEventListener("pointercancel", () => wall.classList.remove("is-paused"))
    if (window.matchMedia("(hover: hover)").matches) {
      wall.addEventListener("pointerover", (event) => {
        if (event.target.closest(".polaroid, .capsule")) wall.classList.add("is-paused")
      })
      wall.addEventListener("pointerout", (event) => {
        const item = event.target.closest(".polaroid, .capsule")
        if (!item) return
        const next = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(".polaroid, .capsule")
        if (!next) wall.classList.remove("is-paused")
      })
    }
  })
  window.setTimeout(updateLinger, 80)
}

function queueLinger(immediate) {
  window.clearTimeout(lingerWait)
  if (immediate) {
    updateLinger()
    return
  }
  lingerWait = window.setTimeout(updateLinger, 180)
}

function bindEvents() {
  if ($("bgm-btn")) $("bgm-btn").addEventListener("click", toggleBgm)
  if ($("gate-btn")) $("gate-btn").addEventListener("click", unlock)
  if ($("gate-input")) {
    $("gate-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") unlock()
    })
  }
  document.querySelector(".tabbar")?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]")
    if (!tab) return
    switchTab(tab.dataset.tab)
  })
  $("main")?.addEventListener("click", onMainClick)
  $("sheet")?.addEventListener("click", onSheetClick)
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (cropOpen()) closeCropper()
      else if (state.peek >= 0) closePeek()
      else if (state.tale.phase === "intro" || state.tale.phase === "play") finishTale()
      else closeSheet()
      return
    }
    if (state.peek >= 0) return
    if (event.key === "ArrowLeft") stepAlbum(-1)
    if (event.key === "ArrowRight") stepAlbum(1)
  })
  $("main")?.addEventListener("change", onMainChange)
  $("main")?.addEventListener("pointerover", (event) => {
    const item = event.target.closest(".polaroid, .capsule")
    if (!item) return
    queueLinger(true)
  })
  $("main")?.addEventListener("pointerout", (event) => {
    const item = event.target.closest(".polaroid, .capsule")
    if (!item) return
    const next = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(".polaroid, .capsule")
    if (next === item) return
    queueLinger(true)
  })
  window.addEventListener("scroll", () => queueLinger(false), { passive: true })
  window.addEventListener("resize", () => {
    queueLinger(true)
    if (cropOpen()) layoutCrop(false)
  })
  const cropper = $("cropper")
  if (cropper) {
    cropper.addEventListener("click", async (event) => {
      const act = event.target.closest("[data-act]")
      if (!act) return
      if (act.dataset.act === "crop-cancel") {
        closeCropper()
        return
      }
      if (act.dataset.act === "crop-ok") {
        act.disabled = true
        act.textContent = "正在放上…"
        try {
          await confirmCrop()
        } catch (error) {
          alert(error.message || "换成背景失败")
          act.disabled = false
          act.textContent = "用这一条"
        }
      }
    })
    cropper.addEventListener("input", (event) => {
      if (event.target.id === "crop-zoom" && crop) setCropZoom(Number(event.target.value))
    })
    cropper.addEventListener("pointerdown", (event) => {
      if (!crop || !event.target.closest("#crop-board")) return
      event.preventDefault()
      const board = $("crop-board")
      if (board?.setPointerCapture) board.setPointerCapture(event.pointerId)
      if (!crop.pointers) crop.pointers = new Map()
      crop.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (crop.pointers.size === 2) {
        const pts = Array.from(crop.pointers.values())
        crop.pinch = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          zoom: crop.zoom
        }
        crop.drag = null
      } else {
        crop.drag = { x: event.clientX, y: event.clientY }
        crop.pinch = null
      }
    })
    cropper.addEventListener("pointermove", (event) => {
      if (!crop?.pointers?.has(event.pointerId)) return
      crop.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (crop.pointers.size === 2 && crop.pinch) {
        const pts = Array.from(crop.pointers.values())
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        if (crop.pinch.dist) setCropZoom(crop.pinch.zoom * (dist / crop.pinch.dist))
        const slider = $("crop-zoom")
        if (slider) slider.value = String(crop.zoom)
        return
      }
      if (!crop.drag) return
      moveCropBy(event.clientX - crop.drag.x, event.clientY - crop.drag.y)
      crop.drag = { x: event.clientX, y: event.clientY }
    })
    const endCropPointer = (event) => {
      if (!crop?.pointers) return
      crop.pointers.delete(event.pointerId)
      if (crop.pointers.size < 2) crop.pinch = null
      if (!crop.pointers.size) crop.drag = null
    }
    cropper.addEventListener("pointerup", endCropPointer)
    cropper.addEventListener("pointercancel", endCropPointer)
  }
}

function startBgm() {
  const audio = $("bgm")
  const btn = $("bgm-btn")
  if (!audio || !btn) return
  btn.classList.remove("hidden")
  audio.volume = 0.32
  const muted = sessionStorage.getItem("om_bgm") === "off"
  if (muted) {
    audio.pause()
    btn.classList.add("off")
    return
  }
  const play = audio.play()
  if (play && play.catch) {
    play.catch(() => btn.classList.add("off"))
  }
  btn.classList.toggle("off", audio.paused)
}

function toggleBgm() {
  const audio = $("bgm")
  const btn = $("bgm-btn")
  if (!audio || !btn) return
  if (audio.paused) {
    sessionStorage.setItem("om_bgm", "on")
    audio.play().catch(() => {})
    btn.classList.remove("off")
    return
  }
  sessionStorage.setItem("om_bgm", "off")
  audio.pause()
  btn.classList.add("off")
}

function prefersQuietMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function openTheBook() {
  const folio = $("folio")
  $("gate").classList.add("hidden")
  $("app").classList.remove("hidden")
  render()
  startBgm()
  if (!folio || prefersQuietMotion()) return
  folio.classList.remove("hidden", "is-open")
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => folio.classList.add("is-open"))
  })
  window.setTimeout(() => {
    folio.classList.add("hidden")
    folio.classList.remove("is-open")
  }, 1100)
}

function unlock() {
  const code = $("gate-input").value.trim()
  if (!ACCESS[code]) {
    $("gate-error").classList.remove("hidden")
    return
  }
  rememberGate(code)
  openTheBook()
}

function onSheetClick(event) {
  if (event.target.closest("[data-act='close-peek']") || event.target.id === "peek") {
    closePeek()
    return
  }
  const step = event.target.closest("[data-album-step]")
  if (step) {
    stepAlbum(Number(step.dataset.albumStep))
    return
  }
  const peekBtn = event.target.closest("[data-peek]")
  if (peekBtn) {
    if (state.albumSwiped) {
      state.albumSwiped = false
      return
    }
    openPeek(Number(peekBtn.dataset.peek))
    return
  }
  if (event.target.closest("[data-act='toggle-more']")) {
    $("sheet-more")?.classList.toggle("hidden")
    return
  }
  if (event.target.closest("[data-act='edit-words']")) {
    beginSheetEdit()
    return
  }
  if (event.target.closest("[data-act='cancel-edit']")) {
    cancelSheetEdit()
    return
  }
  if (event.target.closest("[data-act='save-edit']")) {
    saveSheetEdit().catch((error) => {
      alert(error.message || "改字失败")
      const btn = document.querySelector("[data-act='save-edit']")
      if (btn) {
        btn.disabled = false
        btn.textContent = "改好了"
      }
    })
    return
  }
  if (event.target.id === "sheet" || event.target.closest("[data-act='close-sheet']")) {
    closeSheet()
    return
  }
  onMainClick(event)
}

function switchTab(tab) {
  if (tab === "her") tab = "us"
  if (tab === "add" && !canWrite()) return
  if (tab === state.tab && (state.tale.phase === "intro" || state.tale.phase === "play")) {
    finishTale()
    return
  }
  if (tab === state.tab) return
  stopTaleTimer()
  closeSheet()
  if (tab !== "add") clearDraft()
  state.tab = tab
  state.view = null
  state.dayKey = ""
  state.fileId = ""
  state.slide = 0
  if (tab === "us") state.about = "us"
  if (tab === "us") beginTale(tab)
  else state.tale = { book: "", phase: "wall", index: 0, scenes: [] }
  render()
}

async function onMainClick(event) {
  const tab = event.target.closest("[data-tab]")
  if (tab) return switchTab(tab.dataset.tab)
  const about = event.target.closest("[data-about]")
  if (about) {
    state.about = about.dataset.about
    state.about = "us"
    render()
    return
  }
  const drop = event.target.closest("[data-draft-remove]")
  if (drop) {
    removeDraft(Number(drop.dataset.draftRemove))
    render()
    return
  }
  const compose = event.target.closest("[data-compose]")
  if (compose) {
    const next = compose.dataset.compose
    if (next !== "photo" && next !== "letter") clearDraft()
    state.compose = next
    if (state.compose === "photo") state.about = "us"
    render()
    return
  }
  const yearBtn = event.target.closest("[data-year]")
  if (yearBtn) {
    const year = Number(yearBtn.dataset.year)
    state.openYears[year] = !isYearOpen(year)
    render()
    return
  }
  const dayBtn = event.target.closest("[data-day]")
  if (dayBtn) {
    openDaySheet(dayBtn.dataset.day)
    return
  }
  const open = event.target.closest("[data-open]")
  if (open) {
    openEntrySheet(open.dataset.open)
    return
  }
  if (event.target.id === "f-save") return canWrite() ? saveCompose() : null
  const act = event.target.closest("[data-act]")
  if (!act) return
  if (act.dataset.act === "tale-go") {
    taleGo()
    return
  }
  if (act.dataset.act === "tale-next") {
    taleNext()
    return
  }
  if (act.dataset.act === "skip-tale") {
    finishTale()
    return
  }
  if (act.dataset.act === "replay-tale") {
    beginTale("us", true)
    render()
    return
  }
  if (!canWrite() && ["edit-words", "use-backdrop", "clear-backdrop", "delete", "clear-demo", "clear", "save-edit"].includes(act.dataset.act)) return
  if (act.dataset.act === "back" || act.dataset.act === "close-sheet") {
    closeSheet()
    return
  }
  if (act.dataset.act === "use-backdrop") {
    const tile = state.sheetGallery[albumIndex()]
    const file = tile && tile.file && tile.file.mime.startsWith("image/") ? tile.file : null
    if (!file) return alert("这一页不是照片")
    try {
      await openBackdropCrop(file)
    } catch (error) {
      alert(error.message || "打不开这张照片")
    }
    return
  }
  if (act.dataset.act === "clear-backdrop") {
    try {
      await clearBackdrop()
      render()
    } catch (error) {
      alert(error.message || "还原底色失败")
    }
    return
  }
  if (act.dataset.act === "delete") {
    if (!confirm(Cloud.on() ? "删除后所有打开这个网站的人都看不到这条。" : "删除后只从这台浏览器里去掉。")) return
    try {
      ;(act.dataset.id ? [act.dataset.id] : []).forEach((id) => {
        const entry = state.entries.find((item) => item.id === id)
        ;(entry?.files || []).forEach((file) => urlCache.delete(file.id))
      })
      const target = state.entries.find((item) => item.id === act.dataset.id)
      if (Cloud.on()) await Cloud.remove(target)
      else await deleteEntry(act.dataset.id)
      await loadAll()
      closeSheet()
      render()
    } catch (error) {
      alert(error.message || "删除失败")
    }
    return
  }
  if (act.dataset.act === "demo") {
    try {
      await loadDemo()
    } catch (error) {
      alert(error.message || "示例载入失败")
    }
    return
  }
  if (act.dataset.act === "clear-demo") {
    const trials = state.entries.filter(isTrial)
    if (!trials.length) return
    if (!confirm("只清掉试片，你自己放进来的会留着。")) return
    try {
      for (const entry of trials) {
        if (Cloud.on()) await Cloud.remove(entry)
        else await deleteEntry(entry.id)
      }
      await loadAll()
      render()
    } catch (error) {
      alert(error.message || "清掉试片失败")
    }
    return
  }
  if (act.dataset.act === "clear") {
    if (!confirm(Cloud.on() ? "将清空云端全部点滴，所有人都看不到。" : "将清空这台浏览器里的全部点滴。")) return
    try {
      for (const entry of state.entries) {
        if (Cloud.on()) await Cloud.remove(entry)
        else await deleteEntry(entry.id)
      }
      urlCache.forEach((url) => URL.revokeObjectURL(url))
      urlCache.clear()
      await loadAll()
      render()
    } catch (error) {
      alert(error.message || "清空失败")
    }
  }
}

async function onMainChange(event) {
  const input = event.target
  if (input.id === "f-chatfile" && input.files?.[0]) {
    const text = await input.files[0].text()
    const body = $("f-body")
    if (body) body.value = (body.value ? `${body.value}\n\n` : "") + text.slice(0, 20000)
    $("f-picked").textContent = `已读入 ${input.files[0].name}`
    return
  }
  if (input.id === "f-backdrop" && input.files?.[0]) {
    if (!canWrite()) return
    try {
      const files = await filesFromInput(input.files)
      input.value = ""
      await openBackdropCrop(files[0])
    } catch (error) {
      input.value = ""
      alert(error.message || "打不开这张照片")
    }
    return
  }
  if ((input.id === "f-files" || input.id === "f-camera") && input.files?.length) {
    addDraftFiles(input.files)
    input.value = ""
    render()
  }
}

async function saveCompose() {
  const type = state.compose
  stashForm()
  const title = (state.draftTitle || "").trim() || kindLabel(type)
  const when = state.draftWhen ? new Date(state.draftWhen).getTime() : Date.now()
  const body = (state.draftBody || "").trim()
  let files = []
  if (type === "photo" || type === "letter" || type === "video") {
    files = await filesFromInput(state.draftFiles)
  }
  if ((type === "photo" || type === "letter") && !files.length) {
    return alert(type === "letter" ? "请先拍下或放入这封信" : "请先放入照片或视频")
  }
  const who = type === "photo" || type === "video" ? "us" : "words"
  const entry = {
    id: uid("e"),
    type,
    title,
    body,
    who,
    happenedAt: when,
    createdAt: Date.now(),
    files
  }
  const btn = $("f-save")
  if (btn) {
    btn.disabled = true
    btn.textContent = Cloud.on() ? "正在上传…" : "正在保存…"
  }
  try {
    const saved = await persistEntry(entry)
    await loadAll()
    clearDraft()
    state.tab = "us"
    state.about = "us"
    stopTaleTimer()
    state.tale = { book: state.tab, phase: "wall", index: 0, scenes: [] }
    render()
    if (saved && (type === "photo" || type === "video" || type === "letter")) openEntrySheet(saved.id)
  } catch (error) {
    alert(error.message || "保存失败")
    if (btn) {
      btn.disabled = false
      btn.textContent = "放进册子"
    }
  }
}

async function runSelfTest() {
  rememberGate("heziqing")
  $("gate")?.classList.add("hidden")
  $("app")?.classList.remove("hidden")
  await putEntry({
    id: uid("e"),
    type: "note",
    title: "自测纪念日",
    body: "我们的点滴自测通过",
    happenedAt: Date.now(),
    createdAt: Date.now(),
    files: []
  })
  await loadAll()
  const ok = state.entries.some((item) => item.title === "自测纪念日")
  const text = `${ok ? "SELFTEST_OK" : "SELFTEST_FAIL"} entries=${state.entries.length}`
  document.title = text
  document.body.insertAdjacentHTML("afterbegin", `<pre id="selftest-result">${text}</pre>`)
  switchTab("us")
}

async function sampleFile(name, mime) {
  const res = await fetch(`./samples/${name}`)
  if (!res.ok) throw new Error(`缺少示例文件 ${name}`)
  const blob = await res.blob()
  return {
    id: uid("f"),
    name,
    mime: mime || blob.type || "application/octet-stream",
    blob
  }
}

function sampleRef(name, mime) {
  return {
    id: uid("f"),
    name,
    mime,
    url: `./samples/${name}`
  }
}

function daysAgo(days, hour) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour ?? 20, 18, 0, 0)
  return date.getTime()
}

async function loadDemo() {
  if (state.entries.some((item) => item.demo)) {
    alert("示例已经在故事里了，可先清空再载入。")
    return
  }
  const mountain = sampleRef("mountain.jpg", "image/jpeg")
  const river = sampleRef("river.jpg", "image/jpeg")
  const seaside = sampleRef("seaside.png", "image/png")
  const coffee = sampleRef("coffee.png", "image/png")
  const food = sampleRef("food.jpg", "image/jpeg")
  const night = sampleRef("night.jpg", "image/jpeg")
  const envelope = sampleRef("envelope.png", "image/png")
  const pdf = sampleRef("letter.pdf", "application/pdf")
  const samples = [
    {
      type: "note",
      title: "相识第 1 天",
      body: "图书馆关门的时候下了小雨。伞只有一把，后来谁也没再提这件事。",
      happenedAt: daysAgo(120, 21)
    },
    {
      type: "chat",
      title: "深夜闲聊",
      body: "她：还没睡？\n我：在改一份明天要交的东西。\n她：那我陪你一会儿。\n我：不用，你早点睡。\n她：我看着你写完再睡。\n我：……好。\n她：写完了喊我。\n我：嗯。",
      happenedAt: daysAgo(96, 23)
    },
    {
      type: "photo",
      title: "第一次出门",
      body: "走错了两次路，最后在江边把风筝线绕到一起。",
      happenedAt: daysAgo(80, 15),
      files: [mountain, river]
    },
    {
      type: "chat",
      title: "关于晚饭",
      body: "我：今晚想吃什么？\n她：随便。\n我：那火锅？\n她：不要。\n我：米线？\n她：不要。\n我：那你说。\n她：你再猜。\n我：那家咖啡店下面的面。\n她：对。",
      happenedAt: daysAgo(52, 18)
    },
    {
      type: "photo",
      title: "海边的下午",
      body: "风很大，话说到一半就被吹走了。椅子是空的，人就站在旁边。",
      happenedAt: daysAgo(36, 16),
      files: [seaside, coffee]
    },
    {
      type: "photo",
      title: "一顿普通的晚饭",
      body: "没有纪念日。就是那天刚好都有空。",
      happenedAt: daysAgo(18, 19),
      files: [food, night]
    },
    {
      type: "letter",
      title: "一封没有寄出的信",
      body: "给你：\n\n后来我想，那天晚上的路灯其实并不亮，只是你走在旁边，整条街都像被点着了。\n没有要你回信。把这一页留下，就够了。\n\n—— 写于相识第 100 天",
      happenedAt: daysAgo(7, 22),
      files: [envelope, pdf]
    }
  ]
  for (const item of samples) {
    await persistEntry({
      id: uid("e"),
      demo: true,
      files: item.files || [],
      createdAt: Date.now(),
      ...item
    })
  }
  await loadAll()
  state.tab = "door"
  state.view = null
  render()
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
      document.title = `SELFTEST_FAIL load ${error.message}`
      return
    }
    if (Cloud.on()) {
      alert(`云端读取失败：${error.message || "请检查云函数是否可用"}`)
    }
  }
  if (selftest) {
    try {
      await runSelfTest()
    } catch (error) {
      document.title = `SELFTEST_FAIL ${error.message}`
    }
    return
  }
  if (gateOpen()) {
    $("gate").classList.add("hidden")
    $("app").classList.remove("hidden")
    startBgm()
  }
  render()
}

boot()
