/**
 * App 索引层 <-> 小程序回忆层
 *
 * App：对着系统相册建索引，不复制、不上传原图。
 * 小程序：只接收回忆集级精选结果，不接收整机 1 万张索引。
 *
 * 导出文件：memory-export-v1.json
 */
const EXPORT_VERSION = 1
const EXPORT_KIND = 'memory-library-export'

function createExportPayload(memories) {
  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    memories
  }
}

function parseExportPayload(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!data || data.kind !== EXPORT_KIND || data.version !== EXPORT_VERSION) {
    throw new Error('不是有效的回忆集导出文件')
  }
  if (!Array.isArray(data.memories)) {
    throw new Error('导出文件缺少回忆集')
  }
  return data
}

module.exports = {
  EXPORT_VERSION,
  EXPORT_KIND,
  createExportPayload,
  parseExportPayload
}
