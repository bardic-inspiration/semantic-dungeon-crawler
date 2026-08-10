import { describe, expect, it } from 'vitest';

import type { InteractResponse, ResolvedRoomResponse, Ruleset } from './index';
import { isValidEntity } from './index';

// These tests double as compile-time checks that the exported types are usable
// and correctly shaped (SPEC §3.2–3.4). If a field is renamed/removed the build
// breaks here — a reminder that such a change is a MAJOR bump per SPEC §3.5.

describe('schema type surface', () => {
  it('models a null ruleset (relativistic-drift default, SPEC §1)', () => {
    const ruleset: Ruleset = { spec_version: '0.1.0', layers: [] };
    expect(ruleset.layers).toHaveLength(0);
  });

  it('models a layered ruleset with each effect kind (SPEC §3.4)', () => {
    const ruleset: Ruleset = {
      spec_version: '0.1.0',
      layers: [
        {
          id: 'global-drift',
          scope: 'global',
          mode: { priority: 10 },
          rules: [
            { predicate: 'static.archetype == "portal"', effect: { kind: 'hard_allow' } },
            { predicate: 'dynamic.turn_count > 5', effect: { kind: 'hard_forbid' } },
            {
              predicate: 'static.tags CONTAINS "financial-abstract"',
              effect: { kind: 'soft_reweight', factor: 1.5 },
            },
          ],
        },
      ],
    };
    expect(ruleset.layers[0]?.rules).toHaveLength(3);
  });

  it('models a resolved room response the client can consume (INV-3)', () => {
    const room: ResolvedRoomResponse['room'] = {
      id: 'node-000',
      archetype: 'container',
      semantic_tags: [],
      embedding_ref: 'vec:graph#000',
      affordances: ['enter'],
      salience: 1,
      contains: [],
      layout_hint: { scale: 'medium', density: 0.5, shape_bias: 'radial' },
      state: { coherence: 1, visited: true },
    };
    const response: ResolvedRoomResponse = { room, objects: [], exits: [] };
    const interact: InteractResponse = { new_room: response, transition_occurred: false };

    expect(isValidEntity(response.room)).toBe(true);
    expect(interact.transition_occurred).toBe(false);
  });
});
