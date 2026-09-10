const Cloud = {
  on() {
    const cfg = window.CLOUD || {}
    return !!(cfg.enabled && cfg.functionUrl)
  },

  async call(action, payload) {
    let res
    try {
      res = await fetch(window.CLOUD.functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Moments-Key": "heziqing"
        },
        body: JSON.stringify({ action, key: "heziqing", ...payload })
      })
    } catch (error) {
      throw new Error("连不上云端，请换浏览器重试")
    }
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

  async blobToChunks(blob) {
    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const size = 4500
    const chunks = []
    for (let i = 0; i < bytes.length; i += size) {
      const slice = bytes.subarray(i, i + size)
      let binary = ""
      for (let j = 0; j < slice.length; j += 1) binary += String.fromCharCode(slice[j])
      chunks.push(btoa(binary))
    }
    return chunks
  },

  async uploadBlob(file) {
    const chunks = await this.blobToChunks(file.blob)
    if (!chunks.length) throw new Error("文件是空的")
    const fileIDs = []
    for (let index = 0; index < chunks.length; index += 1) {
      const part = await this.call("uploadChunk", {
        uploadId: file.id,
        index,
        total: chunks.length,
        data: chunks[index]
      })
      fileIDs.push(part.fileID)
    }
    const done = await this.call("finishUpload", {
      fileIDs,
      name: file.name,
      mime: file.mime
    })
    return {
      id: file.id,
      name: file.name,
      mime: file.mime,
      fileID: done.fileID,
      url: done.url || ""
    }
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
      out.push(await this.uploadBlob(file))
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
