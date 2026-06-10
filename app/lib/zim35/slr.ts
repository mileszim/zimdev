// The ZIM-35: a fictional vintage mechanical 35mm SLR, built from primitives.
// Each Part is independently animatable (pivot + axis + angle/offset) and
// carries a material + an optional action for click interaction.
import { chain, rotX, rotZ, translate, type Vec3 } from "./math";
import { box, boxFrustum, cylinder, merge, pack, xform, type Geom, type PackedGeom } from "./mesh";

export const MAT = {
  METAL: 0,     // bright chrome top/bottom plates
  LEATHER: 1,   // dithered body covering
  DARK: 2,      // black-anodized lens barrel & fittings
  GLASS: 3,     // front element — dark with hot specular
  PEDESTAL: 4,  // display stand, nearly silhouette
} as const;

export type ActionId =
  | "fire"
  | "wind"
  | "shutter-dial"
  | "aperture"
  | "focus"
  | "rewind";

export interface Part {
  id: number;
  name: string;
  mat: number;
  action?: ActionId;
  geom: PackedGeom;
  // animation state
  pivot: Vec3;
  axis: "x" | "y" | "z";
  angle: number;
  offset: Vec3; // post-rotation translation (e.g. button depress)
}

let nextId = 1;

function part(
  name: string,
  mat: number,
  geom: Geom,
  opts: { action?: ActionId; pivot?: Vec3; axis?: "x" | "y" | "z" } = {},
): Part {
  return {
    id: nextId++,
    name,
    mat,
    action: opts.action,
    geom: pack(geom),
    pivot: opts.pivot ?? [0, 0, 0],
    axis: opts.axis ?? "y",
    angle: 0,
    offset: [0, 0, 0],
  };
}

/** Cylinder re-oriented so its axis runs along Z, then translated. */
function zCyl(r: number, len: number, cx: number, cy: number, cz: number, opts?: Parameters<typeof cylinder>[2]) {
  return xform(cylinder(r, len, opts), chain(translate(cx, cy, cz), rotX(Math.PI / 2)));
}

function at(g: Geom, x: number, y: number, z: number): Geom {
  return xform(g, translate(x, y, z));
}

export function buildSLR(): Part[] {
  nextId = 1;
  const parts: Part[] = [];

  // ---- body ----------------------------------------------------------
  parts.push(part("TOP PLATE", MAT.METAL, merge(
    at(box(3.7, 0.34, 1.24), 0, 0.91, 0),
    at(box(0.52, 0.13, 0.05), 0, 0.91, 0.645),       // maker's badge
  )));
  parts.push(part("LEATHERETTE BODY", MAT.LEATHER, at(box(3.7, 1.5, 1.3), 0, -0.02, 0)));
  parts.push(part("BASE PLATE", MAT.METAL, merge(
    at(box(3.7, 0.3, 1.24), 0, -0.95, 0),
    zCyl(0.12, 0.04, 0, -1.09, 0),                    // tripod socket boss
  )));

  // ---- pentaprism + finder -------------------------------------------
  parts.push(part("PENTAPRISM", MAT.METAL, merge(
    at(boxFrustum(1.3, 0.98, 0.74, 0.68, 0.5), 0, 1.08, 0),
    at(box(0.42, 0.07, 0.5), 0, 1.615, 0),            // hot shoe
  )));
  parts.push(part("VIEWFINDER", MAT.DARK, at(box(0.36, 0.24, 0.08), 0, 0.92, -0.69)));

  // ---- lens stack (axis +Z, centered x=0 y=0) ------------------------
  parts.push(part("LENS MOUNT", MAT.DARK, zCyl(0.66, 0.12, 0, 0, 0.71, { capTop: false })));
  parts.push(part("APERTURE RING", MAT.DARK, zCyl(0.6, 0.22, 0, 0, 0.88, { knurl: true, capTop: false, capBottom: false }), {
    action: "aperture", pivot: [0, 0, 0.88], axis: "z",
  }));
  parts.push(part("LENS BARREL", MAT.DARK, zCyl(0.54, 0.18, 0, 0, 1.08, { capTop: false, capBottom: false })));
  parts.push(part("FOCUS RING", MAT.DARK, zCyl(0.63, 0.34, 0, 0, 1.34, { knurl: true, capTop: false, capBottom: false }), {
    action: "focus", pivot: [0, 0, 1.34], axis: "z",
  }));
  parts.push(part("FRONT BEZEL", MAT.DARK, zCyl(0.55, 0.14, 0, 0, 1.57, { capTop: false, capBottom: false })));
  parts.push(part("FRONT ELEMENT", MAT.GLASS, zCyl(0.45, 0.05, 0, 0, 1.6)));

  // ---- top-deck controls ---------------------------------------------
  parts.push(part("SHUTTER DIAL", MAT.METAL,
    at(cylinder(0.34, 0.18, { knurl: true }), 1.26, 1.17, 0.06),
    { action: "shutter-dial", pivot: [1.26, 1.17, 0.06], axis: "y" }));

  // film-advance lever: arm + thumb pad + pivot cap, swings around Y
  const leverPivot: Vec3 = [1.5, 1.16, -0.38];
  parts.push(part("FILM ADVANCE LEVER", MAT.METAL, merge(
    at(box(0.8, 0.05, 0.15), 1.1, 1.16, -0.38),
    at(box(0.26, 0.045, 0.11), 0.74, 1.16, -0.31),
    at(cylinder(0.15, 0.09), 1.5, 1.19, -0.38),
  ), { action: "wind", pivot: leverPivot, axis: "y" }));

  parts.push(part("SHUTTER RELEASE", MAT.METAL, merge(
    at(cylinder(0.15, 0.05), 1.02, 1.1, 0.33),        // collar
    at(cylinder(0.1, 0.09), 1.02, 1.15, 0.33),        // button
  ), { action: "fire", pivot: [1.02, 1.15, 0.33], axis: "y" }));

  parts.push(part("FRAME COUNTER", MAT.GLASS, at(box(0.18, 0.04, 0.13), 0.68, 1.095, 0.33)));

  parts.push(part("REWIND CRANK", MAT.METAL, merge(
    at(cylinder(0.13, 0.1), -1.42, 1.12, 0),
    at(cylinder(0.24, 0.13, { knurl: true }), -1.42, 1.24, 0),
    at(box(0.3, 0.045, 0.1), -1.36, 1.33, 0),         // fold-flat handle
  ), { action: "rewind", pivot: [-1.42, 1.2, 0], axis: "y" }));

  // ---- garnish --------------------------------------------------------
  parts.push(part("SELF TIMER", MAT.DARK,
    xform(box(0.09, 0.34, 0.07), chain(translate(-0.62, -0.32, 0.68), rotZ(0.35)))));
  parts.push(part("STRAP LUG", MAT.METAL, merge(
    zCyl(0.07, 0.12, 1.82, 0.78, 0.12),
    zCyl(0.07, 0.12, -1.82, 0.78, 0.12),
  )));

  // ---- display pedestal ----------------------------------------------
  parts.push(part("TURNTABLE", MAT.PEDESTAL,
    at(cylinder(2.55, 0.08, { seg: 40 }), 0, -1.17, 0)));

  return parts;
}

export function partById(parts: Part[], id: number): Part | undefined {
  return parts.find((p) => p.id === id);
}

export function findPart(parts: Part[], action: ActionId): Part {
  const p = parts.find((q) => q.action === action);
  if (!p) throw new Error(`missing part: ${action}`);
  return p;
}
