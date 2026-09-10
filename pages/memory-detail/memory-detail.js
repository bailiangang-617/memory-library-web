const store = require('../../utils/store')

Page({
  data: {
    memory: null
  },

  onLoad(query) {
    this.memoryId = query.id
  },

  onShow() {
    this.reload()
  },

  reload() {
    const raw = store.getMemory(this.memoryId)
    if (!raw) {
      wx.showToast({ title: '回忆集不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 400)
      return
    }
    this.setData({ memory: store.decorateMemory(raw) })
  },

  edit() {
    wx.navigateTo({ url: `/pages/memory-edit/memory-edit?id=${this.memoryId}` })
  },

  openPhoto(event) {
    const { id } = event.detail
    wx.navigateTo({ url: `/pages/photo-detail/photo-detail?id=${id}` })
  },

  remove() {
    wx.showModal({
      title: '删除回忆集',
      content: '照片仍留在库里，只去掉这一集。',
      confirmColor: '#C43C2C',
      success: (res) => {
        if (!res.confirm) return
        store.deleteMemory(this.memoryId)
        wx.navigateBack()
      }
    })
  }
})
