import { describe, expect, it } from 'vitest';

import entityExample from '../../../fixtures/entity.example.json';
import { isValidEntity } from './validate';
import type { Entity } from './entity';

describe('isValidEntity', () => {
  it('accepts the example fixture and narrows it to Entity (SPEC §6.2 Exit)', () => {
    expect(isValidEntity(entityExample)).toBe(true);

    // The guard narrows the imported JSON to Entity, so this assignment
    // type-checks with zero TS errors — the Phase 1 Exit criterion.
    if (isValidEntity(entityExample)) {
      const entity: Entity = entityExample;
      expect(entity.archetype).toBe('container');
      expect(entity.layout_hint.scale).toBe('large');
      expect(entity.state.visited).toBe(false);
    }
  });

  it('accepts a minimal well-formed entity', () => {
    const minimal = {
      id: 'x',
      archetype: 'prop',
      semantic_tags: [],
      embedding_ref: 'vec:graph#001',
      affordances: [],
      salience: 0,
      contains: [],
      layout_hint: { scale: 'small', density: 0, shape_bias: '' },
      state: { coherence: 0, visited: false },
    };
    expect(isValidEntity(minimal)).toBe(true);
  });

  it.each([
    ['not an object', 42],
    ['null', null],
    ['array', []],
    ['missing embedding_ref', { id: 'a', archetype: 'prop' }],
    [
      'wrong type for salience',
      {
        id: 'a',
        archetype: 'prop',
        semantic_tags: [],
        embedding_ref: 'v',
        affordances: [],
        salience: 'high',
        contains: [],
        layout_hint: { scale: 'small', density: 0, shape_bias: '' },
        state: { coherence: 0, visited: false },
      },
    ],
    [
      'invalid layout_hint.scale',
      {
        id: 'a',
        archetype: 'prop',
        semantic_tags: [],
        embedding_ref: 'v',
        affordances: [],
        salience: 0,
        contains: [],
        layout_hint: { scale: 'huge', density: 0, shape_bias: '' },
        state: { coherence: 0, visited: false },
      },
    ],
    [
      'non-string entry in semantic_tags',
      {
        id: 'a',
        archetype: 'prop',
        semantic_tags: ['ok', 3],
        embedding_ref: 'v',
        affordances: [],
        salience: 0,
        contains: [],
        layout_hint: { scale: 'small', density: 0, shape_bias: '' },
        state: { coherence: 0, visited: false },
      },
    ],
  ])('rejects malformed entity: %s', (_label, value) => {
    expect(isValidEntity(value)).toBe(false);
  });
});
