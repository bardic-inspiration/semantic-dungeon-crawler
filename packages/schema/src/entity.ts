// Entity schema — SPEC §3.1.
// The unified representation for both "rooms" and "objects": there is no
// structural distinction between them (a room is an entity whose `archetype`
// implies containment). Field names and types match SPEC §3.1 verbatim.

export interface Entity {
  id: string; // stable node id, matches graph.json node id
  archetype: Archetype; // determines renderer interpretation
  semantic_tags: string[]; // free-form tags from build-time tagging
  embedding_ref: string; // pointer to vector in graph.json, NEVER the raw vector
  affordances: Affordance[]; // legal interaction verbs
  salience: number; // 0.0–1.0, informs render prominence / population weight
  contains: string[]; // child entity ids (empty for leaf/prop entities)
  layout_hint: LayoutHint;
  state: EntityState;
}

// Open extension point: the `| string` members make Archetype/Affordance
// open unions (they collapse to `string` at the type level). Adding a new
// literal is a MINOR bump per SPEC §3.5 — the open string is why no restructure
// is required. The known literals are retained here as documentation.
export type Archetype =
  | 'container' // room-like; implies "enter"/"traverse" affordances typically present
  | 'readable'
  | 'actor'
  | 'portal'
  | 'prop'
  | string;

export type Affordance = 'enter' | 'traverse' | 'read' | 'take' | 'inspect' | 'speak' | string;

export interface LayoutHint {
  scale: 'small' | 'medium' | 'large';
  density: number; // 0.0–1.0, target population density if this entity is a container
  shape_bias: string; // open string — adapter-interpreted, e.g. "vertical", "radial"
}

export interface EntityState {
  coherence: number; // 0.0–1.0, decay/stability scalar, author-defined meaning
  visited: boolean;
}
