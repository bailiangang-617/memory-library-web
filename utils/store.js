/**
 * 本地优先存储。接口按「以后可换成云开发」来收口：
 * - 照片文件：用户目录 /photos
 * - 元数据：wx.setStorage（photos / tags / memories）
 *
 * 第二期若上云开发：同一套方法改为写云数据库 + 云存储，
 * 页面只依赖本模块，不直接碰 storage / 文件系统。
 */
const { createPhoto, createTag, createMemory } = require('./models')
const { formatMonthKey, formatMonthLabel, formatRange } = require('./format')

const STORAGE_KEY = 'memory_library_v1'
const PHOTO_DIR = `${wx.env.USER_DATA_PATH}/photos`

const emptyState = () => ({
  version: 1,
  photos: [],
  tags: [],
  memories: []
})

let cache = emptyState()

function clone(data) {
  return JSON.parse(JSON.stringify(data))
}

function persist() {
  wx.setStorageSync(STORAGE_KEY, cache)
}

function ensureDir() {
  const fs = wx.getFileSystemManager()
  try {
    fs.accessSync(PHOTO_DIR)
  } catch (error) {
    fs.mkdirSync(PHOTO_DIR, true)
  }
}

function init() {
  ensureDir()
  const saved = wx.getStorageSync(STORAGE_KEY)
  cache = saved && saved.version === 1
    ? {
        version: 1,
        photos: saved.photos || [],
        tags: saved.tags || [],
        memories: saved.memories || []
      }
    : emptyState()
}

function getState() {
  return clone(cache)
}

function getPhoto(id) {
  return clone(cache.photos.find((item) => item.id === id) || null)
}

function getMemory(id) {
  return clone(cache.memories.find((item) => item.id === id) || null)
}

function getTag(id) {
  return clone(cache.tags.find((item) => item.id === id) || null)
}

function listTags(type) {
  const tags = type ? cache.tags.filter((item) => item.type === type) : cache.tags
  return clone(tags).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

function findOrCreateTag(type, name) {
  const normalized = String(name || '').trim()
  if (!normalized) return null
  let tag = cache.tags.find((item) => item.type === type && item.name === normalized)
  if (!tag) {
    tag = createTag(type, normalized)
    cache.tags.push(tag)
    persist()
  }
  return clone(tag)
}

function attachTags(photoIds, tagIds) {
  const idSet = new Set(tagIds)
  cache.photos.forEach((photo) => {
    if (!photoIds.includes(photo.id)) return
    idSet.forEach((tagId) => {
      if (!photo.tagIds.includes(tagId)) photo.tagIds.push(tagId)
    })
  })
  persist()
}

function replacePhotoTags(photoId, tagIds) {
  const photo = cache.photos.find((item) => item.id === photoId)
  if (!photo) return
  photo.tagIds = [...new Set(tagIds)]
  persist()
}

function updatePhoto(photoId, patch) {
  const photo = cache.photos.find((item) => item.id === photoId)
  if (!photo) return null
  if (patch.shotAt) photo.shotAt = patch.shotAt
  if (Object.prototype.hasOwnProperty.call(patch, 'location')) {
    photo.location = patch.location
  }
  persist()
  return clone(photo)
}

function savePhotoFile(tempFilePath, photoId) {
  ensureDir()
  const extMatch = /\.(\w+)$/.exec(tempFilePath)
  const ext = extMatch ? extMatch[1] : 'jpg'
  const dest = `${PHOTO_DIR}/${photoId}.${ext}`
  const fs = wx.getFileSystemManager()
  fs.copyFileSync(tempFilePath, dest)
  return dest
}

function addPhotos(entries) {
  const photos = entries.map((entry) => createPhoto(entry))
  cache.photos = photos.concat(cache.photos)
  persist()
  return clone(photos)
}

function deletePhotos(photoIds) {
  const idSet = new Set(photoIds)
  const fs = wx.getFileSystemManager()
  cache.photos.forEach((photo) => {
    if (!idSet.has(photo.id)) return
    try {
      fs.unlinkSync(photo.filePath)
    } catch (error) {
      // 文件可能已被清理，忽略
    }
  })
  cache.photos = cache.photos.filter((photo) => !idSet.has(photo.id))
  cache.memories.forEach((memory) => {
    memory.photoIds = memory.photoIds.filter((id) => !idSet.has(id))
    if (idSet.has(memory.coverPhotoId)) {
      memory.coverPhotoId = memory.photoIds[0] || null
    }
  })
  persist()
}

function addMemory(partial) {
  const memory = createMemory(partial)
  if (!memory.coverPhotoId && memory.photoIds[0]) {
    memory.coverPhotoId = memory.photoIds[0]
  }
  cache.memories.unshift(memory)
  syncPhotoMemories(memory.id, memory.photoIds, [])
  persist()
  return clone(memory)
}

function updateMemory(memoryId, partial) {
  const memory = cache.memories.find((item) => item.id === memoryId)
  if (!memory) return null
  const previousIds = memory.photoIds.slice()
  if (partial.title != null) memory.title = String(partial.title).trim() || '未命名回忆集'
  if (partial.description != null) memory.description = String(partial.description).trim()
  if (partial.photoIds) memory.photoIds = partial.photoIds.slice()
  if (Object.prototype.hasOwnProperty.call(partial, 'coverPhotoId')) {
    memory.coverPhotoId = partial.coverPhotoId
  }
  if (!memory.coverPhotoId && memory.photoIds[0]) {
    memory.coverPhotoId = memory.photoIds[0]
  }
  memory.updatedAt = Date.now()
  syncPhotoMemories(memory.id, memory.photoIds, previousIds)
  persist()
  return clone(memory)
}

function deleteMemory(memoryId) {
  cache.memories = cache.memories.filter((item) => item.id !== memoryId)
  cache.photos.forEach((photo) => {
    photo.memoryIds = photo.memoryIds.filter((id) => id !== memoryId)
  })
  persist()
}

function syncPhotoMemories(memoryId, nextIds, prevIds) {
  const nextSet = new Set(nextIds)
  const prevSet = new Set(prevIds)
  cache.photos.forEach((photo) => {
    if (nextSet.has(photo.id) && !photo.memoryIds.includes(memoryId)) {
      photo.memoryIds.push(memoryId)
    }
    if (prevSet.has(photo.id) && !nextSet.has(photo.id)) {
      photo.memoryIds = photo.memoryIds.filter((id) => id !== memoryId)
    }
  })
}

function addPhotosToMemory(memoryId, photoIds) {
  const memory = cache.memories.find((item) => item.id === memoryId)
  if (!memory) return null
  const merged = memory.photoIds.slice()
  photoIds.forEach((id) => {
    if (!merged.includes(id)) merged.push(id)
  })
  return updateMemory(memoryId, { photoIds: merged })
}

function decoratePhoto(photo) {
  const tags = photo.tagIds
    .map((id) => cache.tags.find((tag) => tag.id === id))
    .filter(Boolean)
  return {
    ...clone(photo),
    tags,
    people: tags.filter((tag) => tag.type === 'people'),
    places: tags.filter((tag) => tag.type === 'place'),
    contents: tags.filter((tag) => tag.type === 'content'),
    customs: tags.filter((tag) => tag.type === 'custom'),
    locationName: photo.location && photo.location.name ? photo.location.name : '',
    inMemory: photo.memoryIds.length > 0
  }
}

function matchesFilter(photo, filter) {
  if (!filter) return true
  if (filter.monthKey && formatMonthKey(photo.shotAt) !== filter.monthKey) return false
  if (filter.tagId && !photo.tagIds.includes(filter.tagId)) return false
  if (filter.inMemory === 'yes' && photo.memoryIds.length === 0) return false
  if (filter.inMemory === 'no' && photo.memoryIds.length > 0) return false
  if (filter.keyword) {
    const keyword = filter.keyword.trim().toLowerCase()
    const tags = photo.tagIds
      .map((id) => cache.tags.find((tag) => tag.id === id))
      .filter(Boolean)
      .map((tag) => tag.name)
    const locationName = photo.location && photo.location.name ? photo.location.name : ''
    const haystack = tags.concat(locationName).join(' ').toLowerCase()
    if (!haystack.includes(keyword)) return false
  }
  return true
}

function listPhotos(filter) {
  return cache.photos
    .filter((photo) => matchesFilter(photo, filter))
    .sort((a, b) => (b.shotAt || 0) - (a.shotAt || 0))
    .map(decoratePhoto)
}

function groupPhotosByMonth(photos) {
  const groups = []
  const index = {}
  photos.forEach((photo) => {
    const key = formatMonthKey(photo.shotAt)
    if (!index[key]) {
      index[key] = {
        key,
        label: formatMonthLabel(photo.shotAt),
        photos: []
      }
      groups.push(index[key])
    }
    index[key].photos.push(photo)
  })
  return groups
}

function listMemories() {
  return cache.memories.map((memory) => decorateMemory(memory))
}

function decorateMemory(memory) {
  const photos = memory.photoIds
    .map((id) => cache.photos.find((photo) => photo.id === id))
    .filter(Boolean)
    .map(decoratePhoto)
  const cover = photos.find((photo) => photo.id === memory.coverPhotoId) || photos[0] || null
  const times = photos.map((photo) => photo.shotAt).filter(Boolean)
  const startAt = times.length ? Math.min.apply(null, times) : memory.createdAt
  const endAt = times.length ? Math.max.apply(null, times) : memory.createdAt
  return {
    ...clone(memory),
    photos,
    cover,
    photoCount: photos.length,
    rangeLabel: formatRange(startAt, endAt)
  }
}

function getStats() {
  return {
    photoCount: cache.photos.length,
    memoryCount: cache.memories.length,
    tagCount: cache.tags.length
  }
}

function clearAll() {
  const fs = wx.getFileSystemManager()
  cache.photos.forEach((photo) => {
    try {
      fs.unlinkSync(photo.filePath)
    } catch (error) {
      // ignore
    }
  })
  cache = emptyState()
  persist()
}

function importAppExport(payload) {
  const { parseExportPayload } = require('../shared/contract')
  const data = parseExportPayload(payload)
  let created = 0
  data.memories.forEach((item) => {
    const exists = cache.memories.some((memory) => memory.id === item.id || memory.title === item.title)
    if (exists) return
    const photoIds = (item.photos || []).map((photo) => {
      const existing = cache.photos.find((row) => row.id === photo.assetId)
      if (existing) return existing.id
      const createdPhoto = createPhoto({
        id: photo.assetId,
        filePath: '',
        importedAt: Date.now(),
        shotAt: photo.shotAt,
        location: photo.location,
        tagIds: []
      })
      cache.photos.unshift(createdPhoto)
      if (photo.location && photo.location.name) {
        const tag = findOrCreateTag('place', photo.location.name)
        if (tag && !createdPhoto.tagIds.includes(tag.id)) createdPhoto.tagIds.push(tag.id)
      }
      return createdPhoto.id
    })
    cache.memories.unshift(createMemory({
      id: item.id,
      title: item.title,
      description: item.description,
      coverPhotoId: item.coverAssetId || photoIds[0] || null,
      photoIds
    }))
    created += 1
  })
  persist()
  return { memoryCount: created, total: data.memories.length }
}

function listMonthOptions() {
  const map = {}
  cache.photos.forEach((photo) => {
    const key = formatMonthKey(photo.shotAt)
    map[key] = formatMonthLabel(photo.shotAt)
  })
  return Object.keys(map)
    .sort()
    .reverse()
    .map((key) => ({ key, label: map[key] }))
}

module.exports = {
  init,
  getState,
  getPhoto,
  getMemory,
  getTag,
  listTags,
  findOrCreateTag,
  attachTags,
  replacePhotoTags,
  updatePhoto,
  savePhotoFile,
  addPhotos,
  deletePhotos,
  addMemory,
  updateMemory,
  deleteMemory,
  addPhotosToMemory,
  listPhotos,
  groupPhotosByMonth,
  listMemories,
  decoratePhoto,
  decorateMemory,
  getStats,
  clearAll,
  listMonthOptions,
  importAppExport
}
