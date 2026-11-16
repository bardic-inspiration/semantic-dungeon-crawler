// The embedding surface: a set of passages and where each one lies in
// meaning-space. It is what the corpus and embeddings pipeline produces and
// what a ruleset is played on.
//
// Packed (plain JSON, as stored and shipped):
//   { format, embeddings, sources: [{ title, ... }], passages: [{ t, s }],
//     dim, vectors: base64 of n * dim signed bytes, xy: [x0, y0, x1, y1, ...] }
// `xy` is a flat picture of the surface for drawing, each axis 0 to 1000.
// Opened (`openSurface`), the vectors are an Int8Array with their norms.

export const SURFACE_FORMAT = 1;

/** Packs passages and their vectors into a surface. */
export function packSurface({ sources, passages, vectors, embeddings }) {
  if (vectors.length !== passages.length) throw new Error("surface: one vector per passage");
  const dim = vectors[0].length;
  let peak = 0;
  for (const v of vectors) for (const x of v) peak = Math.max(peak, Math.abs(x));
  const bytes = new Int8Array(passages.length * dim);
  vectors.forEach((v, i) => v.forEach((x, d) => (bytes[i * dim + d] = Math.round((x / (peak || 1)) * 127))));
  return {
    format: SURFACE_FORMAT,
    embeddings,
    sources,
    passages,
    dim,
    vectors: toBase64(new Uint8Array(bytes.buffer)),
    xy: project2d(vectors).flat(),
  };
}

/** A packed surface, ready to be asked about: adds `n`, `vectors` as bytes, and `norms`. */
export function openSurface(packed) {
  if (packed.format !== SURFACE_FORMAT) throw new Error(`surface: format ${packed.format}, expected ${SURFACE_FORMAT}`);
  const raw = fromBase64(packed.vectors);
  const vectors = new Int8Array(raw.buffer, raw.byteOffset, raw.length);
  const n = packed.passages.length;
  const { dim } = packed;
  if (vectors.length !== n * dim) throw new Error("surface: vectors do not match the passages");
  const norms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = 0, o = i * dim; d < dim; d++) s += vectors[o + d] * vectors[o + d];
    norms[i] = Math.sqrt(s) || 1;
  }
  return { ...packed, n, vectors, norms };
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// The two principal components, by power iteration.
function project2d(vectors) {
  const n = vectors.length;
  const dim = vectors[0].length;
  const mean = new Float64Array(dim);
  for (const v of vectors) for (let d = 0; d < dim; d++) mean[d] += v[d] / n;
  const centered = vectors.map((v) => v.map((x, d) => x - mean[d]));
  const axes = [];
  for (let k = 0; k < 2; k++) {
    let axis = Float64Array.from({ length: dim }, (_, d) => Math.sin(d * 12.9898 + k * 78.233));
    for (let iter = 0; iter < 60; iter++) {
      const next = new Float64Array(dim);
      for (const row of centered) {
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += row[d] * axis[d];
        for (let d = 0; d < dim; d++) next[d] += dot * row[d];
      }
      for (const prev of axes) {
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += next[d] * prev[d];
        for (let d = 0; d < dim; d++) next[d] -= dot * prev[d];
      }
      const norm = Math.hypot(...next) || 1;
      for (let d = 0; d < dim; d++) next[d] /= norm;
      axis = next;
    }
    axes.push(axis);
  }
  const points = centered.map((row) => axes.map((a) => row.reduce((s, x, d) => s + x * a[d], 0)));
  for (let k = 0; k < 2; k++) {
    const sorted = points.map((p) => p[k]).sort((a, b) => a - b);
    const lo = sorted[Math.floor(n * 0.01)];
    const hi = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
    const span = hi - lo || 1;
    for (const p of points) p[k] = Math.round(Math.max(0, Math.min(1, (p[k] - lo) / span)) * 1000);
  }
  return points;
}
