const store = require('../../utils/store')
const { listTags } = store

Page({
  data: {
    total: 0,
    groups: [],
    selectMode: false,
    selectedIds: [],
    filterKey: 'all',
    filter: {},
    monthOptions: [],
    tagOptions: [],
    sheet: '',
    sheetTitle: ''
  },

  onShow() {
    this.reload()
  },

  reload() {
    const photos = store.listPhotos(this.data.filter)
    this.setData({
      total: store.getStats().photoCount,
      groups: store.groupPhotosByMonth(photos),
      monthOptions: store.listMonthOptions()
    })
  },

  onFilter(event) {
    const key = event.currentTarget.dataset.key
    if (key === 'all') {
      this.setData({ filterKey: 'all', filter: {}, sheet: '' }, () => this.reload())
      return
    }
    if (key === 'month') {
      this.setData({
        sheet: 'month',
        sheetTitle: '按时间'
      })
      return
    }
    if (key === 'inMemory') {
      this.setData({
        sheet: 'inMemory',
        sheetTitle: '是否已入集'
      })
      return
    }
    const typeMap = { people: '人物', place: '地点', content: '内容' }
    this.setData({
      sheet: 'tag',
      sheetTitle: `按${typeMap[key]}`,
      tagOptions: listTags(key),
      pendingTagType: key
    })
  },

  onPickMonth(event) {
    const key = event.currentTarget.dataset.key
    this.setData({
      filterKey: 'month',
      filter: { monthKey: key },
      sheet: ''
    }, () => this.reload())
  },

  onPickTag(event) {
    const id = event.currentTarget.dataset.id
    this.setData({
      filterKey: this.data.pendingTagType,
      filter: { tagId: id },
      sheet: ''
    }, () => this.reload())
  },

  onPickInMemory(event) {
    const value = event.currentTarget.dataset.value
    this.setData({
      filterKey: 'inMemory',
      filter: { inMemory: value },
      sheet: ''
    }, () => this.reload())
  },

  closeSheet() {
    this.setData({ sheet: '' })
  },

  toggleSelectMode() {
    this.setData({
      selectMode: !this.data.selectMode,
      selectedIds: []
    })
  },

  onPhotoTap(event) {
    const { id } = event.detail
    if (!this.data.selectMode) {
      wx.navigateTo({ url: `/pages/photo-detail/photo-detail?id=${id}` })
      return
    }
    const selectedIds = this.data.selectedIds.slice()
    const index = selectedIds.indexOf(id)
    if (index > -1) selectedIds.splice(index, 1)
    else selectedIds.push(id)
    this.setData({ selectedIds })
  },

  goImport() {
    wx.switchTab({ url: '/pages/import/import' })
  },

  onBatchTag() {
    if (!this.ensureSelection()) return
    wx.navigateTo({
      url: `/pages/tag-edit/tag-edit?ids=${this.data.selectedIds.join(',')}`
    })
  },

  onBatchMemory() {
    if (!this.ensureSelection()) return
    this.pickMemory(this.data.selectedIds)
  },

  pickMemory(photoIds) {
    const memories = store.listMemories()
    const query = photoIds.join(',')
    if (!memories.length) {
      wx.navigateTo({ url: `/pages/memory-edit/memory-edit?photoIds=${query}` })
      return
    }
    const names = memories.slice(0, 5).map((item) => item.title)
    wx.showActionSheet({
      itemList: ['新建回忆集'].concat(names),
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/memory-edit/memory-edit?photoIds=${query}` })
          return
        }
        const memory = memories[res.tapIndex - 1]
        store.addPhotosToMemory(memory.id, photoIds)
        this.setData({ selectMode: false, selectedIds: [] })
        this.reload()
        wx.showToast({ title: '已加入回忆集', icon: 'success' })
      }
    })
  },

  onBatchDelete() {
    if (!this.ensureSelection()) return
    wx.showModal({
      title: '从库中删除',
      content: '只删除小程序里的副本，不会删除手机系统相册中的原图。',
      confirmColor: '#C43C2C',
      success: (res) => {
        if (!res.confirm) return
        store.deletePhotos(this.data.selectedIds)
        this.setData({ selectedIds: [], selectMode: false })
        this.reload()
      }
    })
  },

  ensureSelection() {
    if (!this.data.selectedIds.length) {
      wx.showToast({ title: '请先选择照片', icon: 'none' })
      return false
    }
    return true
  },

  noop() {}
})
