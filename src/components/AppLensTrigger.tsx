import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAppLens } from '../core/AppLensProvider';

export function AppLensTrigger(): React.JSX.Element {
  const { setModalVisible } = useAppLens();

  return (
    <TouchableOpacity
      style={styles.trigger}
      onPress={() => setModalVisible(true)}
      activeOpacity={0.8}
    >
      <Text style={styles.icon}>🔍</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  trigger: {
    position: 'absolute',
    bottom: 32,
    right: 16,
    zIndex: 9999,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0d0d0dCC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00ff88',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  icon: {
    fontSize: 20,
  },
});
