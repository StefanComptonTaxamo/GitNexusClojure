/**
 * Clojure import resolution config.
 *
 * Clojure namespaces map to file paths via two transforms:
 *   1. dots become path separators:  foo.bar.baz → foo/bar/baz
 *   2. hyphens in segments become underscores: my-ns.utils → my_ns/utils
 *
 * Concrete extensions are .clj / .cljc / .cljs / .edn; suffix-matching against
 * the file index resolves whichever exists.
 *
 * Java imports captured from `(:import [java.util Date])` clauses look like
 * dotted class paths (e.g. `java.util`). They never resolve in-repo and are
 * absorbed (returns empty result so they don't fall through to suffix
 * matching against unrelated files).
 */
import { SupportedLanguages } from 'gitnexus-shared';
import type { ImportResolutionConfig, ImportResolverStrategy } from '../types.js';
import { suffixResolve } from '../utils.js';

const JAVA_INTEROP_PREFIXES = ['java.', 'javax.', 'jakarta.', 'sun.', 'com.sun.'];

const namespaceToPathSegments = (namespace: string): string[] =>
  namespace
    .split('.')
    .map((seg) => seg.replace(/-/g, '_'))
    .filter(Boolean);

export const clojureImportStrategy: ImportResolverStrategy = (rawImportPath, _filePath, ctx) => {
  // Java interop imports never resolve to repo files; absorb them so the
  // generic suffix matcher doesn't false-positive against unrelated paths.
  if (JAVA_INTEROP_PREFIXES.some((p) => rawImportPath.startsWith(p))) {
    return { kind: 'files', files: [] };
  }

  const segments = namespaceToPathSegments(rawImportPath);
  if (segments.length === 0) return null;

  const resolved = suffixResolve(segments, ctx.normalizedFileList, ctx.allFileList, ctx.index);
  return resolved ? { kind: 'files', files: [resolved] } : null;
};

export const clojureImportConfig: ImportResolutionConfig = {
  language: SupportedLanguages.Clojure,
  strategies: [clojureImportStrategy],
};
