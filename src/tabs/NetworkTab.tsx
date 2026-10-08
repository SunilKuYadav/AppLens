import React, { useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppLens } from '../core/AppLensProvider';
import { AppLens } from '../core/AppLens';
import { NetworkRequest } from '../types/NetworkTypes';
import { NetworkEntry } from '../components/NetworkEntry';
import { NetworkDetailScreen } from './NetworkDetailScreen';
import { SearchBar } from '../components/SearchBar';

type MethodFilter = 'ALL' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ERROR';

const METHOD_FILTERS: MethodFilter[] = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'ERROR'];

export function NetworkTab(): React.JSX.Element {
  const { networkRequests, selectedNetworkRequest, setSelectedNetworkRequest } = useAppLens();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MethodFilter>('ALL');
  const [view, setView] = useState<'list' | 'detail'>('list');

  const filtered = useMemo(() => {
    let list = [...networkRequests].reverse();

    if (filter === 'ERROR') {
      list = list.filter(r => r.state === 'error' || (r.status !== undefined && r.status >= 400));
    } else if (filter !== 'ALL') {
      list = list.filter(r => r.method.toUpperCase() === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.url.toLowerCase().includes(q));
    }

    return list;
  }, [networkRequests, filter, search]);

  if (view === 'detail' && selectedNetworkRequest) {
    return (
      <NetworkDetailScreen
        request={selectedNetworkRequest}
        onBack={() => {
          setView('list');
          setSelectedNetworkRequest(null);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.count}>{networkRequests.length} requests</Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => AppLens.getStorage().clearNetworkRequests()}
          >
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Filter by URL…" />
        <View style={styles.filterRow}>
          {METHOD_FILTERS.map(f => (
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

      <FlatList<NetworkRequest>
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <NetworkEntry
            request={item}
            onPress={() => {
              setSelectedNetworkRequest(item);
              setView('detail');
            }}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No requests captured</Text>
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
});
