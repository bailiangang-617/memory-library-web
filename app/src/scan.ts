import * as MediaLibrary from 'expo-media-library'
import {
  countAssets,
  getScanState,
  listAssetsByMonth,
  setBurstGroup,
  setScanState,
  updateLocation,
  upsertAssets,
  type IndexedAsset
} from './db'

const PAGE_SIZE = 200
const QUICK_PAGES = 3
const SCREENSHOT_RE = /screenshot|screen[_\s-]?shot|截屏|截图/i
const BURST_GAP_MS = 1500

export type ScanProgress = {
  phase: 'idle' | 'permission' | 'quick' | 'newer' | 'history' | 'burst' | 'done' | 'denied'
  indexed: number
  message: string
}

function isScreenshot(filename: string, albumTitle?: string | null) {
  return SCREENSHOT_RE.test(filename) || SCREENSHOT_RE.test(albumTitle || '')
}

async function screenshotAlbumIds() {
  const albums = await MediaLibrary.getAlbumsAsync()
  return new Set(
    albums.filter((album) => SCREENSHOT_RE.test(album.title)).map((album) => album.id)
  )
}

function toIndexed(asset: MediaLibrary.Asset, shotAlbums: Set<string>): IndexedAsset {
  return {
    id: asset.id,
    filename: asset.filename,
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    creationTime: asset.creationTime,
    modificationTime: asset.modificationTime,
    albumId: asset.albumId ?? null,
    isScreenshot: isScreenshot(asset.filename, null) || (asset.albumId && shotAlbums.has(asset.albumId)) ? 1 : 0,
    burstGroupId: null,
    latitude: null,
    longitude: null,
    locationName: null
  }
}

async function ingestPage(
  options: MediaLibrary.AssetsOptions,
  shotAlbums: Set<string>
) {
  const page = await MediaLibrary.getAssetsAsync({
    first: PAGE_SIZE,
    mediaType: MediaLibrary.MediaType.photo,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    ...options
  })
  const items = page.assets.map((asset) => toIndexed(asset, shotAlbums))
  await upsertAssets(items)
  return page
}

export async function requestPhotoPermission() {
  const current = await MediaLibrary.getPermissionsAsync()
  if (current.granted) return true
  const next = await MediaLibrary.requestPermissionsAsync()
  return next.granted
}

export async function rebuildBursts() {
  const assets = await listAssetsByMonth()
  const usable = assets
    .filter((item) => !item.isScreenshot)
    .slice()
    .sort((a, b) => a.creationTime - b.creationTime)

  let group: IndexedAsset[] = []
  const flush = async () => {
    if (group.length >= 3) {
      await setBurstGroup(group.map((item) => item.id), group[0].id)
    }
    group = []
  }

  for (const asset of usable) {
    const prev = group[group.length - 1]
    const closeEnough = !prev || asset.creationTime - prev.creationTime <= BURST_GAP_MS
    const similarSize = !prev || (
      Math.abs(asset.width - prev.width) <= 16 &&
      Math.abs(asset.height - prev.height) <= 16
    )
    if (!group.length || (closeEnough && similarSize)) {
      group.push(asset)
    } else {
      await flush()
      group.push(asset)
    }
  }
  await flush()
}

async function refreshScanTotals(partial: Partial<{ newest: number; oldest: number; historyDone: boolean }>) {
  const prev = await getScanState()
  const totalIndexed = await countAssets()
  const newestIndexed = partial.newest
    ? Math.max(prev.newestIndexed, partial.newest)
    : prev.newestIndexed
  const oldestIndexed = partial.oldest
    ? (prev.oldestIndexed ? Math.min(prev.oldestIndexed, partial.oldest) : partial.oldest)
    : prev.oldestIndexed
  const next = {
    newestIndexed,
    oldestIndexed,
    historyDone: partial.historyDone ? 1 : prev.historyDone,
    totalIndexed,
    lastScanAt: Date.now()
  }
  await setScanState(next)
  return next
}

export async function scanQuick(onProgress: (progress: ScanProgress) => void) {
  onProgress({ phase: 'permission', indexed: 0, message: '正在申请相册权限' })
  const granted = await requestPhotoPermission()
  if (!granted) {
    onProgress({ phase: 'denied', indexed: 0, message: '未获得相册权限，无法建立索引' })
    return
  }

  const shotAlbums = await screenshotAlbumIds()
  onProgress({ phase: 'quick', indexed: 0, message: '先索引最近照片，马上就能用' })

  let cursor: string | undefined
  let newest = 0
  let oldest = Number.MAX_SAFE_INTEGER
  let indexed = 0

  for (let pageNo = 0; pageNo < QUICK_PAGES; pageNo += 1) {
    const page = await ingestPage(cursor ? { after: cursor } : {}, shotAlbums)
    indexed += page.assets.length
    page.assets.forEach((asset) => {
      newest = Math.max(newest, asset.creationTime)
      oldest = Math.min(oldest, asset.creationTime)
    })
    onProgress({ phase: 'quick', indexed, message: `已索引最近 ${indexed} 张` })
    if (!page.hasNextPage || !page.endCursor) break
    cursor = page.endCursor
  }

  const state = await refreshScanTotals({
    newest,
    oldest: oldest === Number.MAX_SAFE_INTEGER ? 0 : oldest
  })
  onProgress({ phase: 'burst', indexed: state.totalIndexed, message: '正在识别连拍' })
  await rebuildBursts()
  onProgress({
    phase: 'done',
    indexed: state.totalIndexed,
    message: `最近 ${state.totalIndexed} 张已可浏览，其余可在后台继续扫`
  })
}

export async function scanNewer(onProgress: (progress: ScanProgress) => void) {
  const granted = await requestPhotoPermission()
  if (!granted) {
    onProgress({ phase: 'denied', indexed: 0, message: '未获得相册权限' })
    return
  }
  const state = await getScanState()
  const shotAlbums = await screenshotAlbumIds()
  onProgress({ phase: 'newer', indexed: state.totalIndexed, message: '正在同步新增照片' })

  let cursor: string | undefined
  let newest = state.newestIndexed
  let added = 0
  do {
    const page = await ingestPage(
      {
        ...(cursor ? { after: cursor } : {}),
        createdAfter: state.newestIndexed || undefined
      },
      shotAlbums
    )
    added += page.assets.length
    page.assets.forEach((asset) => {
      newest = Math.max(newest, asset.creationTime)
    })
    onProgress({ phase: 'newer', indexed: state.totalIndexed + added, message: `新增 ${added} 张` })
    if (!page.hasNextPage || !page.endCursor) break
    cursor = page.endCursor
  } while (true)

  const next = await refreshScanTotals({ newest })
  await rebuildBursts()
  onProgress({ phase: 'done', indexed: next.totalIndexed, message: added ? `新增 ${added} 张` : '没有新照片' })
}

export async function scanHistory(onProgress: (progress: ScanProgress) => void) {
  const granted = await requestPhotoPermission()
  if (!granted) {
    onProgress({ phase: 'denied', indexed: 0, message: '未获得相册权限' })
    return
  }
  const state = await getScanState()
  if (state.historyDone) {
    onProgress({ phase: 'done', indexed: state.totalIndexed, message: '历史照片已经扫完' })
    return
  }

  const shotAlbums = await screenshotAlbumIds()
  onProgress({ phase: 'history', indexed: state.totalIndexed, message: '继续扫描更早的照片' })

  let cursor: string | undefined
  let oldest = state.oldestIndexed || Date.now()
  let added = 0
  let pages = 0

  do {
    const page = await ingestPage(
      {
        ...(cursor ? { after: cursor } : {}),
        createdBefore: oldest
      },
      shotAlbums
    )
    added += page.assets.length
    pages += 1
    page.assets.forEach((asset) => {
      oldest = Math.min(oldest, asset.creationTime)
    })
    const live = await refreshScanTotals({ oldest, historyDone: !page.hasNextPage })
    onProgress({
      phase: 'history',
      indexed: live.totalIndexed,
      message: `累计 ${live.totalIndexed} 张，正在补历史`
    })
    if (!page.hasNextPage || !page.endCursor || pages >= 8) {
      if (!page.hasNextPage) await refreshScanTotals({ historyDone: true })
      break
    }
    cursor = page.endCursor
  } while (true)

  await rebuildBursts()
  const next = await getScanState()
  onProgress({
    phase: 'done',
    indexed: next.totalIndexed,
    message: next.historyDone ? `全部 ${next.totalIndexed} 张已建立索引` : `已索引 ${next.totalIndexed} 张，可继续补历史`
  })
}

export async function fillLocation(assetId: string) {
  const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false })
  const loc = info.location
  if (!loc) return null
  await updateLocation(assetId, loc.latitude, loc.longitude)
  return loc
}

export function groupByMonth(assets: IndexedAsset[]) {
  const groups: { key: string; label: string; photos: IndexedAsset[] }[] = []
  const index: Record<string, (typeof groups)[0]> = {}
  assets.forEach((asset) => {
    const date = new Date(asset.creationTime)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (!index[key]) {
      index[key] = {
        key,
        label: `${date.getFullYear()}年${date.getMonth() + 1}月`,
        photos: []
      }
      groups.push(index[key])
    }
    index[key].photos.push(asset)
  })
  return groups
}
