const store = require('../../utils/store')
const { TAG_TYPE_LABEL } = require('../../utils/models')
const { formatDateTime } = require('../../utils/format')

Page({
  data: {
    photo: null,
    timeLabel: '',
    typeLabel: TAG_TYPE_LABEL
  },

  onLoad(query) {
    this.photoId = query.id
  },

  onShow() {
    this.reload()
  },

  reload() {
    const raw = store.getPhoto(this.photoId)
    if (!raw) {
      wx.showToast({ title: '照片不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 400)
      return
    }
    const photo = store.decoratePhoto(raw)
    this.setData({
      photo,
      timeLabel: formatDateTime(photo.shotAt)
    })
  },

  preview() {
    wx.previewImage({
      current: this.data.photo.filePath,
      urls: [this.data.photo.filePath]
    })
  },

  editTags() {
    wx.navigateTo({ url: `/pages/tag-edit/tag-edit?ids=${this.photoId}` })
  },

  addToMemory() {
    const memories = store.listMemories()
    if (!memories.length) {
      wx.navigateTo({ url: `/pages/memory-edit/memory-edit?photoIds=${this.photoId}` })
      return
    }
    wx.showActionSheet({
      itemList: ['新建回忆集'].concat(memories.slice(0, 5).map((item) => item.title)),
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/memory-edit/memory-edit?photoIds=${this.photoId}` })
          return
        }
        store.addPhotosToMemory(memories[res.tapIndex - 1].id, [this.photoId])
        this.reload()
        wx.showToast({ title: '已加入回忆集', icon: 'success' })
      }
    })
  },

  editLocation() {
    wx.showModal({
      title: '补充地点',
      editable: true,
      placeholderText: '例如 厦门 / 家里',
      content: this.data.photo.locationName || '',
      success: (res) => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        const prev = this.data.photo.location || {}
        store.updatePhoto(this.photoId, {
          location: name
            ? { name, latitude: prev.latitude || null, longitude: prev.longitude || null }
            : null
        })
        if (name) {
          const tag = store.findOrCreateTag('place', name)
          if (tag) store.attachTags([this.photoId], [tag.id])
        }
        this.reload()
      }
    })
  },

  remove() {
    wx.showModal({
      title: '从库中删除',
      content: '只删除小程序里的副本，不会删除系统相册原图。',
      confirmColor: '#C43C2C',
      success: (res) => {
        if (!res.confirm) return
        store.deletePhotos([this.photoId])
        wx.navigateBack()
      }
    })
  }
})
