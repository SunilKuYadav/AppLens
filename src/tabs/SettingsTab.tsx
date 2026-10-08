import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { AppLens } from '../core/AppLens';
import { AppLensConfig } from '../core/AppLensConfig';

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}

function ToggleRow({ label, description, value, onValueChange }: ToggleRowProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabels}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description && <Text style={styles.rowDesc}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#333', true: '#00ff8866' }}
        thumbColor={value ? '#00ff88' : '#888'}
        ios_backgroundColor="#333"
      />
    </View>
  );
}

export function SettingsTab(): React.JSX.Element {
  // Local copy of config so toggles are immediately responsive
  const [config, setConfig] = useState<AppLensConfig>(() => AppLens.getConfig());

  function update(partial: Partial<AppLensConfig>): void {
    const updated = { ...config, ...partial };
    setConfig(updated);
    // Propagate to singleton so future reads reflect the change
    AppLens.initialize(updated);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionHeader}>Core</Text>
      <View style={styles.card}>
        <ToggleRow
          label="AppLens Enabled"
          description="Master switch — disables all features when off"
          value={config.enabled}
          onValueChange={v => update({ enabled: v })}
        />
        <ToggleRow
          label="Network Logging"
          description="Intercept and display network requests"
          value={config.network}
          onValueChange={v => update({ network: v })}
        />
        <ToggleRow
          label="Console Logging"
          description="Capture console.log / warn / error"
          value={config.console}
          onValueChange={v => update({ console: v })}
        />
        <ToggleRow
          label="Event Logging"
          description="Track AppLens.trackEvent() calls"
          value={config.events}
          onValueChange={v => update({ events: v })}
        />
        <ToggleRow
          label="AI Assistant"
          description="Enable the AI tab (requires API key)"
          value={config.ai}
          onValueChange={v => update({ ai: v })}
        />
      </View>

      <Text style={styles.sectionHeader}>Storage</Text>
      <View style={styles.card}>
        <ToggleRow
          label="Persist Logs"
          description="Persist logs across app restarts (not yet implemented)"
          value={false}
          onValueChange={() => {
            // Not implemented — toggle is visual only
          }}
        />
        <ToggleRow
          label="Verbose Logging"
          description="Include extra debug information in AppLens itself"
          value={false}
          onValueChange={() => {
            // Not implemented — toggle is visual only
          }}
        />
      </View>

      <Text style={styles.sectionHeader}>AI</Text>
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Provider</Text>
          <Text style={styles.infoValue}>{config.aiProvider}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Model</Text>
          <Text style={styles.infoValue}>{config.aiModel ?? 'not set'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>API Key</Text>
          <Text style={styles.infoValue}>
            {config.aiApiKey ? '••••••••' : 'not set'}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>Limits</Text>
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Max Network Entries</Text>
          <Text style={styles.infoValue}>{config.maxNetworkEntries}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Max Log Entries</Text>
          <Text style={styles.infoValue}>{config.maxLogEntries}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Max Event Entries</Text>
          <Text style={styles.infoValue}>{config.maxEventEntries}</Text>
        </View>
      </View>

      <Text style={styles.version}>AppLens v0.1.0</Text>
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
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  rowLabels: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '500',
  },
  rowDesc: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  infoLabel: {
    color: '#888',
    fontSize: 13,
  },
  infoValue: {
    color: '#ccc',
    fontSize: 13,
  },
  version: {
    color: '#333',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
  bottomSpacer: {
    height: 24,
  },
});
