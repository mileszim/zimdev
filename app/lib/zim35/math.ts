// Minimal affine 3D math. A Mat is a 3x4 row-major affine transform:
// [ r00 r01 r02 tx ]
// [ r10 r11 r12 ty ]
// [ r20 r21 r22 tz ]
export type Mat = Float64Array;
export type Vec3 = [number, number, number];

export function ident(): Mat {
  return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
}

export function translate(x: number, y: number, z: number): Mat {
  return new Float64Array([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]);
}

export function rotX(a: number): Mat {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float64Array([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]);
}

export function rotY(a: number): Mat {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float64Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]);
}

export function rotZ(a: number): Mat {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float64Array([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]);
}

/** result = a ∘ b  (apply b first, then a) */
export function mul(a: Mat, b: Mat): Mat {
  const o = new Float64Array(12);
  for (let r = 0; r < 3; r++) {
    const a0 = a[r * 4], a1 = a[r * 4 + 1], a2 = a[r * 4 + 2], a3 = a[r * 4 + 3];
    o[r * 4 + 0] = a0 * b[0] + a1 * b[4] + a2 * b[8];
    o[r * 4 + 1] = a0 * b[1] + a1 * b[5] + a2 * b[9];
    o[r * 4 + 2] = a0 * b[2] + a1 * b[6] + a2 * b[10];
    o[r * 4 + 3] = a0 * b[3] + a1 * b[7] + a2 * b[11] + a3;
  }
  return o;
}

export function chain(...ms: Mat[]): Mat {
  let m = ms[0];
  for (let i = 1; i < ms.length; i++) m = mul(m, ms[i]);
  return m;
}
