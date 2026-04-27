#!/usr/bin/env node
/**
 * Build tree-sitter-clojure native binding.
 *
 * Mirrors scripts/build-tree-sitter-proto.cjs. The vendored grammar lives at
 * gitnexus/vendor/tree-sitter-clojure/ and is declared as a `file:`
 * optionalDependency. npm copies it into node_modules/tree-sitter-clojure/
 * during install; we run node-gyp there so build artifacts stay in
 * npm-managed territory (avoids the ENOTEMPTY upgrade issue described in
 * #836).
 *
 * The vendored package uses a modern N-API binding so it builds against
 * current Node.js — the upstream npm package (0.4.0) ships with stale V8
 * APIs that fail to compile on Node 23+.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cljDir = path.join(__dirname, '..', 'node_modules', 'tree-sitter-clojure');
const bindingGyp = path.join(cljDir, 'binding.gyp');
const bindingNode = path.join(
  cljDir,
  'build',
  'Release',
  'tree_sitter_clojure_binding.node',
);

try {
  if (!fs.existsSync(bindingGyp)) {
    process.exit(0);
  }

  if (fs.existsSync(bindingNode)) {
    process.exit(0);
  }

  try {
    require.resolve('node-addon-api');
    require.resolve('node-gyp-build');
  } catch (resolveErr) {
    console.warn(
      '[tree-sitter-clojure] Skipping build: hoisted build deps not resolvable (%s).',
      resolveErr.message,
    );
    console.warn(
      '[tree-sitter-clojure] Clojure parsing will be unavailable. Install without --no-optional and with scripts enabled to build.',
    );
    process.exit(0);
  }

  console.log('[tree-sitter-clojure] Building native binding...');
  execSync('npx node-gyp rebuild', {
    cwd: cljDir,
    stdio: 'pipe',
    timeout: 180000,
  });
  console.log('[tree-sitter-clojure] Native binding built successfully');
} catch (err) {
  console.warn('[tree-sitter-clojure] Could not build native binding:', err.message);
  console.warn(
    '[tree-sitter-clojure] Clojure (.clj/.cljc/.cljs) parsing will be unavailable. Non-Clojure gitnexus functionality is unaffected.',
  );
  process.exit(0);
}
