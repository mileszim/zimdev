// Dev tool: render one frame of the ZIM-35 to stdout for visual tuning.
// Usage: npx tsx scripts/preview-frame.ts [yaw] [pitch] [dist]
import { AsciiRenderer } from "../app/lib/zim35/renderer";
import { buildSLR } from "../app/lib/zim35/slr";

const yaw = parseFloat(process.argv[2] ?? "-0.55");
const pitch = parseFloat(process.argv[3] ?? "0.32");
const dist = parseFloat(process.argv[4] ?? "7.6");

const r = new AsciiRenderer(150, 56);
const parts = buildSLR();
if (process.env.LEVER) {
  const lever = parts.find((p) => p.action === "wind")!;
  lever.angle = parseFloat(process.env.LEVER);
}
const text = r.render(parts, {
  yaw,
  pitch,
  dist,
  targetY: 0.1,
  fov: (28 * Math.PI) / 180,
  cellAspect: 0.5, // terminal cells
  iris: 1,
  hoverId: -1,
});
console.log(text);
