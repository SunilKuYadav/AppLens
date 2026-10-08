# ShopDemo — AppLens Example App

ShopDemo is a small React Native shopping demo (product list, product detail, cart, orders) used to exercise the [`@applens/react-native`](../README.md) library. It consumes AppLens via a `file:../` dependency and includes an **AI Test Lab** tab that generates realistic runtime evidence so you can try the AppLens AI assistant against grounded data.

The demo is deliberately generic. It calls a public demo API (`https://fakestoreapi.com`) and tracks a couple of events (`add_to_cart`, `order_placed`); there is no proprietary logic.

---

## Prerequisites

- A working React Native 0.87 environment — follow the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide for your OS.
- Node.js and npm.
- iOS: Xcode + CocoaPods. Android: Android Studio + an emulator.
- Install dependencies from this `Example/` folder:

```sh
npm install
```

AppLens itself needs no build step — it ships raw TypeScript and is resolved from `../` via Metro and the tsconfig path mapping.

---

## Running the app

Start Metro from this folder:

```sh
npm start
```

### iOS

Install pods on first run (and after native dep changes), then launch:

```sh
bundle install          # first time only, installs CocoaPods
bundle exec pod install
npm run ios
```

### Android

```sh
npm run android
```

> On the Android emulator, `127.0.0.1` points at the emulator, not your Mac. Any local server (like LM Studio) must be reached via `10.0.2.2`. The Example already picks the right base URL per platform in `App.tsx`.

Open the AppLens console at any time by tapping the floating trigger button; it opens the full-screen modal with the Overview, Network, Console, Events, Errors, AI, and Settings tabs.

---

## Configuring the AI (LM Studio)

The Example is wired for a local [LM Studio](https://lmstudio.ai) server (OpenAI-compatible). To get grounded AI answers:

1. In LM Studio, **load a model** (the Example expects `qwen2.5-coder-14b-instruct`).
2. Enable **"Serve on Local Network"** so the server binds `0.0.0.0`, not just localhost.
3. Confirm the base URL matches your platform:

   | Platform | Base URL |
   | --- | --- |
   | iOS simulator | `http://127.0.0.1:1234/v1` |
   | Android emulator | `http://10.0.2.2:1234/v1` |
   | Physical device | `http://<your-computer-LAN-IP>:1234/v1` |

4. Make sure `aiModel` in `App.tsx` matches the model name loaded in LM Studio.

`App.tsx` already selects `10.0.2.2` on Android and `127.0.0.1` elsewhere. Android debug builds may need cleartext `http` traffic allowed.

> The real `openai` SDK is replaced in this Example by a small fetch-based shim (`shims/openai.js`) so it works in the RN runtime.

---

## Testing AI capabilities

The **AI Lab** tab (🧪) lists runnable scenarios. Each card has a **Run scenario** button that produces deterministic runtime evidence (network requests, console output, tracked events, and — where relevant — a captured error), and a suggested question with a **Copy question** button.

How to use the lab:

1. Open the **AI Lab** tab and tap **Run scenario** on a card. Wait for it to show *done*.
2. Tap **Copy question** to copy that scenario's suggested question.
3. Open the AppLens console → **AI** tab, paste the question, and send it.
4. The AI reads the runtime evidence via the Context Engine and answers. Every reply ends with a `Confidence: High | Medium | Low` line, shown as a badge, and a collapsible "Context used" section lists which chunks were included.

There is no prefilled-prompt API in AppLens, so the lab uses tap-to-copy rather than injecting the prompt for you.

### Scenarios

| # | Scenario | Suggested question (tap to copy) | Expected grounded answer |
|---|---|---|---|
| 1 | **Failed checkout request** | `Why did checkout fail?` | AI cites the failed request (HTTP 500, or the 404 fallback) and the `checkout_failed` event it logged. |
| 2 | **Response shape mismatch** | `The checkout API succeeds but the confirmation is empty. Why?` | AI notes the request returned 200 but the expected nested field was missing, so the confirmation id is `undefined`. |
| 3 | **Runtime error** | `What caused the latest error and where in the code?` | AI reports the captured error (`Cannot read property "total" of undefined`) and its stack. |
| 4 | **Slow request + warnings** | `Which requests are slow and what was logged around them?` | AI identifies the ~3s request (`httpbin.org/delay/3`) by duration and relates it to the surrounding warnings. |
| 5 | **Session event funnel** | `Summarize the user's last session flow.` | AI summarizes the event sequence `cart_viewed → checkout_started → payment_failed`. |
| 6 | **Secret redaction** | `What auth token was sent?` | AI reports the `Authorization` header is `[REDACTED]` and cannot disclose it. The body `password`/`token` are `[REDACTED]` too, because the Example enables `redaction.fields`. |
| 7 | **Code correlation** | `Which file makes the /carts request?` | With the knowledge graph loaded, AI relates the runtime `/carts` POST to `CartScreen` (the Example screen that issues it). |

### Scenario #7 and the knowledge graph

Scenario 7 relies on a pre-built source manifest. The Example already ships one at `src/aiLab/knowledge-graph.json` and loads it in `App.tsx` via `AppLens.loadKnowledgeGraph(...)`. To regenerate it yourself, run the Code Indexer from the AppLens package root:

```sh
cd ..
node src/ai/index-project.js Example/src > Example/src/aiLab/knowledge-graph.json
```

The indexer is a Node-only regex/heuristic scanner, so treat the graph as a best-effort map of screens/components/hooks/services.

### Offline note

Every scenario is wrapped so it still leaves evidence when the device is offline — the network calls fall back or fail gracefully, but the console logs and tracked events are still recorded. Only the AI answer itself degrades without a reachable model (or if LM Studio isn't serving). The redaction, funnel, and error scenarios remain fully demonstrable offline because their evidence is local.

---

## Project layout

```
Example/
├── App.tsx                      # AppLens.initialize + loadKnowledgeGraph + <AppLensUI />
├── src/
│   ├── navigation/              # bottom tabs (Products, Cart, Orders, AI Lab)
│   ├── screens/                 # ProductList, ProductDetail, Cart, Orders, AILab
│   ├── store/                   # cart state (reducer + context)
│   ├── types/
│   └── aiLab/
│       ├── scenarios.ts         # the AI Test Lab scenario definitions
│       └── knowledge-graph.json # pre-built manifest for scenario 7
├── shims/openai.js              # fetch-based OpenAI shim for the RN runtime
└── __tests__/                   # Jest smoke tests
```

---

## Testing & verification

```sh
npx tsc --noEmit     # type-check
npx jest             # unit/smoke tests
npx eslint src       # lint
```

No native simulator build is required for these checks.
