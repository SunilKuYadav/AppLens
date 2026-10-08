import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLens, AppLensUI } from '@applens/react-native';
import { CartProvider } from './src/store/cartStore';
import { AppNavigator } from './src/navigation/AppNavigator';

// Initialize AppLens at module load time so interceptors are active before
// any network requests fire.
AppLens.initialize({
  enabled: true,
  network: true,
  console: true,
  events: true,
  ai: true,
  aiProvider: 'lmstudio',
  aiBaseURL: 'http://127.0.0.1:1234/v1',
  aiModel: 'qwen2.5-coder-14b-instruct',
});

console.log('ShopDemo: AppLens initialized');

export default function App(): React.JSX.Element {
  useEffect(() => {
    if (AppLens.isEnabled()) {
      console.log('ShopDemo: AppLens is active');
    }
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <CartProvider>
          <AppNavigator />
        </CartProvider>
      </NavigationContainer>
      {/* AppLensUI renders the floating trigger and debug modal above everything */}
      <AppLensUI />
    </SafeAreaProvider>
  );
}
