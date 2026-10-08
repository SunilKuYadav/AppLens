import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppLens } from './AppLens';
import { NetworkRequest } from '../types/NetworkTypes';
import { LogEntry } from '../types/LogTypes';
import { AppEvent } from '../types/EventTypes';

// ─── Context type ──────────────────────────────────────────────────────────

interface AppLensContextValue {
  modalVisible: boolean;
  setModalVisible: (v: boolean) => void;
  activeTab: TabName;
  setActiveTab: (tab: TabName) => void;
  selectedNetworkRequest: NetworkRequest | null;
  setSelectedNetworkRequest: (r: NetworkRequest | null) => void;
  selectedLogEntry: LogEntry | null;
  setSelectedLogEntry: (e: LogEntry | null) => void;
  networkRequests: NetworkRequest[];
  logs: LogEntry[];
  events: AppEvent[];
}

export type TabName = 'Overview' | 'Network' | 'Console' | 'Events' | 'AI' | 'Settings';

const AppLensContext = createContext<AppLensContextValue | null>(null);

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useAppLens(): AppLensContextValue {
  const ctx = useContext(AppLensContext);
  if (!ctx) {
    throw new Error('useAppLens must be used inside AppLensProvider');
  }
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────

interface AppLensProviderProps {
  children: React.ReactNode;
}

export function AppLensProvider({ children }: AppLensProviderProps): React.JSX.Element {
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>('Overview');
  const [selectedNetworkRequest, setSelectedNetworkRequest] =
    useState<NetworkRequest | null>(null);
  const [selectedLogEntry, setSelectedLogEntry] = useState<LogEntry | null>(null);

  // Live data from storage
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);

  // Subscribe to storage changes
  useEffect(() => {
    const storage = AppLens.getStorage();

    const sync = () => {
      setNetworkRequests([...storage.getNetworkRequests()]);
      setLogs([...storage.getLogs()]);
      setEvents([...storage.getEvents()]);
    };

    // Initial load
    sync();

    // Subscribe to future changes
    const unsubscribe = storage.subscribe(sync);
    return unsubscribe;
  }, []);

  const value = useMemo<AppLensContextValue>(
    () => ({
      modalVisible,
      setModalVisible,
      activeTab,
      setActiveTab,
      selectedNetworkRequest,
      setSelectedNetworkRequest,
      selectedLogEntry,
      setSelectedLogEntry,
      networkRequests,
      logs,
      events,
    }),
    [
      modalVisible,
      activeTab,
      selectedNetworkRequest,
      selectedLogEntry,
      networkRequests,
      logs,
      events,
    ],
  );

  return <AppLensContext.Provider value={value}>{children}</AppLensContext.Provider>;
}

// ─── Convenience reset helper (used by tabs) ──────────────────────────────

export function useSetModalVisible(): (v: boolean) => void {
  const { setModalVisible } = useAppLens();
  return useCallback((v: boolean) => setModalVisible(v), [setModalVisible]);
}
