/**
 * AI Test Lab scenarios.
 *
 * Each scenario produces deterministic runtime evidence — network requests,
 * console output, tracked events, and (where possible) a captured error — so
 * that the AppLens AI tab has grounded context to reason about.
 *
 * All framing is generic (ShopDemo). Every `run()` is wrapped so that an
 * offline device still produces log + event evidence and never crashes.
 *
 * There is no prefilled-prompt API in AppLens, so each scenario exposes a
 * `suggestedQuestion` the developer taps to copy, then pastes into the AI tab.
 */

import { AppLens } from '@applens/react-native';

export interface Scenario {
  /** Stable identifier */
  id: string;
  /** Short human-readable title */
  title: string;
  /** What the scenario does and what the AI should be able to explain */
  description: string;
  /** Question to copy into the AppLens AI tab after running the scenario */
  suggestedQuestion: string;
  /** Generate the runtime evidence. Never throws. */
  run: () => Promise<void>;
}

/** Small delay helper for sequencing evidence. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Scenario 1 — Failed API ──────────────────────────────────────────────────

const failedApi: Scenario = {
  id: 'failed-api',
  title: '1 · Failed checkout request',
  description:
    'Sends a request that returns a server error (HTTP 500), logs the failure, ' +
    'and tracks a checkout_failed event. The AI should connect the failed ' +
    'request to the event and explain the failure.',
  suggestedQuestion: 'Why did checkout fail?',
  async run() {
    try {
      let status = 0;
      try {
        const res = await fetch('https://httpbin.org/status/500');
        status = res.status;
      } catch {
        // httpbin may be blocked offline — fall back to a 404 endpoint.
        const res = await fetch(
          'https://jsonplaceholder.typicode.com/doesnotexist',
        );
        status = res.status;
      }
      if (status >= 400) {
        console.error('checkout failed', { status });
        AppLens.trackEvent('checkout_failed', { status });
      }
    } catch (err) {
      // Fully offline — still leave evidence behind.
      console.error('checkout failed (network unreachable)', err);
      AppLens.trackEvent('checkout_failed', { status: 'network_error' });
    }
  },
};

// ─── Scenario 2 — Response shape mismatch ──────────────────────────────────────

const shapeMismatch: Scenario = {
  id: 'shape-mismatch',
  title: '2 · Response shape mismatch',
  description:
    'Calls an endpoint that returns 200 OK but with a different JSON shape than ' +
    'the code expects. The code reads a missing nested field, producing an ' +
    'undefined confirmation id that is logged.',
  suggestedQuestion:
    'The checkout API succeeds but the confirmation is empty. Why?',
  async run() {
    try {
      const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
      const data: { order?: { id?: string } } = await res.json();
      // The API responds with { userId, id, title, completed } — there is no
      // `order` object, so this read is undefined.
      const confirmationId = data?.order?.id;
      console.warn('confirmation id is', confirmationId);
    } catch (err) {
      console.warn('confirmation lookup failed', err);
    }
  },
};

// ─── Scenario 3 — Runtime error / unhandled rejection ───────────────────────────

const runtimeError: Scenario = {
  id: 'runtime-error',
  title: '3 · Runtime error',
  description:
    'Throws inside an async task to produce a captured error with a stack trace ' +
    '(Hermes also surfaces it as an unhandled rejection). The error is also ' +
    'logged so evidence exists on non-Hermes engines.',
  suggestedQuestion: 'What caused the latest error and where in the code?',
  async run() {
    const trigger = async (): Promise<void> => {
      await delay(50);
      throw new Error('Cannot read property "total" of undefined (checkout)');
    };
    try {
      await trigger();
    } catch (err) {
      // Log it so there is evidence even without the Hermes rejection tracker.
      console.error('Unhandled error during checkout', err);
      // Re-raise asynchronously so the ErrorInterceptor / rejection tracker
      // can also capture it where supported.
      setTimeout(() => {
        throw err;
      }, 0);
    }
  },
};

// ─── Scenario 4 — Slow request + warning burst ──────────────────────────────────

const slowRequest: Scenario = {
  id: 'slow-request',
  title: '4 · Slow request + warnings',
  description:
    'Issues a deliberately slow request and emits several warnings around it. ' +
    'The AI should identify the slow request by its duration and relate it to ' +
    'the surrounding log noise.',
  suggestedQuestion: 'Which requests are slow and what was logged around them?',
  async run() {
    console.warn('inventory sync starting (this may be slow)');
    try {
      await fetch('https://httpbin.org/delay/3');
      console.warn('inventory sync completed');
    } catch (err) {
      console.warn('inventory sync failed or timed out', err);
    }
    console.warn('inventory cache may be stale');
    console.warn('consider retrying inventory sync');
  },
};

// ─── Scenario 5 — Event funnel ──────────────────────────────────────────────────

const eventFunnel: Scenario = {
  id: 'event-funnel',
  title: '5 · Session event funnel',
  description:
    'Tracks a sequence of events representing a user session that ends in a ' +
    'failed payment. The AI should summarize the flow from the event stream.',
  suggestedQuestion: "Summarize the user's last session flow.",
  async run() {
    AppLens.trackEvent('cart_viewed', { items: 2 });
    await delay(120);
    AppLens.trackEvent('checkout_started', { total: 59.98 });
    await delay(120);
    AppLens.trackEvent('payment_failed', { reason: 'card_declined' });
  },
};

// ─── Scenario 6 — Redaction check ───────────────────────────────────────────────

const redactionCheck: Scenario = {
  id: 'redaction-check',
  title: '6 · Secret redaction',
  description:
    'Sends a request carrying a secret in the Authorization header and in the ' +
    'JSON body. AppLens redacts the Authorization header value by default; the ' +
    'Example also enables body-field redaction (redaction.fields), so password ' +
    'and token in the body are redacted too. The AI must not be able to reveal ' +
    'the secret.',
  suggestedQuestion: 'What auth token was sent?',
  async run() {
    try {
      await fetch('https://httpbin.org/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-demo-SECRET-TOKEN-123',
        },
        body: JSON.stringify({
          password: 'hunter2',
          token: 'tok_demo_SECRET',
          note: 'this request intentionally carries secrets',
        }),
      });
      console.log('redaction scenario: request sent with secret credentials');
    } catch (err) {
      console.warn('redaction scenario request failed (offline)', err);
    }
  },
};

// ─── Scenario 7 — Code correlation (knowledge graph) ────────────────────────────

const codeCorrelation: Scenario = {
  id: 'code-correlation',
  title: '7 · Code correlation',
  description:
    'Makes the same /carts checkout request the Cart screen uses. With the ' +
    'Example knowledge graph loaded (see App.tsx), the AI can relate the ' +
    'runtime request to the source file that issues it.',
  suggestedQuestion: 'Which file makes the /carts request?',
  async run() {
    try {
      await fetch('https://fakestoreapi.com/carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 1,
          date: new Date().toISOString(),
          products: [{ productId: 1, quantity: 1 }],
        }),
      });
      console.log('code-correlation scenario: /carts request sent');
    } catch (err) {
      console.warn('code-correlation scenario request failed (offline)', err);
    }
  },
};

/** All AI Test Lab scenarios, in display order. */
export const scenarios: Scenario[] = [
  failedApi,
  shapeMismatch,
  runtimeError,
  slowRequest,
  eventFunnel,
  redactionCheck,
  codeCorrelation,
];
