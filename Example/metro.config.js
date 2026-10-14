const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration for Example.
 *
 * AppLens can be consumed from one of two sources, selected by the
 * APPLENS_SOURCE environment variable:
 *
 *   APPLENS_SOURCE=local  (default) — resolve @applens/react-native from the
 *                          workspace source at ../src/index.ts. Edits to the
 *                          library are picked up immediately, no reinstall.
 *
 *   APPLENS_SOURCE=git    — resolve the installed package in
 *                          node_modules/@applens/react-native (the git-tag
 *                          dependency declared in package.json). This is what
 *                          a real consumer gets.
 *
 * See LOCAL-DEVELOPMENT.md for the full workflow and the npm script aliases.
 *
 * Why local mode needs extra care: the lib root (/AppLens) has its own
 * node_modules/react. Metro's resolver walks UP the directory tree from each
 * source file, so lib source files would find /AppLens/node_modules/react
 * instead of Example's copy — giving us two React instances and breaking
 * context. In local mode we blockList the entire lib node_modules so Metro
 * NEVER resolves from there, and extraNodeModules pins every shared package to
 * Example's copy. In git mode none of that is needed.
 */

const APPLENS_SOURCE = (process.env.APPLENS_SOURCE || 'local').toLowerCase();
const USE_LOCAL = APPLENS_SOURCE !== 'git';

const appLensRoot = path.resolve(__dirname, '..');
const libNodeModules = path.resolve(appLensRoot, 'node_modules');
const nm = (pkg) => path.resolve(__dirname, 'node_modules', pkg);

// Escape a path for use in a RegExp
function escPath(p) {
  return p.replace(/[/\\]/g, '[\\\\/]');
}

// Shared across both modes: the openai SDK is stubbed (AI disabled, the real
// SDK needs Node.js shims that don't exist in the RN runtime).
const baseExtraNodeModules = {
  openai: path.resolve(__dirname, 'shims/openai.js'),
};

// Absolute path to the workspace library source root (../src) and its entry.
const libSrc = path.resolve(appLensRoot, 'src');
const libSrcEntry = path.resolve(libSrc, 'index.ts');

// The installed git-tag copy of the library (a FULL source copy, not a
// symlink, with "main": "src/index.ts"). In local mode we must never resolve
// into it — see resolveRequest below.
const installedLibDir = path.resolve(__dirname, 'node_modules', '@applens', 'react-native');

const localConfig = {
  // Watch the library source so edits trigger a Metro reload.
  watchFolders: [appLensRoot],

  resolver: {
    unstable_enablePackageExports: true,

    extraNodeModules: {
      ...baseExtraNodeModules,

      // Shared singletons — must be exactly one copy in the bundle.
      react: nm('react'),
      'react-native': nm('react-native'),
      'react/jsx-runtime': nm('react/jsx-runtime'),
      'react/jsx-dev-runtime': nm('react/jsx-dev-runtime'),

      // Babel runtime helpers
      '@babel/runtime': nm('@babel/runtime'),

      // markdown renderer used by AITab
      'react-native-markdown-display': nm('react-native-markdown-display'),
    },

    blockList: [
      // Block ALL of the lib root's node_modules from being resolved or crawled
      // (prevents a second React, etc).
      new RegExp('^' + escPath(libNodeModules) + escPath(path.sep) + '.*'),
      // Block the installed git-tag copy entirely so Metro can never resolve
      // the library from node_modules in local mode.
      new RegExp('^' + escPath(installedLibDir) + escPath(path.sep) + '.*'),
    ],

    // IMPORTANT: extraNodeModules alone does NOT redirect the library when
    // unstable_enablePackageExports is on — Metro resolves @applens/react-native
    // via the installed package's own "main"/"exports" and loads it straight
    // from node_modules, so every relative import inside it stays in
    // node_modules and your ../src edits are ignored. A custom resolveRequest
    // intercepts the package specifier (and any subpath) and pins it to ../src
    // BEFORE package-exports resolution runs.
    resolveRequest: (context, moduleName, platform) => {
      if (
        moduleName === '@applens/react-native' ||
        moduleName.startsWith('@applens/react-native/')
      ) {
        const subpath = moduleName.slice('@applens/react-native'.length); // '' or '/foo'
        const target = subpath ? path.join(libSrc, subpath) : libSrcEntry;
        return context.resolveRequest(context, target, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

const gitConfig = {
  // No watchFolders / blockList needed: @applens/react-native resolves as an
  // ordinary installed package from Example/node_modules.
  resolver: {
    unstable_enablePackageExports: true,
    extraNodeModules: {
      ...baseExtraNodeModules,
    },
  },
};

const activeConfig = USE_LOCAL ? localConfig : gitConfig;

// eslint-disable-next-line no-console
console.log(
  `[AppLens] Metro resolving @applens/react-native from: ${
    USE_LOCAL ? 'LOCAL workspace source (../src)' : 'GIT-installed package (node_modules)'
  }  — set APPLENS_SOURCE=${USE_LOCAL ? 'git' : 'local'} to switch.`,
);

module.exports = mergeConfig(getDefaultConfig(__dirname), activeConfig);
