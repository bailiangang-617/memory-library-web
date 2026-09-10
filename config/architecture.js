/**
 * 双层架构
 *
 * App（app/）
 * - 对着系统相册建索引，不复制、不上传原图
 * - 先扫最近几百张，再增量同步新增，历史分页补全
 * - 第一期自动能力：时间轴、截图、连拍、地点
 *
 * 小程序
 * - 只做回忆层：回看、打标签、精选配图、接收 App 导出 JSON
 *
 * 协议
 * - shared/contract.js
 * - 文件：memory-export-v1.json
 */
module.exports = {
  layers: ['app-index', 'miniprogram-memory'],
  appTabs: ['timeline', 'groups', 'scan'],
  mpTabs: ['library', 'memories', 'import', 'mine'],
  entities: ['indexedAsset', 'photo', 'tag', 'memory'],
  storage: {
    app: 'sqlite-index-only',
    miniprogram: 'local-selected-memories'
  }
}
