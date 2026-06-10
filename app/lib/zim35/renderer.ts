// Software rasterizer that draws Parts into a character grid.
// Z-buffered, Gouraud-shaded, with per-material ASCII ramps, ordered
// dithering for the leatherette, and a part-ID buffer for click picking.
import { chain, ident, mul, rotX, rotY, rotZ, translate, type Mat } from "./math";
import { MAT, type Part } from "./slr";

interface Material {
  base: number;
  diff: number;
  spec: number;
  shin: number;
  ramp: string;
  dither: number;
}

const MATERIALS: Material[] = [];
MATERIALS[MAT.METAL] = { base: 0.07, diff: 0.68, spec: 0.5, shin: 30, ramp: " .':;=+*xX#%@", dither: 0.07 };
MATERIALS[MAT.LEATHER] = { base: 0.05, diff: 0.4, spec: 0.1, shin: 4, ramp: " .,:;oc%8@", dither: 0.26 };
MATERIALS[MAT.DARK] = { base: 0.04, diff: 0.48, spec: 0.6, shin: 20, ramp: " .,:;=+*#%", dither: 0 };
MATERIALS[MAT.GLASS] = { base: 0.03, diff: 0.14, spec: 1.6, shin: 40, ramp: " .:=*#@", dither: 0 };
MATERIALS[MAT.PEDESTAL] = { base: 0.03, diff: 0.08, spec: 0, shin: 1, ramp: " .,:;", dither: 0.3 };

// camera-fixed lights (view space)
const KEY = norm3(-0.33, 0.66, 0.56);
const FILL = norm3(0.7, 0.12, 0.42);
const HALF = norm3(KEY[0], KEY[1], KEY[2] + 1); // Blinn half-vector w/ view dir (0,0,1)

/** Stable per-cell pseudo-random grain in [0,1). */
function grain(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >> 13)) * 0x5bd1e995;
  return ((h ^ (h >> 15)) & 0xffff) / 0x10000;
}

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

export interface RenderOpts {
  yaw: number;
  pitch: number;
  dist: number;
  targetY: number;
  fov: number;        // vertical, radians
  cellAspect: number; // glyph width / line height (~0.6 for most monos)
  iris: number;       // 0 (closed) .. 1 (fully open)
  irisLabel?: string; // centered text while the iris is shut
  hoverId: number;    // part id to highlight, or -1
}

export class AsciiRenderer {
  readonly cols: number;
  readonly rows: number;
  private depth: Float32Array;
  private lum: Float32Array;
  private matBuf: Int16Array;
  private shadeBuf: Float32Array;
  private partBuf: Int16Array;
  private line: number[] = [];

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.depth = new Float32Array(n);
    this.lum = new Float32Array(n);
    this.matBuf = new Int16Array(n);
    this.shadeBuf = new Float32Array(n);
    this.partBuf = new Int16Array(n);
  }

  /** Part id at a grid cell, searching a small neighborhood (forgiving clicks). */
  pickAt(col: number, row: number, radius = 2): number {
    let best = -1, bestD = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = col + dx, y = row + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const id = this.partBuf[y * this.cols + x];
        if (id <= 0) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = id; }
      }
    }
    return best;
  }

  render(parts: Part[], o: RenderOpts): string {
    const { cols, rows } = this;
    const n = cols * rows;
    this.depth.fill(Infinity);
    this.lum.fill(0);
    this.matBuf.fill(-1);
    this.shadeBuf.fill(1);
    this.partBuf.fill(-1);

    // view = T(0,0,-dist) · Rx(pitch) · Ry(yaw) · T(-target)
    const view = chain(
      translate(0, 0, -o.dist),
      rotX(o.pitch),
      rotY(o.yaw),
      translate(0, -o.targetY, 0),
    );

    const f = 1 / Math.tan(o.fov / 2);
    const aspect = (cols * o.cellAspect) / rows;
    const fx = f / aspect, fy = f;

    for (const part of parts) {
      const m = this.partMatrix(part, view);
      const mat = MATERIALS[part.mat];
      this.rasterPart(part, m, mat, fx, fy, o.hoverId);
    }

    return this.compose(o);
  }

  private partMatrix(part: Part, view: Mat): Mat {
    let m: Mat = ident();
    if (part.angle !== 0) {
      const r = part.axis === "x" ? rotX(part.angle) : part.axis === "y" ? rotY(part.angle) : rotZ(part.angle);
      m = chain(
        translate(part.pivot[0], part.pivot[1], part.pivot[2]),
        r,
        translate(-part.pivot[0], -part.pivot[1], -part.pivot[2]),
      );
    }
    const [ox, oy, oz] = part.offset;
    if (ox || oy || oz) m = mul(translate(ox, oy, oz), m);
    return mul(view, m);
  }

  private rasterPart(part: Part, m: Mat, mat: Material, fx: number, fy: number, hoverId: number) {
    const { cols, rows } = this;
    const { pos, nrm, shade, triCount } = part.geom;
    const hover = part.id === hoverId ? 0.16 : 0;

    const sx = new Float64Array(3), sy = new Float64Array(3), sz = new Float64Array(3), sl = new Float64Array(3);

    for (let t = 0; t < triCount; t++) {
      const base = t * 9;
      let clipped = false;
      for (let v = 0; v < 3; v++) {
        const i = base + v * 3;
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        const vx = m[0] * x + m[1] * y + m[2] * z + m[3];
        const vy = m[4] * x + m[5] * y + m[6] * z + m[7];
        const vz = m[8] * x + m[9] * y + m[10] * z + m[11];
        if (vz > -0.4) { clipped = true; break; }
        // project
        sx[v] = (vx * fx / -vz + 1) * 0.5 * cols;
        sy[v] = (1 - vy * fy / -vz) * 0.5 * rows;
        sz[v] = -vz;
        // shade (view space, camera-fixed lights)
        let nx = m[0] * nrm[i] + m[1] * nrm[i + 1] + m[2] * nrm[i + 2];
        let ny = m[4] * nrm[i] + m[5] * nrm[i + 1] + m[6] * nrm[i + 2];
        let nz = m[8] * nrm[i] + m[9] * nrm[i + 1] + m[10] * nrm[i + 2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const dKey = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]);
        const dFill = Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]);
        const dSpec = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
        const rim = Math.pow(1 - Math.abs(nz), 3) * 0.2;
        sl[v] = mat.base + mat.diff * (dKey + dFill * 0.45) + mat.spec * Math.pow(dSpec, mat.shin) + rim + hover;
      }
      if (clipped) continue;

      const x0 = sx[0], y0 = sy[0], x1 = sx[1], y1 = sy[1], x2 = sx[2], y2 = sy[2];
      const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
      if (Math.abs(area) < 1e-6) continue;
      const inv = 1 / area;

      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(cols - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(rows - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maxX || minY > maxY) continue;

      const triShade = shade[t];
      for (let py = minY; py <= maxY; py++) {
        const cy = py + 0.5;
        const rowOff = py * cols;
        for (let px = minX; px <= maxX; px++) {
          const cx = px + 0.5;
          const w0 = ((x1 - cx) * (y2 - cy) - (y1 - cy) * (x2 - cx)) * inv;
          if (w0 < 0) continue;
          const w1 = ((x2 - cx) * (y0 - cy) - (y2 - cy) * (x0 - cx)) * inv;
          if (w1 < 0) continue;
          const w2 = 1 - w0 - w1;
          if (w2 < 0) continue;
          const z = w0 * sz[0] + w1 * sz[1] + w2 * sz[2];
          const idx = rowOff + px;
          if (z >= this.depth[idx]) continue;
          this.depth[idx] = z;
          this.lum[idx] = w0 * sl[0] + w1 * sl[1] + w2 * sl[2];
          this.matBuf[idx] = part.mat;
          this.shadeBuf[idx] = triShade;
          this.partBuf[idx] = part.id;
        }
      }
    }
  }

  private compose(o: RenderOpts): string {
    const { cols, rows } = this;
    const out: string[] = [];
    const cx = cols / 2, cy = rows / 2;
    // visual-space radius normalization (cells are taller than wide)
    const rMax = Math.min(cols * o.cellAspect, rows) / 2;
    const label = o.irisLabel ?? "";
    const labelRow = Math.floor(rows / 2);
    const labelCol = Math.floor((cols - label.length) / 2);
    const showLabel = label.length > 0 && o.iris <= 0.02;

    for (let y = 0; y < rows; y++) {
      const line = this.line;
      line.length = 0;
      const rowOff = y * cols;
      for (let x = 0; x < cols; x++) {
        if (o.iris < 1) {
          const dx = (x + 0.5 - cx) * o.cellAspect;
          const dy = y + 0.5 - cy;
          if (Math.hypot(dx, dy) / rMax > o.iris) {
            if (showLabel && y === labelRow && x >= labelCol && x < labelCol + label.length) {
              line.push(label.charCodeAt(x - labelCol));
            } else {
              line.push(32);
            }
            continue;
          }
        }
        const matId = this.matBuf[rowOff + x];
        if (matId < 0) { line.push(32); continue; }
        const mat = MATERIALS[matId];
        let l = this.lum[rowOff + x] * this.shadeBuf[rowOff + x];
        if (mat.dither > 0) l += (grain(x, y) - 0.5) * mat.dither;
        const ramp = mat.ramp;
        let ri = Math.floor(l * ramp.length);
        if (ri < 0) ri = 0;
        if (ri >= ramp.length) ri = ramp.length - 1;
        line.push(ramp.charCodeAt(ri));
      }
      out.push(String.fromCharCode(...line));
    }
    return out.join("\n");
  }
}
