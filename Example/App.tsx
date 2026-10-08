import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLens, AppLensUI, GraphNode } from '@applens/react-native';
import { CartProvider } from './src/store/cartStore';
import { AppNavigator } from './src/navigation/AppNavigator';
import knowledgeGraph from './src/aiLab/knowledge-graph.json';

// Initialize AppLens at module load time so interceptors are active before
// any network requests fire.
AppLens.initialize({
  enabled: true,
  network: true,
  console: true,
  events: true,
  ai: true,
  aiProvider: 'lmstudio',
  // Base URL for the local LM Studio server.
  // - Android emulator: 10.0.2.2 maps to the host machine's localhost
  // - iOS simulator:    127.0.0.1 works and points at the Mac
  // - Physical device:  use the computer's LAN IP, e.g. http://192.168.1.4:1234/v1
  aiBaseURL: Platform.OS === 'android' ? 'http://10.0.2.2:1234/v1' : 'http://127.0.0.1:1234/v1',
  aiModel: 'qwen2.5-coder-14b-instruct',
  // Redact sensitive request/response BODY fields (header values are redacted
  // by default). Powers the AI Test Lab redaction scenario.
  redaction: {
    fields: ['password', 'token', 'secret', 'accessToken', 'refreshToken'],
  },
});

// Load the pre-built knowledge graph so the AI can correlate runtime activity
// with source files. Generate it with:
//   node src/ai/index-project.js Example/src > Example/src/aiLab/knowledge-graph.json
AppLens.loadKnowledgeGraph(knowledgeGraph as GraphNode[]);

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
