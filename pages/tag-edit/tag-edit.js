const store = require('../../utils/store')
const { TAG_TYPES, TAG_TYPE_LABEL } = require('../../utils/models')

function buildGroups(selectedTagIds) {
  const selected = selectedTagIds || []
  return TAG_TYPES.map((type) => ({
    type,
    label: TAG_TYPE_LABEL[type],
    tags: store.listTags(type).map((tag) => ({
      ...tag,
      selected: selected.indexOf(tag.id) > -1
    }))
  }))
}

Page({
  data: {
    photoCount: 0,
    groups: [],
    selectedTagIds: []
  },

  onLoad(query) {
    this.photoIds = (query.ids || '').split(',').filter(Boolean)
    this.initialCommon = this.commonTagIds()
    this.setSelection(this.initialCommon.slice())
  },

  commonTagIds() {
    const lists = this.photoIds
      .map((id) => {
        const photo = store.getPhoto(id)
        return photo ? photo.tagIds.slice() : []
      })
    if (!lists.length) return []
    return lists.reduce((shared, list) => shared.filter((id) => list.indexOf(id) > -1))
  },

  setSelection(selectedTagIds) {
    this.setData({
      photoCount: this.photoIds.length,
      selectedTagIds,
      groups: buildGroups(selectedTagIds)
    })
  },

  toggleTag(event) {
    const { id } = event.currentTarget.dataset
    const selectedTagIds = this.data.selectedTagIds.slice()
    const index = selectedTagIds.indexOf(id)
    if (index > -1) selectedTagIds.splice(index, 1)
    else selectedTagIds.push(id)
    this.setSelection(selectedTagIds)
  },

  addTag(event) {
    const type = event.currentTarget.dataset.type
    wx.showModal({
      title: `添加${TAG_TYPE_LABEL[type]}`,
      editable: true,
      placeholderText: TAG_TYPE_LABEL[type],
      success: (res) => {
        if (!res.confirm) return
        const tag = store.findOrCreateTag(type, res.content)
        if (!tag) return
        const selectedTagIds = this.data.selectedTagIds.slice()
        if (selectedTagIds.indexOf(tag.id) === -1) selectedTagIds.push(tag.id)
        this.setSelection(selectedTagIds)
      }
    })
  },

  save() {
    const selected = new Set(this.data.selectedTagIds)
    const initial = new Set(this.initialCommon)
    const added = this.data.selectedTagIds.filter((id) => !initial.has(id))
    const removed = this.initialCommon.filter((id) => !selected.has(id))

    this.photoIds.forEach((id) => {
      const photo = store.getPhoto(id)
      if (!photo) return
      if (this.photoIds.length === 1) {
        store.replacePhotoTags(id, this.data.selectedTagIds)
        return
      }
      const next = photo.tagIds.filter((tagId) => removed.indexOf(tagId) === -1)
      added.forEach((tagId) => {
        if (next.indexOf(tagId) === -1) next.push(tagId)
      })
      store.replacePhotoTags(id, next)
    })
    wx.showToast({ title: '标签已更新', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 300)
  }
})
