import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import { createRequire } from 'node:module';
import { CLOJURE_QUERIES } from '../../src/core/ingestion/tree-sitter-queries.js';

// tree-sitter-clojure is an optionalDependency — load defensively so this test
// silently skips on environments where the native binding failed to build.
const _require = createRequire(import.meta.url);
let Clojure: any = null;
try {
  Clojure = _require('tree-sitter-clojure');
} catch {
  // skip
}

describe('Clojure tree-sitter queries', () => {
  describe('static query text', () => {
    it('captures defn / defn- / definline as functions', () => {
      expect(CLOJURE_QUERIES).toContain('@definition.function');
      expect(CLOJURE_QUERIES).toMatch(/defn\|defn-\|definline/);
    });

    it('captures defprotocol as a trait', () => {
      expect(CLOJURE_QUERIES).toContain('@definition.trait');
      expect(CLOJURE_QUERIES).toContain('"defprotocol"');
    });

    it('captures defrecord / deftype as a class', () => {
      expect(CLOJURE_QUERIES).toContain('@definition.class');
      expect(CLOJURE_QUERIES).toMatch(/defrecord\|deftype/);
    });

    it('captures defmulti and defmethod', () => {
      expect(CLOJURE_QUERIES).toContain('"defmulti"');
      expect(CLOJURE_QUERIES).toContain('"defmethod"');
      expect(CLOJURE_QUERIES).toContain('@definition.method');
    });

    it('captures ns as a module', () => {
      expect(CLOJURE_QUERIES).toContain('@definition.module');
      expect(CLOJURE_QUERIES).toContain('"ns"');
    });

    it('captures :require / :use / :import as imports', () => {
      expect(CLOJURE_QUERIES).toContain('@import');
      expect(CLOJURE_QUERIES).toContain('@import.source');
      expect(CLOJURE_QUERIES).toMatch(/require\|use/);
    });
  });

  describe.skipIf(!Clojure)('end-to-end capture matching', () => {
    const SOURCE = `(ns sample.core
  (:require [clojure.string :as str]
            [foo.bar :refer [helper]])
  (:import [java.util Date]))

(defn greet [name] (str "Hello " name))
(defn- internal-helper [x] (* x 2))
(definline boost [x] x)
(def pi 3.14159)
(defprotocol IShape (area [this]))
(defrecord Circle [radius] IShape (area [_] (* pi radius radius)))
(deftype Square [side])
(definterface IRunnable (run []))
(defmulti describe :type)
(defmethod describe :dog [_] "A dog")
(defmethod describe :cat [_] "A cat")
(def addone (fn [x] (+ x 1)))
(def doubler #(* 2 %))
`;

    const runQueries = () => {
      const parser = new Parser();
      parser.setLanguage(Clojure);
      const tree = parser.parse(SOURCE);
      const Q = new (Parser as any).Query(Clojure, CLOJURE_QUERIES);
      const matches = Q.matches(tree.rootNode);
      const captured: Array<{
        kind: string;
        name: string;
        dispatchValue?: string;
        isMultimethod?: boolean;
      }> = [];
      for (const m of matches) {
        let kind: string | undefined;
        let name: string | undefined;
        let importSource: string | undefined;
        let dispatchValue: string | undefined;
        let isMultimethod = false;
        for (const c of m.captures) {
          if (c.name.startsWith('definition.')) {
            kind = c.name;
          } else if (c.name === 'import') {
            kind = 'import';
          } else if (c.name === 'name') {
            name = c.node.text;
          } else if (c.name === 'import.source') {
            importSource = c.node.text;
          } else if (c.name === 'dispatch.value') {
            dispatchValue = c.node.text;
          } else if (c.name === 'multimethod') {
            isMultimethod = true;
          }
        }
        if (kind === 'import' && importSource) {
          captured.push({ kind, name: importSource });
        } else if (kind && name) {
          captured.push({
            kind,
            name,
            ...(dispatchValue !== undefined ? { dispatchValue } : {}),
            ...(isMultimethod ? { isMultimethod: true } : {}),
          });
        }
      }
      return captured;
    };

    it('emits a definition.module for the ns form', () => {
      const captured = runQueries();
      expect(captured).toContainEqual({ kind: 'definition.module', name: 'sample.core' });
    });

    it('emits definition.function for defn / defn- / definline / defmulti', () => {
      const captured = runQueries();
      const fns = captured.filter((c) => c.kind === 'definition.function').map((c) => c.name);
      expect(fns).toEqual(expect.arrayContaining(['greet', 'internal-helper', 'boost', 'describe']));
    });

    it('emits definition.variable for top-level def with non-fn value', () => {
      const captured = runQueries();
      expect(captured).toContainEqual({ kind: 'definition.variable', name: 'pi' });
    });

    it('promotes (def name (fn …)) to definition.function', () => {
      const captured = runQueries();
      const fns = captured.filter((c) => c.kind === 'definition.function').map((c) => c.name);
      expect(fns).toContain('addone');
    });

    it('promotes (def name #(…)) anonymous-fn literals to definition.function', () => {
      const captured = runQueries();
      const fns = captured.filter((c) => c.kind === 'definition.function').map((c) => c.name);
      expect(fns).toContain('doubler');
    });

    it('emits definition.trait for defprotocol', () => {
      const captured = runQueries();
      expect(captured).toContainEqual({ kind: 'definition.trait', name: 'IShape' });
    });

    it('emits definition.class for defrecord and deftype', () => {
      const captured = runQueries();
      const classes = captured.filter((c) => c.kind === 'definition.class').map((c) => c.name);
      expect(classes).toEqual(expect.arrayContaining(['Circle', 'Square']));
    });

    it('emits definition.interface for definterface', () => {
      const captured = runQueries();
      expect(captured).toContainEqual({ kind: 'definition.interface', name: 'IRunnable' });
    });

    it('emits definition.method for each defmethod with its dispatch value', () => {
      const captured = runQueries();
      const methods = captured.filter((c) => c.kind === 'definition.method');
      expect(methods.length).toBeGreaterThanOrEqual(2);
      expect(methods.every((m) => m.name === 'describe')).toBe(true);
      const dispatchValues = methods.map((m) => m.dispatchValue);
      expect(dispatchValues).toEqual(expect.arrayContaining([':dog', ':cat']));
    });

    it('flags defmulti with @multimethod capture', () => {
      const captured = runQueries();
      const multi = captured.find(
        (c) => c.kind === 'definition.function' && c.name === 'describe',
      );
      expect(multi?.isMultimethod).toBe(true);
    });

    it('emits import captures for :require and :import clauses', () => {
      const captured = runQueries();
      const imports = captured.filter((c) => c.kind === 'import').map((c) => c.name);
      expect(imports).toEqual(expect.arrayContaining(['clojure.string', 'foo.bar', 'java.util']));
    });
  });
});
