module.exports = {
  preset: '@react-native/jest-preset',
  // The default preset's transformIgnorePatterns does not allow Jest to
  // transform the ESM published by React Navigation and its native deps,
  // which breaks `App` imports. Allowlist those packages so they are
  // transformed by Babel like the rest of the app.
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|react-native-safe-area-context|react-native-screens|react-native-markdown-display)/)',
  ],
  // Keep the preset's RN polyfill setup, then provide XMLHttpRequest/fetch
  // globals (present in the RN runtime, absent in the Node test env) before
  // App.tsx initializes AppLens at module load.
  setupFiles: [
    require.resolve('@react-native/jest-preset/jest/setup.js'),
    '<rootDir>/jest.setup.js',
  ],
};
