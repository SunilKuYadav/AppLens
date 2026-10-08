import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppLens, TabName } from '../core/AppLensProvider';
import { OverviewTab } from '../tabs/OverviewTab';
import { NetworkTab } from '../tabs/NetworkTab';
import { ConsoleTab } from '../tabs/ConsoleTab';
import { EventsTab } from '../tabs/EventsTab';
import { ErrorsTab } from '../tabs/ErrorsTab';
import { AITab } from '../tabs/AITab';
import { SettingsTab } from '../tabs/SettingsTab';

const TABS: TabName[] = ['Overview', 'Network', 'Console', 'Events', 'Errors', 'AI', 'Settings'];

function TabContent({ tab }: { tab: TabName }): React.JSX.Element {
  switch (tab) {
    case 'Overview':  return <OverviewTab />;
    case 'Network':   return <NetworkTab />;
    case 'Console':   return <ConsoleTab />;
    case 'Events':    return <EventsTab />;
    case 'Errors':    return <ErrorsTab />;
    case 'AI':        return <AITab />;
    case 'Settings':  return <SettingsTab />;
    default:          return <OverviewTab />;
  }
}

export function AppLensModal(): React.JSX.Element {
  const { modalVisible, setModalVisible, activeTab, setActiveTab } = useAppLens();

  return (
    <Modal
      visible={modalVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            <Text style={styles.headerAccent}>App</Text>Lens
          </Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setModalVisible(false)}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            accessibilityRole="button"
          >
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBarWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBar}
          >
            {TABS.map(tab => (
              <TouchableOpacity
                key={tab}
                style={styles.tabItem}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === tab && styles.tabLabelActive,
                  ]}
                >
                  {tab}
                </Text>
                {activeTab === tab && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <TabContent tab={activeTab} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52, // safe area approximation for notched phones
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerAccent: {
    color: '#00ff88',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
  },
  closeText: {
    color: '#ccc',
    fontSize: 20,
    lineHeight: 22,
  },
  tabBarWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  tabLabel: {
    color: '#555',
    fontSize: 14,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#fff',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 14,
    right: 14,
    height: 2,
    backgroundColor: '#00ff88',
    borderRadius: 1,
  },
  content: {
    flex: 1,
  },
});
