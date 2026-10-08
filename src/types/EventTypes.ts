/**
 * A structured application event tracked via AppLens.trackEvent().
 */
export interface AppEvent {
  /** Unique identifier for this event */
  id: string;
  /** Event name (e.g. 'checkout_started') */
  name: string;
  /** Unix timestamp (ms) when the event was tracked */
  timestamp: number;
  /** Optional structured properties associated with the event */
  properties?: Record<string, unknown>;
}
