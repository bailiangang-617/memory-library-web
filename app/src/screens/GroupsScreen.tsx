import { useEffect, useState } from 'react'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { addMemory, listBurstGroups, listLocatedAssets, listScreenshots } from '../db'
import { colors } from '../theme'

export function GroupsScreen({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [shots, setShots] = useState(0)
  const [located, setLocated] = useState(0)
  const [bursts, setBursts] = useState<{ burstGroupId: string; count: number; uri: string; creationTime: number }[]>([])

  useEffect(() => {
    Promise.all([listScreenshots(), listBurstGroups(), listLocatedAssets()]).then(([shotList, burstList, locList]) => {
      setShots(shotList.length)
      setBursts(burstList)
      setLocated(locList.length)
    })
  }, [refreshKey])

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>智能分组</Text>
      <Text style={styles.sub}>先用高准确率规则：截图、连拍、带定位。人脸和内容识别后置。</Text>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.num}>{shots}</Text>
          <Text style={styles.label}>截图</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.num}>{bursts.length}</Text>
          <Text style={styles.label}>连拍组</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.num}>{located}</Text>
          <Text style={styles.label}>有地点</Text>
        </View>
      </View>

      <Text style={styles.section}>连拍组</Text>
      {bursts.length === 0 ? (
        <Text style={styles.empty}>还没有识别到连拍。扫完最近照片后会自动分组。</Text>
      ) : bursts.map((item) => (
        <Pressable
          key={item.burstGroupId}
          style={styles.card}
          onPress={() => {
            Alert.alert(
              `一组 ${item.count} 张连拍`,
              '做成回忆集后，可以导出给微信小程序回看。原图不会被复制。',
              [
                { text: '取消', style: 'cancel' },
                {
                  text: '做成回忆集',
                  onPress: async () => {
                    const { listAssetsByBurst } = await import('../db')
                    const photos = await listAssetsByBurst(item.burstGroupId)
                    await addMemory(`连拍 ${new Date(item.creationTime).toLocaleDateString()}`, '', photos.map((p) => p.id))
                    onChanged()
                    Alert.alert('已成集', '可到扫描页导出给小程序')
                  }
                }
              ]
            )
          }}
        >
          <Image source={{ uri: item.uri }} style={styles.cover} />
          <View style={styles.meta}>
            <Text style={styles.cardTitle}>{item.count} 张连拍</Text>
            <Text style={styles.cardSub}>{new Date(item.creationTime).toLocaleString()}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '600', color: colors.ink },
  sub: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 20 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center'
  },
  num: { fontSize: 22, fontWeight: '600', color: colors.ink },
  label: { marginTop: 2, color: colors.muted, fontSize: 12 },
  section: { marginTop: 28, marginBottom: 10, fontWeight: '600', color: colors.ink },
  empty: { color: colors.muted, lineHeight: 22 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10
  },
  cover: { width: 88, height: 88, backgroundColor: colors.line },
  meta: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  cardSub: { marginTop: 4, color: colors.muted, fontSize: 12 }
})
