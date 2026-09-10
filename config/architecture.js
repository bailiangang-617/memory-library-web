/**
 * 我们的点滴
 * 网页：故事时间线 + 记下（聊天/照片/视频/信）
 * 小程序：同名预览，能力受微信选择文件限制
 */
module.exports = {
  productName: '我们的点滴',
  tabs: ['story', 'add', 'mine'],
  entryTypes: ['chat', 'photo', 'video', 'letter', 'note'],
  storage: 'browser-indexeddb-or-miniprogram-local'
}
