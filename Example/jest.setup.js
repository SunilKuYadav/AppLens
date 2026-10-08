/**
 * Jest setup for the ShopDemo Example.
 *
 * React Native provides XMLHttpRequest and fetch globals at runtime, but the
 * Node test environment does not. AppLens attaches its network interceptor as
 * soon as App.tsx calls AppLens.initialize() at module load, so these globals
 * must exist before the App module is required. Provide inert stand-ins so the
 * interceptor can attach without performing any real network I/O during tests.
 */

/* eslint-env jest */

if (typeof global.XMLHttpRequest === 'undefined') {
  class MockXMLHttpRequest {
    open() {}
    send() {}
    setRequestHeader() {}
    addEventListener() {}
    getAllResponseHeaders() {
      return '';
    }
  }
  global.XMLHttpRequest = MockXMLHttpRequest;
}

if (typeof global.fetch === 'undefined') {
  global.fetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { forEach: () => {} },
      clone() {
        return this;
      },
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({}),
    });
}
