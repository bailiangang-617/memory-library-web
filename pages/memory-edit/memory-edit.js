const store = require('../../utils/store')

Page({
  data: {
    memoryId: '',
    title: '',
    description: '',
    photoIds: [],
    coverPhotoId: '',
    photos: [],
    picking: false,
    libraryPhotos: []
  },

  onLoad(query) {
    const memoryId = query.id || ''
    const presetIds = query.photoIds ? query.photoIds.split(',').filter(Boolean) : []
    if (memoryId) {
      const memory = store.getMemory(memoryId)
      if (!memory) {
        wx.showToast({ title: '回忆集不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 400)
        return
      }
      this.setData({
        memoryId,
        title: memory.title,
        description: memory.description,
        photoIds: memory.photoIds,
        coverPhotoId: memory.coverPhotoId || memory.photoIds[0] || ''
      })
    } else {
      this.setData({
        photoIds: presetIds,
        coverPhotoId: presetIds[0] || ''
      })
    }
    wx.setNavigationBarTitle({ title: memoryId ? '编辑回忆集' : '新建回忆集' })
    this.refreshPhotos()
  },

  refreshPhotos() {
    const photos = this.data.photoIds
      .map((id) => {
        const photo = store.getPhoto(id)
        return photo ? store.decoratePhoto(photo) : null
      })
      .filter(Boolean)
    this.setData({ photos })
  },

  onTitle(event) {
    this.setData({ title: event.detail.value })
  },

  onDesc(event) {
    this.setData({ description: event.detail.value })
  },

  openPicker() {
    this.setData({
      picking: true,
      libraryPhotos: store.listPhotos()
    })
  },

  closePicker() {
    this.setData({ picking: false })
  },

  onPickPhoto(event) {
    const { id } = event.detail
    const photoIds = this.data.photoIds.slice()
    const index = photoIds.indexOf(id)
    if (index > -1) photoIds.splice(index, 1)
    else photoIds.push(id)
    const coverPhotoId = photoIds.includes(this.data.coverPhotoId)
      ? this.data.coverPhotoId
      : (photoIds[0] || '')
    this.setData({ photoIds, coverPhotoId }, () => this.refreshPhotos())
  },

  setCover(event) {
    const { id } = event.currentTarget.dataset
    this.setData({ coverPhotoId: id })
  },

  removePhoto(event) {
    const { id } = event.currentTarget.dataset
    const photoIds = this.data.photoIds.filter((item) => item !== id)
    const coverPhotoId = photoIds.includes(this.data.coverPhotoId)
      ? this.data.coverPhotoId
      : (photoIds[0] || '')
    this.setData({ photoIds, coverPhotoId }, () => this.refreshPhotos())
  },

  save() {
    if (!this.data.photoIds.length) {
      wx.showToast({ title: '请至少加入一张照片', icon: 'none' })
      return
    }
    const payload = {
      title: this.data.title || '未命名回忆集',
      description: this.data.description,
      photoIds: this.data.photoIds,
      coverPhotoId: this.data.coverPhotoId || this.data.photoIds[0]
    }
    if (this.data.memoryId) {
      store.updateMemory(this.data.memoryId, payload)
    } else {
      store.addMemory(payload)
    }
    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 300)
  },

  noop() {}
})
