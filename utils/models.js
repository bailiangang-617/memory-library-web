const { createId } = require('./id')

const TAG_TYPES = ['people', 'place', 'content', 'custom']

const TAG_TYPE_LABEL = {
  people: '人物',
  place: '地点',
  content: '内容',
  custom: '自定义'
}

function createPhoto(partial) {
  const now = Date.now()
  return {
    id: partial.id || createId('p'),
    filePath: partial.filePath,
    importedAt: partial.importedAt || now,
    shotAt: partial.shotAt || partial.importedAt || now,
    location: partial.location || null,
    width: partial.width || 0,
    height: partial.height || 0,
    size: partial.size || 0,
    tagIds: partial.tagIds || [],
    memoryIds: partial.memoryIds || []
  }
}

function createTag(type, name) {
  return {
    id: createId('t'),
    type,
    name: String(name || '').trim()
  }
}

function createMemory(partial) {
  const now = Date.now()
  return {
    id: partial.id || createId('m'),
    title: (partial.title || '未命名回忆集').trim(),
    description: (partial.description || '').trim(),
    coverPhotoId: partial.coverPhotoId || null,
    photoIds: partial.photoIds || [],
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now
  }
}

module.exports = {
  TAG_TYPES,
  TAG_TYPE_LABEL,
  createPhoto,
  createTag,
  createMemory
}
