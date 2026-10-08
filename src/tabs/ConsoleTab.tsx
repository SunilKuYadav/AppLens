import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppLens } from '../core/AppLensProvider';
import { AppLens } from '../core/AppLens';
import { LogEntry, LogLevel } from '../types/LogTypes';
import { LogEntryRow } from '../components/LogEntryRow';
import { JSONViewer } from '../components/JSONViewer';
import { Badge } from '../components/Badge';
import { SearchBar } from '../components/SearchBar';

type LevelFilter = 'ALL' | Uppercase<LogLevel>;
const LEVEL_FILTERS: LevelFilter[] = ['ALL', 'LOG', 'INFO', 'WARN', 'ERROR', 'DEBUG'];

function levelColor(level: LogLevel): string {
  switch (level) {
    case 'log':   return '#555';
    case 'info':  return '#2563eb';
    case 'warn':  return '#d97706';
    case 'error': return '#dc2626';
    case 'debug': return '#06b6d4';
    default:      return '#555';
  }
}

export function ConsoleTab(): React.JSX.Element {
  const { logs } = useAppLens();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LevelFilter>('ALL');
  const [detailEntry, setDetailEntry] = useState<LogEntry | null>(null);

  const filtered = useMemo(() => {
    let list = [...logs].reverse();
    if (filter !== 'ALL') {
      list = list.filter(e => e.level.toUpperCase() === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.message.toLowerCase().includes(q));
    }
    return list;
  }, [logs, filter, search]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.count}>{logs.length} entries</Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => AppLens.getStorage().clearLogs()}
          >
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search logs…" />
        <View style={styles.filterRow}>
          {LEVEL_FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, filter === f && styles.filterPillActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList<LogEntry>
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <LogEntryRow entry={item} onPress={() => setDetailEntry(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No logs captured</Text>
          </View>
        }
        style={styles.list}
      />

      {/* Detail modal */}
      <Modal
        visible={detailEntry !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailEntry(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.detailSheet}>
            {detailEntry && (
              <>
                <View style={styles.detailHeader}>
                  <Badge
                    label={detailEntry.level.toUpperCase()}
                    color={levelColor(detailEntry.level)}
                  />
                  <Text style={styles.detailTime}>
                    {new Date(detailEntry.timestamp).toLocaleTimeString()}
                  </Text>
                  <TouchableOpacity onPress={() => setDetailEntry(null)}>
                    <Text style={styles.detailClose}>×</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.detailScroll}>
                  <Text style={styles.detailMessage}>{detailEntry.message}</Text>

                  {detailEntry.args.length > 1 && (
                    <>
                      <Text style={styles.detailLabel}>Arguments</Text>
                      <JSONViewer data={detailEntry.args} maxHeight={200} />
                    </>
                  )}

                  {detailEntry.stack && (
                    <>
                      <Text style={styles.detailLabel}>Stack Trace</Text>
                      <ScrollView horizontal>
                        <Text style={styles.stackText}>{detailEntry.stack}</Text>
                      </ScrollView>
                    </>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  header: {
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  count: {
    color: '#888',
    fontSize: 12,
  },
  clearButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
  },
  clearText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  filterPillActive: {
    backgroundColor: '#00ff88',
  },
  filterPillText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#0d0d0d',
  },
  list: {
    flex: 1,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
  },
  // Detail modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    padding: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  detailTime: {
    color: '#888',
    fontSize: 12,
    flex: 1,
  },
  detailClose: {
    color: '#888',
    fontSize: 24,
    lineHeight: 26,
  },
  detailScroll: {
    flexGrow: 0,
  },
  detailMessage: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  detailLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 12,
  },
  stackText: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
});
