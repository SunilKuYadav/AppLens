# Local vs Git: switching the AppLens source

The Example app (ShopDemo) can consume `@applens/react-native` from **two
sources**, chosen at runtime by a single environment flag. This lets you develop
the library against a real app with instant feedback, or validate exactly what a
published consumer gets — without editing files to switch.

| Mode | Flag | What it resolves | Use it when |
|---|---|---|---|
| **local** (default) | `APPLENS_SOURCE=local` | the workspace TypeScript source at `../src/index.ts` | developing the library — edits reload instantly, no reinstall |
| **git** | `APPLENS_SOURCE=git` | the installed package in `node_modules/@applens/react-native` (the git-tag dependency in `package.json`) | validating the real consumer experience / the published tag |

If `APPLENS_SOURCE` is unset, the app defaults to **local**.

---

## Quick start

Convenience npm scripts set the flag for you (defined in `Example/package.json`):

```sh
# LOCAL — bundle the workspace source (../src)
npm run start:local        # Metro, cache reset
npm run android:local
npm run ios:local

# GIT — bundle the installed node_modules package
npm run start:git          # Metro, cache reset
npm run android:git
npm run ios:git
```

Or set the flag yourself on any command:

```sh
APPLENS_SOURCE=local npm start
APPLENS_SOURCE=git   npm run android
```

On startup Metro prints which source is active, e.g.:

```
[AppLens] Metro resolving @applens/react-native from: LOCAL workspace source (../src)  — set APPLENS_SOURCE=git to switch.
```

> **Always reset the Metro cache when switching modes.** Metro caches resolved
> module paths, so a stale cache can keep serving the previous source. The
> `start:local` / `start:git` scripts pass `--reset-cache` for you. If you flip
> the flag on `run-android` / `run-ios` while a Metro server is already running,
> stop that server and start it fresh in the new mode (the native build talks to
> whatever Metro is listening on `8081`).

---

## How it works

The switch lives entirely in **`Example/metro.config.js`**, which reads
`process.env.APPLENS_SOURCE` and builds one of two resolver configs.

### local mode

```
@applens/react-native  ->  ../src/index.ts   (workspace source)
```

Resolving the library from source needs two safeguards, because the library
root (`/AppLens`) has its own `node_modules/react`:

- **`watchFolders: ['..']`** so Metro watches the library source and reloads on
  every edit.
- **`extraNodeModules`** pins the shared singletons (`react`, `react-native`,
  `react/jsx-runtime`, `@babel/runtime`, `react-native-markdown-display`) to
  **Example's** copies. Metro's resolver walks *up* the tree from each source
  file; without this, library files would pick up `/AppLens/node_modules/react`
  and you'd get **two React instances** — broken context and hooks.
- **`blockList`** blocks the entire `/AppLens/node_modules` tree so nothing
  resolves from there; every import inside library source falls through to the
  `extraNodeModules` map above.

### git mode

```
@applens/react-native  ->  node_modules/@applens/react-native  (installed tag)
```

None of the local safeguards apply — the library is just an ordinary installed
dependency, resolved the same way a real consuming app resolves it. The only
override kept is the `openai` shim (see below), which both modes share.

### Shared: the `openai` shim

Both modes alias `openai` to `shims/openai.js`. The real OpenAI SDK expects
Node.js APIs that don't exist in the React Native runtime; the Example app
disables the OpenAI provider and stubs the import so the bundle builds.

---

## TypeScript / editor types

Metro controls what gets **bundled at runtime**; it does **not** affect what
`tsc` and your editor use for types. Type resolution is configured separately in
**`Example/tsconfig.json`** via a `paths` mapping:

```jsonc
"paths": {
  "@applens/react-native": ["../src/index.ts"],
  "@applens/react-native/*": ["../src/*"]
}
```

This points types at the workspace source, matching the default **local** mode,
so you edit the library with accurate types. To type-check against the
**git-installed** package instead, comment out those two mappings — TypeScript
then resolves from `node_modules/@applens/react-native`.

> Note: `tsc` cannot read an environment variable, so the type source is a
> manual toggle in `tsconfig.json`, independent of the `APPLENS_SOURCE` runtime
> flag. For day-to-day library development, leaving it pointed at `../src` is the
> right default.

---

## Keeping the git copy current

In **git** mode you bundle whatever is installed in
`node_modules/@applens/react-native`. The dependency is pinned in
`package.json`:

```json
"@applens/react-native": "git+https://github.com/SunilKuYadav/AppLens.git#v0.3.2"
```

To test a newer tag, bump the `#vX.Y.Z` ref and reinstall:

```sh
npm install
APPLENS_SOURCE=git npm run android
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Changes to `../src` don't show up | Running in **git** mode, or stale Metro cache | Use `npm run start:local`; it resets the cache |
| "Invalid hook call" / context is `undefined` | Two React copies (local-mode safeguards bypassed) | Ensure you launched via `metro.config.js` (don't hand-edit the resolver); reset cache |
| Still bundling the old source after switching | Metro served from a cache from the previous mode | Stop Metro, restart with `--reset-cache` (the `:local` / `:git` scripts do this) |
| Types differ from runtime | `tsconfig.json` `paths` points at one source, Metro at another | Decide which source you want and align the `paths` mapping with `APPLENS_SOURCE` |
| git mode can't find the package | Not installed, or install failed | `npm install` in `Example/`, confirm `node_modules/@applens/react-native` exists |

---

_See also: the repo-root [`docs/DEVELOPER.md`](../docs/DEVELOPER.md) for the
overall library development and testing workflow._
