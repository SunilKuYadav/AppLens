import React from 'react';

/**
 * AppLensProvider — stub placeholder.
 *
 * The full implementation (modal overlay, context, tab shell) is delivered
 * in FEAT-002. This stub exists so index.ts can export it cleanly and
 * consumers can wrap their app tree now without waiting for FEAT-002.
 */
interface AppLensProviderProps {
  children: React.ReactNode;
}

export function AppLensProvider({
  children,
}: AppLensProviderProps): React.JSX.Element {
  // TODO(FEAT-002): Render the AppLens debug modal overlay here.
  return <>{children}</>;
}
