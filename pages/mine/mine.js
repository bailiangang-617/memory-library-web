const store = require('../../utils/store')
const scope = require('../../config/scope')

Page({
  data: {
    stats: { photoCount: 0, memoryCount: 0, tagCount: 0 },
    productName: scope.productName,
    promise: scope.promise,
    can: scope.can,
    cannot: scope.cannot
  },

  onShow() {
    this.setData({ stats: store.getStats() })
  },

  goImport() {
    wx.switchTab({ url: '/pages/import/import' })
  },

  clearAll() {
    wx.showModal({
      title: '清空回忆库',
      content: '将删除小程序内的全部照片副本、标签和回忆集，不影响系统相册。',
      confirmColor: '#C43C2C',
      success: (res) => {
        if (!res.confirm) return
        store.clearAll()
        this.setData({ stats: store.getStats() })
        wx.showToast({ title: '已清空', icon: 'none' })
      }
    })
  }
})
