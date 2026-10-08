import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NetworkRequest } from '../types/NetworkTypes';
import { Badge } from './Badge';

interface NetworkEntryProps {
  request: NetworkRequest;
  onPress: () => void;
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':    return '#2563eb';
    case 'POST':   return '#16a34a';
    case 'PUT':    return '#d97706';
    case 'DELETE': return '#dc2626';
    case 'PATCH':  return '#7c3aed';
    default:       return '#555';
  }
}

function statusColor(status?: number): string {
  if (status === undefined) return '#555';
  if (status >= 500) return '#dc2626';
  if (status >= 400) return '#d97706';
  if (status >= 300) return '#2563eb';
  if (status >= 200) return '#16a34a';
  return '#555';
}

function truncateUrl(url: string, maxLen = 60): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return path.length > maxLen ? path.slice(0, maxLen) + '…' : path;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + '…' : url;
  }
}

export function NetworkEntry({ request, onPress }: NetworkEntryProps): React.JSX.Element {
  const statusLabel =
    request.state === 'pending'
      ? 'PEND'
      : request.status !== undefined
      ? String(request.status)
      : '—';

  const durationLabel =
    request.duration !== undefined ? `${request.duration}ms` : '—';

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.left}>
        <Badge label={request.method.toUpperCase()} color={methodColor(request.method)} />
        <Text style={styles.url} numberOfLines={1}>
          {truncateUrl(request.url)}
        </Text>
      </View>
      <View style={styles.right}>
        <Badge
          label={statusLabel}
          color={statusColor(request.status)}
        />
        <Text style={styles.duration}>{durationLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  url: {
    color: '#ccc',
    fontSize: 13,
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  duration: {
    color: '#888',
    fontSize: 12,
    minWidth: 48,
    textAlign: 'right',
  },
});
