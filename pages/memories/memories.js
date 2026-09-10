const store = require('../../utils/store')

Page({
  data: {
    memories: [],
    photoCount: 0
  },

  onShow() {
    this.setData({
      memories: store.listMemories(),
      photoCount: store.getStats().photoCount
    })
  },

  createMemory() {
    if (!this.data.photoCount) {
      wx.showToast({ title: '请先导入照片', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/memory-edit/memory-edit' })
  },

  openMemory(event) {
    const { id } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/memory-detail/memory-detail?id=${id}` })
  },

  goImport() {
    wx.switchTab({ url: '/pages/import/import' })
  },

  onEmptyAction() {
    if (this.data.photoCount) this.createMemory()
    else this.goImport()
  }
})
