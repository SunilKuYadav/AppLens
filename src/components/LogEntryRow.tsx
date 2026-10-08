import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LogEntry } from '../types/LogTypes';
import { Badge } from './Badge';

interface LogEntryRowProps {
  entry: LogEntry;
  onPress: () => void;
}

function levelColor(level: LogEntry['level']): string {
  switch (level) {
    case 'log':   return '#555';
    case 'info':  return '#2563eb';
    case 'warn':  return '#d97706';
    case 'error': return '#dc2626';
    case 'debug': return '#06b6d4';
    default:      return '#555';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function LogEntryRow({ entry, onPress }: LogEntryRowProps): React.JSX.Element {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.left}>
        <Badge label={entry.level.toUpperCase()} color={levelColor(entry.level)} />
        <Text style={styles.message} numberOfLines={2}>
          {entry.message}
        </Text>
      </View>
      <Text style={styles.time}>{formatTime(entry.timestamp)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 8,
  },
  message: {
    color: '#ccc',
    fontSize: 13,
    flex: 1,
  },
  time: {
    color: '#555',
    fontSize: 11,
    marginLeft: 8,
    marginTop: 2,
  },
});
