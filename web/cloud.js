const Cloud = {
  on() {
    const cfg = window.CLOUD || {}
    return !!(cfg.enabled && cfg.functionUrl)
  },

  async call(action, payload) {
    const res = await fetch(window.CLOUD.functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Moments-Key": "heziqing"
      },
      body: JSON.stringify({ action, key: "heziqing", ...payload })
    })
    const text = await res.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch (error) {
      data = { error: text }
    }
    if (data.result && typeof data.result === "object") data = data.result
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `云端请求失败 ${res.status}`)
    }
    return data
  },

  async blobToBase64(blob) {
    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ""
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  },

  async packFiles(files) {
    const out = []
    for (const file of files || []) {
      if (file.url && !file.blob) {
        out.push({
          id: file.id,
          name: file.name,
          mime: file.mime,
          url: file.url,
          fileID: file.fileID || ""
        })
        continue
      }
      if (!file.blob) continue
      out.push({
        id: file.id,
        name: file.name,
        mime: file.mime,
        base64: await this.blobToBase64(file.blob)
      })
    }
    return out
  },

  fromRecord(row) {
    return {
      id: row.clientId || row.id || row._id,
      objectId: row.objectId || row._id,
      type: row.type,
      title: row.title,
      body: row.body || "",
      happenedAt: row.happenedAt,
      createdAt: row.createdAtClient || Date.now(),
      demo: !!row.demo,
      files: row.files || []
    }
  },

  async ready() {
    return true
  },

  async list() {
    const data = await this.call("list")
    return (data.entries || []).map((row) => this.fromRecord(row))
  },

  async save(entry) {
    const data = await this.call("save", {
      entry: {
        ...entry,
        files: await this.packFiles(entry.files)
      }
    })
    return this.fromRecord(data.entry || entry)
  },

  async remove(entry) {
    if (!entry?.objectId) return
    await this.call("remove", { objectId: entry.objectId })
  }
}

window.Cloud = Cloud
