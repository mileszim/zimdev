import { useEffect, useRef, useState } from "react";

import type { Route } from "./+types/home";
import {
  Engine,
  FOCUS,
  FSTOPS,
  INITIAL_SNAPSHOT,
  ROLL_SIZE,
  SPEEDS,
  type Snapshot,
} from "../lib/zim35/engine";

export function meta({}: Route.MetaArgs) {
  const description =
    "Miles Zimmerman — software engineer & photographer in San Francisco. " +
    "Operate the ZIM-35, a mechanical 35mm SLR rendered live in ASCII: wind the lever, set the exposure, fire the shutter.";
  return [
    { title: "Miles Zimmerman · zim.dev" },
    { name: "description", content: description },
    { property: "og:title", content: "Miles Zimmerman · zim.dev" },
    { property: "og:description", content: description },
    { property: "og:url", content: "https://zim.dev" },
    { property: "og:type", content: "website" },
    { tagName: "link", rel: "canonical", href: "https://zim.dev/" },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "Person",
        name: "Miles Zimmerman",
        url: "https://zim.dev",
        jobTitle: "Software Engineer",
        worksFor: { "@type": "Organization", name: "Dealops", url: "https://dealops.com" },
        address: { "@type": "PostalAddress", addressLocality: "San Francisco", addressRegion: "CA" },
        sameAs: [
          "https://github.com/mileszim",
          "https://linkedin.com/in/mileszim",
          "https://zim.pics",
        ],
      },
    },
  ];
}

const LINKS = [
  { label: "POST", value: "DEALOPS", href: "https://dealops.com", external: true },
  { label: "DARKROOM", value: "ZIM.PICS", href: "https://zim.pics", external: true },
  { label: "GITHUB", value: "@MILESZIM", href: "https://github.com/mileszim", external: true, me: true },
  { label: "LINKEDIN", value: "/IN/MILESZIM", href: "https://linkedin.com/in/mileszim", external: true, me: true },
  { label: "RESUME", value: "PDF", href: "/resume.pdf", external: false },
];

function buildMeter(delta: number): string {
  const scale = "-3...-2...-1....0....+1...+2...+3";
  const clamped = Math.max(-3, Math.min(3, delta));
  const col = Math.round(((clamped + 3) / 6) * (scale.length - 1));
  const needle = " ".repeat(col) + "^";
  return `${scale}\n${needle}`;
}

function meterVerdict(delta: number): string {
  if (delta > 0.6) return `OVER +${delta}`;
  if (delta < -0.6) return `UNDER ${delta}`;
  return "EXPOSURE GOOD";
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      {children}
    </section>
  );
}

function Stepper(props: {
  label: string;
  value: string;
  keys: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="stepper">
      <span className="stepper-label">{props.label}</span>
      <span className="stepper-value">
        <button type="button" className="tick" onClick={props.onDec} aria-label={`${props.label} down`}>
          &lt;
        </button>
        <strong>{props.value}</strong>
        <button type="button" className="tick" onClick={props.onInc} aria-label={`${props.label} up`}>
          &gt;
        </button>
      </span>
      <span className="stepper-keys">{props.keys}</span>
    </div>
  );
}

export default function Home() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [snap, setSnap] = useState<Snapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    const engine = new Engine(viewportRef.current!, preRef.current!);
    engine.onChange = setSnap;
    engine.start();
    engineRef.current = engine;
    return () => engine.dispose();
  }, []);

  useEffect(() => {
    sheetRef.current?.scrollTo({ left: sheetRef.current.scrollWidth, behavior: "smooth" });
  }, [snap.exposures.length]);

  const eng = () => engineRef.current;

  return (
    <main className="rig">
      <header className="masthead">
        <span className="ident">
          <span className="brand">ZIM.DEV</span>
          <span className="ident-sub">MILES ZIMMERMAN</span>
        </span>
        <span className="model">
          ZIM-35 <em>// MECHANICAL ASCII SLR BY ZIMWERK OPTIK</em>
        </span>
        <span className="serial">SOFTWARE ENGINEER &amp; PHOTOGRAPHER · SAN FRANCISCO, CA</span>
      </header>

      <div className="deck">
        <div className="rail rail-left">
          <Panel title="OPERATOR">
            <p className="op-name">MILES ZIMMERMAN</p>
            <p className="op-trade">SOFTWARE ENGINEER &amp; PHOTOGRAPHER</p>
            <p className="op-station">SAN FRANCISCO, CALIFORNIA</p>
            <nav className="op-links" aria-label="Profiles and contact">
              {LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  {...(l.external
                    ? { target: "_blank", rel: l.me ? "me noopener noreferrer" : "noopener noreferrer" }
                    : {})}
                >
                  <span>{l.label}</span>
                  <strong>{l.value}</strong>
                  <em aria-hidden="true">-&gt;</em>
                </a>
              ))}
            </nav>
          </Panel>

          <Panel title="FILM TRANSPORT">
            <div className="counter" aria-live="polite">
              <span className="counter-num">{String(snap.frame).padStart(2, "0")}</span>
              <span className="counter-of">/{ROLL_SIZE}</span>
            </div>
            <div className="lamps">
              <span className={`lamp ${snap.cocked ? "lit" : ""}`}>COCKED</span>
              <span className={`lamp warn ${!snap.cocked && snap.busy === "idle" ? "lit" : ""}`}>WIND</span>
            </div>
            <div className="transport">
              <button type="button" className="btn" onClick={() => eng()?.wind()}>
                [ WIND ]
              </button>
              <button type="button" className="btn btn-fire" onClick={() => eng()?.fire()}>
                [ FIRE ]
              </button>
              <button type="button" className="btn" onClick={() => eng()?.rewind()}>
                [ REWIND ]
              </button>
            </div>
            <p className="fine">ROLL Nº{snap.roll} · ZIMCHROME 400</p>
          </Panel>
        </div>

        <div className="stage">
          <div
            className="viewport"
            ref={viewportRef}
            role="img"
            aria-label="Three-dimensional ASCII rendering of a ZIM-35 mechanical camera. Drag to orbit; click parts to operate them."
          >
            <pre className="grid" ref={preRef} suppressHydrationWarning>
              {"\n\n   WARMING PHOSPHOR ..."}
            </pre>
          </div>
          <div className="statusline">
            <span className="status-msg" key={snap.status}>
              &gt; {snap.status}
            </span>
            <span className="status-hover">{snap.hover ?? "DRAG TO ORBIT · CLICK PARTS TO OPERATE"}</span>
          </div>
        </div>

        <div className="rail rail-right">
          <Panel title="EXPOSURE">
            <Stepper
              label="SHUTTER"
              value={SPEEDS[snap.shutterIdx].label}
              keys="S/D"
              onDec={() => eng()?.cycleShutter(-1)}
              onInc={() => eng()?.cycleShutter(1)}
            />
            <Stepper
              label="APERTURE"
              value={`f/${FSTOPS[snap.apertureIdx]}`}
              keys="Z/X"
              onDec={() => eng()?.cycleAperture(-1)}
              onInc={() => eng()?.cycleAperture(1)}
            />
            <Stepper
              label="FOCUS"
              value={FOCUS[snap.focusIdx]}
              keys=",/."
              onDec={() => eng()?.cycleFocus(-1)}
              onInc={() => eng()?.cycleFocus(1)}
            />
          </Panel>

          <Panel title="LIGHT METER">
            <pre className="meter">{buildMeter(snap.meter)}</pre>
            <p className={`meter-verdict ${Math.abs(snap.meter) > 0.6 ? "off" : ""}`}>
              {meterVerdict(snap.meter)}
            </p>
          </Panel>

          <Panel title="RIG">
            <div className="rig-controls">
              <span>DOLLY</span>
              <button type="button" className="tick" onClick={() => eng()?.dolly(-0.8)} aria-label="Dolly in">
                +
              </button>
              <button type="button" className="tick" onClick={() => eng()?.dolly(0.8)} aria-label="Dolly out">
                -
              </button>
              <button type="button" className="btn btn-small" onClick={() => eng()?.toggleMute()}>
                [ FOLEY: {snap.muted ? "MUTED" : "LIVE"} ]
              </button>
            </div>
          </Panel>

          <Panel title="KEYMAP">
            <pre className="keymap">{[
              "SPACE fire    W wind",
              "R rewind      M mute",
              "S/D speed     Z/X stop",
              ",/. focus    DRAG orbit",
            ].join("\n")}</pre>
          </Panel>
        </div>
      </div>

      <footer className="sheet-wrap">
        <h2 className="panel-title sheet-title">
          CONTACT SHEET <em>— EXPOSED FRAMES</em>
        </h2>
        <div className="sheet" ref={sheetRef}>
          {snap.exposures.length === 0 ? (
            <p className="sheet-empty">[ UNEXPOSED ROLL — WIND, COMPOSE, FIRE ]</p>
          ) : (
            snap.exposures.map((x) => (
              <figure className="neg" key={`${x.roll}-${x.n}`}>
                <div className="sprockets" aria-hidden="true">o&nbsp;&nbsp;o&nbsp;&nbsp;o&nbsp;&nbsp;o&nbsp;&nbsp;o</div>
                <pre className="thumb">{x.thumb}</pre>
                <div className="sprockets" aria-hidden="true">o&nbsp;&nbsp;o&nbsp;&nbsp;o&nbsp;&nbsp;o&nbsp;&nbsp;o</div>
                <figcaption className="neg-caption">
                  R{x.roll}·Nº{String(x.n).padStart(2, "0")} {x.speed} f/{x.fstop}
                </figcaption>
              </figure>
            ))
          )}
        </div>
        <p className="colophon">
          ZIM.DEV · © 2026 MILES ZIMMERMAN · RENDERED LIVE IN ASCII, NO PIXELS HARMED · SN 0001976
        </p>
      </footer>
    </main>
  );
}
