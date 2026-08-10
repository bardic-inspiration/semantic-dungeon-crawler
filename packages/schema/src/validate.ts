// Minimal validation helpers — Phase 1 (SPEC §6.2). Types + type guards only;
// no solver, no rule evaluation. Per INV-4 these check *well-formedness*
// (shape and field types), never *coherence* or *taste*.

import type { Entity, EntityState, LayoutHint } from './entity';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isLayoutHint(value: unknown): value is LayoutHint {
  if (!isRecord(value)) return false;
  return (
    (value.scale === 'small' || value.scale === 'medium' || value.scale === 'large') &&
    isFiniteNumber(value.density) &&
    typeof value.shape_bias === 'string'
  );
}

function isEntityState(value: unknown): value is EntityState {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.coherence) && typeof value.visited === 'boolean';
}

/**
 * Structural type guard for {@link Entity} (SPEC §3.1). Returns true iff `value`
 * is a well-formed entity: every required field is present with the right type.
 * It does not judge whether the entity is coherent or sensible (INV-4).
 */
export function isValidEntity(value: unknown): value is Entity {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.archetype === 'string' &&
    isStringArray(value.semantic_tags) &&
    typeof value.embedding_ref === 'string' &&
    isStringArray(value.affordances) &&
    isFiniteNumber(value.salience) &&
    isStringArray(value.contains) &&
    isLayoutHint(value.layout_hint) &&
    isEntityState(value.state)
  );
}
