/**
 * Clojure: end-to-end indexing of definitions, imports, calls, and
 * multimethod / DISPATCHES_TO modeling. Acts as the regression guard for
 * Phases 1, 3, 4 (definitions + imports + calls), and 6 (multimethods).
 *
 * This file is `describe.skipIf` gated on the optional `tree-sitter-clojure`
 * native binding so CI environments that fail to build it (rare) do not
 * fail the test suite — matching the policy in `clojure-queries.test.ts`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { createRequire } from 'node:module';
import { FIXTURES, getRelationships, getNodesByLabel, type PipelineResult } from './helpers.js';
import { runPipelineFromRepo } from '../../../src/core/ingestion/pipeline.js';

const _require = createRequire(import.meta.url);
let clojureAvailable = false;
try {
  _require('tree-sitter-clojure');
  clojureAvailable = true;
} catch {
  // Native binding missing — skip the suite.
}

describe.skipIf(!clojureAvailable)('Clojure end-to-end resolution', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(path.join(FIXTURES, 'clojure-pkg'), () => {});
  }, 60000);

  it('emits Module nodes for both ns forms', () => {
    const modules = getNodesByLabel(result, 'Module');
    expect(modules).toEqual(
      expect.arrayContaining(['sample.core', 'sample.util', 'sample.extensions']),
    );
  });

  it('emits Function nodes for defn and (def x (fn …))-promoted vars', () => {
    const fns = getNodesByLabel(result, 'Function');
    // double-it (defn), internal-helper (defn-), caller (defn), describe (defmulti),
    // area (protocol method declaration may also surface as a Method, not Function —
    // we only assert the user-visible top-level functions here).
    expect(fns).toEqual(expect.arrayContaining(['double-it', 'internal-helper', 'caller', 'describe']));
  });

  it('flags defmulti `describe` with isMultimethod=true', () => {
    let flagged = 0;
    result.graph.forEachNode((n) => {
      if (n.label === 'Function' && n.properties.name === 'describe' && n.properties.isMultimethod === true) {
        flagged += 1;
      }
    });
    expect(flagged).toBe(1);
  });

  it('emits one Method per defmethod arm with its dispatch value', () => {
    const methods: Array<{ name: string; dv: string | undefined }> = [];
    result.graph.forEachNode((n) => {
      if (n.label === 'Method' && n.properties.name === 'describe') {
        methods.push({
          name: n.properties.name,
          dv: n.properties.dispatchValue as string | undefined,
        });
      }
    });
    expect(methods.length).toBe(2);
    expect(methods.map((m) => m.dv).sort()).toEqual([':cat', ':dog']);
  });

  it('emits DISPATCHES_TO edges from each defmethod Method to the defmulti Function', () => {
    const dispatches = getRelationships(result, 'DISPATCHES_TO');
    expect(dispatches.length).toBe(2);
    for (const e of dispatches) {
      expect(e.source).toBe('describe');
      expect(e.target).toBe('describe');
      expect(e.sourceLabel).toBe('Method');
      expect(e.targetLabel).toBe('Function');
    }
  });

  it('resolves the cross-file :require import', () => {
    const imports = getRelationships(result, 'IMPORTS');
    // core.clj :requires sample.util — should resolve to util.clj.
    const coreToUtil = imports.find(
      (e) => e.sourceFilePath.endsWith('core.clj') && e.targetFilePath.endsWith('util.clj'),
    );
    expect(coreToUtil).toBeDefined();
  });

  it('captures defprotocol as a Trait and defrecord as a Class', () => {
    const traits = getNodesByLabel(result, 'Trait');
    const classes = getNodesByLabel(result, 'Class');
    expect(traits).toContain('IShape');
    expect(classes).toContain('Circle');
  });

  it('emits IMPLEMENTS edges for inline (defrecord Circle [r] IShape …)', () => {
    const implementsEdges = getRelationships(result, 'IMPLEMENTS');
    const circleToShape = implementsEdges.find(
      (e) => e.source === 'Circle' && e.target === 'IShape',
    );
    expect(circleToShape).toBeDefined();
  });

  it('emits IMPLEMENTS edges for free-floating (extend-protocol IShape Square …)', () => {
    // Square is defined in extensions.clj; IShape lives in core.clj.
    // The extend-protocol form sits in extensions.clj — none of these are
    // co-located, so the heritage edge can only land if the form-based
    // heritage path is wired end-to-end.
    const implementsEdges = getRelationships(result, 'IMPLEMENTS');
    const squareToShape = implementsEdges.find(
      (e) => e.source === 'Square' && e.target === 'IShape',
    );
    expect(squareToShape).toBeDefined();
  });
});
