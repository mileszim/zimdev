// Triangle-soup mesh builders. Geometry is baked in model (world) space;
// per-vertex normals give smooth shading on curved surfaces, flat on boxes.
import { type Mat } from "./math";

export interface Geom {
  pos: number[]; // 9 floats per triangle
  nrm: number[]; // 9 floats per triangle (per-vertex)
  shade: number[]; // 1 float per triangle (luminance multiplier)
}

export function emptyGeom(): Geom {
  return { pos: [], nrm: [], shade: [] };
}

function pushTri(
  g: Geom,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  normals: number[] | null,
  shade: number,
) {
  g.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  if (normals) {
    g.nrm.push(...normals);
  } else {
    // flat normal from winding (CCW seen from outside)
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    g.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
  g.shade.push(shade);
}

function quad(
  g: Geom,
  a: number[], b: number[], c: number[], d: number[],
  shade = 1,
) {
  pushTri(g, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], null, shade);
  pushTri(g, a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], null, shade);
}

/** Axis-aligned box centered at origin. */
export function box(w: number, h: number, d: number, shade = 1): Geom {
  const g = emptyGeom();
  const x = w / 2, y = h / 2, z = d / 2;
  const p = (sx: number, sy: number, sz: number) => [sx * x, sy * y, sz * z];
  quad(g, p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), shade);     // +Z
  quad(g, p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), shade); // -Z
  quad(g, p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), shade);     // +X
  quad(g, p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), shade); // -X
  quad(g, p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1), shade);     // +Y
  quad(g, p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), shade); // -Y
  return g;
}

/** Tapered box: bottom rect (bw x bd) at y=0, top rect (tw x td) at y=h. */
export function boxFrustum(bw: number, bd: number, tw: number, td: number, h: number): Geom {
  const g = emptyGeom();
  const b = (sx: number, sz: number) => [sx * bw / 2, 0, sz * bd / 2];
  const t = (sx: number, sz: number) => [sx * tw / 2, h, sz * td / 2];
  quad(g, b(-1, 1), b(1, 1), t(1, 1), t(-1, 1));     // front
  quad(g, b(1, -1), b(-1, -1), t(-1, -1), t(1, -1)); // back
  quad(g, b(1, 1), b(1, -1), t(1, -1), t(1, 1));     // right
  quad(g, b(-1, -1), b(-1, 1), t(-1, 1), t(-1, -1)); // left
  quad(g, t(-1, 1), t(1, 1), t(1, -1), t(-1, -1));   // top
  quad(g, b(-1, -1), b(1, -1), b(1, 1), b(-1, 1));   // bottom
  return g;
}

export interface CylOpts {
  seg?: number;
  rTop?: number;       // defaults to r (cone if different)
  capTop?: boolean;
  capBottom?: boolean;
  knurl?: boolean;     // alternate bright/dark stripes per segment
}

/** Cylinder along Y axis, centered at origin (y in [-h/2, h/2]). Smooth side normals. */
export function cylinder(r: number, h: number, opts: CylOpts = {}): Geom {
  const { seg = 26, rTop = r, capTop = true, capBottom = true, knurl = false } = opts;
  const g = emptyGeom();
  const y0 = -h / 2, y1 = h / 2;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const shade = knurl ? (i % 2 ? 1.18 : 0.74) : 1;
    // side quad with smooth (per-vertex radial) normals
    const pA = [r * c0, y0, r * s0], pB = [r * c1, y0, r * s1];
    const pC = [rTop * c1, y1, rTop * s1], pD = [rTop * c0, y1, rTop * s0];
    const nA = [c0, 0, s0], nB = [c1, 0, s1];
    pushTri(g, pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], pC[0], pC[1], pC[2],
      [...nA, ...nB, ...nB], shade);
    pushTri(g, pA[0], pA[1], pA[2], pC[0], pC[1], pC[2], pD[0], pD[1], pD[2],
      [...nA, ...nB, ...nA], shade);
    if (capTop && rTop > 0) {
      pushTri(g, 0, y1, 0, pC[0], pC[1], pC[2], pD[0], pD[1], pD[2], [0, 1, 0, 0, 1, 0, 0, 1, 0], 1);
    }
    if (capBottom) {
      pushTri(g, 0, y0, 0, pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], [0, -1, 0, 0, -1, 0, 0, -1, 0], 1);
    }
  }
  return g;
}

/** Bake an affine transform into geometry (positions + rotated normals). */
export function xform(g: Geom, m: Mat): Geom {
  const out: Geom = { pos: new Array(g.pos.length), nrm: new Array(g.nrm.length), shade: [...g.shade] };
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    out.pos[i] = m[0] * x + m[1] * y + m[2] * z + m[3];
    out.pos[i + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
    out.pos[i + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
    const nx = g.nrm[i], ny = g.nrm[i + 1], nz = g.nrm[i + 2];
    out.nrm[i] = m[0] * nx + m[1] * ny + m[2] * nz;
    out.nrm[i + 1] = m[4] * nx + m[5] * ny + m[6] * nz;
    out.nrm[i + 2] = m[8] * nx + m[9] * ny + m[10] * nz;
  }
  return out;
}

export function merge(...gs: Geom[]): Geom {
  const out = emptyGeom();
  for (const g of gs) {
    out.pos.push(...g.pos);
    out.nrm.push(...g.nrm);
    out.shade.push(...g.shade);
  }
  return out;
}

/** Pack a Geom into typed arrays for the renderer's hot loop. */
export interface PackedGeom {
  pos: Float32Array;
  nrm: Float32Array;
  shade: Float32Array;
  triCount: number;
}

export function pack(g: Geom): PackedGeom {
  return {
    pos: new Float32Array(g.pos),
    nrm: new Float32Array(g.nrm),
    shade: new Float32Array(g.shade),
    triCount: g.shade.length,
  };
}
