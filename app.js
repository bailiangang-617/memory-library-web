const ACCESS_CODE = "heziqing"
const DB_NAME = "our-moments-v1"

const KINDS = [
  { type: "chat", label: "聊天" },
  { type: "photo", label: "照片" },
  { type: "video", label: "视频" },
  { type: "letter", label: "电子信" },
  { type: "note", label: "一句话" }
]

const FILTERS = [
  { id: "all", label: "全部" },
  { id: "her", label: "紫钦" },
  { id: "us", label: "我们" },
  { id: "words", label: "字" }
]

const MONTHS = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]
const CN_NUM = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"]

const state = {
  tab: "story",
  entries: [],
  filter: "all",
  view: null,
  compose: "photo",
  about: "her"
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

async function persistEntry(entry) {
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

function monthLabel(ts) {
  const d = new Date(ts || Date.now())
  return `${cnYear(d.getFullYear())}  ·  ${MONTHS[d.getMonth()]}`
}

function monthKey(ts) {
  const d = new Date(ts || Date.now())
  return `${d.getFullYear()}-${d.getMonth()}`
}

function groupedEntries(list) {
  const groups = []
  for (const entry of list) {
    const key = monthKey(entry.happenedAt)
    const last = groups[groups.length - 1]
    if (!last || last.key !== key) {
      groups.push({ key, label: monthLabel(entry.happenedAt), items: [entry] })
    } else {
      last.items.push(entry)
    }
  }
  return groups
}

function coverPhoto() {
  for (const entry of state.entries) {
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

function filteredEntries() {
  if (state.filter === "all") return state.entries
  return state.entries.filter((item) => inferWho(item) === state.filter)
}

function render() {
  const titles = {
    story: ["册子", "与紫钦的日子"],
    add: ["写下", "想留给她的，都可以放进来"],
    mine: ["我们", "这本册子只给你们两个人"]
  }
  $("app")?.classList.toggle("is-album", state.tab === "story" && !state.view)
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
  const photo = coverPhoto()
  const cover = `
    <section class="cover">
      ${photo ? `<img class="leaf-photo" src="${fileUrl(photo)}" alt="" style="height:180px;border-radius:8px;margin:0 0 16px" />` : ""}
      <p class="cover-mark">给她的册子</p>
      <h2 class="cover-name">贺紫钦</h2>
      <div class="flourish" aria-hidden="true"><span></span></div>
      <p class="cover-line">${state.entries.length ? `已有 ${state.entries.length} 页回忆` : "还没把那天放进来"}</p>
    </section>
    <div class="links">
      ${FILTERS.map((item) => `<button class="link ${state.filter === item.id ? "on" : ""}" data-filter="${item.id}" type="button">${item.label}</button>`).join("")}
    </div>
  `
  if (!state.entries.length) {
    $("main").innerHTML = `${cover}<div class="empty"><p>照片、视频、对话或一封信，都可以从「写下」放进来。</p></div>`
    return
  }
  if (!list.length) {
    $("main").innerHTML = `${cover}<div class="empty"><p>这一面还是空的。</p></div>`
    return
  }
  $("main").innerHTML = cover + groupedEntries(list).map((group) => `
    <div class="chapter">${group.label}</div>
    ${group.items.map(cardHtml).join("")}
  `).join("")
}

function cardHtml(entry) {
  const photos = (entry.files || []).filter((file) => file.mime.startsWith("image/"))
  const videos = (entry.files || []).filter((file) => file.mime.startsWith("video/"))
  const title = entry.title && entry.title !== kindLabel(entry.type) ? entry.title : ""
  const letter = inferWho(entry) === "words"
  return `<button class="leaf ${letter ? "letter-leaf" : ""}" data-open="${entry.id}" type="button">
    ${photos[0] ? `<img class="leaf-photo" src="${fileUrl(photos[0])}" alt="" />` : ""}
    ${!photos[0] && videos[0] ? `<video class="leaf-video" src="${fileUrl(videos[0])}" muted></video>` : ""}
    <div class="leaf-meta">
      <p class="leaf-date">${formatDay(entry.happenedAt)}</p>
      ${title ? `<h3>${escapeHtml(title)}</h3>` : ""}
      ${entry.body ? `<div class="excerpt">${escapeHtml(entry.body)}</div>` : ""}
    </div>
  </button>`
}

function renderAdd() {
  const type = state.compose
  const media = type === "photo" || type === "video"
  $("main").innerHTML = `
    <div class="compose-types">
      ${KINDS.map((item) => `<button class="btn ${type === item.type ? "primary" : "plain"}" data-compose="${item.type}" type="button">${item.label}</button>`).join("")}
    </div>
    <section class="card form">
      ${media ? `<div class="about-row">
        <button class="btn ${state.about === "her" ? "primary" : "plain"}" data-about="her" type="button">紫钦</button>
        <button class="btn ${state.about === "us" ? "primary" : "plain"}" data-about="us" type="button">我们</button>
      </div>` : ""}
      <input id="f-title" class="input" placeholder="${titlePlaceholder(type)}" />
      <input id="f-when" class="input" type="datetime-local" value="${toDatetimeLocal(Date.now())}" />
      <textarea id="f-body" placeholder="${type === "chat" ? "把想留下的那几句贴进来。" : "想在旁边写一句吗？也可以不写。"}"></textarea>
      ${type === "chat" ? `<label class="btn ghost file-btn">从导出的对话读入<input id="f-chatfile" type="file" accept=".txt,.html,.htm,text/plain,text/html" /></label>` : ""}
      ${type === "photo" ? `<label class="btn ghost file-btn">放入照片<input id="f-files" type="file" accept="image/*" multiple /></label>` : ""}
      ${type === "video" ? `<label class="btn ghost file-btn">放入视频<input id="f-files" type="file" accept="video/*" multiple /></label>` : ""}
      ${type === "letter" ? `<label class="btn ghost file-btn">放入信<input id="f-files" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>` : ""}
      <p id="f-picked" class="muted"></p>
      <button class="btn primary" id="f-save" type="button">放进册子</button>
    </section>
  `
}

function titlePlaceholder(type) {
  if (type === "chat") return "可以写一个名字，比如 那天晚上"
  if (type === "photo") return "可以写一句，比如 她侧过身的时候"
  if (type === "video") return "这段视频，想叫它什么"
  if (type === "letter") return "这封信"
  return "比如 在一起的某一天"
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

function renderDetail(id) {
  const entry = state.entries.find((item) => item.id === id)
  if (!entry) {
    state.view = null
    return render()
  }
  const whoLabel = inferWho(entry) === "her" ? "紫钦" : inferWho(entry) === "us" ? "我们" : "字"
  $("page-title").textContent = entry.title && entry.title !== kindLabel(entry.type) ? entry.title : whoLabel
  $("page-sub").textContent = formatDay(entry.happenedAt)
  const files = entry.files || []
  $("main").innerHTML = `
    <div class="flourish" aria-hidden="true"><span></span></div>
    ${entry.body ? `<section class="letter-sheet">${escapeHtml(entry.body)}</section>` : ""}
    ${files.map((file) => {
      if (file.mime.startsWith("image/")) return `<div class="media-frame"><img class="hero-img" src="${fileUrl(file)}" alt="${escapeHtml(file.name)}" /></div>`
      if (file.mime.startsWith("video/")) return `<div class="media-frame"><video class="hero-img" src="${fileUrl(file)}" controls></video></div>`
      if (file.mime === "application/pdf" || /\.pdf$/i.test(file.name)) {
        return `<iframe class="preview-frame" src="${fileUrl(file)}" title="${escapeHtml(file.name)}"></iframe>`
      }
      return `<section class="card form"><p>${escapeHtml(file.name)}</p><a class="btn ghost" href="${fileUrl(file)}" download="${escapeHtml(file.name)}">打开这封信</a></section>`
    }).join("")}
    <div class="row-btns" style="margin-top:16px">
      <button class="btn plain" data-act="back" type="button">返回</button>
      <button class="btn danger" data-act="delete" data-id="${entry.id}" type="button">删除</button>
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
  const about = event.target.closest("[data-about]")
  if (about) {
    state.about = about.dataset.about
    render()
    return
  }
  const compose = event.target.closest("[data-compose]")
  if (compose) {
    state.compose = compose.dataset.compose
    if (state.compose === "photo" || state.compose === "video") state.about = state.about || "her"
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
      state.view = null
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
  if (type === "chat" && !body) return alert("请贴上想留下的那几句")
  if (type === "note" && !body) return alert("请写一句想记住的话")
  if ((type === "photo" || type === "video" || type === "letter") && !files.length) {
    return alert("请先放入文件")
  }
  const who = type === "photo" || type === "video" ? (state.about || "her") : "words"
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
    state.tab = "story"
    state.filter = "all"
    state.view = saved.id
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("on", tab.dataset.tab === "story"))
    render()
  } catch (error) {
    alert(error.message || "保存失败")
    if (btn) {
      btn.disabled = false
      btn.textContent = "放进册子"
    }
  }
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
  if (sessionStorage.getItem("om_ok") === "1") {
    $("gate").classList.add("hidden")
    $("app").classList.remove("hidden")
  }
  render()
}

boot()
