const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration for Example
 * Resolves the local @applens/react-native package from the parent directory.
 *
 * The lib root (/AppLens) has its own node_modules/react. Metro's resolver
 * walks UP the directory tree from each source file, so lib source files
 * would find /AppLens/node_modules/react instead of Example's copy —
 * giving us two React instances and breaking context.
 *
 * Fix: blockList the entire lib node_modules so Metro NEVER resolves from
 * there, and extraNodeModules pins every shared package to Example's copy.
 */

const appLensRoot = path.resolve(__dirname, '..');
const libNodeModules = path.resolve(appLensRoot, 'node_modules');
const nm = (pkg) => path.resolve(__dirname, 'node_modules', pkg);

// Escape a path for use in a RegExp
function escPath(p) {
  return p.replace(/[/\\]/g, '[\\\\/]');
}

const config = {
  watchFolders: [appLensRoot],

  resolver: {
    unstable_enablePackageExports: true,

    extraNodeModules: {
      // The lib itself
      '@applens/react-native': path.resolve(appLensRoot, 'src/index.ts'),

      // Shared singletons — must be exactly one copy in the bundle
      react: nm('react'),
      'react-native': nm('react-native'),
      'react/jsx-runtime': nm('react/jsx-runtime'),
      'react/jsx-dev-runtime': nm('react/jsx-dev-runtime'),

      // Babel runtime helpers
      '@babel/runtime': nm('@babel/runtime'),

      // openai — stubbed out (AI disabled, real SDK needs Node.js shims)
      openai: path.resolve(__dirname, 'shims/openai.js'),
    },

    blockList: [
      // Block ALL of the lib's node_modules from being resolved or crawled.
      // This forces every import inside lib source files to fall through to
      // extraNodeModules above, which points at Example's node_modules.
      new RegExp('^' + escPath(libNodeModules) + escPath(path.sep) + '.*'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
