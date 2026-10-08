import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function OrdersScreen(): React.JSX.Element {
  useEffect(() => {
    console.log('Orders screen viewed');
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📦</Text>
      <Text style={styles.title}>Your orders will appear here</Text>
      <Text style={styles.subtitle}>
        This is a demo app. Orders are submitted to the FakeStore API and not
        persisted — place an order from the Cart screen to see the event logged
        in the AppLens Events tab.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F9FAFB',
  },
  icon: { fontSize: 64, marginBottom: 20 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
});
