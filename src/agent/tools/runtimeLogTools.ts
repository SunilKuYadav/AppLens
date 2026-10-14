import {
  ConsoleLogSummary,
  DeviceToolName,
  NetworkLogSummary,
} from '../protocol';

/** Default maximum number of log entries requested from the device. */
export const DEFAULT_LOG_COUNT = 50;

/** Default time (ms) to wait for the device to answer a tool_call. */
export const DEFAULT_TOOL_TIMEOUT_MS = 15_000;

/**
 * The channel the runtime-log tools use to reach the device. The server
 * implements this over the paired WebSocket: it sends a `tool_call` and
 * resolves the returned promise when the matching `tool_result` arrives
 * (correlated by `callId`), rejecting on timeout.
 */
export interface DeviceBridge {
  /**
   * Send a device-side tool call and await its result.
   *
   * @param name    - Which device tool to invoke.
   * @param args    - Tool arguments.
   * @param timeout - Milliseconds to wait before rejecting.
   */
  callDeviceTool(
    name: DeviceToolName,
    args: Record<string, unknown>,
    timeout?: number,
  ): Promise<unknown>;
}

/**
 * Ask the device for recent network logs (resolved on the device from
 * `AppLensStorage.getNetworkRequests()` in FEAT-002). Returns at most `count`
 * compact summaries. A busy ring buffer cannot overflow the WS frame because
 * the count is capped and the device trims to it.
 */
export async function getNetworkLogs(
  bridge: DeviceBridge,
  count: number = DEFAULT_LOG_COUNT,
  timeout: number = DEFAULT_TOOL_TIMEOUT_MS,
): Promise<NetworkLogSummary[]> {
  const result = await bridge.callDeviceTool(
    'get_network_logs',
    { count: capCount(count) },
    timeout,
  );
  return Array.isArray(result) ? (result as NetworkLogSummary[]) : [];
}

/**
 * Ask the device for recent console logs (resolved on the device from
 * `AppLensStorage.getLogs()` in FEAT-002). Returns at most `count` compact
 * summaries.
 */
export async function getConsoleLogs(
  bridge: DeviceBridge,
  count: number = DEFAULT_LOG_COUNT,
  timeout: number = DEFAULT_TOOL_TIMEOUT_MS,
): Promise<ConsoleLogSummary[]> {
  const result = await bridge.callDeviceTool(
    'get_console_logs',
    { count: capCount(count) },
    timeout,
  );
  return Array.isArray(result) ? (result as ConsoleLogSummary[]) : [];
}

/** Clamp a requested count to a sane [1, 200] window. */
function capCount(count: number): number {
  if (!Number.isFinite(count) || count < 1) {
    return DEFAULT_LOG_COUNT;
  }
  return Math.min(200, Math.floor(count));
}
