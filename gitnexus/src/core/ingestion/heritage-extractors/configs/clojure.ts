// gitnexus/src/core/ingestion/heritage-extractors/configs/clojure.ts

/**
 * Clojure heritage extractor.
 *
 * Clojure's protocol-implementation forms decouple "where the IMPLEMENTS
 * edge is declared" from "where the type is defined." Examples:
 *
 *   (extend-protocol IShape         ; one protocol, N types
 *     Circle (area [_] …)
 *     Square (area [_] …))
 *
 *   (extend-type Circle             ; one type, N protocols
 *     IShape (area [_] …)
 *     IPrintable (print [_] …))
 *
 *   (extend Circle                  ; same shape as extend-type, but with
 *     IShape {:area (fn [_] …)}     ; map-of-fns rather than method bodies
 *     IPrintable {:print (fn [_] …)})
 *
 *   (defrecord Circle [radius]      ; inline implementations on the
 *     IShape   (area [_] …)         ; defining form
 *     IPrintable (print [_] …))
 *
 *   (deftype Circle [radius] …)     ; same shape as defrecord
 *
 * For each (type, protocol) pair we emit a `trait-impl` HeritageInfo. The
 * heritage processor resolves the names cross-file via the symbol table and
 * draws an IMPLEMENTS edge.
 *
 * Because tree-sitter pattern matching can't capture an arbitrary number of
 * pairs from a variadic list, we capture the WHOLE list_lit + the head sym
 * (`@heritage.form` / `@heritage.head`) and walk the named children here.
 */

import { SupportedLanguages } from 'gitnexus-shared';
import type { HeritageExtractionConfig, HeritageInfo } from '../../heritage-types.js';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

const HERITAGE_FORM_HEADS = new Set([
  'extend-protocol',
  'extend-type',
  'extend',
  'defrecord',
  'deftype',
]);

/**
 * The Clojure grammar wraps every symbol literal in `sym_lit` with a
 * single `sym_name` named child carrying the actual text. Pull that text
 * back out, returning null for non-symbol nodes.
 */
const symLitText = (node: SyntaxNode): string | null => {
  if (node.type !== 'sym_lit') return null;
  const inner = node.namedChildren.find((c) => c.type === 'sym_name');
  return inner ? inner.text : null;
};

/**
 * `(extend-protocol Protocol Type1 method-list+ Type2 method-list+ …)`
 * args[0] is the protocol; the rest is alternating `sym_lit` (type) and
 * one-or-more `list_lit` (method body) until the next `sym_lit`.
 */
const extractExtendProtocol = (args: SyntaxNode[]): HeritageInfo[] => {
  const protocol = args[0] ? symLitText(args[0]) : null;
  if (!protocol) return [];
  const out: HeritageInfo[] = [];
  for (let i = 1; i < args.length; i++) {
    const typeName = symLitText(args[i]);
    if (typeName) {
      out.push({ className: typeName, parentName: protocol, kind: 'trait-impl' });
    }
  }
  return out;
};

/**
 * `(extend-type Type Protocol1 method-list+ Protocol2 method-list+ …)`
 * args[0] is the type; subsequent `sym_lit`s are protocols.
 *
 * `(extend Type Protocol map_lit Protocol map_lit …)` has the same shape
 * for our purposes — the map_lits aren't sym_lits so they're ignored by
 * the symLitText filter.
 */
const extractExtendType = (args: SyntaxNode[]): HeritageInfo[] => {
  const typeName = args[0] ? symLitText(args[0]) : null;
  if (!typeName) return [];
  const out: HeritageInfo[] = [];
  for (let i = 1; i < args.length; i++) {
    const protocol = symLitText(args[i]);
    if (protocol) {
      out.push({ className: typeName, parentName: protocol, kind: 'trait-impl' });
    }
  }
  return out;
};

/**
 * `(defrecord Name [fields] Protocol1 method-list+ Protocol2 method-list+ …)`
 * `(deftype   Name [fields] Protocol1 method-list+ …)`
 *
 * args[0] is the type name, args[1] is the field vector. Subsequent
 * `sym_lit`s are protocols; intervening `list_lit`s are method bodies.
 */
const extractDefRecord = (args: SyntaxNode[]): HeritageInfo[] => {
  const typeName = args[0] ? symLitText(args[0]) : null;
  if (!typeName) return [];
  // No protocols implemented inline — args[1] is the field vector and
  // there's nothing after it.
  if (args.length < 3) return [];
  const out: HeritageInfo[] = [];
  for (let i = 2; i < args.length; i++) {
    const protocol = symLitText(args[i]);
    if (protocol) {
      out.push({ className: typeName, parentName: protocol, kind: 'trait-impl' });
    }
  }
  return out;
};

export const clojureHeritageConfig: HeritageExtractionConfig = {
  language: SupportedLanguages.Clojure,
  formExtractor: {
    extract(formNode: SyntaxNode, headText: string, _filePath: string): HeritageInfo[] {
      if (!HERITAGE_FORM_HEADS.has(headText)) return [];
      // First named child is the head sym_lit; skip it.
      const args = formNode.namedChildren.slice(1);
      switch (headText) {
        case 'extend-protocol':
          return extractExtendProtocol(args);
        case 'extend-type':
        case 'extend':
          return extractExtendType(args);
        case 'defrecord':
        case 'deftype':
          return extractDefRecord(args);
        default:
          return [];
      }
    },
  },
};
