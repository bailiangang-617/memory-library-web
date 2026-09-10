const tencentcloud = require("tencentcloud-sdk-nodejs-tcb")
const cloudbase = require("@cloudbase/node-sdk")

const TcbClient = tencentcloud.tcb.v20180608.Client
const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || "ziqinghuiyilu-d0gzmlqwm75797fd9"
const KEY = "heziqing"

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
})

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Moments-Key",
  "Content-Type": "application/json"
}

function ok(data) {
  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, ...data }) }
}

function fail(message, statusCode) {
  return { statusCode: statusCode || 400, headers: cors, body: JSON.stringify({ ok: false, error: message }) }
}

function parseBody(event) {
  if (event && event.action) return event
  let raw = event && event.body
  if (raw == null) return event || {}
  if (event.isBase64Encoded && typeof raw === "string") {
    raw = Buffer.from(raw, "base64").toString("utf8")
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw || "{}")
    } catch (error) {
      return {}
    }
  }
  return raw
}

function header(event, name) {
  const headers = event.headers || {}
  const target = name.toLowerCase()
  const found = Object.keys(headers).find((item) => item.toLowerCase() === target)
  return found ? headers[found] : ""
}

function lit(value) {
  if (value == null || value === "") return "NULL"
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value))
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  return `'${String(value).replace(/'/g, "''")}'`
}

function jsonb(value) {
  return `${lit(JSON.stringify(value || []))}::jsonb`
}

function sqlClient() {
  if (!process.env.TENCENTCLOUD_SECRETID || !process.env.TENCENTCLOUD_SECRETKEY) {
    throw new Error("云函数还没有管理密钥，请确认这是事件型云函数")
  }
  return new TcbClient({
    credential: {
      secretId: process.env.TENCENTCLOUD_SECRETID,
      secretKey: process.env.TENCENTCLOUD_SECRETKEY,
      token: process.env.TENCENTCLOUD_SESSIONTOKEN
    },
    region: process.env.TENCENTCLOUD_REGION || "ap-shanghai",
    profile: {
      httpProfile: { endpoint: "tcb.tencentcloudapi.com" }
    }
  })
}

function parseRows(result) {
  const data = result && (result.Response || result.data || result)
  const columns = data.Columns || data.columns || []
  const rows = data.Rows || data.rows || []
  return rows.map((row) => {
    const arr = typeof row === "string" ? JSON.parse(row) : row
    const item = {}
    columns.forEach((name, index) => {
      item[name] = arr[index]
    })
    return item
  })
}

async function findIdByClient(clientId) {
  if (!clientId) return ""
  const rows = await runSql(`SELECT id FROM public.moments WHERE client_id=${lit(clientId)} ORDER BY id DESC LIMIT 1`)
  return rows[0] && rows[0].id ? String(rows[0].id) : ""
}

async function runSql(sql) {
  const client = sqlClient()
  const result = await client.ExecutePGSql({
    EnvId: ENV_ID,
    Sql: sql
  })
  return parseRows(result)
}

function fromRow(row) {
  let files = row.files || []
  if (typeof files === "string") {
    try {
      files = JSON.parse(files)
    } catch (error) {
      files = []
    }
  }
  return {
    id: row.client_id || String(row.id),
    objectId: String(row.id),
    type: row.type,
    title: row.title,
    body: row.body || "",
    happenedAt: Number(row.happened_at || 0),
    createdAt: Number(row.created_at_client || Date.now()),
    demo: row.demo === true || row.demo === "t" || row.demo === "true",
    files
  }
}

async function refreshFiles(entries) {
  const ids = []
  for (const entry of entries) {
    for (const file of entry.files || []) {
      if (file.fileID) ids.push(file.fileID)
    }
  }
  if (!ids.length || typeof app.getTempFileURL !== "function") return entries
  const map = {}
  for (let i = 0; i < ids.length; i += 50) {
    const result = await app.getTempFileURL({ fileList: ids.slice(i, i + 50) })
    for (const row of result.fileList || []) {
      map[row.fileID] = row.tempFileURL || row.url || ""
    }
  }
  return entries.map((entry) => ({
    ...entry,
    files: (entry.files || []).map((file) => (
      file.fileID && map[file.fileID] ? { ...file, url: map[file.fileID] } : file
    ))
  }))
}

async function uploadOne(file) {
  if (file.fileID || (file.url && !file.base64)) {
    return {
      id: file.id,
      name: file.name,
      mime: file.mime,
      url: file.fileID ? "" : file.url || "",
      fileID: file.fileID || ""
    }
  }
  if (!file.base64) return null
  const ext = String(file.name || "file").split(".").pop() || "bin"
  const path = `moments/${file.id || Date.now()}.${ext}`.replace(/[^\w./-]/g, "")
  const uploaded = await app.uploadFile({
    cloudPath: path,
    fileContent: Buffer.from(file.base64, "base64")
  })
  return {
    id: file.id,
    name: file.name,
    mime: file.mime,
    fileID: uploaded.fileID,
    url: ""
  }
}

exports.main = async (event = {}) => {
  const method = event.httpMethod || event.requestContext && event.requestContext.httpMethod || "POST"
  if (String(method).toUpperCase() === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  const body = parseBody(event)
  const key = body.key || header(event, "x-moments-key")
  if (key !== KEY) return fail("口令不对", 401)

  try {
    if (body.action === "list") {
      const rows = await runSql("SELECT id, client_id, type, title, body, happened_at, created_at_client, demo, files FROM public.moments ORDER BY happened_at DESC LIMIT 200")
      return ok({ entries: await refreshFiles(rows.map(fromRow)) })
    }

    if (body.action === "save") {
      const entry = body.entry || {}
      const files = []
      for (const file of entry.files || []) {
        const next = await uploadOne(file)
        if (next) files.push(next)
      }
      const values = {
        client_id: entry.id,
        type: entry.type,
        title: entry.title,
        body: entry.body || "",
        happened_at: entry.happenedAt || Date.now(),
        created_at_client: entry.createdAt || Date.now(),
        demo: !!entry.demo,
        files
      }
      let objectId = entry.objectId
      if (objectId) {
        await runSql(`UPDATE public.moments SET
          client_id=${lit(values.client_id)},
          type=${lit(values.type)},
          title=${lit(values.title)},
          body=${lit(values.body)},
          happened_at=${lit(values.happened_at)},
          created_at_client=${lit(values.created_at_client)},
          demo=${lit(values.demo)},
          files=${jsonb(values.files)}
          WHERE id=${lit(Number(objectId))}`)
      } else {
        const rows = await runSql(`INSERT INTO public.moments
          (client_id, type, title, body, happened_at, created_at_client, demo, files)
          VALUES (
            ${lit(values.client_id)},
            ${lit(values.type)},
            ${lit(values.title)},
            ${lit(values.body)},
            ${lit(values.happened_at)},
            ${lit(values.created_at_client)},
            ${lit(values.demo)},
            ${jsonb(values.files)}
          ) RETURNING id`)
        objectId = rows[0] && rows[0].id
      }
      if (!objectId) objectId = await findIdByClient(values.client_id)
      const saved = (await refreshFiles([fromRow({ id: objectId, ...values, files })]))[0]
      return ok({ entry: saved })
    }

    if (body.action === "remove") {
      if (body.objectId) {
        await runSql(`DELETE FROM public.moments WHERE id=${lit(Number(body.objectId))}`)
      }
      return ok({})
    }

    return fail("未知操作")
  } catch (error) {
    return fail(error.message || "云函数执行失败", 500)
  }
}
