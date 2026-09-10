const ACCESS_CODE = "huiyi"
const DB_NAME = "our-moments-v1"
const MAX_EDGE = 1280

const KINDS = [
  { type: "chat", label: "聊天" },
  { type: "photo", label: "照片" },
  { type: "video", label: "视频" },
  { type: "letter", label: "电子信" },
  { type: "note", label: "一句话" }
]

const state = {
  tab: "story",
  entries: [],
  filter: "all",
  view: null,
  compose: "chat"
}

let dbPromise = null
let memoryOnly = false
const memoryDb = { entries: [] }
const urlCache = new Map()

function $(id) {
  return document.getElementById(id)
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function kindLabel(type) {
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
  const entries = await getAll()
  state.entries = entries.sort((a, b) => (b.happenedAt || 0) - (a.happenedAt || 0))
}

function fileUrl(file) {
  if (!file || !file.blob) return ""
  if (!urlCache.has(file.id)) urlCache.set(file.id, URL.createObjectURL(file.blob))
  return urlCache.get(file.id)
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatDay(ts) {
  const d = new Date(ts || Date.now())
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function toDatetimeLocal(ts) {
  const d = new Date(ts || Date.now())
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function compressImage(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve({ blob: file, width: 0, height: 0 })
      return
    }
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
        resolve({ blob: blob || file, width: canvas.width, height: canvas.height })
      }, "image/jpeg", 0.82)
    }
    img.onerror = () => {
      URL.revokeObjectURL(src)
      resolve({ blob: file, width: 0, height: 0 })
    }
    img.src = src
  })
}

async function filesFromInput(list) {
  const out = []
  for (const file of Array.from(list || [])) {
    const packed = await compressImage(file)
    out.push({
      id: uid("f"),
      name: file.name,
      mime: file.type || "application/octet-stream",
      blob: packed.blob
    })
  }
  return out
}

function filteredEntries() {
  if (state.filter === "all") return state.entries
  return state.entries.filter((item) => item.type === state.filter)
}

function render() {
  const titles = {
    story: ["故事", `已记下 ${state.entries.length} 个点滴`],
    add: ["记下", "聊天摘录、照片、视频或一封信"],
    mine: ["我们的点滴", "只存在这台设备的浏览器里"]
  }
  if (!state.view) {
    $("page-title").textContent = titles[state.tab][0]
    $("page-sub").textContent = titles[state.tab][1]
  }
  if (state.view) return renderDetail(state.view)
  if (state.tab === "add") return renderAdd()
  if (state.tab === "mine") return renderMine()
  return renderStory()
}

function renderStory() {
  const list = filteredEntries()
  if (!state.entries.length) {
    $("main").innerHTML = `<div class="empty"><h2>还没有点滴</h2><p>先记下一段聊天、一组照片，或一封信。也可以先载入示例，看看效果。</p><div class="row-btns" style="justify-content:center"><button class="btn primary" data-act="demo" type="button">载入示例故事</button><button class="btn plain" data-tab="add" type="button">自己记下</button></div></div>`
    return
  }
  $("main").innerHTML = `
    <div class="chips">
      <button class="chip ${state.filter === "all" ? "on" : ""}" data-filter="all" type="button">全部</button>
      ${KINDS.map((item) => `<button class="chip ${state.filter === item.type ? "on" : ""}" data-filter="${item.type}" type="button">${item.label}</button>`).join("")}
    </div>
    ${list.length ? list.map(cardHtml).join("") : `<div class="empty"><h2>这一类还是空的</h2><p>换一个筛选，或再记一条。</p></div>`}
  `
}

function cardHtml(entry) {
  const photos = (entry.files || []).filter((file) => file.mime.startsWith("image/"))
  const videos = (entry.files || []).filter((file) => file.mime.startsWith("video/"))
  const docs = (entry.files || []).filter((file) => !file.mime.startsWith("image/") && !file.mime.startsWith("video/"))
  return `<button class="card story-card" data-open="${entry.id}" type="button">
    <div class="kind">${kindLabel(entry.type)}</div>
    <h3>${escapeHtml(entry.title || kindLabel(entry.type))}</h3>
    <div class="when">${formatDay(entry.happenedAt)}</div>
    ${entry.body ? `<div class="excerpt">${escapeHtml(entry.body)}</div>` : ""}
    ${photos.length || videos.length ? `<div class="media-row">
      ${photos.map((file) => `<img src="${fileUrl(file)}" alt="" />`).join("")}
      ${videos.map((file) => `<video src="${fileUrl(file)}" muted></video>`).join("")}
    </div>` : ""}
    ${docs.map((file) => `<div class="letter-name">${escapeHtml(file.name)}</div>`).join("")}
  </button>`
}

function renderAdd() {
  const type = state.compose
  $("main").innerHTML = `
    <div class="compose-types">
      ${KINDS.map((item) => `<button class="btn ${type === item.type ? "primary" : "plain"}" data-compose="${item.type}" type="button">${item.label}</button>`).join("")}
    </div>
    <section class="card form">
      <input id="f-title" class="input" placeholder="${titlePlaceholder(type)}" />
      <input id="f-when" class="input" type="datetime-local" value="${toDatetimeLocal(Date.now())}" />
      ${type === "chat" || type === "note" ? `<textarea id="f-body" placeholder="${type === "chat" ? "把要留下的那段对话粘贴进来。也可以从电脑版微信导出后再复制。" : "写一句当时想记住的话。"}"></textarea>` : ""}
      ${type === "chat" ? `<label class="btn ghost file-btn">从导出的 txt / html 读入<input id="f-chatfile" type="file" accept=".txt,.html,.htm,text/plain,text/html" /></label>` : ""}
      ${type === "photo" ? `<label class="btn ghost file-btn">选择照片<input id="f-files" type="file" accept="image/*" multiple /></label>` : ""}
      ${type === "video" ? `<label class="btn ghost file-btn">选择视频<input id="f-files" type="file" accept="video/*" multiple /></label>` : ""}
      ${type === "letter" ? `<label class="btn ghost file-btn">选择 Word / PDF<input id="f-files" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>` : ""}
      <p id="f-picked" class="muted"></p>
      <button class="btn primary" id="f-save" type="button">收进故事</button>
    </section>
    <p class="sub">读不到微信里正在聊的内容。聊天请自己导出或粘贴摘录。文件不会上传到服务器。</p>
  `
}

function titlePlaceholder(type) {
  if (type === "chat") return "这段对话可以叫什么，比如 深夜闲聊"
  if (type === "photo") return "这组照片，比如 第一次旅行"
  if (type === "video") return "这段视频"
  if (type === "letter") return "这封信的名字"
  return "这一句，比如 相识 100 天"
}

function renderMine() {
  const count = (type) => state.entries.filter((item) => item.type === type).length
  $("main").innerHTML = `
    <div class="stats">
      <div class="card stat"><b>${state.entries.length}</b><span>点滴</span></div>
      <div class="card stat"><b>${count("chat") + count("letter")}</b><span>聊天/信</span></div>
      <div class="card stat"><b>${count("photo") + count("video")}</b><span>影像</span></div>
    </div>
    <section class="card list">
      <h3>可以记下</h3>
      <p>微信聊天摘录（粘贴或导入导出文件）</p>
      <p>照片、视频</p>
      <p>电子信：Word / PDF</p>
      <p>一句纪念日备注</p>
    </section>
    <section class="card list">
      <h3>做不到</h3>
      <p class="muted">自动读取微信正在聊的记录</p>
      <p class="muted">扫描整机相册</p>
      <p class="muted">把内容存到网站服务器上</p>
    </section>
    <button class="btn ghost block" data-act="demo" type="button">载入示例故事</button>
    <button class="btn danger block" data-act="clear" type="button" style="margin-top:10px">清空本机故事</button>
  `
}

function renderDetail(id) {
  const entry = state.entries.find((item) => item.id === id)
  if (!entry) {
    state.view = null
    return render()
  }
  $("page-title").textContent = entry.title || kindLabel(entry.type)
  $("page-sub").textContent = `${kindLabel(entry.type)} · ${formatDay(entry.happenedAt)}`
  const files = entry.files || []
  $("main").innerHTML = `
    ${entry.body ? `<section class="card form"><div class="excerpt" style="max-height:none">${escapeHtml(entry.body)}</div></section>` : ""}
    ${files.map((file) => {
      if (file.mime.startsWith("image/")) return `<img class="hero-img" src="${fileUrl(file)}" alt="${escapeHtml(file.name)}" />`
      if (file.mime.startsWith("video/")) return `<video class="hero-img" src="${fileUrl(file)}" controls></video>`
      if (file.mime === "application/pdf" || /\.pdf$/i.test(file.name)) {
        return `<iframe class="preview-frame" src="${fileUrl(file)}" title="${escapeHtml(file.name)}"></iframe>`
      }
      return `<section class="card form"><p>${escapeHtml(file.name)}</p><a class="btn ghost" href="${fileUrl(file)}" download="${escapeHtml(file.name)}">打开 / 下载这封信</a><p class="muted">Word 文件请下载后用本地软件查看。</p></section>`
    }).join("")}
    <div class="row-btns" style="margin-top:16px">
      <button class="btn danger" data-act="delete" data-id="${entry.id}" type="button">删除这条</button>
      <button class="btn plain" data-act="back" type="button">返回</button>
    </div>
  `
}

function bindEvents() {
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
  $("main")?.addEventListener("change", onMainChange)
}

function unlock() {
  if ($("gate-input").value.trim() !== ACCESS_CODE) {
    $("gate-error").classList.remove("hidden")
    return
  }
  sessionStorage.setItem("om_ok", "1")
  $("gate").classList.add("hidden")
  $("app").classList.remove("hidden")
}

function switchTab(tab) {
  state.tab = tab
  state.view = null
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("on", btn.dataset.tab === tab))
  render()
}

async function onMainClick(event) {
  const tab = event.target.closest("[data-tab]")
  if (tab) return switchTab(tab.dataset.tab)
  const filter = event.target.closest("[data-filter]")
  if (filter) {
    state.filter = filter.dataset.filter
    render()
    return
  }
  const compose = event.target.closest("[data-compose]")
  if (compose) {
    state.compose = compose.dataset.compose
    render()
    return
  }
  const open = event.target.closest("[data-open]")
  if (open) {
    state.view = open.dataset.open
    render()
    return
  }
  if (event.target.id === "f-save") return saveCompose()
  const act = event.target.closest("[data-act]")
  if (!act) return
  if (act.dataset.act === "back") {
    state.view = null
    render()
    return
  }
  if (act.dataset.act === "delete") {
    if (!confirm("删除后只从这台浏览器里去掉，原文件还在你手机或电脑上。")) return
    ;(act.dataset.id ? [act.dataset.id] : []).forEach((id) => {
      const entry = state.entries.find((item) => item.id === id)
      ;(entry?.files || []).forEach((file) => urlCache.delete(file.id))
    })
    await deleteEntry(act.dataset.id)
    await loadAll()
    state.view = null
    render()
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
  if (act.dataset.act === "clear") {
    if (!confirm("将清空这台浏览器里的全部点滴。")) return
    for (const entry of state.entries) {
      await deleteEntry(entry.id)
    }
    urlCache.forEach((url) => URL.revokeObjectURL(url))
    urlCache.clear()
    await loadAll()
    render()
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
  if (input.id === "f-files" && input.files?.length) {
    $("f-picked").textContent = `已选 ${input.files.length} 个文件`
  }
}

async function saveCompose() {
  const type = state.compose
  const title = $("f-title")?.value.trim() || kindLabel(type)
  const when = $("f-when")?.value ? new Date($("f-when").value).getTime() : Date.now()
  const body = $("f-body")?.value.trim() || ""
  const fileInput = $("f-files")
  let files = []
  if (fileInput?.files?.length) files = await filesFromInput(fileInput.files)
  if (type === "chat" && !body) return alert("请粘贴要留下的聊天内容")
  if (type === "note" && !body) return alert("请写一句想记住的话")
  if ((type === "photo" || type === "video" || type === "letter") && !files.length) {
    return alert("请先选择文件")
  }
  const entry = {
    id: uid("e"),
    type,
    title,
    body,
    happenedAt: when,
    createdAt: Date.now(),
    files
  }
  await putEntry(entry)
  await loadAll()
  state.tab = "story"
  state.filter = "all"
  state.view = entry.id
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("on", btn.dataset.tab === "story"))
  render()
}

async function runSelfTest() {
  sessionStorage.setItem("om_ok", "1")
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
  switchTab("story")
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
  const [mountain, river, seaside, coffee, food, night, envelope, pdf] = await Promise.all([
    sampleFile("mountain.jpg", "image/jpeg"),
    sampleFile("river.jpg", "image/jpeg"),
    sampleFile("seaside.png", "image/png"),
    sampleFile("coffee.png", "image/png"),
    sampleFile("food.jpg", "image/jpeg"),
    sampleFile("night.jpg", "image/jpeg"),
    sampleFile("envelope.png", "image/png"),
    sampleFile("letter.pdf", "application/pdf")
  ])
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
    await putEntry({
      id: uid("e"),
      demo: true,
      files: item.files || [],
      createdAt: Date.now(),
      ...item
    })
  }
  await loadAll()
  state.tab = "story"
  state.filter = "all"
  state.view = null
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("on", btn.dataset.tab === "story"))
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
  }
  if (selftest) {
    try {
      await runSelfTest()
    } catch (error) {
      document.title = `SELFTEST_FAIL ${error.message}`
    }
    return
  }
  if (sessionStorage.getItem("om_ok") === "1") {
    $("gate").classList.add("hidden")
    $("app").classList.remove("hidden")
  }
  render()
}

boot()
