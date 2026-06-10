# zim.dev — Miles Zimmerman

Personal site of Miles Zimmerman (software engineer & photographer, San
Francisco). The centerpiece is the **ZIM-35**: a fully mechanical 35mm SLR you
can operate, rendered live as ASCII characters.
The camera is real 3D geometry (boxes, cylinders, knurled rings) pushed through a
custom software rasterizer — z-buffer, Gouraud shading, per-material character
ramps — into a `<pre>` tag at ~60fps. No WebGL, no canvas, no dependencies.

Built with React Router 7 on Cloudflare Workers.

## Operating the camera

| Control | Action |
| --- | --- |
| Drag / arrow keys | Orbit the camera |
| Scroll wheel | Dolly in/out |
| `SPACE` or click the shutter release | Fire the shutter |
| `W` or click the advance lever | Wind the film + cock the shutter |
| `R` or click the rewind crank | Rewind the roll |
| `S` / `D` or click the shutter dial | Shutter speed (1s – 1/1000) |
| `Z` / `X` or click the aperture ring | Aperture (f/1.8 – f/16) |
| `,` / `.` or click the focus ring | Focus |
| `M` | Mute the synthesized foley |

Every part of the camera is click-targetable in the ASCII render itself (an ID
buffer is rasterized alongside the depth buffer). Fired frames are downsampled
into little negatives on the contact sheet; the light meter scores your
exposure against ZIMCHROME 400 in good light (1/125 @ f/8 is dead-on).

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm run typecheck
```

Render a frame to your terminal without a browser (handy for tuning the model):

```sh
npx tsx scripts/preview-frame.ts <yaw> <pitch> <dist>
npx tsx scripts/preview-ids.ts            # part-ID buffer as letters
```

The engine lives in `app/lib/zim35/`:

- `math.ts` — affine transforms
- `mesh.ts` — primitive builders (box, frustum, cylinder w/ knurling)
- `slr.ts` — the camera model: named, animatable, clickable parts
- `renderer.ts` — the ASCII rasterizer (depth + luminance + part-ID buffers)
- `audio.ts` — WebAudio-synthesized mechanical foley
- `engine.ts` — film-transport state machine, input, tweens, render loop

## Resume

The OPERATOR panel links to `/resume.pdf` — drop your PDF at
`public/resume.pdf` and it will be served statically.

## Deployment

```sh
npm run deploy
```

Builds and deploys to Cloudflare Workers via Wrangler.
