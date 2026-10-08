import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

interface JSONViewerProps {
  data: unknown;
  maxHeight?: number;
}

export function JSONViewer({ data, maxHeight = 300 }: JSONViewerProps): React.JSX.Element {
  const formatted = React.useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  return (
    <ScrollView
      style={[styles.container, { maxHeight }]}
      horizontal={false}
      nestedScrollEnabled
    >
      <Text style={styles.text}>{formatted}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderRadius: 6,
    padding: 8,
  },
  text: {
    color: '#b8d7a3',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
