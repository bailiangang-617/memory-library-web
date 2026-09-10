import { useEffect, useState } from 'react'
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { listAssetsByMonth, type IndexedAsset } from '../db'
import { fillLocation, groupByMonth } from '../scan'
import { colors } from '../theme'

type MonthGroup = ReturnType<typeof groupByMonth>[number]

export function TimelineScreen({ refreshKey }: { refreshKey: number }) {
  const [groups, setGroups] = useState<MonthGroup[]>([])
  const [hint, setHint] = useState('尚未扫描')

  useEffect(() => {
    let cancelled = false
    listAssetsByMonth().then((assets) => {
      if (cancelled) return
      setGroups(groupByMonth(assets))
      setHint(assets.length ? `已索引 ${assets.length} 张，原图仍在系统相册` : '点底部「扫描」先索引最近照片')
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <View style={styles.page}>
      <Text style={styles.title}>时间轴</Text>
      <Text style={styles.sub}>{hint}</Text>
      <FlatList
        data={groups}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <View>
            <Text style={styles.month}>{item.label} · {item.photos.length} 张</Text>
            <View style={styles.grid}>
              {item.photos.slice(0, 12).map((photo) => (
                <PhotoCell key={photo.id} photo={photo} />
              ))}
            </View>
            {item.photos.length > 12 ? (
              <Text style={styles.more}>本月还有 {item.photos.length - 12} 张</Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>还没有索引。先扫最近的几百张，不必等完全部。</Text>}
      />
    </View>
  )
}

function PhotoCell({ photo }: { photo: IndexedAsset }) {
  return (
    <Pressable
      style={styles.cell}
      onPress={() => {
        if (photo.latitude == null) {
          fillLocation(photo.id)
        }
      }}
    >
      <Image source={{ uri: photo.uri }} style={styles.img} />
      {photo.isScreenshot ? <View style={styles.badge}><Text style={styles.badgeText}>截图</Text></View> : null}
      {photo.latitude != null ? <View style={[styles.badge, styles.loc]}><Text style={styles.badgeText}>地点</Text></View> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 56 },
  title: { fontSize: 28, fontWeight: '600', color: colors.ink },
  sub: { marginTop: 6, marginBottom: 12, color: colors.muted, fontSize: 13 },
  month: { marginTop: 18, marginBottom: 8, color: colors.muted, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  cell: { width: '25%', padding: 3, position: 'relative' },
  img: { width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: colors.line },
  badge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1
  },
  loc: { left: undefined, right: 6, backgroundColor: '#3F6F5B' },
  badgeText: { color: '#fff', fontSize: 9 },
  more: { color: colors.muted, fontSize: 12, marginTop: 6 },
  empty: { marginTop: 48, color: colors.muted, lineHeight: 22 }
})
