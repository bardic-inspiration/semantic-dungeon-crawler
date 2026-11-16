// The "hand" interface: draws any game built on the `hand` base ruleset.
// It knows nothing of a particular game. The project's `interface` config
// gives it a title, copy, a theme, and how to group the sources; the rules
// run in core, and this only shows the state and submits the player's pick.
import { openGame } from "../game.mjs";
import { openSurface } from "../surface.mjs";

const { id, interface: ui, docs, surface: packed } = window.SDC;

const COPY = {
  tagline: "",
  meter: "Meter",
  trail: "Your trail",
  map: "The map",
  mapNote: "Nearby passages mean similar things. The line is your path.",
  empty: "Nothing yet. Your first card decides what the trail is about.",
  promptStart: "Choose any card to begin.",
  promptPlay: "Play the card that best continues your trail.",
  afterFirst: "That is your start. Now follow it.",
  verdicts: { great: "Excellent.", good: "Good.", flat: "Flat.", bad: "A miss." },
  // A move worth at least this much earns the "great" verdict.
  greatAt: 12,
  unit: "",
  bestWas: "The best card here was worth {best}.",
  wasBest: "That was the best card in the hand.",
  winTitle: "Done in {moves} moves",
  par: "",
  played: "Here is what you played on the way:",
  best: "Your best on this game is {best}.",
  newBest: "A new best on this game, down from {best}.",
  daily: "Today's game",
  fresh: "New game",
  retry: "Retry this game",
  copy: "Copy result",
  copied: "Copied",
  seedDaily: "Daily",
  seedNamed: "Game",
  streakNone: "no streak",
  streak: "streak ×{x}",
  moves: "moves",
  rulesTitle: "How it works",
  rules: [],
};
const copy = { ...COPY, ...ui.copy, verdicts: { ...COPY.verdicts, ...ui.copy?.verdicts } };
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key]);
const $ = (name) => document.getElementById(name);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "zero");
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};

// Sources are coloured by group. A project names its groups; any it does not
// name get a colour from this list.
const PALETTE = ["#62b6cd", "#86c08c", "#d9686a", "#c59ad6", "#e0b050", "#8fa3e8"];
const groups = {};
for (const source of packed.sources) {
  const key = source.group ?? source.title ?? "source";
  if (!groups[key]) {
    const given = ui.groups?.[key] ?? {};
    groups[key] = { label: given.label ?? key, color: given.color ?? PALETTE[Object.keys(groups).length % PALETTE.length] };
  }
}
const source = (p) => packed.sources[packed.passages[p].s];
const colorOf = (p) => groups[source(p).group ?? source(p).title ?? "source"].color;
const text = (p) => packed.passages[p].t;

let game, goal, streakStep, streakCap;
let session, view, seedName, reveal, timer;

const today = () => {
  const d = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const seedFromHash = () => (/^#seed-([a-z0-9-]{1,40})$/i.exec(location.hash) || [])[1] || null;

function start(name, picks = []) {
  clearTimeout(timer);
  seedName = name;
  session = game.start(`${id}:${name}`, picks);
  view = session.view();
  reveal = null;
  render();
}

function choose(slot) {
  if (reveal || view.ended || slot >= view.hand.length) return;
  const before = view;
  session.play(slot);
  view = session.view();
  const first = before.trail.length === 0;
  reveal = { hand: before.hand, worth: before.worth, slot, first };
  render();
  timer = setTimeout(endReveal, first ? 900 : 2200);
}

function endReveal() {
  clearTimeout(timer);
  reveal = null;
  render();
}

function renderMeter() {
  $("meter").textContent = view.meter;
  $("fill").style.width = `${(100 * view.meter) / goal}%`;
  $("bar").setAttribute("aria-valuenow", view.meter);
  $("moves").textContent = view.trail.length;
  const lit = Math.min(view.streak, streakCap);
  const pips = $("pips");
  pips.replaceChildren();
  for (let i = 0; i < streakCap; i++) pips.append(el("i", i < lit ? "pip lit" : "pip"));
  $("streak").textContent = lit
    ? fill(copy.streak, { x: String(Number((1 + (lit * streakStep) / 100).toFixed(2))) })
    : copy.streakNone;
  $("seed").textContent = `${seedName === today() ? copy.seedDaily : copy.seedNamed} ${seedName}`;
}

function renderTrail() {
  const list = $("trail");
  list.replaceChildren();
  view.trail.forEach((p, i) => {
    const li = el("li");
    li.append(el("span", "line", text(p)));
    const d = view.moved[i];
    li.append(i === 0 ? el("span", "delta zero", "start") : el("span", `delta ${tone(d)}`, signed(d)));
    li.append(el("span", "src", source(p).title));
    list.append(li);
  });
  list.hidden = view.trail.length === 0;
  $("empty").hidden = view.trail.length > 0;
  list.scrollTop = list.scrollHeight;
}

function renderHand() {
  const hand = $("hand");
  const cards = reveal ? reveal.hand : view.hand;
  const showWorth = reveal && !reveal.first;
  hand.hidden = Boolean(view.ended) && !reveal;
  hand.replaceChildren();
  cards.forEach((p, i) => {
    const button = el("button", "card");
    button.type = "button";
    const top = el("span", "card-top");
    top.append(el("span", "key", String(i + 1)));
    if (showWorth) top.append(el("span", `delta ${tone(reveal.worth[i])}`, signed(reveal.worth[i])));
    const src = el("span", "card-src");
    const dot = el("i", "dot");
    dot.style.background = colorOf(p);
    src.append(dot, source(p).title);
    button.append(top, el("span", "card-text", text(p)), src);
    if (reveal) {
      button.disabled = true;
      button.classList.add(i === reveal.slot ? "chosen" : "left");
    } else {
      button.addEventListener("click", () => choose(i));
    }
    hand.append(button);
  });

  const prompt = $("prompt");
  prompt.replaceChildren();
  if (reveal && reveal.first) {
    prompt.append(el("strong", "", copy.afterFirst));
  } else if (reveal) {
    const d = reveal.worth[reveal.slot];
    const best = Math.max(...reveal.worth);
    const verdict = d >= copy.greatAt ? copy.verdicts.great : d > 0 ? copy.verdicts.good : d === 0 ? copy.verdicts.flat : copy.verdicts.bad;
    prompt.append(el("strong", "", `${verdict} ${signed(d)}${copy.unit ? ` ${copy.unit}` : ""}.`));
    prompt.append(` ${d < best ? fill(copy.bestWas, { best: signed(best) }) : copy.wasBest}`);
  } else if (!view.ended) {
    prompt.textContent = view.trail.length === 0 ? copy.promptStart : copy.promptPlay;
  }
}

function renderResult() {
  const box = $("result");
  box.hidden = !view.ended || Boolean(reveal);
  if (box.hidden) return;
  const moves = view.trail.length;
  const key = `${id}-best-${seedName}`;
  const prior = Number(store.get(key)) || 0;
  if (!prior || moves < prior) store.set(key, String(moves));
  box.replaceChildren();
  const [before, after] = copy.winTitle.split("{moves}");
  const title = el("h2", "", before);
  if (after !== undefined) title.append(el("span", "num", String(moves)), after);
  box.append(title);
  const note = prior && prior <= moves ? fill(copy.best, { best: prior }) : prior ? fill(copy.newBest, { best: prior }) : copy.played;
  box.append(el("p", "", [note, copy.par].filter(Boolean).join(" ")));
  const poem = el("div", "poem");
  for (const p of view.trail) poem.append(el("span", "", text(p)));
  box.append(poem);
  const controls = el("div", "controls");
  const again = el("button", "ghost primary", copy.fresh);
  again.type = "button";
  again.addEventListener("click", fresh);
  const retry = el("button", "ghost", copy.retry);
  retry.type = "button";
  retry.addEventListener("click", () => start(seedName));
  const share = el("button", "ghost", copy.copy);
  share.type = "button";
  share.addEventListener("click", async () => {
    const marks = view.moved.slice(1).map((d) => (d > 0 ? "▲" : d < 0 ? "▼" : "·")).join("");
    const line = `${ui.title ?? id} ${seedName}: ${moves} ${copy.moves} ${marks}`;
    try {
      await navigator.clipboard.writeText(line);
      share.textContent = copy.copied;
    } catch {
      share.textContent = line;
    }
  });
  controls.append(again, retry, share);
  box.append(controls);
}

function renderMap() {
  const canvas = $("map");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !view) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const pad = 18;
  const at = (p) => [
    pad + (packed.xy[p * 2] / 1000) * (rect.width - pad * 2),
    pad + (packed.xy[p * 2 + 1] / 1000) * (rect.height - pad * 2),
  ];
  ctx.globalAlpha = 0.5;
  for (let p = 0; p < packed.passages.length; p++) {
    ctx.fillStyle = colorOf(p);
    ctx.beginPath();
    ctx.arc(...at(p), 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const accent = css("--accent");
  const bone = css("--bone");
  if (view.trail.length) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    view.trail.forEach((p, i) => (i ? ctx.lineTo(...at(p)) : ctx.moveTo(...at(p))));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    for (const p of view.trail) {
      ctx.beginPath();
      ctx.arc(...at(p), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = bone;
    ctx.beginPath();
    ctx.arc(...at(view.trail.at(-1)), 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (reveal && !reveal.first) {
    ctx.font = `700 12px ${css("--ui")}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    reveal.hand.forEach((p, i) => {
      if (i === reveal.slot) return;
      const [x, y] = at(p);
      ctx.fillStyle = css("--ink");
      ctx.strokeStyle = bone;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = bone;
      ctx.fillText(String(i + 1), x, y + 0.5);
    });
  }
}

function render() {
  renderMeter();
  renderTrail();
  renderHand();
  renderResult();
  renderMap();
}

function fresh() {
  const name = Math.floor(Math.random() * 36 ** 5).toString(36).padStart(5, "0");
  location.hash = `seed-${name}`;
  if (seedName !== name) start(name);
}

function layout() {
  $("title").textContent = ui.title ?? id;
  $("tagline").textContent = copy.tagline;
  $("daily").textContent = copy.daily;
  $("fresh").textContent = copy.fresh;
  $("meter-section").setAttribute("aria-label", copy.meter);
  $("meter-label").textContent = copy.meter;
  $("goal").textContent = ` / ${goal}`;
  $("bar").setAttribute("aria-valuemax", goal);
  $("moves-label").textContent = copy.moves;
  $("trail-title").textContent = copy.trail;
  $("empty").textContent = copy.empty;
  $("map-title").textContent = copy.map;
  const legend = $("legend");
  for (const group of Object.values(groups)) {
    const item = el("span");
    const dot = el("i", "dot");
    dot.style.background = group.color;
    item.append(dot, group.label);
    legend.append(item);
  }
  legend.append(el("span", "", copy.mapNote));
  if (copy.rules.length) {
    $("rules").hidden = false;
    $("rules-title").textContent = copy.rulesTitle;
    for (const paragraph of copy.rules) $("rules").append(el("p", "", paragraph));
  }
}

function boot(saved = {}) {
  try {
    game = openGame({ ...docs, surface: openSurface(packed) });
    goal = Number(game.table("goal"));
    streakStep = Number(game.table("streakStep"));
    streakCap = Number(game.table("streakCap"));
  } catch (error) {
    $("failure").hidden = false;
    $("failure").textContent = `The game could not start: ${error.message}`;
    throw error;
  }
  layout();
  $("fresh").addEventListener("click", fresh);
  $("daily").addEventListener("click", () => {
    if (location.hash) location.hash = "";
    start(today());
  });
  window.addEventListener("hashchange", () => {
    const name = seedFromHash();
    if (name && name !== seedName) start(name);
  });
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (reveal && (e.key === " " || e.key === "Enter")) return endReveal();
    const n = Number(e.key);
    if (n >= 1 && n <= 9) choose(n - 1);
  });
  $("hand").addEventListener("click", () => reveal && endReveal());
  new ResizeObserver(renderMap).observe($("map"));
  if (document.fonts?.ready) document.fonts.ready.then(renderMap);
  start(saved.seedName || seedFromHash() || today(), saved.picks || []);
}

const hot = window.claude?.hot;
if (hot?.snapshot) hot.snapshot(() => ({ seedName, picks: session?.picks ?? [] }));
if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
