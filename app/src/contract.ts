export const EXPORT_VERSION = 1
export const EXPORT_KIND = 'memory-library-export'

export type ExportedPhoto = {
  assetId: string
  filename: string
  shotAt: number
  location: {
    name: string
    latitude: number | null
    longitude: number | null
  } | null
  isScreenshot: boolean
  burstGroupId: string | null
}

export type ExportedMemory = {
  id: string
  title: string
  description: string
  coverAssetId: string | null
  photos: ExportedPhoto[]
}

export type ExportPayload = {
  kind: typeof EXPORT_KIND
  version: typeof EXPORT_VERSION
  exportedAt: number
  memories: ExportedMemory[]
}

export function createExportPayload(memories: ExportedMemory[]): ExportPayload {
  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    memories
  }
}
