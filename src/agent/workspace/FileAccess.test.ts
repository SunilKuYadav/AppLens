import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  realpath,
} from 'node:fs/promises';
import { FileAccess, MAX_FILE_BYTES } from './FileAccess';

/**
 * Build a throwaway workspace with:
 *   root/
 *     src/hello.ts            (in-workspace file)
 *     node_modules/pkg/i.js   (deny-listed)
 *     big.txt                 (> size cap)
 *     link-out  -> <outside>/secret.txt   (symlink escaping the root)
 *   outside/secret.txt
 *
 * Returns the realpath'd root plus a cleanup fn.
 */
async function makeWorkspace(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'applens-fa-'));
  const root = path.join(base, 'root');
  const outside = path.join(base, 'outside');

  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await mkdir(outside, { recursive: true });

  await writeFile(path.join(root, 'src', 'hello.ts'), 'export const hi = 1;\n');
  await writeFile(path.join(root, 'node_modules', 'pkg', 'i.js'), 'module.exports = 1;\n');
  await writeFile(path.join(root, 'big.txt'), 'x'.repeat(MAX_FILE_BYTES + 1));
  await writeFile(path.join(outside, 'secret.txt'), 'TOP SECRET\n');
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'link-out'));

  return {
    root: await realpath(root),
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}

test('rejects ../ escape', async () => {
  const { root, cleanup } = await makeWorkspace();
  try {
    const fa = await FileAccess.create(root);
    await assert.rejects(() => fa.resolve('../outside/secret.txt'), /outside the workspace/);
  } finally {
    await cleanup();
  }
});

test('rejects absolute path', async () => {
  const { root, cleanup } = await makeWorkspace();
  try {
    const fa = await FileAccess.create(root);
    await assert.rejects(() => fa.resolve('/etc/passwd'), /absolute paths/);
  } finally {
    await cleanup();
  }
});

test('rejects symlink escaping the workspace', async () => {
  const { root, cleanup } = await makeWorkspace();
  try {
    const fa = await FileAccess.create(root);
    await assert.rejects(() => fa.resolve('link-out'), /resolves outside the workspace/);
  } finally {
    await cleanup();
  }
});

test('reads an in-workspace file', async () => {
  const { root, cleanup } = await makeWorkspace();
  try {
    const fa = await FileAccess.create(root);
    const text = await fa.readFile('src/hello.ts');
    assert.equal(text, 'export const hi = 1;\n');
  } finally {
    await cleanup();
  }
});

test('enforces the deny-list', async () => {
  const { root, cleanup } = await makeWorkspace();
  try {
    const fa = await FileAccess.create(root);
    await assert.rejects(
      () => fa.readFile('node_modules/pkg/i.js'),
      /ignored/,
    );
  } finally {
    await cleanup();
  }
});

test('enforces the size cap', async () => {
  const { root, cleanup } = await makeWorkspace();
  try {
    const fa = await FileAccess.create(root);
    await assert.rejects(() => fa.readFile('big.txt'), /too large/);
  } finally {
    await cleanup();
  }
});
