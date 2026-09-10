const store = require('../../utils/store')
const { createId } = require('../../utils/id')
const { readExifFromFile } = require('../../utils/exif')

const MAX_COUNT = 20

Page({
  data: {
    maxCount: MAX_COUNT,
    lastPhotos: [],
    lastCount: 0,
    importHint: ''
  },

  choosePhotos() {
    wx.chooseMedia({
      count: MAX_COUNT,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: (res) => {
        this.importFiles(res.tempFiles || [])
      }
    })
  },

  importFromApp() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        const fs = wx.getFileSystemManager()
        fs.readFile({
          filePath: file.path,
          encoding: 'utf8',
          success: (readRes) => {
            try {
              const result = store.importAppExport(readRes.data)
              this.setData({
                importHint: result.memoryCount
                  ? `已从 App 导入 ${result.memoryCount} 个回忆集`
                  : '这些回忆集已经在库里了'
              })
              wx.showToast({ title: this.data.importHint, icon: 'none' })
            } catch (error) {
              wx.showToast({ title: error.message || '文件无效', icon: 'none' })
            }
          },
          fail: () => wx.showToast({ title: '读取文件失败', icon: 'none' })
        })
      }
    })
  },

  async importFiles(files) {
    if (!files.length) return
    wx.showLoading({ title: '正在导入', mask: true })
    const entries = []
    try {
      for (const file of files) {
        const id = createId('p')
        const filePath = store.savePhotoFile(file.tempFilePath, id)
        const info = await this.readImageInfo(filePath)
        const exif = await readExifFromFile(filePath)
        const location = this.buildLocation(exif)
        entries.push({
          id,
          filePath,
          importedAt: Date.now(),
          shotAt: exif.shotAt || Date.now(),
          location,
          width: info.width || file.width || 0,
          height: info.height || file.height || 0,
          size: file.size || 0
        })
      }
      const photos = store.addPhotos(entries)
      this.setData({
        lastPhotos: photos,
        lastCount: photos.length
      })
      wx.hideLoading()
      wx.showToast({ title: `已导入 ${photos.length} 张`, icon: 'none' })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: '导入失败，请重试', icon: 'none' })
    }
  },

  readImageInfo(src) {
    return new Promise((resolve) => {
      wx.getImageInfo({
        src,
        success: resolve,
        fail: () => resolve({ width: 0, height: 0 })
      })
    })
  },

  buildLocation(exif) {
    if (exif.latitude == null || exif.longitude == null) return null
    if (!exif.latitude && !exif.longitude) return null
    return {
      name: '',
      latitude: exif.latitude,
      longitude: exif.longitude
    }
  },

  continueImport() {
    this.choosePhotos()
  },

  goTag() {
    const ids = this.data.lastPhotos.map((item) => item.id).join(',')
    wx.navigateTo({ url: `/pages/tag-edit/tag-edit?ids=${ids}` })
  },

  goMemory() {
    const ids = this.data.lastPhotos.map((item) => item.id).join(',')
    wx.navigateTo({ url: `/pages/memory-edit/memory-edit?photoIds=${ids}` })
  },

  goLibrary() {
    wx.switchTab({ url: '/pages/library/library' })
  },

  goMemories() {
    wx.switchTab({ url: '/pages/memories/memories' })
  }
})
