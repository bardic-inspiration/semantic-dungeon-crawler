// Presents an embedding surface to core as a map.
//
// Core asks a host six questions about space (core: docs/host.md). This host
// answers them from meaning instead of geometry. Every passage of the surface
// is one cell, `cell(i, 0)`, on a map `n` wide and 1 high, and:
//
//   distance(a, b)        how unalike two passages are: 0 (the same) to
//                         2000 (opposite), 1000 * (1 - cosine similarity).
//   cellsWithin(c, r)     every open passage within that distance of `c`.
//   neighbors(c)          the nearest open passages to `c`: as many as the
//                         ruleset's `adjacency` (4 or 8).
//   inBounds(c)           the passage exists and the ruleset's `blocksMove`
//                         does not hold for it.
//   lineOfSight(a, b)     always true: nothing stands between two meanings.
//   cellAt(c)             the passage's layer values (its source, and so on).
//
// Like any core host it is pure, total, and answers lists in row order.

export const MAX_DISTANCE = 2000;

/** A host factory for `loadScenario(registry, doc, { host })`. */
export function surfaceHost(surface) {
  const { n, dim, vectors, norms } = surface;
  const onMap = (cell) => cell.y === 0 && cell.x >= 0 && cell.x < n && Number.isInteger(cell.x);
  const distance = (a, b) => {
    if (!onMap(a) || !onMap(b)) return MAX_DISTANCE;
    if (a.x === b.x) return 0;
    let dot = 0;
    for (let d = 0, i = a.x * dim, j = b.x * dim; d < dim; d++) dot += vectors[i + d] * vectors[j + d];
    const cosine = dot / (norms[a.x] * norms[b.x]);
    return Math.round((1 - Math.max(-1, Math.min(1, cosine))) * 1000);
  };

  return (map) => {
    if (map.width !== n || map.height !== 1) {
      throw new Error(`surface host: the map is ${map.width}x${map.height}, the surface has ${n} passages`);
    }
    const blocked = new Uint8Array(n);
    for (const cell of map.blocksMove) blocked[cell.x] = 1;
    const values = new Map(map.cells.map((cell) => [cell.x, cell.values]));
    const open = (cell) => onMap(cell) && !blocked[cell.x];
    const cellsWithin = (cell, range) => {
      const cells = [];
      for (let x = 0; x < n; x++) {
        if (!blocked[x] && distance(cell, { x, y: 0 }) <= range) cells.push({ x, y: 0 });
      }
      return cells;
    };
    return {
      inBounds: open,
      distance,
      cellsWithin,
      neighbors: (cell) => {
        const near = [];
        for (let x = 0; x < n; x++) {
          if (!blocked[x] && x !== cell.x) near.push([distance(cell, { x, y: 0 }), x]);
        }
        near.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return near
          .slice(0, map.adjacency)
          .map(([, x]) => x)
          .sort((a, b) => a - b)
          .map((x) => ({ x, y: 0 }));
      },
      lineOfSight: () => true,
      cellAt: (cell) => values.get(cell.x) ?? map.defaults,
    };
  };
}

/**
 * The core map document for a surface: one cell per passage, carrying the
 * passage's `source` index. `ruleset` is `{ id, version }` of the ruleset the
 * map is for.
 */
export function surfaceMap(surface, ruleset, id = "surface") {
  return {
    format: 2,
    map: { id },
    ruleset,
    width: surface.n,
    height: 1,
    cells: surface.passages.map((p, x) => ({ at: [x, 0], source: p.s })),
  };
}
