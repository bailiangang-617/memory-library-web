import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GroupsScreen } from './src/screens/GroupsScreen'
import { ScanScreen } from './src/screens/ScanScreen'
import { TimelineScreen } from './src/screens/TimelineScreen'
import { colors } from './src/theme'

type Tab = 'timeline' | 'groups' | 'scan'

export default function App() {
  const [tab, setTab] = useState<Tab>('scan')
  const [refreshKey, setRefreshKey] = useState(0)

  function bump() {
    setRefreshKey((value) => value + 1)
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.body}>
        {tab === 'timeline' ? <TimelineScreen refreshKey={refreshKey} /> : null}
        {tab === 'groups' ? <GroupsScreen refreshKey={refreshKey} onChanged={bump} /> : null}
        {tab === 'scan' ? <ScanScreen onChanged={bump} /> : null}
      </View>
      <View style={styles.tabbar}>
        <TabItem label="时间轴" active={tab === 'timeline'} onPress={() => setTab('timeline')} />
        <TabItem label="分组" active={tab === 'groups'} onPress={() => setTab('groups')} />
        <TabItem label="扫描" active={tab === 'scan'} onPress={() => setTab('scan')} />
      </View>
    </View>
  )
}

function TabItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabActive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingBottom: 16
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { color: colors.muted, fontSize: 14 },
  tabActive: { color: colors.accent, fontWeight: '600' }
})
