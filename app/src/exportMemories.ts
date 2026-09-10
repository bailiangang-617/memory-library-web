import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { createExportPayload, type ExportedMemory } from './contract'
import { getMemoryExportData } from './db'

export async function exportMemoriesToWeChat() {
  const rows = await getMemoryExportData()
  if (!rows.length) {
    throw new Error('还没有回忆集可以导出')
  }
  const memories: ExportedMemory[] = rows.map(({ memory, photos }) => ({
    id: memory.id,
    title: memory.title,
    description: memory.description || '',
    coverAssetId: memory.coverAssetId,
    photos: photos.map((photo) => ({
      assetId: photo.id,
      filename: photo.filename,
      shotAt: photo.creationTime,
      location: photo.latitude == null ? null : {
        name: photo.locationName || '',
        latitude: photo.latitude,
        longitude: photo.longitude
      },
      isScreenshot: !!photo.isScreenshot,
      burstGroupId: photo.burstGroupId
    }))
  }))
  const payload = createExportPayload(memories)
  const path = `${FileSystem.cacheDirectory}memory-export-v1.json`
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload), {
    encoding: FileSystem.EncodingType.UTF8
  })
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) {
    throw new Error('当前设备无法分享文件')
  }
  await Sharing.shareAsync(path, {
    mimeType: 'application/json',
    dialogTitle: '导出给微信小程序',
    UTI: 'public.json'
  })
  return memories.length
}
