// Dev tool: render the part-ID buffer as letters to debug part placement.
import { AsciiRenderer } from "../app/lib/zim35/renderer";
import { buildSLR } from "../app/lib/zim35/slr";

const yaw = parseFloat(process.argv[2] ?? "-0.55");
const pitch = parseFloat(process.argv[3] ?? "0.3");
const dist = parseFloat(process.argv[4] ?? "10.5");

const r = new AsciiRenderer(150, 56);
const parts = buildSLR();
r.render(parts, {
  yaw, pitch, dist,
  targetY: 0.1,
  fov: (28 * Math.PI) / 180,
  cellAspect: 0.5,
  iris: 1,
  hoverId: -1,
});

const ABC = "abcdefghijklmnopqrstuvwxyzABCDEFGH";
const buf = (r as any).partBuf as Int16Array;
let out = "";
for (let y = 0; y < 56; y++) {
  for (let x = 0; x < 150; x++) {
    const id = buf[y * 150 + x];
    out += id <= 0 ? " " : ABC[(id - 1) % ABC.length];
  }
  out += "\n";
}
console.log(out);
parts.forEach((p) => console.log(ABC[(p.id - 1) % ABC.length], p.name));
