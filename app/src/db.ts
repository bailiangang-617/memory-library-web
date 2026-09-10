import * as SQLite from 'expo-sqlite'

export type IndexedAsset = {
  id: string
  filename: string
  uri: string
  width: number
  height: number
  creationTime: number
  modificationTime: number
  albumId: string | null
  isScreenshot: number
  burstGroupId: string | null
  latitude: number | null
  longitude: number | null
  locationName: string | null
}

export type ScanState = {
  newestIndexed: number
  oldestIndexed: number
  historyDone: number
  totalIndexed: number
  lastScanAt: number
}

export type MemoryRow = {
  id: string
  title: string
  description: string
  coverAssetId: string | null
  createdAt: number
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDb()
  }
  return dbPromise
}

async function openDb() {
  const db = await SQLite.openDatabaseAsync('photo-index.db')
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      uri TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      creation_time INTEGER NOT NULL,
      modification_time INTEGER,
      album_id TEXT,
      is_screenshot INTEGER DEFAULT 0,
      burst_group_id TEXT,
      latitude REAL,
      longitude REAL,
      location_name TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_assets_time ON assets(creation_time DESC);
    CREATE INDEX IF NOT EXISTS idx_assets_burst ON assets(burst_group_id);
    CREATE INDEX IF NOT EXISTS idx_assets_shot ON assets(is_screenshot);
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      cover_asset_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_photos (
      memory_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      sort_order INTEGER,
      PRIMARY KEY (memory_id, asset_id)
    );
  `)
  return db
}

export async function getScanState(): Promise<ScanState> {
  const raw = await getKv('scan_state')
  if (!raw) {
    return {
      newestIndexed: 0,
      oldestIndexed: 0,
      historyDone: 0,
      totalIndexed: 0,
      lastScanAt: 0
    }
  }
  return JSON.parse(raw)
}

export async function setScanState(state: ScanState) {
  await setKv('scan_state', JSON.stringify(state))
}

export async function getKv(key: string) {
  const db = await getDb()
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])
  return row?.value ?? null
}

export async function setKv(key: string, value: string) {
  const db = await getDb()
  await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value])
}

export async function upsertAssets(items: IndexedAsset[]) {
  if (!items.length) return
  const db = await getDb()
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO assets (
          id, filename, uri, width, height, creation_time, modification_time,
          album_id, is_screenshot, burst_group_id, latitude, longitude, location_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          filename = excluded.filename,
          uri = excluded.uri,
          width = excluded.width,
          height = excluded.height,
          creation_time = excluded.creation_time,
          modification_time = excluded.modification_time,
          album_id = excluded.album_id,
          is_screenshot = excluded.is_screenshot`,
        [
          item.id,
          item.filename,
          item.uri,
          item.width,
          item.height,
          item.creationTime,
          item.modificationTime,
          item.albumId,
          item.isScreenshot,
          item.burstGroupId,
          item.latitude,
          item.longitude,
          item.locationName
        ]
      )
    }
  })
}

export async function countAssets() {
  const db = await getDb()
  const row = await db.getFirstAsync<{ total: number }>('SELECT COUNT(*) as total FROM assets')
  return row?.total ?? 0
}

export async function listAssetsByMonth() {
  const db = await getDb()
  return db.getAllAsync<IndexedAsset>(
    `SELECT id, filename, uri, width, height,
            creation_time as creationTime, modification_time as modificationTime,
            album_id as albumId, is_screenshot as isScreenshot,
            burst_group_id as burstGroupId, latitude, longitude,
            location_name as locationName
     FROM assets
     ORDER BY creation_time DESC`
  )
}

export async function listScreenshots() {
  const db = await getDb()
  return db.getAllAsync<IndexedAsset>(
    `SELECT id, filename, uri, width, height,
            creation_time as creationTime, modification_time as modificationTime,
            album_id as albumId, is_screenshot as isScreenshot,
            burst_group_id as burstGroupId, latitude, longitude,
            location_name as locationName
     FROM assets
     WHERE is_screenshot = 1
     ORDER BY creation_time DESC`
  )
}

export async function listBurstGroups() {
  const db = await getDb()
  return db.getAllAsync<{ burstGroupId: string; count: number; uri: string; creationTime: number }>(
    `SELECT burst_group_id as burstGroupId, COUNT(*) as count,
            MIN(uri) as uri, MIN(creation_time) as creationTime
     FROM assets
     WHERE burst_group_id IS NOT NULL
     GROUP BY burst_group_id
     HAVING count >= 3
     ORDER BY creationTime DESC`
  )
}

export async function listAssetsByBurst(burstGroupId: string) {
  const db = await getDb()
  return db.getAllAsync<IndexedAsset>(
    `SELECT id, filename, uri, width, height,
            creation_time as creationTime, modification_time as modificationTime,
            album_id as albumId, is_screenshot as isScreenshot,
            burst_group_id as burstGroupId, latitude, longitude,
            location_name as locationName
     FROM assets
     WHERE burst_group_id = ?
     ORDER BY creation_time ASC`,
    [burstGroupId]
  )
}

export async function listLocatedAssets() {
  const db = await getDb()
  return db.getAllAsync<IndexedAsset>(
    `SELECT id, filename, uri, width, height,
            creation_time as creationTime, modification_time as modificationTime,
            album_id as albumId, is_screenshot as isScreenshot,
            burst_group_id as burstGroupId, latitude, longitude,
            location_name as locationName
     FROM assets
     WHERE latitude IS NOT NULL
     ORDER BY creation_time DESC`
  )
}

export async function updateLocation(id: string, latitude: number, longitude: number) {
  const db = await getDb()
  await db.runAsync('UPDATE assets SET latitude = ?, longitude = ? WHERE id = ?', [latitude, longitude, id])
}

export async function clearBurstGroups() {
  const db = await getDb()
  await db.runAsync('UPDATE assets SET burst_group_id = NULL')
}

export async function setBurstGroup(ids: string[], groupId: string) {
  if (!ids.length) return
  const db = await getDb()
  const placeholders = ids.map(() => '?').join(',')
  await db.runAsync(
    `UPDATE assets SET burst_group_id = ? WHERE id IN (${placeholders})`,
    [groupId, ...ids]
  )
}

export async function addMemory(title: string, description: string, assetIds: string[]) {
  const db = await getDb()
  const id = `m_${Date.now().toString(36)}`
  await db.runAsync(
    'INSERT INTO memories (id, title, description, cover_asset_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, title, description, assetIds[0] || null, Date.now()]
  )
  for (let i = 0; i < assetIds.length; i += 1) {
    await db.runAsync(
      'INSERT OR REPLACE INTO memory_photos (memory_id, asset_id, sort_order) VALUES (?, ?, ?)',
      [id, assetIds[i], i]
    )
  }
  return id
}

export async function listMemories() {
  const db = await getDb()
  return db.getAllAsync<MemoryRow & { photoCount: number }>(
    `SELECT m.id, m.title, m.description, m.cover_asset_id as coverAssetId,
            m.created_at as createdAt, COUNT(p.asset_id) as photoCount
     FROM memories m
     LEFT JOIN memory_photos p ON p.memory_id = m.id
     GROUP BY m.id
     ORDER BY m.created_at DESC`
  )
}

export async function getMemoryExportData() {
  const db = await getDb()
  const memories = await listMemories()
  const result = []
  for (const memory of memories) {
    const photos = await db.getAllAsync<IndexedAsset>(
      `SELECT a.id, a.filename, a.uri, a.width, a.height,
              a.creation_time as creationTime, a.modification_time as modificationTime,
              a.album_id as albumId, a.is_screenshot as isScreenshot,
              a.burst_group_id as burstGroupId, a.latitude, a.longitude,
              a.location_name as locationName
       FROM memory_photos p
       JOIN assets a ON a.id = p.asset_id
       WHERE p.memory_id = ?
       ORDER BY p.sort_order ASC`,
      [memory.id]
    )
    result.push({ memory, photos })
  }
  return result
}
