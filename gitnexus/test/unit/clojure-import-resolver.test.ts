/**
 * Unit tests for the Clojure import resolution strategy.
 *
 * Verifies:
 *   - namespace dot → path slash translation
 *   - hyphen → underscore segment normalisation
 *   - .clj / .cljc / .cljs / .edn extension matching
 *   - Java interop imports are absorbed (empty-files sentinel)
 */

import { describe, it, expect } from 'vitest';
import { clojureImportStrategy } from '../../src/core/ingestion/import-resolvers/configs/clojure.js';
import type { ResolveCtx } from '../../src/core/ingestion/import-resolvers/types.js';
import { buildSuffixIndex } from '../../src/core/ingestion/import-resolvers/utils.js';

function makeCtx(files: string[]): ResolveCtx {
  const allFileList = files;
  const normalizedFileList = files.map((f) => f.replace(/\\/g, '/'));
  const index = buildSuffixIndex(normalizedFileList, allFileList);
  return {
    allFilePaths: new Set(files),
    allFileList,
    normalizedFileList,
    index,
    resolveCache: new Map(),
    configs: {
      tsconfigPaths: null,
      goModule: null,
      composerConfig: null,
      swiftPackageConfig: null,
      csharpConfigs: [],
    },
  };
}

describe('clojureImportStrategy', () => {
  it('resolves dotted namespace to .clj file', () => {
    const ctx = makeCtx(['src/foo/bar.clj', 'src/foo/core.clj']);
    expect(clojureImportStrategy('foo.bar', 'src/foo/core.clj', ctx)).toEqual({
      kind: 'files',
      files: ['src/foo/bar.clj'],
    });
  });

  it('resolves dotted namespace to .cljc file', () => {
    const ctx = makeCtx(['src/shared/utils.cljc']);
    expect(clojureImportStrategy('shared.utils', 'src/app/main.clj', ctx)).toEqual({
      kind: 'files',
      files: ['src/shared/utils.cljc'],
    });
  });

  it('resolves dotted namespace to .cljs file', () => {
    const ctx = makeCtx(['src/web/ui.cljs']);
    expect(clojureImportStrategy('web.ui', 'src/web/main.cljs', ctx)).toEqual({
      kind: 'files',
      files: ['src/web/ui.cljs'],
    });
  });

  it('translates hyphenated segments to underscored file paths', () => {
    const ctx = makeCtx(['src/my_app/feature_x.clj']);
    expect(clojureImportStrategy('my-app.feature-x', 'src/my_app/core.clj', ctx)).toEqual({
      kind: 'files',
      files: ['src/my_app/feature_x.clj'],
    });
  });

  it('absorbs java.* imports with empty-files sentinel', () => {
    const ctx = makeCtx(['src/main.clj']);
    expect(clojureImportStrategy('java.util', 'src/main.clj', ctx)).toEqual({
      kind: 'files',
      files: [],
    });
  });

  it('absorbs javax.* imports with empty-files sentinel', () => {
    const ctx = makeCtx(['src/main.clj']);
    expect(clojureImportStrategy('javax.servlet', 'src/main.clj', ctx)).toEqual({
      kind: 'files',
      files: [],
    });
  });

  it('returns null when namespace cannot be resolved', () => {
    const ctx = makeCtx(['src/main.clj']);
    expect(clojureImportStrategy('totally.unknown.ns', 'src/main.clj', ctx)).toBeNull();
  });

  it('returns null for an empty namespace', () => {
    const ctx = makeCtx(['src/main.clj']);
    expect(clojureImportStrategy('', 'src/main.clj', ctx)).toBeNull();
  });
});
