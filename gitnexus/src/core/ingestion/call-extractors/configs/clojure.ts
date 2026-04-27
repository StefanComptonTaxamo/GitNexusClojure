// gitnexus/src/core/ingestion/call-extractors/configs/clojure.ts

import { SupportedLanguages } from 'gitnexus-shared';
import type { CallExtractionConfig } from '../../call-types.js';

/**
 * Clojure call extraction.
 *
 * Clojure call sites are uniformly `(head arg…)` lists with a symbol in the
 * head position. The tree-sitter query in CLOJURE_QUERIES already filters out
 * special forms / definition heads (see the @call pattern's #not-match?), so
 * by the time this config sees a call we know it's a real invocation.
 *
 * Three call shapes are surfaced today:
 *   - Plain function call:    (foo a b)            → call.name = "foo"
 *   - Java instance interop:  (.method obj args)   → call.name = ".method"
 *   - Namespace-qualified:    (str/upper-case x)   → call.name = "str/upper-case"
 *   - Static interop:         (Math/abs x)         → call.name = "Math/abs"
 *
 * The current config is a no-op — generic `inferCallForm` based on
 * `@call.name` works correctly for plain calls. Member-call shape
 * inference for `.method` and `Class/method` will follow when the
 * Phase 5 ScopeResolver lands and can resolve receiver types.
 */
export const clojureCallConfig: CallExtractionConfig = {
  language: SupportedLanguages.Clojure,
};
