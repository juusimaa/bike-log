/* Bike Log V5 (draft 2026-10-13): Strava import and bike links (spec 003), on top of V4.
   A standalone preview of the Strava flows; parts, maintenance and the bike switcher are unchanged
   from V4 and not repeated here. The rules below only imitate the API, which owns them for real. */
'use strict';

function day(s) { return new Date(`${s}T12:00:00Z`).getTime(); }
const TODAY = day('2026-10-13');
const DAY = 86400000;
function iso(t) { return new Date(t).toISOString().slice(0, 10); }
function fmtDate(t) { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
function fmtTime(t) { return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }); }
function fmtKm(m) { return Math.round(m / 1000).toLocaleString('en-GB'); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function icon(id, cls = 'i') { return `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`; }
function plural(n, one, many = `${one}s`) { return `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`; }
const art = (color, cls = 'art') => `<svg class="${cls}" viewBox="0 0 600 300" style="--bike-color:${color}" aria-hidden="true"><use href="#bike-art"/></svg>`;

/* ---------- Strava side (what the athlete has in Strava; synthetic) ---------- */
const CYCLING = new Set(['Ride', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide', 'Handcycle', 'Velomobile']);
const TYPE_LABEL = { Ride: 'Ride', GravelRide: 'Gravel ride', MountainBikeRide: 'MTB ride', EBikeRide: 'E-bike ride', VirtualRide: 'Virtual ride', Run: 'Run' };
const KIND = { road: 'road', gravel: 'gravel', mountain: 'mountain', city: 'city', cross: 'gravel' };
const COLORS = ['#789b8c', '#9a7a62', '#7d8fa8', '#a8857d', '#8c9a6a'];

const PROFILE_BIKES = [
  { id: 'b101', name: 'Grizl', brand: 'Canyon', model: 'Grizl CF SL 8', type: 'gravel', retired: false },
  { id: 'b102', name: 'Tarmac', brand: 'Specialized', model: 'Tarmac SL7', type: 'road', retired: false },
  { id: 'b103', name: 'Old Allez', brand: 'Specialized', model: 'Allez', type: 'road', retired: true },
  { id: 'b104', name: "Ella's Marin", brand: 'Marin', model: 'Fairfax 2', type: 'city', retired: false },
];
const NEW_BIKE = { id: 'b105', name: 'Checkpoint', brand: 'Trek', model: 'Checkpoint SL 5', type: 'gravel', retired: false };

function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
function series(seed, gear, n, from, to, names, kmMin, kmMax, type) {
  const r = rng(seed); const a = day(from); const b = day(to); const out = [];
  for (let i = 0; i < n; i++) {
    const base = a + Math.floor(((b - a) * (i + r() * 0.8)) / n);
    const start = base - 12 * 3600000 + (6 + Math.floor(r() * 12)) * 3600000 + Math.floor(r() * 60) * 60000;
    const km = kmMin + r() * (kmMax - kmMin);
    out.push({ id: `s${seed}${String(i).padStart(2, '0')}`, name: names[Math.floor(r() * names.length)], start, metres: Math.round(km * 1000), secs: Math.round((km / (23 + r() * 6)) * 3600), type, gear });
  }
  return out;
}
const at = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h, min);
function activities() {
  return [
    ...series(11, 'b101', 22, '2026-03-05', '2026-10-08', ['Gravel loop', 'Morning Ride', 'Forest roads', 'Lunch Ride'], 35, 95, 'GravelRide'),
    ...series(12, 'b102', 16, '2026-03-10', '2026-10-06', ['Morning Ride', 'Coffee ride', 'Tempo hour', 'Evening Ride'], 40, 110, 'Ride'),
    { id: 's900', name: 'Evening Ride', start: at(2026, 10, 12, 16, 32), metres: 41250, secs: 5400, type: 'Ride', gear: 'b102' },
    ...series(13, 'b103', 3, '2025-04-01', '2025-09-01', ['Morning Ride'], 30, 60, 'Ride'),
    ...series(14, 'b104', 4, '2026-05-01', '2026-09-20', ['Commute', 'Errands'], 5, 15, 'Ride'),
    { id: 's950', name: 'Morning Ride', start: at(2026, 9, 27, 7, 5), metres: 52300, secs: 7200, type: 'Ride', gear: null },
    { id: 's951', name: 'Lunch Ride', start: at(2026, 10, 3, 11, 40), metres: 31800, secs: 4300, type: 'Ride', gear: null },
    { id: 's952', name: 'Afternoon Ride', start: at(2026, 10, 9, 14, 15), metres: 46700, secs: 6300, type: 'Ride', gear: null },
    ...series(15, 'b102', 3, '2026-04-01', '2026-09-01', ['Indoor tempo (trainer app)'], 25, 45, 'VirtualRide'),
    ...series(16, null, 4, '2026-04-01', '2026-09-30', ['Morning Run'], 6, 12, 'Run'),
  ];
}
const NEW_BIKE_RIDES = () => series(17, 'b105', 4, '2026-09-20', '2026-10-12', ['Gravel loop', 'Morning Ride'], 40, 80, 'GravelRide');

/* ---------- Bike Log side ---------- */
const GARAGE = () => [
  { id: 'gravel', name: 'Gravel bike', make: 'Canyon', model: 'Grizl CF SL 8', kind: 'gravel', year: 2025, color: '#789b8c' },
  { id: 'road', name: 'Road bike', make: 'Specialized', model: 'Tarmac SL7', kind: 'road', year: 2023, color: '#9a7a62' },
  { id: 'winter', name: 'Winter bike', make: 'Surly', model: 'Straggler', kind: 'gravel', year: 2019, color: '#7d8fa8' },
];
const MANUAL = () => [
  { id: 'm1', name: 'Winter base miles', start: at(2026, 1, 18, 10, 0), metres: 48200, secs: 7600, bike: 'winter' },
  { id: 'm2', name: 'Snowy loop', start: at(2026, 2, 7, 11, 30), metres: 33100, secs: 5800, bike: 'winter' },
  { id: 'm3', name: 'First gravel of spring', start: at(2026, 3, 2, 9, 15), metres: 61500, secs: 10100, bike: 'gravel' },
  { id: 'm4', name: 'Evening loop', start: at(2026, 10, 12, 16, 30), metres: 41900, secs: 5460, bike: 'road' },
].map((r) => ({ ...r, source: 'manual', status: 'assigned', type: 'Ride', gear: null, override: false, dupOf: null }));

let seq = 0;
function blankState(scenario) {
  return {
    scenario,
    bikes: scenario === 'empty' ? [] : GARAGE(),
    rides: scenario === 'empty' ? [] : MANUAL(),
    strava: { activities: activities(), profile: PROFILE_BIKES.map((b) => ({ ...b })) },
    links: {}, // Strava bike id → { state: 'linked'|'ignored'|'unresolved', bike }
    conn: null, // { athlete, status, lastSync, startDate, virtual, defaultBike, backfill }
    setup: null, // draft while setting up
    excluded: new Set(), // Strava rides the owner chose not to keep (duplicates)
    notDup: new Set(),
  };
}

function scenarioState(name) {
  const s = blankState(name);
  if (name !== 'connected') return s;
  state = s;
  connect();
  applySetup({ b101: { action: 'link', bike: 'gravel' }, b102: { action: 'link', bike: 'road' }, b103: { action: 'ignore' }, b104: { action: 'ignore' } }, day('2026-03-01'), false);
  importAll();
  // A bike added in Strava since the first sync; its rides wait for the owner.
  s.strava.profile.push({ ...NEW_BIKE });
  s.strava.activities.push(...NEW_BIKE_RIDES());
  importAll();
  // A ride whose bike was changed in Strava after import; a manual sync re-checks it.
  const changed = s.strava.activities.filter((a) => a.gear === 'b101' && a.start > TODAY - 30 * DAY).at(-1);
  if (changed) changed.gear = 'b102';
  s.conn.status = 'connected'; s.conn.lastSync = at(2026, 10, 13, 6, 12);
  return s;
}

let state = blankState('empty');

/* ---------- Derived values ---------- */
const bikeOf = (id) => state.bikes.find((b) => b.id === id);
const bikeName = (b) => (b ? b.name || `${b.make} ${b.model}` : '');
const sbOf = (id) => state.strava.profile.find((b) => b.id === id);
const linkOf = (id) => state.links[id] ?? null;
const linkedStrava = (bikeId) => Object.keys(state.links).find((g) => state.links[g].state === 'linked' && state.links[g].bike === bikeId) ?? null;
const unlinkedBikes = () => state.bikes.filter((b) => !linkedStrava(b.id));
const imported = () => state.rides.filter((r) => r.source === 'strava');
const pending = (gear) => state.rides.filter((r) => r.status === 'pending' && (!gear || r.gear === gear));
const unassigned = () => state.rides.filter((r) => r.status === 'unassigned');
const dupes = () => state.rides.filter((r) => r.dupOf);
const sumKm = (rides) => rides.reduce((a, r) => a + r.metres, 0);
const ridesOfBike = (bikeId) => state.rides.filter((r) => r.bike === bikeId && r.status === 'assigned');
const throughLink = (gear) => state.rides.filter((r) => r.source === 'strava' && r.gear === gear && !r.override && r.status === 'assigned');
const unresolvedBikes = () => Object.keys(state.links).filter((g) => state.links[g].state === 'unresolved');
const sbLabel = (sb) => `${esc(sb.brand)} ${esc(sb.model)} · ${esc(sb.type)}`;

/* The suggestion: the one unlinked bike sharing the most words (at least two) with the Strava bike. */
const words = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !['bike', 'the'].includes(w)));
function suggestion(sb, taken = new Set()) {
  const mine = words(`${sb.name} ${sb.brand} ${sb.model}`);
  let best = null; let bestScore = 1; let tie = false;
  for (const b of state.bikes) {
    if (taken.has(b.id) || linkedStrava(b.id)) continue;
    const score = [...words(`${b.name} ${b.make} ${b.model}`)].filter((w) => mine.has(w)).length;
    if (score > bestScore) { best = b.id; bestScore = score; tie = false; } else if (score === bestScore && best) tie = true;
  }
  return tie ? null : best;
}

/* ---------- Rules imitating the API ---------- */
function eligible(a) {
  const c = state.conn;
  if (!(CYCLING.has(a.type) || (a.type === 'VirtualRide' && c.virtual))) return false;
  if (a.start < c.startDate) return false;
  if (a.gear && linkOf(a.gear)?.state === 'ignored') return false;
  return !state.excluded.has(a.id);
}
function assignmentFor(gear) { // FR-015, steps 2–5 (step 1, the owner's override, never changes here)
  if (gear) {
    const link = linkOf(gear);
    return link?.state === 'linked' ? { bike: link.bike, status: 'assigned' } : { bike: null, status: 'pending' };
  }
  return state.conn.defaultBike ? { bike: state.conn.defaultBike, status: 'assigned' } : { bike: null, status: 'unassigned' };
}
function importOne(a) {
  if (state.rides.some((r) => r.stravaId === a.id)) return false; // each Strava ride once
  if (a.gear && !linkOf(a.gear)) state.links[a.gear] = { state: 'unresolved', bike: null };
  state.rides.push({ id: `r${++seq}`, source: 'strava', stravaId: a.id, name: a.name, start: a.start, metres: a.metres, secs: a.secs, type: a.type, gear: a.gear, override: false, dupOf: null, ...assignmentFor(a.gear) });
  return true;
}
function queue() { return state.strava.activities.filter(eligible).filter((a) => !state.rides.some((r) => r.stravaId === a.id)).sort((x, y) => x.start - y.start); }
function importAll() { const n = queue().filter(importOne).length; flagDuplicates(); return n; }
function removeIneligible() { // by type, start date and duplicates; ignoring a bike removes its rides separately
  const c = state.conn;
  const ok = (a) => a && (CYCLING.has(a.type) || (a.type === 'VirtualRide' && c.virtual)) && a.start >= c.startDate && !state.excluded.has(a.id);
  const keep = (r) => r.source !== 'strava' || ok(state.strava.activities.find((a) => a.id === r.stravaId));
  const before = state.rides.length; state.rides = state.rides.filter(keep); return before - state.rides.length;
}
function flagDuplicates() {
  const manual = state.rides.filter((r) => r.source === 'manual');
  for (const r of imported()) {
    if (r.dupOf || state.notDup.has(r.id) || r.status !== 'assigned') continue;
    const m = manual.find((x) => x.bike === r.bike && Math.abs(x.start - r.start) <= 10 * 60000 && Math.abs(x.metres - r.metres) <= 0.05 * x.metres);
    if (m) r.dupOf = m.id;
  }
}
function reassign(r) { if (!r.override) Object.assign(r, assignmentFor(r.gear)); }

function connect() {
  state.conn = { athlete: 'Alex Rider', status: 'setup', lastSync: null, startDate: null, virtual: false, defaultBike: null, backfill: null };
}
function applySetup(choices, startDate, virtual) { // all or nothing, before any ride is imported (FR-008)
  Object.entries(choices).forEach(([gear, c], k) => {
    const sb = sbOf(gear);
    if (c.action === 'link') state.links[gear] = { state: 'linked', bike: c.bike };
    else if (c.action === 'ignore') state.links[gear] = { state: 'ignored', bike: null };
    else {
      const id = `bike${++seq}`;
      state.bikes.push({ id, name: c.name || sb.name, make: c.make || sb.brand, model: c.model || sb.model, kind: c.kind || KIND[sb.type] || 'road', year: 2026, color: COLORS[(state.bikes.length + k) % COLORS.length], fromStrava: true });
      state.links[gear] = { state: 'linked', bike: id };
    }
  });
  Object.assign(state.conn, { startDate, virtual, status: 'syncing' });
}
const defaultStart = () => (state.scenario === 'empty' ? day('2026-01-01') : day('2026-03-01'));

/* ---------- Backfill (paced, pauses at Strava's request limit, then resumes on its own) ---------- */
let timer = null;
function startBackfill() {
  const q = queue();
  state.conn.backfill = { total: q.length, done: 0, paused: false, pausedOnce: false };
  clearInterval(timer);
  timer = setInterval(() => {
    const c = state.conn; const bf = c?.backfill;
    if (!bf) { clearInterval(timer); return; }
    if (bf.paused) return;
    if (!bf.pausedOnce && bf.done >= bf.total * 0.55) {
      bf.paused = true; bf.pausedOnce = true; c.status = 'paused'; render();
      setTimeout(() => { if (state.conn?.backfill === bf) { bf.paused = false; c.status = 'syncing'; render(); } }, 2600);
      return;
    }
    const next = queue().slice(0, 3);
    next.forEach(importOne); bf.done = Math.min(bf.total, bf.done + next.length);
    if (!next.length || bf.done >= bf.total) {
      clearInterval(timer); flagDuplicates();
      c.backfill = null; c.status = 'connected'; c.lastSync = at(2026, 10, 13, 9, 12);
      const u = unassigned().length;
      toast(`Import finished: ${plural(imported().length, 'ride')}.${u ? ` ${plural(u, 'ride')} had no bike in Strava.` : ''}`);
    }
    render();
  }, 260);
}

/* ---------- Rendering ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
let view = 'overview';
const ridesUi = { filter: 'all', bike: 'all', selected: new Set() };

function render() {
  view = (location.hash || '#overview').slice(1);
  if (!['overview', 'components', 'rides', 'maintenance', 'strava'].includes(view)) view = 'overview';
  document.querySelectorAll('nav a').forEach((a) => {
    const on = a.dataset.view === view;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#scenario').value = state.scenario;
  const c = state.conn;
  const navState = $('#strava-state');
  navState.className = `nav-state${c && c.status !== 'setup' ? (needsAttention() ? ' warn' : ' on') : ''}`;
  navState.title = c && c.status !== 'setup' ? 'Connected' : 'Not connected';
  const needs = pending().length + unassigned().length;
  $('#rides-count').hidden = !needs; $('#rides-count').textContent = needs;

  const titles = { overview: 'Overview', components: 'Components', rides: 'Rides', maintenance: 'Maintenance', strava: 'Strava' };
  $('#breadcrumb').textContent = titles[view];
  const heading = {
    overview: ['Your garage', state.bikes.length ? `${plural(state.bikes.length, 'bike')}. Open a bike's settings to see or change its Strava link.` : 'Nothing here yet.'],
    components: ['Components', 'Unchanged in V5.'],
    rides: ['Rides', 'Every ride, manual or imported, across your garage. Each counts toward the parts fitted when it started.'],
    maintenance: ['Maintenance', 'Unchanged in V5.'],
    strava: c?.status === 'setup' ? ['Set up Strava import', 'Decide how your Strava bikes relate to your garage. Nothing is imported until you save.'] : ['Strava', 'Import rides from Strava and keep them on the right bike.'],
  }[view];
  $('#page-title').textContent = heading[0];
  $('#page-subtitle').textContent = heading[1];
  $('#heading-actions').innerHTML = headingActions();
  $('#attention').innerHTML = view === 'strava' && c?.status === 'setup' ? '' : attention();
  $('#view-content').innerHTML = { overview: overviewView, components: unchangedView, rides: ridesView, maintenance: unchangedView, strava: stravaView }[view]();
}
const needsAttention = () => !!(pending().length || unassigned().length || dupes().length);
const connected = () => state.conn && state.conn.status !== 'setup';

function headingActions() {
  if (view === 'rides') return '<button class="button primary" type="button" data-action="add-ride">' + icon('i-plus') + 'Add a ride</button>';
  if (!connected()) return view === 'strava' ? '' : '<a class="button secondary" href="#strava">Connect Strava</a>';
  if (view === 'strava' || view === 'overview') return syncButton();
  return '';
}
const syncButton = () => `<button class="button secondary" type="button" data-action="sync" ${state.conn.backfill ? 'disabled' : ''}>${icon('i-sync')}Sync now</button>`;

/* The notices that follow the owner everywhere until resolved (FR-020, FR-022, FR-029). */
function attention() {
  if (!connected()) return '';
  const out = unresolvedBikes().map((g) => {
    const sb = sbOf(g); const n = pending(g).length;
    return `<div class="notice" role="status">${icon('i-alert')}<div><strong>New bike in Strava: ${esc(sb.name)}</strong> (${sbLabel(sb)}). ${plural(n, 'ride is', 'rides are')} waiting for you to decide which bike ${n === 1 ? 'it belongs' : 'they belong'} to. Until then ${n === 1 ? 'it counts' : 'they count'} toward no part.</div><div class="notice-actions"><button class="button small secondary" type="button" data-action="resolve" data-gear="${g}">Decide</button></div></div>`;
  });
  const u = unassigned().length;
  if (u) out.push(`<div class="notice calm" role="status">${icon('i-alert')}<div>${plural(u, 'imported ride has', 'imported rides have')} no bike in Strava. Pick a bike for ${u === 1 ? 'it' : 'them'}, or set a default bike for rides like ${u === 1 ? 'this' : 'these'}.</div><div class="notice-actions"><a class="button small secondary" href="#rides" data-filter="needs">Review</a></div></div>`);
  const d = dupes().length;
  if (d) out.push(`<div class="notice calm" role="status">${icon('i-alert')}<div>${plural(d, 'imported ride looks', 'imported rides look')} like ${d === 1 ? 'a ride' : 'rides'} you logged by hand. Both count until you choose.</div><div class="notice-actions"><a class="button small secondary" href="#rides" data-filter="dupes">Review</a></div></div>`);
  return out.join('');
}

function unchangedView() {
  return '<div class="notice calm">This view is unchanged by the Strava import. See the <a class="text-button" href="../v4/index.html">V4 preview</a>.</div>';
}

function overviewView() {
  if (!state.bikes.length) {
    return `<section class="panel empty-state"><h2>No bikes yet</h2><p>Create your first bike, or connect Strava and bring in the bikes you already ride. You choose which ones.</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="button primary" href="#strava">Connect Strava</a><button class="button secondary" type="button" data-action="create-bike">Create a bike</button></div></section>`;
  }
  return `<section class="garage-grid">${state.bikes.map((b) => {
    const g = linkedStrava(b.id); const sb = g && sbOf(g); const rides = ridesOfBike(b.id);
    const linkPill = !connected() ? '' : sb ? `<span class="pill fitted">${icon('i-link')}Strava: ${esc(sb.name)}</span>` : '<span class="pill quiet">Not linked to Strava</span>';
    return `<article class="bike-card">${art(b.color)}<h2>${esc(bikeName(b))}</h2><p>${esc(b.make)} ${esc(b.model)} · ${esc(b.kind)} · ${b.year}</p><div>${linkPill}</div>
      <div class="card-foot"><span class="tabular">${plural(rides.length, 'ride')} · ${fmtKm(sumKm(rides))} km</span><button class="button small secondary" type="button" data-action="bike-settings" data-bike="${b.id}">Bike settings</button></div></article>`;
  }).join('')}</section>`;
}

/* ---------- Strava page ---------- */
function stravaView() {
  const c = state.conn;
  if (!c) return connectView();
  if (c.status === 'setup') return setupView();
  return connectedView();
}

function connectView() {
  return `<section class="panel"><h2>Bring your rides in from Strava</h2>
    <ul class="intro-list">
      <li>${icon('i-check')}<span>Rides you record in Strava appear here on their own, and count toward the parts fitted when each ride started.</span></li>
      <li>${icon('i-check')}<span>You decide how each Strava bike relates to your garage. Bike Log suggests, but never creates or links a bike without you.</span></li>
      <li>${icon('i-check')}<span>Strava doesn't know your parts. Bike Log works out their usage from your rides; Strava's own bike totals are not used.</span></li>
    </ul>
    <button class="button strava-button" type="button" data-action="connect">Connect with Strava</button>
    <p class="fine">Strava will ask you to let Bike Log read your profile, including your bikes, and your activities, including ones only you can see. You can disconnect at any time; imported rides are then removed.</p></section>`;
}

function setupView() {
  const d = state.setup;
  const rows = state.strava.profile;
  const empty = d.mode === 'confirm';
  const errors = d.errors ?? [];
  return `<section class="panel"><div class="step-title"><span class="num">1</span><h2>${empty ? 'Which Strava bikes should be in your garage?' : 'How do your Strava bikes match your garage?'}</h2></div>
    <p class="lead">${empty
      ? 'Ticked bikes are created in Bike Log and linked to Strava. Untick bikes you don\'t want here, such as sold, retired or borrowed ones; Bike Log won\'t ask about them again.'
      : 'For each Strava bike, link it to one of your bikes, create a new bike, or ignore it. Where a Strava bike looks like one of yours, it is suggested. A bike can be linked to only one Strava bike.'}</p>
    ${errors.length ? `<div class="notice inline" role="alert">${icon('i-alert')}<div>Choose what to do with ${errors.map((g) => `<strong>${esc(sbOf(g).name)}</strong>`).join(', ')}.</div></div>` : ''}
    <div>${rows.map((sb) => (empty ? confirmRow(sb, d) : mapRow(sb, d))).join('')}</div></section>
    <section class="panel"><div class="step-title"><span class="num">2</span><h2>Import rides from</h2></div>
    <p class="lead">Rides that started on or after this date are imported. ${state.scenario === 'empty' ? 'You have no parts recorded yet, so the default is the start of this year.' : 'The default is your earliest recorded part, 1 Mar 2026, so older rides don\'t arrive only to show gaps.'}</p>
    <div class="field-pair"><label class="field">Start date<input type="date" id="setup-start" value="${iso(d.startDate)}" max="${iso(TODAY)}"></label><div></div></div>
    <label class="check"><input type="checkbox" id="setup-virtual" ${d.virtual ? 'checked' : ''}><span>Also import virtual rides<small>Indoor rides from trainer apps. Off by default: a trainer wears the drivetrain but not your tyres, and many riders use a separate trainer setup.</small></span></label>
    <p class="fine">Running, walking and other activities that aren't rides are never imported.</p></section>
    <div class="heading-actions" style="justify-content:flex-end;margin-bottom:8px"><button class="button secondary" type="button" data-action="setup-cancel">Cancel</button><button class="button primary" type="button" data-action="setup-save">Save and start import</button></div>`;
}

function details(sb, c, g) {
  return `<div class="details"><div class="field-pair">
    <label class="field">Name<input data-setup="${g}" data-key="name" value="${esc(c.name ?? sb.name)}"></label>
    <label class="field">Make<input data-setup="${g}" data-key="make" value="${esc(c.make ?? sb.brand)}"></label>
    <label class="field">Model<input data-setup="${g}" data-key="model" value="${esc(c.model ?? sb.model)}"></label>
    <label class="field">Kind<select data-setup="${g}" data-key="kind">${['road', 'gravel', 'mountain', 'city'].map((k) => `<option ${k === (c.kind ?? KIND[sb.type]) ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
  </div></div>`;
}
function confirmRow(sb, d) {
  const c = d.choices[sb.id];
  const on = c.action === 'create';
  return `<div class="map-row ${on ? '' : 'off'}"><input type="checkbox" data-setup-tick="${sb.id}" ${on ? 'checked' : ''} aria-label="Create ${esc(sb.name)} in Bike Log">${art(COLORS[PROFILE_BIKES.findIndex((p) => p.id === sb.id) % COLORS.length])}
    <div><strong>${esc(sb.name)}</strong><small>${sbLabel(sb)}</small>${sb.retired ? '<div class="tags"><span class="pill quiet">Retired in Strava</span></div>' : ''}</div>
    <div class="choose" style="font-size:13px;color:var(--muted)">${on ? 'Will be created and linked' : 'Will be ignored'}</div>
    ${on ? details(sb, c, sb.id) : ''}</div>`;
}
function mapRow(sb, d) {
  const c = d.choices[sb.id] ?? {};
  const value = c.action === 'link' ? `link:${c.bike}` : c.action ?? '';
  const takenBy = {};
  Object.entries(d.choices).forEach(([g, x]) => { if (x.action === 'link' && g !== sb.id) takenBy[x.bike] = sbOf(g).name; });
  const suggested = c.action === 'link' && c.bike === d.suggested[sb.id];
  const invalid = (d.errors ?? []).includes(sb.id);
  return `<div class="map-row no-check">${art('#b7c2b4')}
    <div><strong>${esc(sb.name)}</strong><small>${sbLabel(sb)}</small><div class="tags">${sb.retired ? '<span class="pill quiet">Retired in Strava</span>' : ''}${suggested ? '<span class="pill fitted">Suggested match</span>' : ''}</div></div>
    <select data-setup-choice="${sb.id}" aria-label="What to do with ${esc(sb.name)}" class="${invalid ? 'invalid' : ''}">
      <option value="" ${value === '' ? 'selected' : ''}>Choose…</option>
      <optgroup label="Link to one of your bikes">${state.bikes.map((b) => `<option value="link:${b.id}" ${value === `link:${b.id}` ? 'selected' : ''} ${takenBy[b.id] ? 'disabled' : ''}>${esc(bikeName(b))}${takenBy[b.id] ? ` (chosen for ${esc(takenBy[b.id])})` : ''}</option>`).join('')}</optgroup>
      <option value="create" ${value === 'create' ? 'selected' : ''}>Create a new bike</option>
      <option value="ignore" ${value === 'ignore' ? 'selected' : ''}>Ignore this bike</option>
    </select>
    ${c.action === 'create' ? details(sb, c, sb.id) : ''}</div>`;
}

function connectedView() {
  const c = state.conn;
  const bf = c.backfill;
  const statusText = { syncing: bf ? 'Importing your past rides' : 'Syncing', paused: 'Paused because of Strava\'s request limits', connected: 'Connected', reconnect: 'Needs reconnecting' }[c.status];
  const imp = imported();
  return `<section class="panel"><div class="panel-head"><div><h2>Connected as ${esc(c.athlete)}</h2>
      <p class="status-line" style="margin-top:6px"><span class="dot ${c.status === 'paused' ? 'warn' : ''}"></span>${statusText}${c.lastSync && !bf ? ` · last synced today at ${fmtTime(c.lastSync)}` : ''}</p></div>
      <div class="tabular" style="font-size:13px;color:var(--muted)">${plural(imp.length, 'imported ride')} · ${fmtKm(sumKm(imp))} km</div></div>
    ${bf ? `<div class="backfill ${bf.paused ? 'paused' : ''}"><div class="bar"><span style="width:${bf.total ? Math.round((bf.done / bf.total) * 100) : 100}%"></span></div>
      <p>${bf.paused ? `Paused at ${bf.done} of ${bf.total} rides until about 09:30. It carries on by itself; nothing is lost or imported twice.` : `Imported ${bf.done} of about ${bf.total} rides. You can leave this page; the import carries on.`}</p></div>` : ''}
    ${!bf ? '<p class="fine">New rides arrive on their own, usually within minutes. <strong>Sync now</strong> also re-checks the last 30 days, because Strava doesn\'t report a bike changed on an existing ride.</p>' : ''}
  </section>
  <section class="panel"><div class="panel-head"><h2>Your Strava bikes</h2><span style="font-size:13px;color:var(--muted)">One Strava bike links to one bike in your garage.</span></div>
    <div class="table-wrap" style="margin-top:12px"><table class="bikes-table"><thead><tr><th>In Strava</th><th>In Bike Log</th><th class="number">Imported</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
    <tbody>${state.strava.profile.map(stravaBikeRow).join('')}</tbody></table></div></section>
  <section class="panel"><h2>Import settings</h2>
    <div style="margin-top:8px">
      <div class="settings-row"><div>Import rides from<small>Moving the date earlier imports older rides; moving it later removes imported rides before it.</small></div><div class="control"><strong>${fmtDate(c.startDate)}</strong><button class="button small secondary" type="button" data-action="start-date">Change</button></div></div>
      <div class="settings-row"><div>Virtual rides<small>Indoor rides from trainer apps.</small></div><div class="control"><label class="check" style="margin:0"><input type="checkbox" data-action="virtual" ${c.virtual ? 'checked' : ''}><span>Import virtual rides</span></label></div></div>
      <div class="settings-row"><div>Rides without a bike in Strava<small>${c.defaultBike ? `Assigned to ${esc(bikeName(bikeOf(c.defaultBike)))} automatically.` : 'Left unassigned for you to pick a bike.'}</small></div><div class="control"><select id="default-bike" aria-label="Default bike for rides without a bike in Strava"><option value="">Leave unassigned</option>${state.bikes.map((b) => `<option value="${b.id}" ${c.defaultBike === b.id ? 'selected' : ''}>${esc(bikeName(b))}</option>`).join('')}</select></div></div>
    </div></section>
  <section class="panel preview-tools"><h2>Preview only: things that happen in Strava</h2>
    <p class="lead">Use these to see how Bike Log reacts. They are not part of the design.</p>
    <div class="tools">
      ${state.strava.profile.some((b) => b.id === 'b105') ? '' : '<button class="button small secondary" type="button" data-action="sim-new-bike">A new bike is ridden in Strava</button>'}
      <button class="button small secondary" type="button" data-action="sim-delete">A ride is deleted in Strava</button>
      <button class="button small secondary" type="button" data-action="sim-revoke">Access is revoked in Strava</button>
    </div></section>
  <section class="panel"><div class="panel-head"><div><h2>Disconnect</h2><p class="fine" style="margin-top:4px">Stops importing and removes imported rides. Your bikes, parts and manual rides stay.</p></div><button class="button danger" type="button" data-action="disconnect">Disconnect Strava</button></div></section>
  <p class="attribution">Ride data powered by Strava.</p>`;
}

function stravaBikeRow(sb) {
  const link = linkOf(sb.id);
  const rides = state.rides.filter((r) => r.source === 'strava' && r.gear === sb.id && r.status === 'assigned');
  let cell; let actions;
  if (!link || link.state === 'unresolved') {
    const n = pending(sb.id).length;
    cell = link ? `<span class="pill missing">${icon('i-alert')}Waiting for you · ${plural(n, 'ride')}</span>` : '<span class="pill quiet">No rides yet</span>';
    actions = link ? `<button class="button small secondary" type="button" data-action="resolve" data-gear="${sb.id}">Decide</button>` : '';
  } else if (link.state === 'ignored') {
    cell = '<span class="pill quiet">Ignored</span><span class="cell-sub">Rides on it aren\'t imported.</span>';
    actions = menu(sb.id, [['stop-ignoring', 'Stop ignoring']]);
  } else {
    const b = bikeOf(link.bike);
    cell = `<span class="cell-strong">${icon('i-link', 'i')}${esc(bikeName(b))}</span><span class="cell-sub">${esc(b.make)} ${esc(b.model)}</span>`;
    actions = menu(sb.id, [['change-link', 'Change link…'], ['remove-link', 'Remove link…']]);
  }
  return `<tr><td><span class="cell-strong">${esc(sb.name)}</span><span class="cell-sub">${sbLabel(sb)}</span>${sb.retired ? '<span class="pill quiet" style="margin-top:6px">Retired in Strava</span>' : ''}</td>
    <td>${cell}</td><td class="number">${rides.length ? `${plural(rides.length, 'ride')}<span class="cell-sub">${fmtKm(sumKm(rides))} km</span>` : '—'}</td><td style="text-align:right">${actions}</td></tr>`;
}
let menuSeq = 0;
function menu(gear, items, data = 'gear') {
  const id = `menu-${++menuSeq}`;
  return `<button class="more-button" type="button" data-menu="${id}" aria-haspopup="true" aria-expanded="false" aria-label="More actions">${icon('i-more')}</button>
    <div class="menu" id="${id}" hidden>${items.map(([a, label]) => `<button type="button" data-action="${a}" data-${data}="${gear}">${label}</button>`).join('')}</div>`;
}

/* ---------- Rides page ---------- */
function ridesView() {
  const needs = pending().length + unassigned().length;
  const d = dupes().length;
  const f = ridesUi.filter;
  const toolbar = `<div class="rides-toolbar"><div class="segmented" role="radiogroup" aria-label="Show">
      ${[['all', 'All rides', state.rides.length], ['needs', 'Needs a bike', needs], ['dupes', 'Possible duplicates', d]].map(([v, l, n]) => `<label><input type="radio" name="rides-filter" value="${v}" ${f === v ? 'checked' : ''}>${l}<small>${n}</small></label>`).join('')}
    </div>${f === 'all' ? `<select id="rides-bike" aria-label="Bike"><option value="all">All bikes</option>${state.bikes.map((b) => `<option value="${b.id}" ${ridesUi.bike === b.id ? 'selected' : ''}>${esc(bikeName(b))}</option>`).join('')}</select>` : ''}</div>`;
  const head = (check) => `<thead><tr><th>${check ? '<span class="visually-hidden">Select</span>' : ''}</th><th>Ride</th><th>Date</th><th class="number">Distance</th><th>Bike</th><th><span class="visually-hidden">Actions</span></th></tr></thead>`;
  let body = '';
  if (f === 'all') {
    const list = state.rides.filter((r) => ridesUi.bike === 'all' || r.bike === ridesUi.bike).sort((a, b) => b.start - a.start);
    body = list.length ? `<table>${head(false)}<tbody>${list.slice(0, 40).map((r) => rideRow(r, false)).join('')}</tbody></table>${list.length > 40 ? '<p class="fine">Showing the 40 most recent rides.</p>' : ''}` : '<p class="empty">No rides yet.</p>';
  } else if (f === 'needs') {
    const groups = unresolvedBikes().filter((g) => pending(g).length);
    const u = unassigned().sort((a, b) => b.start - a.start);
    if (!groups.length && !u.length) body = '<p class="empty">Every ride has a bike.</p>';
    else {
      body = `<table>${head(true)}<tbody>${groups.map((g) => {
        const sb = sbOf(g); const rs = pending(g).sort((a, b) => b.start - a.start);
        return `<tr class="group-row"><td colspan="6"><div class="group-line"><span class="pill missing">${icon('i-alert')}New Strava bike</span><span><strong>${esc(sb.name)}</strong> · ${sbLabel(sb)} · ${plural(rs.length, 'ride')} waiting</span><button class="button small primary" type="button" data-action="resolve" data-gear="${g}">Decide for all ${rs.length}</button></div></td></tr>${rs.map((r) => rideRow(r, false)).join('')}`;
      }).join('')}
      ${u.length ? `<tr class="group-row"><td colspan="6"><div class="group-line"><span class="pill quiet">No bike in Strava</span><span>${plural(u.length, 'ride')}. Pick a bike, or <button class="text-button" type="button" data-action="focus-default">set a default bike</button> for rides like these.</span></div></td></tr>${u.map((r) => rideRow(r, true)).join('')}` : ''}
      </tbody></table>`;
    }
  } else {
    const list = dupes();
    body = list.length ? `<table>${head(false)}<tbody>${list.map((r) => rideRow(r, false)).join('')}</tbody></table>` : '<p class="empty">No possible duplicates.</p>';
  }
  const sel = [...ridesUi.selected].filter((id) => unassigned().some((r) => r.id === id));
  const bulk = f === 'needs' && sel.length ? `<div class="bulk-bar" role="region" aria-label="Selected rides"><strong>${plural(sel.length, 'ride')} selected</strong>
    <select id="bulk-bike" aria-label="Bike for selected rides">${state.bikes.map((b) => `<option value="${b.id}">${esc(bikeName(b))}</option>`).join('')}</select>
    <button class="button small primary" type="button" data-action="bulk-assign">Assign</button><button class="button small secondary" type="button" data-action="bulk-clear">Clear</button></div>` : '';
  return `${toolbar}<section class="rides-card"><div class="table-wrap" tabindex="0" role="region" aria-label="Rides">${body}</div>${bulk}</section>`;
}

function rideRow(r, checkable) {
  const b = bikeOf(r.bike);
  const tags = [r.source === 'strava' ? '<span class="src strava">Strava</span>' : '<span class="src manual">Manual</span>'];
  if (r.type !== 'Ride' && TYPE_LABEL[r.type]) tags.push(`<span>${TYPE_LABEL[r.type]}</span>`);
  if (r.override) tags.push('<span>Bike changed in Bike Log</span>');
  if (r.dupOf) tags.push('<span class="pill missing">Possible duplicate</span>');
  const bikeCell = r.status === 'pending' ? `<span class="pill missing">Waiting: ${esc(sbOf(r.gear).name)}</span>`
    : r.status === 'unassigned' ? '<span class="pill quiet">No bike</span>' : esc(bikeName(b));
  const items = [];
  if (r.source === 'strava') {
    items.push(['ride-bike', r.status === 'assigned' ? 'Change bike…' : 'Pick a bike…']);
    if (r.override) items.push(['follow-strava', 'Follow Strava again']);
    if (r.dupOf) items.push(['dup', 'Resolve duplicate…']);
    items.push(['view-strava', 'View on Strava']);
  }
  return `<tr><td>${checkable ? `<input type="checkbox" data-select="${r.id}" ${ridesUi.selected.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(r.name)}">` : ''}</td>
    <td><span class="ride-name">${esc(r.name)}</span><div class="ride-meta">${tags.join('')}</div></td>
    <td><time datetime="${iso(r.start)}">${fmtDate(r.start)}</time></td><td class="number">${(r.metres / 1000).toFixed(1)} km</td><td>${bikeCell}</td>
    <td style="text-align:right">${items.length ? menu(r.id, items, 'ride') : ''}</td></tr>`;
}

/* ---------- Dialogs ---------- */
const dialog = $('#dialog');
let active = null;
function openDialog(spec) {
  active = { draft: {}, ...spec };
  $('#dialog-title').textContent = spec.title;
  $('#dialog-submit').textContent = spec.submitLabel ?? 'Save';
  $('#dialog-submit').hidden = spec.submitLabel === null;
  $('#dialog-cancel').textContent = spec.submitLabel === null ? 'Close' : 'Cancel';
  $('#dialog-submit').className = `button ${spec.danger ? 'danger' : 'primary'}`;
  dialog.classList.toggle('wide', !!spec.wide);
  paintDialog();
  $('#dialog-error').textContent = '';
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('#dialog-body input:not([type=hidden]), #dialog-body select, #dialog-body button, #dialog-submit')?.focus();
}
function paintDialog() { $('#dialog-body').innerHTML = active.render(active.draft); }
function readForm() {
  const data = {};
  for (const el of $('#dialog-form').elements) {
    if (!el.name) continue;
    if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; } else if (el.type === 'checkbox') data[el.name] = el.checked; else data[el.name] = el.value;
  }
  return data;
}
$('#dialog-form').addEventListener('change', (ev) => {
  if (!active || !ev.target.matches('[data-rerender]')) return;
  Object.assign(active.draft, readForm());
  paintDialog();
  $(`#dialog-body [name="${ev.target.name}"]${ev.target.type === 'radio' ? `[value="${ev.target.value}"]` : ''}`)?.focus();
});
$('#dialog-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  $('#dialog-error').textContent = '';
  Object.assign(active.draft, readForm());
  const spec = active;
  const result = spec.submit(spec.draft);
  if (result) { $('#dialog-error').textContent = result; return; }
  dialog.close();
  render();
  spec.afterSave?.();
});
dialog.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) dialog.close(); });
dialog.addEventListener('close', () => { if (!dialog.open) active = null; });

function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('visible');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('visible'), 3600);
}
const radios = (name, value, options) => `<div class="choice-list" role="radiogroup">${options.map((o) => `<label class="choice"><input type="radio" name="${name}" value="${o.value}" ${o.value === value ? 'checked' : ''} ${o.disabled ? 'disabled' : ''} data-rerender><span>${o.title}${o.sub ? `<small>${o.sub}</small>` : ''}</span><span class="meta">${o.meta ?? ''}</span></label>`).join('')}</div>`;
const bikeOptions = (bikes, value, suggested) => bikes.map((b) => ({ value: b.id, title: esc(bikeName(b)), sub: `${esc(b.make)} ${esc(b.model)} · ${esc(b.kind)}`, meta: b.id === suggested ? '<span class="pill fitted">Suggested</span>' : '' }));
const segmented = (name, value, options) => `<div class="segmented" role="radiogroup">${options.map((o) => `<label><input type="radio" name="${name}" value="${o.value}" ${o.value === value ? 'checked' : ''} data-rerender>${o.label}</label>`).join('')}</div>`;
function impact(rides, from, to) {
  return `<p class="impact"><strong>${plural(rides.length, 'ride')} · ${fmtKm(sumKm(rides))} km</strong> ${from ? `move from ${esc(from)} ` : ''}${to ? `to ${esc(to)}` : ''}. Part totals on ${[from, to].filter(Boolean).map(esc).join(' and ') || 'the affected bikes'} are recalculated.</p>`;
}

/* A new Strava bike: create, link to a bike without a Strava link, or ignore (FR-020, FR-021). */
function resolveDialog(gear) {
  const sb = sbOf(gear);
  const n = pending(gear).length;
  const free = unlinkedBikes();
  const sug = suggestion(sb);
  openDialog({
    title: `New Strava bike: ${sb.name}`, wide: true, submitLabel: 'Save',
    draft: { how: sug ? 'link' : 'create', bike: sug ?? free[0]?.id, name: sb.name, make: sb.brand, model: sb.model, kind: KIND[sb.type] },
    render: (d) => `<p class="dialog-description">${sbLabel(sb)}. ${plural(n, 'ride is', 'rides are')} waiting, ${fmtKm(sumKm(pending(gear)))} km in all. How does this bike relate to your garage?</p>
      ${segmented('how', d.how, [{ value: 'create', label: 'Create a new bike' }, { value: 'link', label: 'Link to my bike' }, { value: 'ignore', label: 'Ignore it' }])}
      ${d.how === 'create' ? `<div class="field-pair"><label class="field">Name<input name="name" value="${esc(d.name)}" required></label><label class="field">Kind<select name="kind">${['road', 'gravel', 'mountain', 'city'].map((k) => `<option ${k === d.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label></div>
        <div class="field-pair"><label class="field">Make<input name="make" value="${esc(d.make)}"></label><label class="field">Model<input name="model" value="${esc(d.model)}"></label></div>
        <p class="fine">Strava's lifetime distance for this bike is not copied. The new bike's parts count only rides from now on, plus the ${plural(n, 'waiting ride')}.</p>` : ''}
      ${d.how === 'link' ? (free.length ? `${radios('bike', d.bike, bikeOptions(free, d.bike, sug))}<p class="fine">Only bikes without a Strava link are shown. The ${plural(n, 'waiting ride')} will count toward the parts fitted on the chosen bike at each ride's start.</p>` : '<div class="empty-choice">Every bike in your garage is already linked to a Strava bike. Change one of those links first, or create a new bike.</div>') : ''}
      ${d.how === 'ignore' ? `<div class="empty-choice">The ${plural(n, 'waiting ride')} will be removed, and rides on ${esc(sb.name)} won't be imported. You can stop ignoring it later on the Strava page.</div>` : ''}`,
    submit: (d) => {
      if (d.how === 'create') {
        if (!d.name.trim()) return 'Give the bike a name.';
        const id = `bike${++seq}`;
        state.bikes.push({ id, name: d.name.trim(), make: d.make, model: d.model, kind: d.kind, year: 2026, color: COLORS[state.bikes.length % COLORS.length], fromStrava: true });
        state.links[gear] = { state: 'linked', bike: id };
        pending(gear).forEach(reassign); flagDuplicates();
        toast(`${d.name.trim()} created and linked. ${plural(n, 'ride')} assigned.`);
      } else if (d.how === 'link') {
        if (!d.bike || !free.length) return 'Choose a bike, or create a new one.';
        state.links[gear] = { state: 'linked', bike: d.bike };
        pending(gear).forEach(reassign); flagDuplicates();
        toast(`Linked to ${bikeName(bikeOf(d.bike))}. ${plural(n, 'ride')} assigned.`);
      } else {
        state.links[gear] = { state: 'ignored', bike: null };
        state.rides = state.rides.filter((r) => !(r.status === 'pending' && r.gear === gear));
        toast(`${sb.name} ignored. ${plural(n, 'waiting ride')} removed.`);
      }
      return null;
    },
  });
}

/* Change a link to another bike; move or keep rides already imported (FR-024, FR-025). */
function changeLinkDialog(gear) {
  const sb = sbOf(gear);
  const from = bikeOf(linkOf(gear).bike);
  const free = unlinkedBikes();
  const rides = throughLink(gear);
  const overridden = state.rides.filter((r) => r.gear === gear && r.override).length;
  openDialog({
    title: `Change link for ${sb.name}`, wide: true, submitLabel: 'Change link',
    draft: { bike: free[0]?.id ?? '', rides: 'move' },
    render: (d) => {
      const to = bikeOf(d.bike);
      return `<p class="dialog-description">${esc(sb.name)} (${sbLabel(sb)}) is linked to <strong>${esc(bikeName(from))}</strong>. Choose the bike it should be linked to instead.</p>
      ${free.length ? radios('bike', d.bike, bikeOptions(free, d.bike, null)) : '<div class="empty-choice">Every other bike is already linked to a Strava bike. Remove that link first, or create a new bike.</div>'}
      ${free.length ? `<h3 style="font-size:14px;margin:6px 0 10px">Rides already imported through this link</h3>
      ${radios('rides', d.rides, [
        { value: 'move', title: `Move them to ${esc(bikeName(to))}`, sub: 'Use this when the link was wrong from the start.', meta: plural(rides.length, 'ride') },
        { value: 'keep', title: `Keep them on ${esc(bikeName(from))}`, sub: 'Use this when you really rode them on that bike. Only new rides go to the new bike.' },
      ])}
      ${d.rides === 'move' ? impact(rides, bikeName(from), bikeName(to)) : ''}
      ${overridden ? `<p class="fine">${plural(overridden, 'ride')} whose bike you set yourself stay where they are.</p>` : ''}` : ''}`;
    },
    submit: (d) => {
      if (!free.length || !d.bike) return 'Choose a bike.';
      state.links[gear] = { state: 'linked', bike: d.bike };
      if (d.rides === 'move') rides.forEach((r) => { r.bike = d.bike; r.dupOf = null; });
      flagDuplicates();
      toast(d.rides === 'move' ? `Linked to ${bikeName(bikeOf(d.bike))}. ${plural(rides.length, 'ride')} moved; part totals recalculated.` : `Linked to ${bikeName(bikeOf(d.bike))}. Existing rides stay on ${bikeName(from)}.`);
      return null;
    },
  });
}

function removeLinkDialog(gear) {
  const sb = sbOf(gear);
  const from = bikeOf(linkOf(gear).bike);
  const rides = throughLink(gear);
  openDialog({
    title: `Remove link for ${sb.name}`, wide: true, submitLabel: 'Remove link',
    draft: { future: 'ask', rides: 'keep' },
    render: (d) => `<p class="dialog-description">${esc(sb.name)} will no longer be linked to <strong>${esc(bikeName(from))}</strong>.</p>
      <h3 style="font-size:14px;margin:0 0 10px">New rides on ${esc(sb.name)}</h3>
      ${radios('future', d.future, [
        { value: 'ask', title: 'Ask me again', sub: 'They wait for you to link or create a bike.' },
        { value: 'ignore', title: 'Ignore this Strava bike', sub: 'They are not imported.' },
      ])}
      <h3 style="font-size:14px;margin:6px 0 10px">Rides already imported through this link</h3>
      ${radios('rides', d.rides, [
        { value: 'keep', title: `Keep them on ${esc(bikeName(from))}`, meta: plural(rides.length, 'ride') },
        { value: 'move', title: d.future === 'ask' ? 'Make them wait for a bike' : 'Remove them', sub: d.future === 'ask' ? 'They stop counting toward any part until you decide.' : 'They stop counting and are removed from Bike Log.' },
      ])}
      ${d.rides === 'move' ? impact(rides, bikeName(from), null) : ''}`,
    submit: (d) => {
      state.links[gear] = { state: d.future === 'ask' ? 'unresolved' : 'ignored', bike: null };
      if (d.rides === 'move') {
        if (d.future === 'ask') rides.forEach((r) => { r.bike = null; r.status = 'pending'; r.dupOf = null; });
        else state.rides = state.rides.filter((r) => !rides.includes(r));
      }
      toast(`Link removed.${d.rides === 'move' ? ` ${plural(rides.length, 'ride')} ${d.future === 'ask' ? 'now wait for a bike' : 'removed'}.` : ''}`);
      return null;
    },
  });
}

function stopIgnoringDialog(gear) {
  const sb = sbOf(gear);
  const n = state.strava.activities.filter((a) => a.gear === gear && (CYCLING.has(a.type) || (a.type === 'VirtualRide' && state.conn.virtual)) && a.start >= state.conn.startDate).length;
  openDialog({
    title: `Stop ignoring ${sb.name}?`, submitLabel: 'Stop ignoring',
    render: () => `<p class="dialog-description">${n ? `${plural(n, 'ride')} on ${esc(sb.name)} since ${fmtDate(state.conn.startDate)} will be imported and wait for you to link or create a bike.` : `There are no rides on ${esc(sb.name)} since ${fmtDate(state.conn.startDate)}. New rides on it will wait for you to link or create a bike.`}</p>`,
    submit: () => { state.links[gear] = { state: 'unresolved', bike: null }; importAll(); toast(`${sb.name} is no longer ignored.`); return null; },
    afterSave: () => { if (!n) delete state.links[gear]; render(); },
  });
}

/* Bike settings: where an owner fixes a link from the bike's side. */
function bikeSettingsDialog(bikeId) {
  const b = bikeOf(bikeId);
  const g = linkedStrava(bikeId);
  const sb = g && sbOf(g);
  const candidates = Object.keys(state.links).filter((x) => state.links[x].state !== 'linked').map(sbOf);
  openDialog({
    title: `${bikeName(b)} settings`, wide: true, submitLabel: null,
    render: () => `<div class="field-pair"><label class="field">Name<input value="${esc(b.name)}" readonly></label><label class="field">Kind<input value="${esc(b.kind)}" readonly></label></div>
      <div class="field-pair"><label class="field">Make<input value="${esc(b.make)}" readonly></label><label class="field">Model<input value="${esc(b.model)}" readonly></label></div>
      <p class="fine" style="margin-top:-6px">Bike details are edited as in V4.</p>
      <div class="detail-section"><h3>Strava</h3>
      ${!connected() ? '<p>Strava is not connected. <a class="text-button" href="#strava" data-close>Connect Strava</a></p>'
        : sb ? `<p>Linked to <strong>${esc(sb.name)}</strong> (${sbLabel(sb)}). ${plural(throughLink(g).length, 'ride')} imported through this link.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="button small secondary" type="button" data-action="change-link" data-gear="${g}">Change link…</button><button class="button small secondary" type="button" data-action="remove-link" data-gear="${g}">Remove link…</button></div>`
        : `<p>Not linked to a Strava bike.</p>${candidates.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${candidates.map((c) => `<button class="button small secondary" type="button" data-action="link-from-bike" data-gear="${c.id}" data-bike="${b.id}">Link to ${esc(c.name)}${linkOf(c.id).state === 'ignored' ? ' (ignored)' : ''}</button>`).join('')}</div>` : '<p class="fine">Every Strava bike is already linked.</p>'}`}
      </div>`,
    submit: () => null,
  });
}
function linkFromBike(gear, bikeId) {
  const wasIgnored = linkOf(gear).state === 'ignored';
  state.links[gear] = { state: 'linked', bike: bikeId };
  if (wasIgnored) importAll(); else pending(gear).forEach(reassign);
  flagDuplicates();
  dialog.close(); render();
  toast(`${sbOf(gear).name} linked to ${bikeName(bikeOf(bikeId))}.`);
}

/* One imported ride's bike, set by the owner; survives later syncs (FR-028). */
function rideBikeDialog(rideId) {
  const r = state.rides.find((x) => x.id === rideId);
  openDialog({
    title: r.status === 'assigned' ? 'Change bike for this ride' : 'Pick a bike for this ride', wide: true,
    draft: { bike: r.bike ?? state.bikes[0]?.id },
    render: (d) => `<p class="dialog-description"><strong>${esc(r.name)}</strong>, ${fmtDate(r.start)}, ${(r.metres / 1000).toFixed(1)} km. ${r.gear ? `In Strava: ${esc(sbOf(r.gear).name)}.` : 'No bike in Strava.'}</p>
      ${radios('bike', d.bike, bikeOptions(state.bikes, d.bike, null))}
      <p class="fine">Your choice is kept even if the ride's bike changes in Strava later. You can undo it with <strong>Follow Strava again</strong>. Distance, time and date come from Strava and can only be changed there.</p>`,
    submit: (d) => {
      if (!d.bike) return 'Choose a bike.';
      Object.assign(r, { bike: d.bike, status: 'assigned', override: true, dupOf: null });
      ridesUi.selected.delete(r.id); flagDuplicates();
      toast(`Ride moved to ${bikeName(bikeOf(d.bike))}. Part totals recalculated.`);
      return null;
    },
  });
}

function dupDialog(rideId) {
  const r = state.rides.find((x) => x.id === rideId);
  const m = state.rides.find((x) => x.id === r.dupOf);
  const card = (x, label) => `<div><span class="src ${x.source}">${label}</span><br><strong>${esc(x.name)}</strong><br>${fmtDate(x.start)} at ${fmtTime(x.start)}<br>${(x.metres / 1000).toFixed(1)} km · ${Math.round(x.secs / 60)} min</div>`;
  openDialog({
    title: 'Same ride twice?', wide: true, submitLabel: 'Save',
    draft: { keep: 'strava' },
    render: (d) => `<p class="dialog-description">Both are on ${esc(bikeName(bikeOf(r.bike)))}, start within 10 minutes of each other and are about the same distance. Until you choose, both count.</p>
      <div class="dup-pair">${card(r, 'Strava')}${card(m, 'Manual')}</div>
      ${radios('keep', d.keep, [
        { value: 'strava', title: 'Keep the Strava ride', sub: 'Your manual ride is deleted.' },
        { value: 'manual', title: 'Keep my manual ride', sub: 'The Strava ride is removed and not imported again.' },
        { value: 'both', title: 'They are different rides', sub: 'Keep both and stop flagging them.' },
      ])}`,
    submit: (d) => {
      if (d.keep === 'strava') { state.rides = state.rides.filter((x) => x !== m); r.dupOf = null; }
      if (d.keep === 'manual') { state.excluded.add(r.stravaId); state.rides = state.rides.filter((x) => x !== r); }
      if (d.keep === 'both') { state.notDup.add(r.id); r.dupOf = null; }
      toast('Saved. Part totals recalculated.');
      return null;
    },
  });
}

function defaultBikeDialog(bikeId) {
  const b = bikeOf(bikeId);
  const u = unassigned();
  openDialog({
    title: `Use ${bikeName(b)} by default?`, submitLabel: 'Save',
    draft: { existing: true },
    render: (d) => `<p class="dialog-description">New rides with no bike in Strava will go to <strong>${esc(bikeName(b))}</strong>.</p>
      ${u.length ? `<label class="check"><input type="checkbox" name="existing" ${d.existing ? 'checked' : ''}><span>Also assign the ${plural(u.length, 'ride')} waiting now<small>${fmtKm(sumKm(u))} km in all. Leave unticked to pick their bikes yourself.</small></span></label>` : ''}`,
    submit: (d) => {
      state.conn.defaultBike = bikeId;
      if (d.existing) u.forEach((r) => Object.assign(r, { bike: bikeId, status: 'assigned' }));
      flagDuplicates();
      toast(`Default bike set${d.existing && u.length ? `; ${plural(u.length, 'ride')} assigned` : ''}.`);
      return null;
    },
  });
}

function startDateDialog() {
  const c = state.conn;
  openDialog({
    title: 'Import rides from', submitLabel: 'Save',
    draft: { date: iso(c.startDate) },
    render: (d) => {
      const t = day(d.date || iso(c.startDate));
      const lose = imported().filter((r) => r.start < t);
      return `<label class="field">Start date<input type="date" name="date" value="${esc(d.date)}" max="${iso(TODAY)}" data-rerender></label>
      ${t < c.startDate ? '<p class="fine">Older rides from the new date will be imported.</p>' : ''}
      ${lose.length ? `<div class="notice inline">${icon('i-alert')}<div>${plural(lose.length, 'imported ride')} (${fmtKm(sumKm(lose))} km) before ${fmtDate(t)} will be removed, and part totals recalculated.</div></div>` : ''}`;
    },
    submit: (d) => {
      if (!d.date) return 'Choose a date.';
      c.startDate = day(d.date);
      const removed = removeIneligible(); const added = importAll();
      toast(`Saved.${added ? ` ${plural(added, 'ride')} imported.` : ''}${removed ? ` ${plural(removed, 'ride')} removed.` : ''}`);
      return null;
    },
  });
}

function virtualDialog(on) {
  const c = state.conn;
  const affected = on ? [] : imported().filter((r) => r.type === 'VirtualRide');
  if (on) { c.virtual = true; const n = importAll(); render(); toast(n ? `${plural(n, 'virtual ride')} imported.` : 'Virtual rides will be imported.'); return; }
  if (!affected.length) { c.virtual = false; render(); return; }
  openDialog({
    title: 'Stop importing virtual rides?', submitLabel: 'Remove virtual rides', danger: true,
    render: () => `<p class="dialog-description">${plural(affected.length, 'virtual ride')} (${fmtKm(sumKm(affected))} km) will be removed and part totals recalculated.</p>`,
    submit: () => { c.virtual = false; removeIneligible(); toast('Virtual rides removed.'); return null; },
  });
  dialog.addEventListener('close', () => render(), { once: true });
}

function disconnectDialog(revoked = false) {
  const imp = imported();
  const doIt = () => {
    clearInterval(timer);
    state.rides = state.rides.filter((r) => r.source !== 'strava');
    state.links = {}; state.conn = null; state.excluded = new Set(); state.notDup = new Set();
  };
  if (revoked) { doIt(); render(); toast('Access was revoked in Strava. Disconnected; imported rides removed.'); return; }
  openDialog({
    title: 'Disconnect Strava?', submitLabel: 'Disconnect', danger: true,
    render: () => `<p class="dialog-description">Bike Log stops importing from Strava.</p>
      <ul class="intro-list" style="margin:0 0 8px"><li>${icon('i-close')}<span>${plural(imp.length, 'imported ride')} (${fmtKm(sumKm(imp))} km) are removed, and part totals recalculated from your manual rides.</span></li>
      <li>${icon('i-close')}<span>Bike links, ignored bikes and your default bike are forgotten.</span></li>
      <li>${icon('i-check')}<span>Your bikes, parts and manual rides stay.</span></li></ul>`,
    submit: () => { doIt(); toast('Disconnected from Strava.'); return null; },
  });
}

/* ---------- Setup flow ---------- */
function beginSetup() {
  connect();
  const empty = state.bikes.length === 0;
  const choices = {}; const suggested = {}; const taken = new Set();
  state.strava.profile.forEach((sb) => {
    if (empty) { choices[sb.id] = { action: sb.retired ? 'ignore' : 'create' }; return; }
    const s = suggestion(sb, taken);
    if (s) { choices[sb.id] = { action: 'link', bike: s }; suggested[sb.id] = s; taken.add(s); } else choices[sb.id] = {};
  });
  state.setup = { mode: empty ? 'confirm' : 'map', choices, suggested, startDate: defaultStart(), virtual: false, errors: [] };
  location.hash = '#strava';
  render();
  toast('Back from Strava with access granted. (Strava\'s consent page is not part of this mock.)');
}
function saveSetup() {
  const d = state.setup;
  d.errors = Object.entries(d.choices).filter(([, c]) => !c.action).map(([g]) => g);
  if (d.errors.length) { render(); document.querySelector('.map-row select.invalid')?.focus(); return; }
  const choices = {};
  Object.entries(d.choices).forEach(([g, c]) => { choices[g] = { ...c }; });
  applySetup(choices, d.startDate, d.virtual);
  state.setup = null;
  render();
  startBackfill();
}

/* ---------- Events ---------- */
function closeMenus() {
  document.querySelectorAll('.menu:not([hidden])').forEach((m) => { m.hidden = true; });
  document.querySelectorAll('[data-menu][aria-expanded=true]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('click', (ev) => {
  const menuBtn = ev.target.closest('[data-menu]');
  if (menuBtn) {
    const m = document.getElementById(menuBtn.dataset.menu);
    const willOpen = m.hidden; closeMenus(); m.hidden = !willOpen;
    menuBtn.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) m.querySelector('button')?.focus();
    return;
  }
  if (!ev.target.closest('.menu')) closeMenus();
  if (ev.target.closest('[data-reset], #reset-demo')) { loadScenario(state.scenario); toast('Preview reset.'); return; }
  const filterLink = ev.target.closest('[data-filter]');
  if (filterLink) { ridesUi.filter = filterLink.dataset.filter; if (location.hash === '#rides') render(); return; }
  const a = ev.target.closest('[data-action]');
  if (!a || a.matches('input[type=checkbox]')) return;
  closeMenus();
  const g = a.dataset.gear;
  switch (a.dataset.action) {
    case 'connect': beginSetup(); break;
    case 'setup-cancel': state.conn = null; state.setup = null; render(); toast('Nothing was imported. Strava access is removed.'); break;
    case 'setup-save': saveSetup(); break;
    case 'resolve': resolveDialog(g); break;
    case 'change-link': changeLinkDialog(g); break;
    case 'remove-link': removeLinkDialog(g); break;
    case 'stop-ignoring': stopIgnoringDialog(g); break;
    case 'link-from-bike': linkFromBike(g, a.dataset.bike); break;
    case 'bike-settings': bikeSettingsDialog(a.dataset.bike); break;
    case 'ride-bike': rideBikeDialog(a.dataset.ride); break;
    case 'follow-strava': { const r = state.rides.find((x) => x.id === a.dataset.ride); r.override = false; reassign(r); flagDuplicates(); render(); toast('The ride follows its Strava bike again.'); break; }
    case 'dup': dupDialog(a.dataset.ride); break;
    case 'view-strava': toast('Opens the ride on strava.com in a new tab.'); break;
    case 'sync': sync(); break;
    case 'start-date': startDateDialog(); break;
    case 'disconnect': disconnectDialog(); break;
    case 'focus-default': location.hash = '#strava'; setTimeout(() => $('#default-bike')?.focus(), 0); break;
    case 'bulk-assign': {
      const bike = $('#bulk-bike').value; const ids = [...ridesUi.selected];
      state.rides.filter((r) => ids.includes(r.id) && r.status === 'unassigned').forEach((r) => Object.assign(r, { bike, status: 'assigned', override: true }));
      ridesUi.selected.clear(); flagDuplicates(); render(); toast(`${plural(ids.length, 'ride')} assigned to ${bikeName(bikeOf(bike))}.`); break;
    }
    case 'bulk-clear': ridesUi.selected.clear(); render(); break;
    case 'sim-new-bike': state.strava.profile.push({ ...NEW_BIKE }); state.strava.activities.push(...NEW_BIKE_RIDES()); toast('In Strava: a new bike, Checkpoint, with rides. Press Sync now (or wait for the next delivery).'); render(); break;
    case 'sim-delete': {
      const r = imported().sort((x, y) => y.start - x.start)[0];
      if (!r) break;
      state.strava.activities = state.strava.activities.filter((x) => x.id !== r.stravaId);
      state.rides = state.rides.filter((x) => x !== r); render(); toast(`"${r.name}" (${fmtDate(r.start)}) was deleted in Strava, so it is removed here. Part totals recalculated.`); break;
    }
    case 'sim-revoke': disconnectDialog(true); break;
    case 'add-ride': toast('Adding a manual ride is unchanged from V4.'); break;
    case 'create-bike': toast('Creating a bike is unchanged from V4.'); break;
    default: break;
  }
});

/* Manual sync: new rides, plus a re-check of the last 30 days for bikes changed in Strava (FR-027). */
function sync() {
  const c = state.conn;
  c.status = 'syncing'; render();
  setTimeout(() => {
    const added = importAll();
    let moved = 0;
    for (const r of imported()) {
      if (r.start < TODAY - 30 * DAY) continue;
      const a = state.strava.activities.find((x) => x.id === r.stravaId);
      if (!a || a.gear === r.gear) continue;
      r.gear = a.gear;
      if (a.gear && !linkOf(a.gear)) state.links[a.gear] = { state: 'unresolved', bike: null };
      if (!r.override) { reassign(r); moved++; }
    }
    flagDuplicates();
    c.status = 'connected'; c.lastSync = at(2026, 10, 13, 9, 12); render();
    const parts = [added ? `${plural(added, 'new ride')}` : 'No new rides'];
    if (moved) parts.push(`${plural(moved, 'ride')} moved because ${moved === 1 ? 'its' : 'their'} bike was changed in Strava`);
    toast(`Synced. ${parts.join('; ')}.`);
  }, 900);
}

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'scenario') { loadScenario(t.value); return; }
  if (t.name === 'rides-filter') { ridesUi.filter = t.value; render(); return; }
  if (t.id === 'rides-bike') { ridesUi.bike = t.value; render(); return; }
  if (t.dataset.select) { if (t.checked) ridesUi.selected.add(t.dataset.select); else ridesUi.selected.delete(t.dataset.select); render(); $(`[data-select="${t.dataset.select}"]`)?.focus(); return; }
  if (t.id === 'default-bike') {
    if (!t.value) { state.conn.defaultBike = null; render(); toast('Rides without a bike in Strava will be left unassigned. Rides already assigned stay.'); } else defaultBikeDialog(t.value);
    return;
  }
  if (t.dataset.action === 'virtual') { virtualDialog(t.checked); return; }
  const d = state.setup;
  if (!d) return;
  if (t.dataset.setupTick) { d.choices[t.dataset.setupTick].action = t.checked ? 'create' : 'ignore'; render(); $(`[data-setup-tick="${t.dataset.setupTick}"]`)?.focus(); return; }
  if (t.dataset.setupChoice) {
    const g = t.dataset.setupChoice; const v = t.value;
    d.choices[g] = v.startsWith('link:') ? { action: 'link', bike: v.slice(5) } : v ? { ...d.choices[g], action: v, bike: undefined } : {};
    d.errors = (d.errors ?? []).filter((x) => x !== g || !v);
    render(); $(`[data-setup-choice="${g}"]`)?.focus(); return;
  }
  if (t.id === 'setup-start') { d.startDate = t.value ? day(t.value) : defaultStart(); return; }
  if (t.id === 'setup-virtual') { d.virtual = t.checked; return; }
  if (t.dataset.setup) { d.choices[t.dataset.setup][t.dataset.key] = t.value; }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.querySelector('.menu:not([hidden])')) {
    const open = document.querySelector('[data-menu][aria-expanded=true]');
    closeMenus(); open?.focus();
  }
});

function loadScenario(name) {
  clearInterval(timer);
  seq = 0;
  state = scenarioState(name);
  ridesUi.filter = 'all'; ridesUi.bike = 'all'; ridesUi.selected.clear();
  if (dialog.open) dialog.close();
  render();
}
window.addEventListener('hashchange', render);
loadScenario('empty');
