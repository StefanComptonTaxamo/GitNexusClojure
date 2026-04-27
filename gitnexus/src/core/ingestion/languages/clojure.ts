/**
 * Clojure Language Provider — SCAFFOLD.
 *
 * This is a minimal scaffold to satisfy the SupportedLanguages exhaustiveness
 * checks while the rest of the Clojure pipeline (queries, extractors, scope
 * resolver, multimethod modeling) is implemented in follow-up PRs.
 *
 * Status of remaining phases (see plan.md):
 *  - Phase 2: heritage processor refactor for retroactive `extend-*` — pending
 *  - Phase 4: tree-sitter queries + per-extractor configs — pending
 *  - Phase 5: ClojureScopeResolver (RFC #909 Ring 3) — pending
 *  - Phase 6: defmulti/defmethod + DISPATCHES_TO emission — pending
 *
 * Today this provider declares the file extensions and import semantics so
 * file-routing works, but parsing is a no-op: no tree-sitter queries, no
 * extractors, no symbol emission. Indexing a Clojure file with this provider
 * produces a File node and nothing else.
 */
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';
import { LANGUAGE_QUERIES } from '../tree-sitter-queries.js';

export const clojureProvider = defineLanguage({
  id: SupportedLanguages.Clojure,
  parseStrategy: 'tree-sitter',
  extensions: ['.clj', '.cljc', '.cljs', '.edn'],
  treeSitterQueries: LANGUAGE_QUERIES[SupportedLanguages.Clojure],
  importSemantics: 'namespace',
  mroStrategy: 'clojure-protocol',
  typeConfig: {
    declarationNodeTypes: new Set(),
    extractDeclaration: () => null,
    extractParameter: () => null,
  },
  exportChecker: () => true,
  importResolver: () => null,
});
