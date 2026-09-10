import { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { getScanState, listMemories } from '../db'
import { exportMemoriesToWeChat } from '../exportMemories'
import { scanHistory, scanNewer, scanQuick, type ScanProgress } from '../scan'
import { colors } from '../theme'

export function ScanScreen({ onChanged }: { onChanged: () => void }) {
  const [progress, setProgress] = useState<ScanProgress>({
    phase: 'idle',
    indexed: 0,
    message: '尚未扫描。先扫最近几百张，不必等 1 万张全部结束。'
  })
  const [historyDone, setHistoryDone] = useState(false)
  const [memoryCount, setMemoryCount] = useState(0)
  const busy = ['permission', 'quick', 'newer', 'history', 'burst'].includes(progress.phase)

  async function refreshMeta() {
    const state = await getScanState()
    const memories = await listMemories()
    setHistoryDone(!!state.historyDone)
    setMemoryCount(memories.length)
    if (state.totalIndexed && progress.phase === 'idle') {
      setProgress({
        phase: 'idle',
        indexed: state.totalIndexed,
        message: `索引里已有 ${state.totalIndexed} 张`
      })
    }
  }

  useEffect(() => {
    refreshMeta()
  }, [])

  async function run(job: (cb: (p: ScanProgress) => void) => Promise<void>) {
    if (busy) return
    await job(setProgress)
    await refreshMeta()
    onChanged()
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>扫描</Text>
      <Text style={styles.sub}>App 只建索引，不复制、不上传原图。小程序只接收回忆集，不接收整机相册。</Text>

      <View style={styles.card}>
        <Text style={styles.kicker}>当前进度</Text>
        <Text style={styles.count}>{progress.indexed}</Text>
        <Text style={styles.message}>{progress.message}</Text>
      </View>

      <Pressable style={[styles.btn, styles.primary]} disabled={busy} onPress={() => run(scanQuick)}>
        <Text style={styles.primaryText}>{busy ? '扫描中…' : '先扫最近照片'}</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.ghost]} disabled={busy} onPress={() => run(scanNewer)}>
        <Text style={styles.ghostText}>同步新增</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.ghost]} disabled={busy || historyDone} onPress={() => run(scanHistory)}>
        <Text style={styles.ghostText}>{historyDone ? '历史已扫完' : '继续补历史（每次约 1600 张）'}</Text>
      </Pressable>
      <Pressable
        style={[styles.btn, styles.plain]}
        disabled={busy}
        onPress={async () => {
          try {
            const count = await exportMemoriesToWeChat()
            Alert.alert('已准备导出', `共 ${count} 个回忆集。发给微信后，在小程序「导入」里选择该文件。`)
          } catch (error) {
            Alert.alert('无法导出', error instanceof Error ? error.message : '请先做一集回忆')
          }
        }}
      >
        <Text style={styles.plainText}>导出回忆集到小程序（{memoryCount}）</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 56 },
  title: { fontSize: 28, fontWeight: '600', color: colors.ink },
  sub: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 20 },
  card: {
    marginTop: 24,
    marginBottom: 20,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20
  },
  kicker: { color: colors.accent, fontSize: 12, letterSpacing: 1 },
  count: { marginTop: 8, fontSize: 40, fontWeight: '600', color: colors.ink },
  message: { marginTop: 8, color: colors.muted, lineHeight: 20 },
  btn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: '#fff', fontWeight: '600' },
  ghost: { backgroundColor: colors.accentSoft },
  ghostText: { color: colors.accent, fontWeight: '600' },
  plain: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  plainText: { color: colors.ink }
})
