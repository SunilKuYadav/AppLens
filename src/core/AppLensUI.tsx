import React from 'react';
import { AppLensProvider } from './AppLensProvider';
import { AppLensTrigger } from '../components/AppLensTrigger';
import { AppLensModal } from '../components/AppLensModal';

interface AppLensUIProps {
  children?: React.ReactNode;
}

/**
 * AppLensUI is the all-in-one component that consumers render.
 *
 * It wraps the application (or a sibling) in the AppLensProvider context,
 * renders the floating trigger button, and mounts the full-screen debug modal.
 *
 * Usage:
 * ```tsx
 * // In App.tsx — render alongside your app tree (not wrapping it)
 * <>
 *   <AppLensUI />
 * </>
 * ```
 *
 * Or as a wrapper:
 * ```tsx
 * <AppLensUI>
 *   <YourApp />
 * </AppLensUI>
 * ```
 */
export function AppLensUI({ children }: AppLensUIProps): React.JSX.Element {
  return (
    <AppLensProvider>
      {children}
      <AppLensTrigger />
      <AppLensModal />
    </AppLensProvider>
  );
}
