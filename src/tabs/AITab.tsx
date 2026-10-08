import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder for FEAT-003.
 * The AI assistant tab will be implemented in FEAT-003.
 */
export function AITab(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🤖</Text>
      <Text style={styles.heading}>AppLens AI</Text>
      <Text style={styles.sub}>AI tab — implemented in FEAT-003</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 48,
  },
  heading: {
    color: '#00ff88',
    fontSize: 20,
    fontWeight: '700',
  },
  sub: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
  },
});
