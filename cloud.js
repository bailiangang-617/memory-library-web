const Cloud = {
  on() {
    const cfg = window.CLOUD || {}
    return !!(cfg.enabled && cfg.functionUrl)
  },

  key() {
    const stored = sessionStorage.getItem("om_key")
    if (stored === "hzq" || stored === "heziqing") return stored
    return "heziqing"
  },

  async call(action, payload) {
    const send = async (key) => {
      const res = await fetch(window.CLOUD.functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Moments-Key": key
        },
        body: JSON.stringify({ action, key, ...payload })
      })
      const text = await res.text()
      let data = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch (error) {
        data = { error: text }
      }
      if (data.result && typeof data.result === "object") data = data.result
      return { res, data }
    }
    let pack
    try {
      pack = await send(this.key())
      if (this.key() === "hzq" && action === "list" && (!pack.res.ok || pack.data.ok === false)) {
        pack = await send("heziqing")
      }
    } catch (error) {
      throw new Error("连不上云端，请换浏览器重试")
    }
    const { res, data } = pack
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `云端请求失败 ${res.status}`)
    }
    return data
  },

  async uploadDirect(file, upload) {
    const headers = {
      "Content-Type": file.mime || "application/octet-stream"
    }
    if (upload.authorization) headers.Authorization = upload.authorization
    if (upload.token) headers["x-cos-security-token"] = upload.token
    if (upload.cosFileId) headers["x-cos-meta-fileid"] = upload.cosFileId
    const res = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers,
      body: file.blob
    })
    if (!res.ok) throw new Error(`直传失败 ${res.status}`)
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

  async uploadChunked(file) {
    if (file.blob.size > 80 * 1024) {
      throw new Error("文件太大，直传失败后不能再走小片上传。请换一张压缩过的照片，或稍后再试")
    }
    const chunks = await this.blobToChunks(file.blob)
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

  async uploadBlob(file) {
    try {
      const prepared = await this.call("prepareUpload", {
        file: { id: file.id, name: file.name, mime: file.mime }
      })
      const upload = prepared.upload || {}
      if (!upload.uploadUrl) throw new Error("没有拿到直传地址")
      await this.uploadDirect(file, upload)
      return {
        id: file.id,
        name: file.name,
        mime: file.mime,
        fileID: upload.fileID,
        url: upload.url || ""
      }
    } catch (error) {
      if (file.blob && file.blob.size <= 80 * 1024) return this.uploadChunked(file)
      throw error
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
