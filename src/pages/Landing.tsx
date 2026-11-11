import { Link } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Constellation from "../components/Constellation";
import { LogoMark } from "../components/Logo";
import ConnectionGraph from "../components/ConnectionGraph";
import UniverseFallback from "../components/UniverseFallback";
const ScrollUniverse = lazy(() => import("../components/ScrollUniverse"));

function UniverseMount() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReady(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref}>
      {ready ? (
        <Suspense
          fallback={
            <div className="lp-universe-loading" id="universe">
              <div className="lp-universe-sticky"><UniverseFallback /></div>
            </div>
          }
        >
          <ScrollUniverse />
        </Suspense>
      ) : (
        <div className="lp-universe-loading" id="universe">
          <div className="lp-universe-sticky"><UniverseFallback /></div>
        </div>
      )}
    </div>
  );
}
import "../styles/landing.css";

const NAV = [
  { href: "#problem", label: "Problem" },
  { href: "#graph", label: "Graph" },
  { href: "#agents", label: "Agents" },
  { href: "#experiments", label: "Experiments" },
  { href: "#memory", label: "Memory" },
];

const FRAGMENTS = [
  { ic: "📄", t: "lightweight-cnn.pdf", s: "Paper · 14 pages · 3 equations", tail: "loose file" },
  { ic: "🗂", t: "PlantVillage subset", s: "Dataset · 2,431 images", tail: "open tab" },
  { ic: "💻", t: "github.com/leaf-lab/leaf-cnn", s: "Repository · PyTorch", tail: "no link" },
  { ic: "🗒", t: "Augmentation recipe", s: "Note · 6 bullet points", tail: "unfiled" },
  { ic: "⚠", t: "train_epoch5.log", s: "Error log · CUDA unavailable", tail: "no fix" },
];

const EDGES = [
  { from: "Paper", to: "Dataset", rel: "evaluates on", conf: "0.92" },
  { from: "Question", to: "Experiment", rel: "investigated by", conf: "0.88" },
  { from: "Experiment", to: "Result", rel: "produces", conf: "0.95" },
  { from: "Experiment", to: "Error", rel: "raised", conf: "0.90" },
  { from: "Error", to: "Fix", rel: "resolved by", conf: "0.97" },
  { from: "Result", to: "Conclusion", rel: "supports", conf: "0.86" },
];

const AGENT_NAMES = [
  "Paper Reader",
  "Equation Extractor",
  "Code Setup",
  "Experiment Agent",
  "Benchmark",
  "Memory Agent",
  "Review Agent",
];

const STATS = [
  { b: "12", s: "node types in the graph" },
  { b: "7", s: "specialist agents" },
  { b: "100%", s: "runs gated by approval" },
  { b: "Local", s: "first — data in your browser" },
];

const MEMORY = [
  {
    kind: "Error → Fix",
    title: "pillow==9.5.0 pin",
    body: "CUDA unavailable on a CPU-only host; forcing CPU and pinning pillow resolved the crash.",
    reuse: "Reused in 4 runs",
    tag: "good",
  },
  {
    kind: "Parameters",
    title: "MobileNetV2 · 5 epochs · batch 32",
    body: "Exact config from Run A, attached to the result so the next run starts from evidence.",
    reuse: "Reused in 3 runs",
    tag: "violet",
  },
  {
    kind: "Finding",
    title: "<5MB model reaches 91%+",
    body: "Holds for the lab split only — field-photo validation is missing and flagged as a gap.",
    reuse: "Reused in 2 reports",
    tag: "warn",
  },
];

const TICKER = [
  "approval before execution",
  "typed edges with evidence",
  "seven specialist agents",
  "CPU-first isolated runs",
  "every result reusable",
  "no silent actions",
];

export default function Landing() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    document.title = "ResearchGraph — A connected mind for your research";
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="lp-page">
      <header className={`lp-head${stuck ? " is-stuck" : ""}`}>
        <div className="lp-head-in">
          <Link className="lp-brand" to="/" aria-label="ResearchGraph home">
            <LogoMark size={27} className="lp-brand-mark" />
            <b>ResearchGraph</b>
          </Link>
          <nav className="lp-nav" aria-label="Landing sections">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>{n.label}</a>
            ))}
          </nav>
          <div className="lp-actions">
            <Link className="lp-login" to="/login">Log in</Link>
            <Link className="lp-btn lp-btn-solid" to="/register">Start workspace</Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-stage">
          <Constellation className="lp-scene" />
          <div className="lp-scene-scrim" aria-hidden="true" />
          <div className="lp-grain" aria-hidden="true" />
        </div>

        <div className="lp-hero-in">
          <span className="lp-eyebrow">
            <i aria-hidden="true" />
            Starts empty · bring your own sources
          </span>

          <h1 className="lp-h1">
            Your research deserves{" "}
            <br />
            a <em>connected</em> mind.
          </h1>

          <p className="lp-lead">
            Papers, datasets, runs and results in one graph — every action approved,
            every result reusable.
          </p>

          <div className="lp-cta">
            <Link className="lp-btn lp-btn-lime" to="/register">
              Start your workspace
              <span aria-hidden="true">→</span>
            </Link>
            <a className="lp-btn lp-btn-ghost-dark" href="#graph">See the graph</a>
          </div>

          <ul className="lp-hero-note">
            <li>Approval before anything runs</li>
            <li>Seeded PlantVillage workspace</li>
            <li>Data stays in your browser</li>
          </ul>
        </div>

        <div className="lp-hero-foot">
          <a className="lp-scroll" href="#universe">
            <span className="lp-scroll-line" aria-hidden="true" />
            Scroll
          </a>
          <div className="lp-hero-meta">
            <span><b>10</b> node types</span>
            <span className="dot">·</span>
            <span><b>9</b> edge types</span>
            <span className="dot">·</span>
            <span><b>2</b> runs logged</span>
          </div>
        </div>
      </section>

      <UniverseMount />

      <div className="lp-ticker" aria-hidden="true">
        <div className="lp-ticker-track">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={`${t}-${i}`}>
              {t}
              <i>+</i>
            </span>
          ))}
        </div>
      </div>

      <section className="lp-sec" id="problem">
        <div className="lp-wrap lp-split">
          <div className="lp-split-head">
            <span className="lp-kicker"><b>01</b> The problem</span>
            <h2 className="lp-h2">Research is more than reading.</h2>
            <p className="lp-body">
              One idea lives across a PDF, a dataset, a repo, a note and a log. By the time you
              reconnect it, the context is gone. ResearchGraph turns the pile into a navigable
              universe where every artifact has a place and a relationship.
            </p>
            <p className="lp-under">
              <span className="mark">→</span>
              Import a paper, URL, GitHub repo, dataset or note. Each becomes a node with extracted
              passages and citations.
            </p>
          </div>

          <div className="lp-stack">
            {FRAGMENTS.map((f) => (
              <div className="lp-frag" key={f.t}>
                <span className="ic" aria-hidden="true">{f.ic}</span>
                <span className="txt">
                  <span className="t">{f.t}</span>
                  <span className="s">{f.s}</span>
                </span>
                <span className="tail">{f.tail}</span>
              </div>
            ))}
            <p className="lp-stack-note">five tabs, no thread</p>
          </div>
        </div>
      </section>

      <section className="lp-band" id="graph">
        <div className="lp-wrap">
          <div className="lp-band-head">
            <span className="lp-kicker"><b>02</b> The graph</span>
            <h2 className="lp-h2">Discover the connections.</h2>
            <p className="lp-body">
              Papers link to datasets. Questions link to experiments. Errors link to fixes. Every
              edge is typed and carries evidence, so the graph explains <em>why</em> two things are
              related — not just that they are.
            </p>
          </div>

          <div className="lp-band-grid">
            <div className="lp-window">
              <div className="lp-window-bar">
                <span className="dot" /><span className="dot" /><span className="dot" />
                <span className="lp-window-title">Plant Disease Detection</span>
                <span className="lp-window-hint">hover to trace</span>
                <span className="lp-window-live">live graph</span>
              </div>

              <ConnectionGraph />
            </div>

            <div className="lp-stack onDark">
              {EDGES.map((e) => (
                <div className="lp-edge" key={`${e.from}-${e.to}`}>
                  <span className="pill">{e.from}</span>
                  <span className="arrow" aria-hidden="true">→</span>
                  <span className="pill dest">{e.to}</span>
                  <span className="rel">{e.rel}</span>
                  <span className="conf">{e.conf}</span>
                </div>
              ))}
              <p className="lp-stack-note">suggested links · accept before saving</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="agents">
        <div className="lp-wrap">
          <div className="lp-panel">
            <div className="lp-panel-glow" aria-hidden="true" />
            <span className="lp-kicker"><b>03</b> The team</span>
            <h2 className="lp-h2">A team that helps you think.</h2>
            <p className="lp-body">
              A controller coordinates seven specialists. Every consequential action stops for your
              approval — inspect the plan, approve it, redirect it, or reject it. No silent
              execution, ever.
            </p>

            <div className="lp-pipe">
              <div className="lp-agent ctrl">
                <span className="role"><i aria-hidden="true" />Controller</span>
                <span className="desc">
                  Picks the agent sequence, tracks dependencies, and blocks execution until you approve.
                </span>
                <span className="tag">approval gate enforced</span>
              </div>
              <div className="lp-agent">
                <span className="role"><i aria-hidden="true" />Inspect everything</span>
                <span className="desc">
                  Plans, tool calls, prompts, retrieved passages and confidence — visible per step.
                </span>
              </div>
              <div className="lp-agent">
                <span className="role"><i aria-hidden="true" />Evidence, not vibes</span>
                <span className="desc">
                  Answers cite sources and page references. Unsupported claims are flagged as gaps.
                </span>
              </div>
              <div className="lp-agent">
                <span className="role"><i aria-hidden="true" />Pause · redirect · reject</span>
                <span className="desc">
                  Stop a run mid-flight, change the parameters, or reject the output and rerun.
                </span>
              </div>
            </div>

            <div className="lp-chips">
              {AGENT_NAMES.map((a) => (
                <span className="lp-chip" key={a}>{a}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="experiments">
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <span className="lp-kicker"><b>04</b> Experiments</span>
            <h2 className="lp-h2">From plan to reproducible run.</h2>
            <p className="lp-body">
              Paper → methodology → dataset → parameters → approved run → saved result. CPU-first,
              isolated, and fully logged, so a result can always be traced back to its setup.
            </p>
          </div>

          <div className="lp-steps">
            <div className="lp-step">
              <span className="n">STEP 01</span>
              <h3>Plan &amp; approve</h3>
              <p>Dependencies, environment, parameters and expected outputs — reviewed before anything executes.</p>
              <div className="lp-meter"><i style={{ width: "72%" }} /></div>
              <div className="lp-tagrow">
                <span className="lp-tag">approval required</span>
                <span className="lp-tag">deps · env · outputs</span>
              </div>
            </div>

            <div className="lp-step">
              <span className="n">STEP 02</span>
              <h3>Isolated run</h3>
              <p>A sandboxed CPU run with a timeout, captured logs and artifacts attached to the run.</p>
              <div className="lp-log">{`epoch 3/5 — acc 0.882
best checkpoint saved
elapsed 00:04:12`}</div>
              <div className="lp-tagrow">
                <span className="lp-tag good">logs captured</span>
              </div>
            </div>

            <div className="lp-step">
              <span className="n">STEP 03</span>
              <h3>Compare &amp; save</h3>
              <p>Baseline vs run, with the config attached — then written to memory as reusable knowledge.</p>
              <div className="lp-score">91.4%<small>vs 90.2%</small></div>
              <div className="lp-tagrow">
                <span className="lp-tag good">+1.2pp</span>
                <span className="lp-tag violet">saved to memory</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="memory">
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <span className="lp-kicker"><b>05</b> Memory</span>
            <h2 className="lp-h2">Every experiment becomes knowledge.</h2>
            <p className="lp-body">
              Parameters, errors, fixes and findings are stored with the run that produced them.
              Next time, the workspace starts from what you already learned.
            </p>
          </div>

          <div className="lp-mem">
            {MEMORY.map((m) => (
              <div className="lp-memcard" key={m.title}>
                <span className="kind">{m.kind}</span>
                <b>{m.title}</b>
                <p>{m.body}</p>
                <span className={`lp-tag ${m.tag}`}>{m.reuse}</span>
              </div>
            ))}
          </div>

          <div className="lp-stats">
            {STATS.map((s) => (
              <div className="lp-stat" key={s.s}>
                <b>{s.b}</b>
                <span>{s.s}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-cta-sec">
        <div className="lp-wrap">
          <div className="lp-final">
            <div className="lp-final-glow" aria-hidden="true" />
            <span className="lp-kicker onDark"><b>↗</b> Start here</span>
            <h2>Stop losing context.</h2>
            <p>
              Start with a blank workspace and bring your own papers, datasets and runs — or
              import a workspace snapshot you exported earlier.
            </p>
            <div className="lp-cta">
              <Link className="lp-btn lp-btn-lime" to="/register">
                Create free workspace
                <span aria-hidden="true">→</span>
              </Link>
              <Link className="lp-btn lp-btn-ghost-dark" to="/login">Log in</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-in">
            <div className="lp-foot-brand">
              <Link className="lp-brand" to="/">
                <LogoMark size={27} className="lp-brand-mark" />
                <b>ResearchGraph</b>
              </Link>
              <p>A connected research workspace for papers, experiments and the knowledge between them.</p>
            </div>
            <div className="lp-foot-col">
              <b>Product</b>
              <a href="#graph">Research canvas</a>
              <a href="#problem">Sources</a>
              <a href="#agents">AI agents</a>
              <a href="#experiments">Experiments</a>
            </div>
            <div className="lp-foot-col">
              <b>Workspace</b>
              <Link to="/login">Dashboard</Link>
              <Link to="/login">Memory</Link>
              <Link to="/login">Discovery</Link>
              <Link to="/login">Share &amp; export</Link>
            </div>
            <div className="lp-foot-col">
              <b>Account</b>
              <Link to="/login">Log in</Link>
              <Link to="/register">Create workspace</Link>
              <span>Researcher</span>
            </div>
          </div>
          <div className="lp-foot-bottom">
            <span>© 2026 ResearchGraph · connected research workspace</span>
            <span>Prototype · data stored in your workspace · export any time</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
