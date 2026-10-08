# AppLens

A developer-focused debugging and observability library for React Native applications. AppLens provides an in-app developer console where you can inspect network requests, console logs, application events, runtime information, and get AI-powered analysis of your application's runtime behaviour and source code.

---

## Installation

### 1. Add the dependency

For local development (file path):

```json
// package.json
{
  "dependencies": {
    "@applens/react-native": "file:../AppLens"
  }
}
```

Then install:

```sh
npm install
# or
yarn install
```

### 2. Add path mapping in tsconfig.json

```json
{
  "compilerOptions": {
    "paths": {
      "@applens/react-native": ["../AppLens/src/index.ts"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    "../AppLens/src/**/*.ts",
    "../AppLens/src/**/*.tsx"
  ]
}
```

---

## Quick Start

```tsx
// App.tsx
import { useEffect } from 'react';
import { AppLens, AppLensUI } from '@applens/react-native';

const App = () => {
  useEffect(() => {
    AppLens.initialize({
      enabled: __DEV__,
      network: true,
      console: true,
      events: true,
      ai: true,
      projectRoot: '/path/to/your/project',
    });
  }, []);

  return (
    <SafeAreaProvider>
      <YourApp />
      {__DEV__ && <AppLensUI />}
    </SafeAreaProvider>
  );
};
```

---

## Initialization API

Call `AppLens.initialize(config)` once at app startup (before any rendering).

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch. When `false`, no interception or UI occurs. |
| `network` | `boolean` | `true` | Capture network requests (XHR / fetch). |
| `console` | `boolean` | `true` | Capture `console.log/info/warn/error/debug` output. |
| `events` | `boolean` | `true` | Enable the `AppLens.trackEvent()` API. |
| `ai` | `boolean` | `true` | Enable the AI tab and AI analysis features. |
| `aiApiKey` | `string` | `undefined` | OpenAI API key used by the AI assistant. |
| `aiModel` | `string` | `'gpt-4o'` | OpenAI model identifier. |
| `projectRoot` | `string` | `undefined` | Absolute path to the host project root, used by the Code Indexer for AI context. |
| `maxNetworkEntries` | `number` | `200` | Maximum number of network requests to keep in memory. |
| `maxLogEntries` | `number` | `500` | Maximum number of console log entries to keep in memory. |
| `maxEventEntries` | `number` | `200` | Maximum number of tracked events to keep in memory. |
| `sensitiveHeaders` | `string[]` | `['Authorization','Cookie','x-api-key','x-auth-token']` | Headers whose values are redacted from all network logs. |
| `persistLogs` | `boolean` | `false` | Persist logs across app restarts using AsyncStorage. |
| `verboseLogging` | `boolean` | `false` | Enable verbose internal AppLens logging (useful when debugging AppLens itself). |

### Example

```ts
AppLens.initialize({
  enabled: __DEV__,
  network: true,
  console: true,
  events: true,
  ai: true,
  aiApiKey: process.env.OPENAI_API_KEY,
  aiModel: 'gpt-4o',
  projectRoot: '/Users/you/projects/MyApp',
  sensitiveHeaders: ['Authorization', 'x-api-key'],
  maxNetworkEntries: 300,
  persistLogs: false,
});
```

---

## `<AppLensUI />` Component

Renders the floating trigger button and the full-screen debug modal. Place it as the last child inside your root provider so it renders on top of all other UI.

```tsx
{__DEV__ && <AppLensUI />}
```

No props required. All configuration is handled via `AppLens.initialize()`.

The modal contains the following tabs:

| Tab | What it shows |
|---|---|
| **Overview** | App name, version, environment, runtime statistics summary (request count, error count, log count, event count). |
| **Network** | List of all captured HTTP requests with method, URL, status code, and duration. Tap a request for full detail: URL, method, headers, query params, request body, response headers, response body, error info, and contextual trigger info. |
| **Console** | Captured console output (`log`, `info`, `warn`, `error`, `debug`). Searchable and filterable by level. Tap a log for full detail including stack trace. |
| **Events** | Custom events sent via `AppLens.trackEvent()`. Searchable, filterable, and clearable. |
| **AI** | Conversational AI assistant with full context of the application's runtime state and (optionally) source code. |
| **Settings** | Toggle individual AppLens features on/off at runtime without restarting the app. |

---

## Tracking Custom Events

```ts
import { AppLens } from '@applens/react-native';

AppLens.trackEvent('checkout_started', {
  productId: '123',
  amount: 499,
  currency: 'USD',
});
```

### Event Shape

```ts
{
  name: string;
  timestamp: number;      // Unix ms
  properties?: Record<string, unknown>;
}
```

---

## Configuring the AI Key

The AI tab requires an OpenAI API key. Provide it during initialization:

```ts
AppLens.initialize({
  ai: true,
  aiApiKey: 'sk-...',   // your OpenAI API key
  aiModel: 'gpt-4o',    // optional, defaults to gpt-4o
});
```

> **Security note:** Never hard-code your API key in source control. Use environment variables or a secrets manager and inject the key at build time.

---

## AI Context and Code Awareness

AppLens AI is not a generic chatbot. It is given structured context from:

- Captured network requests and responses
- Console log history
- Tracked events
- Runtime error details
- The Application Knowledge Graph (component → hook → service → API → state relationships)
- Indexed source code (when `projectRoot` is configured)

### Application Knowledge Graph

AppLens builds an internal graph of relationships between your application's entities:

```
Component
   ↓
Hook
   ↓
Service
   ↓
API Endpoint
   ↓
Response Shape
   ↓
State / Store
   ↓
Component
```

The AI uses this graph when answering questions that require understanding data flow across multiple layers of the application — for example:

> "Why didn't my order get created?"
> "Trace the data flow from LoginScreen to HomeScreen."
> "Which component triggered this API request?"

### Code Indexer

When `projectRoot` is set, AppLens indexes the project source files and builds a vector-search index so the AI can retrieve only the relevant code snippets for each question rather than sending the entire project with every prompt.

---

## Sensitive Header Redaction

By default, AppLens redacts the values of these headers from all network logs:

- `Authorization`
- `Cookie`
- `x-api-key`
- `x-auth-token`

The logged value is replaced with `[REDACTED]`. To customize the list:

```ts
AppLens.initialize({
  sensitiveHeaders: ['Authorization', 'x-session-id', 'x-device-token'],
});
```

---

## Runtime Settings

All settings can also be toggled at runtime from the **Settings** tab inside the AppLens modal without restarting the application.

---

## Architecture Overview

```
@applens/react-native
├── src/
│   ├── core/
│   │   ├── AppLens.ts          # Singleton — initialize(), trackEvent(), getters
│   │   ├── AppLensConfig.ts    # Config type and defaults
│   │   ├── AppLensProvider.tsx # React context provider + useAppLens hook
│   │   └── AppLensUI.tsx       # Root React component (trigger + modal)
│   ├── interceptors/
│   │   ├── NetworkInterceptor.ts  # Monkey-patches global XHR and fetch
│   │   └── ConsoleInterceptor.ts  # Overrides global console methods
│   ├── components/
│   │   ├── AppLensModal.tsx    # Full-screen debug modal with tab navigation
│   │   ├── AppLensTrigger.tsx  # Floating action button
│   │   └── tabs/               # Overview, Network, Console, Events, AI, Settings
│   ├── ai/
│   │   ├── AIProvider.ts       # Abstract AI provider interface
│   │   ├── OpenAIProvider.ts   # OpenAI implementation
│   │   ├── LocalAIProvider.ts  # Local/stub implementation
│   │   ├── KnowledgeGraph.ts   # Application entity graph
│   │   └── ContextEngine.ts    # Assembles context chunks for AI prompts
│   ├── store/
│   │   └── AppLensStore.ts     # Internal Zustand store
│   └── types/                  # NetworkTypes, LogTypes, EventTypes, AITypes
```

---

## License

MIT
