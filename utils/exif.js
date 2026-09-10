/**
 * 轻量 JPEG EXIF 读取：拍摄时间、GPS。
 * 读不到时由调用方回退到导入时间，并允许用户后补。
 */
const TAG_EXIF_IFD = 0x8769
const TAG_GPS_IFD = 0x8825
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_DATETIME = 0x0132
const TAG_GPS_LAT_REF = 0x0001
const TAG_GPS_LAT = 0x0002
const TAG_GPS_LNG_REF = 0x0003
const TAG_GPS_LNG = 0x0004

function readU16(view, offset, le) {
  return le ? view.getUint16(offset, true) : view.getUint16(offset, false)
}

function readU32(view, offset, le) {
  return le ? view.getUint32(offset, true) : view.getUint32(offset, false)
}

function readString(view, offset, length) {
  let text = ''
  for (let i = 0; i < length; i += 1) {
    const code = view.getUint8(offset + i)
    if (code === 0) break
    text += String.fromCharCode(code)
  }
  return text
}

function parseExifDate(text) {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text || '')
  if (!match) return null
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  )
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function readRational(view, offset, le) {
  const num = readU32(view, offset, le)
  const den = readU32(view, offset + 4, le)
  if (!den) return 0
  return num / den
}

function readGpsCoord(view, offset, le, ref) {
  const deg = readRational(view, offset, le)
  const min = readRational(view, offset + 8, le)
  const sec = readRational(view, offset + 16, le)
  let value = deg + min / 60 + sec / 3600
  if (ref === 'S' || ref === 'W') value = -value
  return value
}

function readIfd(view, tiffStart, ifdOffset, le, handler) {
  if (ifdOffset <= 0) return
  const countOffset = tiffStart + ifdOffset
  if (countOffset + 2 > view.byteLength) return
  const count = readU16(view, countOffset, le)
  for (let i = 0; i < count; i += 1) {
    const entry = countOffset + 2 + i * 12
    if (entry + 12 > view.byteLength) break
    const tag = readU16(view, entry, le)
    const type = readU16(view, entry + 2, le)
    const size = readU32(view, entry + 4, le)
    const valueOffset = readU32(view, entry + 8, le)
    handler(tag, type, size, valueOffset, entry)
  }
}

function parseExif(buffer) {
  const view = new DataView(buffer)
  if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) {
    return { shotAt: null, latitude: null, longitude: null }
  }

  let offset = 2
  let app1 = -1
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break
    const marker = view.getUint8(offset + 1)
    const size = view.getUint16(offset + 2)
    if (marker === 0xe1) {
      app1 = offset + 4
      break
    }
    if (marker === 0xda) break
    offset += 2 + size
  }

  if (app1 < 0) return { shotAt: null, latitude: null, longitude: null }
  if (readString(view, app1, 4) !== 'Exif') {
    return { shotAt: null, latitude: null, longitude: null }
  }

  const tiffStart = app1 + 6
  const endianMark = readString(view, tiffStart, 2)
  const le = endianMark === 'II'
  if (!le && endianMark !== 'MM') {
    return { shotAt: null, latitude: null, longitude: null }
  }

  const result = {
    shotAt: null,
    latitude: null,
    longitude: null
  }
  let gpsRef = { lat: '', lng: '' }

  const readAscii = (type, size, valueOffset, entry) => {
    if (type !== 2) return ''
    const dataOffset = size <= 4 ? entry + 8 : tiffStart + valueOffset
    return readString(view, dataOffset, size)
  }

  const visit = (ifdOffset, isGps) => {
    readIfd(view, tiffStart, ifdOffset, le, (tag, type, size, valueOffset, entry) => {
      if (!isGps && tag === TAG_EXIF_IFD) {
        visit(valueOffset, false)
        return
      }
      if (!isGps && tag === TAG_GPS_IFD) {
        visit(valueOffset, true)
        return
      }
      if (!isGps && (tag === TAG_DATETIME_ORIGINAL || tag === TAG_DATETIME) && !result.shotAt) {
        result.shotAt = parseExifDate(readAscii(type, size, valueOffset, entry))
        return
      }
      if (isGps && tag === TAG_GPS_LAT_REF) {
        gpsRef.lat = readAscii(type, size, valueOffset, entry)
        return
      }
      if (isGps && tag === TAG_GPS_LNG_REF) {
        gpsRef.lng = readAscii(type, size, valueOffset, entry)
        return
      }
      if (isGps && tag === TAG_GPS_LAT) {
        result.latitude = readGpsCoord(view, tiffStart + valueOffset, le, gpsRef.lat)
        return
      }
      if (isGps && tag === TAG_GPS_LNG) {
        result.longitude = readGpsCoord(view, tiffStart + valueOffset, le, gpsRef.lng)
      }
    })
  }

  visit(readU32(view, tiffStart + 4, le), false)
  return result
}

function readExifFromFile(filePath) {
  return new Promise((resolve) => {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      success: (res) => {
        try {
          resolve(parseExif(res.data))
        } catch (error) {
          resolve({ shotAt: null, latitude: null, longitude: null })
        }
      },
      fail: () => resolve({ shotAt: null, latitude: null, longitude: null })
    })
  })
}

module.exports = {
  parseExif,
  readExifFromFile
}
