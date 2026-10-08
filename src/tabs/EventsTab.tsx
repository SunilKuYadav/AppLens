import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppLens } from '../core/AppLensProvider';
import { AppLens } from '../core/AppLens';
import { AppEvent } from '../types/EventTypes';
import { JSONViewer } from '../components/JSONViewer';
import { Badge } from '../components/Badge';
import { SearchBar } from '../components/SearchBar';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function propertyCount(event: AppEvent): number {
  return event.properties ? Object.keys(event.properties).length : 0;
}

interface EventItemProps {
  event: AppEvent;
  expanded: boolean;
  onToggle: () => void;
}

function EventItem({ event, expanded, onToggle }: EventItemProps): React.JSX.Element {
  const count = propertyCount(event);
  return (
    <TouchableOpacity style={styles.row} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.rowTop}>
        <Text style={styles.eventName}>{event.name}</Text>
        <View style={styles.rowMeta}>
          {count > 0 && (
            <Badge label={`${count} props`} color="#1a1a2e" textColor="#888" />
          )}
          <Text style={styles.time}>{formatTime(event.timestamp)}</Text>
        </View>
      </View>
      {expanded && event.properties && (
        <View style={styles.propertiesBlock}>
          <JSONViewer data={event.properties} maxHeight={200} />
        </View>
      )}
    </TouchableOpacity>
  );
}

export function EventsTab(): React.JSX.Element {
  const { events } = useAppLens();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...events].reverse();
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q));
    }
    return list;
  }, [events, search]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.count}>{events.length} events</Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => AppLens.getStorage().clearEvents()}
          >
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search events…" />
      </View>

      <FlatList<AppEvent>
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <EventItem
            event={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(prev => (prev === item.id ? null : item.id))}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No events tracked</Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventName: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  time: {
    color: '#555',
    fontSize: 11,
  },
  propertiesBlock: {
    marginTop: 10,
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
