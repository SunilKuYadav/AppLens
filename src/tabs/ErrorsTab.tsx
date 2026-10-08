import React, { useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppLens } from '../core/AppLensProvider';
import { AppLens } from '../core/AppLens';
import { AppError } from '../types/ErrorTypes';
import { Badge } from '../components/Badge';
import { SearchBar } from '../components/SearchBar';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

interface ErrorItemProps {
  error: AppError;
  expanded: boolean;
  onToggle: () => void;
}

function ErrorItem({ error, expanded, onToggle }: ErrorItemProps): React.JSX.Element {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={styles.rowTop}>
        <Text style={styles.message} numberOfLines={expanded ? undefined : 2}>
          {error.message}
        </Text>
        <View style={styles.rowMeta}>
          <Badge
            label={error.isFatal ? 'FATAL' : 'ERROR'}
            color={error.isFatal ? '#dc2626' : '#d97706'}
          />
          <Text style={styles.time}>{formatTime(error.timestamp)}</Text>
        </View>
      </View>
      {expanded && error.stack && (
        <View style={styles.stackBlock}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text style={styles.stackText}>{error.stack}</Text>
          </ScrollView>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function ErrorsTab(): React.JSX.Element {
  const { errors } = useAppLens();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...errors].reverse();
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.message.toLowerCase().includes(q));
    }
    return list;
  }, [errors, search]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.count}>{errors.length} errors</Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => AppLens.getStorage().clearErrors()}
            accessibilityRole="button"
          >
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search errors…" />
      </View>

      <FlatList<AppError>
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ErrorItem
            error={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(prev => (prev === item.id ? null : item.id))}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No errors captured</Text>
          </View>
        }
        style={styles.list}
      />
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
  list: {
    flex: 1,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  message: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  time: {
    color: '#555',
    fontSize: 11,
  },
  stackBlock: {
    marginTop: 10,
    backgroundColor: '#111',
    borderRadius: 6,
    padding: 8,
  },
  stackText: {
    color: '#b8d7a3',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
  },
});
