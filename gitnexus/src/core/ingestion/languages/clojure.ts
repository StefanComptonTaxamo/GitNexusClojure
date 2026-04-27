/**
 * Clojure Language Provider.
 *
 * Phases landed:
 *  - Phase 1: schema + shared-model groundwork
 *  - Phase 3: tree-sitter-clojure binding (vendored from sogaiu master)
 *  - Phase 4 (partial): definitions (defn, defmulti, defmethod, defprotocol,
 *    defrecord, deftype, definterface, ns, def-with-fn promotion), imports
 *    (:require/:use/:import vector + bare forms), and now CALLS — every
 *    `(head arg…)` list with a symbol head is a call site, with special
 *    forms / definition heads filtered out at query time.
 *  - Phase 6: defmulti/defmethod + DISPATCHES_TO emission, isMultimethod /
 *    dispatchValue properties.
 *
 * Phases pending:
 *  - Phase 2: heritage processor refactor for retroactive `extend-*`
 *  - Phase 4 (remaining): threading-macro expansion (`->`, `->>`, …),
 *    `:refer` named-binding extractor, reader-conditional `:dialect` tag
 *  - Phase 5: ClojureScopeResolver (RFC #909 Ring 3) — multi-week
 *
 * Today this provider does NOT install a full extractor stack — Clojure
 * still rides the legacy DAG (NOT in MIGRATED_LANGUAGES). It declares
 * extensions, queries, an import resolver, a callExtractor, and a builtin
 * name set so the call processor can emit CALLS edges with sensible
 * filtering.
 */
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';
import { LANGUAGE_QUERIES } from '../tree-sitter-queries.js';
import { createImportResolver } from '../import-resolvers/resolver-factory.js';
import { clojureImportConfig } from '../import-resolvers/configs/clojure.js';
import { createCallExtractor } from '../call-extractors/generic.js';
import { clojureCallConfig } from '../call-extractors/configs/clojure.js';
import type { SyntaxNode } from '../utils/ast-helpers.js';
import type { NodeLabel } from 'gitnexus-shared';

/**
 * Defining heads whose second element is the function/method name. The label
 * column tells the call processor what kind of node ID to construct so that
 * the enclosing-function lookup matches what the parser actually emitted.
 */
const CLOJURE_DEFINING_HEADS: ReadonlyMap<string, NodeLabel> = new Map([
  ['defn', 'Function'],
  ['defn-', 'Function'],
  ['definline', 'Function'],
  ['defmulti', 'Function'],
  ['defmethod', 'Method'],
  ['def', 'Function'], // (def x (fn …)) is promoted to Function in the parser
  ['fn', 'Function'],
]);

/**
 * Walk a Clojure ancestor list_lit and return its enclosing function name +
 * label if the head is one of the defining forms in CLOJURE_DEFINING_HEADS.
 *
 * The default `findEnclosingFunction` walk only fires for nodes whose `type`
 * is in FUNCTION_NODE_TYPES (function_declaration, method_definition, …).
 * Clojure functions are list_lits with a magic head symbol — there is no
 * dedicated grammar node — so the default walk would never find them and
 * every CALLS edge would source from the File. This hook lets the call
 * processor recognise `(defn name …)`, `(defmethod name :dispatch …)`, etc.
 * as enclosing-function ancestors.
 *
 * Returns null when the ancestor is not a defining list_lit; the call
 * processor then continues walking up the AST.
 */
const clojureEnclosingFunctionFinder = (
  ancestorNode: SyntaxNode,
): { funcName: string; label: NodeLabel } | null => {
  if (ancestorNode.type !== 'list_lit') return null;

  // First named child is the head symbol, second is the name symbol.
  const head = ancestorNode.namedChildren[0];
  if (!head || head.type !== 'sym_lit') return null;
  const headName = head.namedChildren.find((c) => c.type === 'sym_name');
  if (!headName) return null;
  const label = CLOJURE_DEFINING_HEADS.get(headName.text);
  if (!label) return null;

  const nameNode = ancestorNode.namedChildren[1];
  if (!nameNode || nameNode.type !== 'sym_lit') return null;
  const nameInner = nameNode.namedChildren.find((c) => c.type === 'sym_name');
  if (!nameInner) return null;

  return { funcName: nameInner.text, label };
};

/**
 * Clojure core / common builtins that should NOT generate CALLS edges to
 * unresolved external functions. This is intentionally conservative: only
 * very high-frequency clojure.core functions and unambiguous JVM/JS host
 * helpers. Anything not in this set will still generate a CALLS edge that
 * the call processor will try to resolve; if resolution fails, the edge
 * is dropped — matching the behavior of every other language provider.
 *
 * Special forms (`if`, `let`, `do`, `fn`, …) are NOT here because they're
 * already filtered at query time by the #not-match? predicate on the
 * @call pattern in tree-sitter-queries.ts.
 */
const BUILT_INS: ReadonlySet<string> = new Set([
  // Sequence / collection
  'first',
  'rest',
  'next',
  'last',
  'cons',
  'conj',
  'into',
  'seq',
  'empty',
  'empty?',
  'count',
  'nth',
  'get',
  'get-in',
  'assoc',
  'assoc-in',
  'dissoc',
  'update',
  'update-in',
  'merge',
  'merge-with',
  'select-keys',
  'keys',
  'vals',
  'contains?',
  'find',
  'concat',
  'reverse',
  'sort',
  'sort-by',
  'distinct',
  'flatten',
  'partition',
  'partition-by',
  'partition-all',
  'group-by',
  'frequencies',
  'zipmap',
  'interleave',
  'interpose',
  'take',
  'take-while',
  'take-last',
  'drop',
  'drop-while',
  'drop-last',
  'split-at',
  'split-with',
  'iterate',
  'repeat',
  'repeatedly',
  'range',
  'cycle',
  // Higher-order
  'map',
  'mapv',
  'mapcat',
  'filter',
  'filterv',
  'remove',
  'reduce',
  'reductions',
  'apply',
  'comp',
  'partial',
  'juxt',
  'complement',
  'identity',
  'constantly',
  'every?',
  'some',
  'not-any?',
  'not-every?',
  'keep',
  'keep-indexed',
  'map-indexed',
  // Predicates / conversion
  'nil?',
  'true?',
  'false?',
  'zero?',
  'pos?',
  'neg?',
  'even?',
  'odd?',
  'number?',
  'string?',
  'symbol?',
  'keyword?',
  'fn?',
  'ifn?',
  'coll?',
  'list?',
  'vector?',
  'map?',
  'set?',
  'sequential?',
  'associative?',
  'counted?',
  'reversible?',
  'identical?',
  'instance?',
  'satisfies?',
  'isa?',
  // Arithmetic / comparison
  'inc',
  'dec',
  'min',
  'max',
  'mod',
  'rem',
  'quot',
  'abs',
  'compare',
  '=',
  'not=',
  '<',
  '>',
  '<=',
  '>=',
  '+',
  '-',
  '*',
  '/',
  // String / IO / printing
  'str',
  'name',
  'namespace',
  'symbol',
  'keyword',
  'pr',
  'pr-str',
  'prn',
  'print',
  'println',
  'newline',
  'format',
  'read-string',
  // Threading / control utility (these are functions, not the `->` macros)
  'when-some',
  'doall',
  'dorun',
  'force',
  // Atoms / refs / agents
  'atom',
  'ref',
  'agent',
  'swap!',
  'reset!',
  'compare-and-set!',
  'alter',
  'send',
  'send-off',
  'await',
  // Type / metadata
  'type',
  'class',
  'meta',
  'with-meta',
  'vary-meta',
  // Constructors
  'list',
  'vector',
  'vec',
  'hash-map',
  'array-map',
  'sorted-map',
  'hash-set',
  'sorted-set',
  'set',
]);

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
  importResolver: createImportResolver(clojureImportConfig),
  callExtractor: createCallExtractor(clojureCallConfig),
  builtInNames: BUILT_INS,
  enclosingFunctionFinder: clojureEnclosingFunctionFinder,
});
