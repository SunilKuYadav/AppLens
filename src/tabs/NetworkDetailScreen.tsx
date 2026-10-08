import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NetworkRequest } from '../types/NetworkTypes';
import { JSONViewer } from '../components/JSONViewer';
import { Badge } from '../components/Badge';

interface NetworkDetailScreenProps {
  request: NetworkRequest;
  onBack: () => void;
}

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function HeadersTable({ headers }: { headers: Record<string, string> }): React.JSX.Element {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return <Text style={styles.emptyText}>No headers</Text>;
  }
  return (
    <View style={styles.table}>
      {entries.map(([key, value]) => (
        <View key={key} style={styles.tableRow}>
          <Text style={styles.tableKey} numberOfLines={1}>{key}</Text>
          <Text style={styles.tableValue} numberOfLines={2}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function parseQueryParams(url: string): Record<string, string> {
  try {
    const u = new URL(url);
    const params: Record<string, string> = {};
    u.searchParams.forEach((v, k) => { params[k] = v; });
    return params;
  } catch {
    return {};
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

export function NetworkDetailScreen({
  request,
  onBack,
}: NetworkDetailScreenProps): React.JSX.Element {
  const queryParams = React.useMemo(() => parseQueryParams(request.url), [request.url]);
  const hasQueryParams = Object.keys(queryParams).length > 0;

  let parsedRequestBody: unknown = request.requestBody;
  try {
    if (typeof request.requestBody === 'string') {
      parsedRequestBody = JSON.parse(request.requestBody);
    }
  } catch { /* keep as string */ }

  let parsedResponseBody: unknown = request.responseBody;
  try {
    if (typeof request.responseBody === 'string') {
      parsedResponseBody = JSON.parse(request.responseBody);
    }
  } catch { /* keep as string */ }

  return (
    <View style={styles.container}>
      {/* Back header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {request.method.toUpperCase()} {(() => {
            try { return new URL(request.url).pathname; } catch { return request.url; }
          })()}
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Request section */}
        <SectionHeader title="Request" />
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>URL</Text>
            <Text style={styles.fieldValue} selectable>{request.url}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Method</Text>
            <Text style={styles.fieldValue}>{request.method.toUpperCase()}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Timestamp</Text>
            <Text style={styles.fieldValue}>
              {new Date(request.timestamp).toLocaleTimeString()}
            </Text>
          </View>
          {hasQueryParams && (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Query Params</Text>
              <JSONViewer data={queryParams} maxHeight={150} />
            </View>
          )}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Request Headers</Text>
            <HeadersTable headers={request.requestHeaders} />
          </View>
          {parsedRequestBody !== undefined && parsedRequestBody !== null && parsedRequestBody !== '' && (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Body</Text>
              <JSONViewer data={parsedRequestBody} maxHeight={200} />
            </View>
          )}
        </View>

        {/* Response section */}
        <SectionHeader title="Response" />
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Status</Text>
            {request.status !== undefined ? (
              <Badge
                label={`${request.status} ${request.statusText ?? ''}`}
                color={statusColor(request.status)}
              />
            ) : (
              <Text style={styles.fieldValue}>—</Text>
            )}
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Duration</Text>
            <Text style={styles.fieldValue}>
              {request.duration !== undefined ? `${request.duration}ms` : '—'}
            </Text>
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Response Headers</Text>
            <HeadersTable headers={request.responseHeaders} />
          </View>
          {parsedResponseBody !== undefined && parsedResponseBody !== null && parsedResponseBody !== '' && (
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Body</Text>
              <JSONViewer data={parsedResponseBody} maxHeight={300} />
            </View>
          )}
        </View>

        {/* Error section */}
        {request.state === 'error' && request.error && (
          <>
            <SectionHeader title="Error" />
            <View style={styles.card}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Message</Text>
                <Text style={[styles.fieldValue, styles.errorText]}>{request.error.message}</Text>
              </View>
              {request.error.code && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Code</Text>
                  <Text style={styles.fieldValue}>{request.error.code}</Text>
                </View>
              )}
              {request.error.stack && (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Stack Trace</Text>
                  <ScrollView horizontal>
                    <Text style={styles.stackText}>{request.error.stack}</Text>
                  </ScrollView>
                </View>
              )}
            </View>
          </>
        )}

        {/* Context section */}
        {request.context && (
          <>
            <SectionHeader title="Context" />
            <View style={styles.card}>
              {request.context.screen && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Screen</Text>
                  <Text style={styles.fieldValue}>{request.context.screen}</Text>
                </View>
              )}
              {request.context.hook && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Hook</Text>
                  <Text style={styles.fieldValue}>{request.context.hook}</Text>
                </View>
              )}
              {request.context.service && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Service</Text>
                  <Text style={styles.fieldValue}>{request.context.service}</Text>
                </View>
              )}
              {request.context.event && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Event</Text>
                  <Text style={styles.fieldValue}>{request.context.event}</Text>
                </View>
              )}
            </View>
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backArrow: {
    color: '#00ff88',
    fontSize: 22,
    lineHeight: 24,
  },
  backText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: '#ccc',
    fontSize: 13,
    flex: 1,
  },
  scroll: {
    flex: 1,
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
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 12,
  },
  fieldBlock: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 6,
  },
  fieldLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 100,
  },
  fieldValue: {
    color: '#ccc',
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  errorText: {
    color: '#dc2626',
  },
  stackText: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  table: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    gap: 8,
  },
  tableKey: {
    color: '#888',
    fontSize: 11,
    width: 130,
    fontFamily: 'monospace',
  },
  tableValue: {
    color: '#ccc',
    fontSize: 11,
    flex: 1,
    fontFamily: 'monospace',
  },
  emptyText: {
    color: '#555',
    fontSize: 12,
    fontStyle: 'italic',
  },
  bottomSpacer: {
    height: 24,
  },
});
