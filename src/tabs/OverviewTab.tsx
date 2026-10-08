import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppLens } from '../core/AppLensProvider';
import { AppLens } from '../core/AppLens';
import { NetworkEntry } from '../components/NetworkEntry';
import { LogEntryRow } from '../components/LogEntryRow';
import { Badge } from '../components/Badge';
import { LogLevel } from '../types/LogTypes';

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }): React.JSX.Element {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  log:   '#555',
  info:  '#2563eb',
  warn:  '#d97706',
  error: '#dc2626',
  debug: '#06b6d4',
};

export function OverviewTab(): React.JSX.Element {
  const {
    networkRequests,
    logs,
    events,
    setSelectedNetworkRequest,
    setSelectedLogEntry,
    setActiveTab,
  } = useAppLens();

  const config = AppLens.getConfig();

  // Log breakdown by level
  const logCounts = React.useMemo(() => {
    const counts: Record<LogLevel, number> = {
      log: 0, info: 0, warn: 0, error: 0, debug: 0,
    };
    for (const e of logs) { counts[e.level]++; }
    return counts;
  }, [logs]);

  const errorCount = networkRequests.filter(r => r.state === 'error' || (r.status !== undefined && r.status >= 500)).length;

  const lastNetworkRequests = networkRequests.slice(-3).reverse();
  const lastLogs = logs.slice(-3).reverse();
  const lastEvents = events.slice(-3).reverse();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Stats */}
      <SectionHeader title="Summary" />
      <View style={styles.statsRow}>
        <StatCard label="Requests" value={networkRequests.length} color="#2563eb" />
        <StatCard label="Errors" value={errorCount} color="#dc2626" />
        <StatCard label="Events" value={events.length} color="#16a34a" />
        <StatCard label="Logs" value={logs.length} color="#d97706" />
      </View>

      {/* Log breakdown */}
      <SectionHeader title="Log Levels" />
      <View style={styles.logLevels}>
        {(Object.entries(logCounts) as [LogLevel, number][]).map(([level, count]) => (
          <View key={level} style={styles.logLevelItem}>
            <Badge label={level.toUpperCase()} color={LOG_LEVEL_COLORS[level]} />
            <Text style={styles.logLevelCount}>{count}</Text>
          </View>
        ))}
      </View>

      {/* Config */}
      <SectionHeader title="Configuration" />
      <View style={styles.configCard}>
        {(
          [
            ['Network', config.network],
            ['Console', config.console],
            ['Events', config.events],
            ['AI', config.ai],
          ] as [string, boolean][]
        ).map(([key, val]) => (
          <View key={key} style={styles.configRow}>
            <Text style={styles.configKey}>{key}</Text>
            <Badge
              label={val ? 'ON' : 'OFF'}
              color={val ? '#16a34a' : '#555'}
            />
          </View>
        ))}
        {config.aiModel && (
          <View style={styles.configRow}>
            <Text style={styles.configKey}>AI Model</Text>
            <Text style={styles.configVal}>{config.aiModel}</Text>
          </View>
        )}
      </View>

      {/* Recent network */}
      {lastNetworkRequests.length > 0 && (
        <>
          <SectionHeader title="Recent Requests" />
          <View style={styles.previewCard}>
            {lastNetworkRequests.map(r => (
              <NetworkEntry
                key={r.id}
                request={r}
                onPress={() => {
                  setSelectedNetworkRequest(r);
                  setActiveTab('Network');
                }}
              />
            ))}
          </View>
        </>
      )}

      {/* Recent logs */}
      {lastLogs.length > 0 && (
        <>
          <SectionHeader title="Recent Logs" />
          <View style={styles.previewCard}>
            {lastLogs.map(e => (
              <LogEntryRow
                key={e.id}
                entry={e}
                onPress={() => {
                  setSelectedLogEntry(e);
                  setActiveTab('Console');
                }}
              />
            ))}
          </View>
        </>
      )}

      {/* Recent events */}
      {lastEvents.length > 0 && (
        <>
          <SectionHeader title="Recent Events" />
          <View style={styles.previewCard}>
            {lastEvents.map(ev => (
              <View key={ev.id} style={styles.eventRow}>
                <Text style={styles.eventName}>{ev.name}</Text>
                <Text style={styles.eventTime}>
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  content: {
    padding: 12,
  },
  sectionHeader: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  logLevels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  logLevelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  logLevelCount: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
  },
  configCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  configKey: {
    color: '#ccc',
    fontSize: 14,
  },
  configVal: {
    color: '#888',
    fontSize: 13,
  },
  previewCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  eventName: {
    color: '#ccc',
    fontSize: 13,
  },
  eventTime: {
    color: '#555',
    fontSize: 11,
  },
  bottomSpacer: {
    height: 24,
  },
});
