'use strict';
/* Bike Log V3 (approved 2026-10-13): component groups, weights and full bike positions.
   Standalone preview with synthetic fixtures. The rules below only imitate the API so the
   flows can be clicked through; the connected client must display API results instead. */

const TODAY = day('2026-10-13');
const GROUPS = [
  { id: 'build', label: 'Build' },
  { id: 'groupset', label: 'Groupset' },
  { id: 'wheels', label: 'Wheels' },
];
const CATALOG = [
  ['fork', 'fork', 'build', null, 'Fork'],
  ['bottom-bracket', 'bottom-bracket', 'build', null, 'Bottom bracket'],
  ['handlebar', 'handlebar', 'build', null, 'Handlebar'],
  ['handlebar-tape', 'handlebar-tape', 'build', null, 'Handlebar tape'],
  ['saddle', 'saddle', 'build', null, 'Saddle'],
  ['seatpost', 'seatpost', 'build', null, 'Seatpost'],
  ['pedals', 'pedals', 'build', null, 'Pedals'],
  ['front-through-axle', 'through-axle', 'build', 'front', 'Front through-axle'],
  ['rear-through-axle', 'through-axle', 'build', 'rear', 'Rear through-axle'],
  ['front-derailleur', 'front-derailleur', 'groupset', null, 'Front derailleur', 'none-fitted'],
  ['rear-derailleur', 'rear-derailleur', 'groupset', null, 'Rear derailleur'],
  ['shifters', 'shifters', 'groupset', null, 'Shifters'],
  ['cassette', 'cassette', 'groupset', null, 'Cassette'],
  ['chain', 'chain', 'groupset', null, 'Chain'],
  ['front-brake', 'brake', 'groupset', 'front', 'Front brake'],
  ['rear-brake', 'brake', 'groupset', 'rear', 'Rear brake'],
  ['front-brake-lever', 'brake-lever', 'groupset', 'front', 'Front brake lever'],
  ['rear-brake-lever', 'brake-lever', 'groupset', 'rear', 'Rear brake lever'],
  ['crankset', 'crankset', 'groupset', null, 'Crankset'],
  ['front-rim', 'rim', 'wheels', 'front', 'Front rim'],
  ['rear-rim', 'rim', 'wheels', 'rear', 'Rear rim'],
  ['front-tyre', 'tyre', 'wheels', 'front', 'Front tyre'],
  ['rear-tyre', 'tyre', 'wheels', 'rear', 'Rear tyre'],
  ['front-disc-rotor', 'disc-rotor', 'wheels', 'front', 'Front disc rotor'],
  ['rear-disc-rotor', 'disc-rotor', 'wheels', 'rear', 'Rear disc rotor'],
  ['front-inner-tube', 'inner-tube', 'wheels', 'front', 'Front inner tube', 'tubeless'],
  ['rear-inner-tube', 'inner-tube', 'wheels', 'rear', 'Rear inner tube', 'tubeless'],
].map(([position, type, group, end, label, exemption]) => ({ position, type, group, end, label, exemption: exemption ?? null }));
const ENTRY = Object.fromEntries(CATALOG.map((e) => [e.position, e]));
const TYPE_LABEL = {
  fork: 'fork', 'bottom-bracket': 'bottom bracket', handlebar: 'handlebar', 'handlebar-tape': 'handlebar tape',
  saddle: 'saddle', seatpost: 'seatpost', pedals: 'pedals', 'through-axle': 'through-axle',
  'front-derailleur': 'front derailleur', 'rear-derailleur': 'rear derailleur', shifters: 'shifters',
  cassette: 'cassette', chain: 'chain', brake: 'brake', 'brake-lever': 'brake lever', crankset: 'crankset',
  rim: 'rim', tyre: 'tyre', 'disc-rotor': 'disc rotor', 'inner-tube': 'inner tube',
};
const PAIR_TYPES = new Set(CATALOG.filter((e) => e.end === 'front').map((e) => e.type));
const PAIR_DEFAULT = new Set(['brake', 'brake-lever', 'disc-rotor']);

function day(s) { return new Date(`${s}T12:00:00Z`).getTime(); }
function iso(t) { return new Date(t).toISOString().slice(0, 10); }
function fmtDate(t) { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
function fmtShort(t) { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
function fmtKm(m) { return Math.round(m / 1000).toLocaleString('en-GB'); }
function fmtG(g) { return `${g.toLocaleString('en-GB')} g`; }
function fmtKg(g) { return `${(g / 1000).toFixed(2)} kg`; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function icon(id, cls = 'i') { return `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`; }
function plural(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

/* ---------- Fixtures ---------- */
let seq = 0;
const nid = (p) => `${p}${++seq}`;
function fixtures() {
  seq = 0;
  const s = { bikes: [], components: [], installations: [], exemptions: [], rides: [], selected: 'gravel' };
  s.bikes.push({ id: 'gravel', name: 'Gravel bike', make: 'Canyon', model: 'Grizl CF SL 8', kind: 'gravel', year: 2025, color: '#789b8c', frameWeight: 1180 });
  s.bikes.push({ id: 'road', name: 'Road bike', make: 'Specialized', model: 'Tarmac SL7', kind: 'road', year: 2023, color: '#9a7a62', frameWeight: null });
  const part = (type, make, model, weight, estimate = 0) => { const c = { id: nid('c'), type, make, model, weight, estimate }; s.components.push(c); return c.id; };
  const fit = (bike, position, comp, start, end = null) => s.installations.push({ id: nid('i'), bike, position, comp, start: day(start), end: end ? day(end) : null });
  const exempt = (bike, position, start, end = null) => s.exemptions.push({ id: nid('e'), bike, position, reason: ENTRY[position].exemption, start: day(start), end: end ? day(end) : null });

  // Gravel: 1x, tubeless, saddle borrowed from the road bike on 12 Oct.
  const g = 'gravel', gs = '2026-03-01';
  fit(g, 'fork', part('fork', 'Canyon', 'FK0094 CF gravel fork', 520), gs);
  fit(g, 'bottom-bracket', part('bottom-bracket', 'Shimano', 'SM-BB72-41B', 77), gs);
  fit(g, 'handlebar', part('handlebar', 'Canyon', 'HB0063 gravel bar', 260), gs);
  fit(g, 'handlebar-tape', part('handlebar-tape', 'Canyon', 'Ergo tape', 65), gs, '2026-06-10');
  fit(g, 'handlebar-tape', part('handlebar-tape', 'Supacaz', 'Super Sticky Kush', 70), '2026-06-10');
  const volt = part('saddle', 'WTB', 'Volt Medium', 280);
  fit(g, 'saddle', volt, gs, '2026-10-12');
  fit(g, 'seatpost', part('seatpost', 'Canyon', 'SP0058 seatpost', null), gs);
  fit(g, 'pedals', part('pedals', 'Shimano', 'PD-M8100 XT', 340, 5200000), gs);
  exempt(g, 'front-derailleur', gs);
  fit(g, 'rear-derailleur', part('rear-derailleur', 'Shimano', 'GRX RD-RX822', 294), gs);
  fit(g, 'shifters', part('shifters', 'Shimano', 'GRX ST-RX820', 560), gs);
  fit(g, 'cassette', part('cassette', 'Shimano', 'CS-M8100 10–51T', 461), gs);
  fit(g, 'chain', part('chain', 'Shimano', 'CN-M8100 12-speed', 252), gs);
  fit(g, 'front-brake', part('brake', 'Shimano', 'GRX BR-RX820', 140), gs);
  fit(g, 'rear-brake', part('brake', 'Shimano', 'GRX BR-RX820', 140), gs);
  fit(g, 'crankset', part('crankset', 'Shimano', 'GRX FC-RX820-1 40T', 640), gs);
  fit(g, 'front-rim', part('rim', 'DT Swiss', 'GR 1600 front rim', 430), gs);
  fit(g, 'rear-rim', part('rim', 'DT Swiss', 'GR 1600 rear rim', 450), gs);
  fit(g, 'front-tyre', part('tyre', 'Schwalbe', 'G-One RS 45 mm', 475), gs);
  fit(g, 'rear-tyre', part('tyre', 'Schwalbe', 'G-One RS 45 mm', 475), gs);
  fit(g, 'front-disc-rotor', part('disc-rotor', 'Shimano', 'RT-MT800 160 mm', 125), gs);
  fit(g, 'rear-disc-rotor', part('disc-rotor', 'Shimano', 'RT-MT800 160 mm', 125), gs);
  exempt(g, 'front-inner-tube', gs);
  exempt(g, 'rear-inner-tube', gs);

  // Road: tubed; the rear wheel was tubeless 1 Aug–15 Sep and now needs a tube; saddle lent to gravel.
  const r = 'road', rs = '2026-02-01';
  fit(r, 'fork', part('fork', 'Specialized', 'Tarmac SL7 fork', 380), rs);
  fit(r, 'bottom-bracket', part('bottom-bracket', 'CeramicSpeed', 'BB right', null), rs);
  fit(r, 'handlebar', part('handlebar', 'Roval', 'Rapide cockpit', 240), rs);
  const argo = part('saddle', 'Fizik', 'Argo R3', 215);
  fit(r, 'saddle', argo, rs, '2026-10-12');
  fit(g, 'saddle', argo, '2026-10-12');
  fit(r, 'seatpost', part('seatpost', 'Roval', 'Alpinist seatpost', 200), rs);
  fit(r, 'pedals', part('pedals', 'Look', 'Keo Blade Carbon', 220), rs);
  fit(r, 'front-derailleur', part('front-derailleur', 'Shimano', 'Ultegra FD-R8150', 96), rs);
  fit(r, 'rear-derailleur', part('rear-derailleur', 'Shimano', 'Ultegra RD-R8150', 262), rs);
  fit(r, 'shifters', part('shifters', 'Shimano', 'Ultegra ST-R8170', 340), rs);
  fit(r, 'cassette', part('cassette', 'Shimano', 'Ultegra CS-R8100 11–30T', 345), rs);
  fit(r, 'chain', part('chain', 'Shimano', 'CN-M8100 12-speed', 252), rs);
  fit(r, 'front-brake', part('brake', 'Shimano', 'Ultegra BR-R8170', 140), rs);
  fit(r, 'rear-brake', part('brake', 'Shimano', 'Ultegra BR-R8170', 140), rs);
  fit(r, 'crankset', part('crankset', 'Shimano', 'Ultegra FC-R8100 52/36', 700), rs);
  fit(r, 'front-rim', part('rim', 'Roval', 'Alpinist CLX front', 360), rs);
  fit(r, 'rear-rim', part('rim', 'Roval', 'Alpinist CLX rear', 400), rs);
  fit(r, 'front-tyre', part('tyre', 'Continental', 'GP5000 28 mm', 250), rs);
  fit(r, 'rear-tyre', part('tyre', 'Continental', 'GP5000 28 mm', 250), rs);
  fit(r, 'front-disc-rotor', part('disc-rotor', 'Shimano', 'RT-CL800 160 mm', 140), rs);
  fit(r, 'rear-disc-rotor', part('disc-rotor', 'Shimano', 'RT-CL800 140 mm', 120), rs);
  fit(r, 'front-inner-tube', part('inner-tube', 'Schwalbe', 'SV15 Extra Light', 110), rs);
  fit(r, 'rear-inner-tube', part('inner-tube', 'Schwalbe', 'SV15 Extra Light', 110), rs, '2026-08-01');
  exempt(r, 'rear-inner-tube', '2026-08-01', '2026-09-15');

  part('chain', 'KMC', 'X12 spare', 238); // bought as a spare, never fitted

  const ride = (bike, from, to, everyDays, kms, label) => {
    let i = 0;
    for (let t = day(from); t <= day(to); t += everyDays * 86400000, i++) {
      s.rides.push({ id: nid('r'), bike, start: t, metres: kms[i % kms.length] * 1000, name: `${label} ${fmtShort(t)}` });
    }
  };
  ride('gravel', '2026-03-05', '2026-10-12', 7, [62, 48, 85, 40, 110, 55], 'Gravel loop');
  ride('road', '2026-02-03', '2026-10-10', 6, [72, 95, 58, 120, 64], 'Road ride');
  return s;
}
let state = fixtures();

/* ---------- Derived values (imitating the API's read models) ---------- */
const bikeOf = (id) => state.bikes.find((b) => b.id === id);
const compOf = (id) => state.components.find((c) => c.id === id);
const covers = (x, t) => x.start <= t && (x.end === null || t < x.end);
const installsAt = (bike, position) => state.installations.filter((i) => i.bike === bike && i.position === position).sort((a, b) => a.start - b.start);
const exemptionsAt = (bike, position) => state.exemptions.filter((e) => e.bike === bike && e.position === position).sort((a, b) => a.start - b.start);
const openInstall = (bike, position, t = TODAY) => installsAt(bike, position).find((i) => covers(i, t)) ?? null;
const openExemption = (bike, position, t = TODAY) => exemptionsAt(bike, position).find((e) => covers(e, t)) ?? null;
const currentInstallOf = (compId) => state.installations.find((i) => i.comp === compId && covers(i, TODAY)) ?? null;
const bikeName = (b) => b.name || `${b.make} ${b.model}`;

function status(bike, position) {
  const fitted = openInstall(bike, position);
  if (fitted) return { state: 'fitted', install: fitted, comp: compOf(fitted.comp), since: fitted.start };
  const ex = openExemption(bike, position);
  if (ex) return { state: 'exempt', exemption: ex, reason: ex.reason, since: ex.start };
  const ends = [...installsAt(bike, position), ...exemptionsAt(bike, position)].map((x) => x.end).filter((e) => e !== null && e <= TODAY);
  if (ends.length) return { state: 'missing', since: Math.max(...ends) };
  return { state: 'not-recorded' };
}
function installMetres(inst) {
  return state.rides.filter((r) => r.bike === inst.bike && covers(inst, r.start)).reduce((a, r) => a + r.metres, 0);
}
function lifetime(compId) {
  const c = compOf(compId);
  const calc = state.installations.filter((i) => i.comp === compId).reduce((a, i) => a + installMetres(i), 0);
  return { calc, estimate: c.estimate, combined: calc + c.estimate };
}
function rideGaps(ride) {
  return CATALOG.filter((e) => !state.installations.some((i) => i.bike === ride.bike && i.position === e.position && covers(i, ride.start))
    && !state.exemptions.some((x) => x.bike === ride.bike && x.position === e.position && covers(x, ride.start))).map((e) => e.position);
}
function positionGaps(bike) {
  const out = new Map();
  for (const ride of state.rides.filter((r) => r.bike === bike).sort((a, b) => a.start - b.start)) {
    for (const p of rideGaps(ride)) {
      const g = out.get(p) ?? { position: p, count: 0, first: ride.start, last: ride.start };
      g.count += 1; g.last = ride.start; out.set(p, g);
    }
  }
  return CATALOG.map((e) => out.get(e.position)).filter(Boolean);
}
const missingPositions = (bike) => CATALOG.filter((e) => status(bike, e.position).state === 'missing').map((e) => e.position);
function weights(bike) {
  const b = bikeOf(bike);
  const groups = GROUPS.map((g) => {
    const parts = CATALOG.filter((e) => e.group === g.id).map((e) => status(bike, e.position)).filter((s) => s.state === 'fitted').map((s) => s.comp);
    return { ...g, grams: parts.reduce((a, c) => a + (c.weight ?? 0), 0), missing: parts.filter((c) => c.weight === null).length, parts: parts.length };
  });
  const parts = groups.reduce((a, g) => a + g.grams, 0);
  const missing = groups.reduce((a, g) => a + g.missing, 0) + (b.frameWeight === null ? 1 : 0);
  return { groups, frame: b.frameWeight, total: parts + (b.frameWeight ?? 0), missing, partCount: groups.reduce((a, g) => a + g.parts, 0) };
}
function missingText(bike) {
  const list = missingPositions(bike).map((p) => ({ p, since: status(bike, p).since }));
  return list;
}

/* ---------- Rules used by the mock's actions (the API owns these for real) ---------- */
function conflictAt(bike, position, start, ignoreIds = []) {
  const all = [...installsAt(bike, position), ...exemptionsAt(bike, position)].filter((x) => !ignoreIds.includes(x.id));
  // The new interval is [start, ∞): it overlaps anything that is still open or ends after start.
  return all.find((x) => x.end === null || start < x.end) ?? null;
}
function validWeight(raw) {
  const v = String(raw ?? '').trim();
  if (v === '') return { ok: true, value: null };
  if (!/^\d+$/.test(v)) return { ok: false, message: 'Enter whole grams, for example 245.' };
  const n = Number(v);
  if (n < 1 || n > 20000) return { ok: false, message: 'Weight must be between 1 and 20,000 g.' };
  return { ok: true, value: n };
}
function validDate(raw, after = null) {
  if (!raw) return { ok: false, message: 'Choose a date.' };
  const t = day(raw);
  if (t > TODAY) return { ok: false, message: 'The date cannot be after today (13 Oct 2026).' };
  if (after !== null && t <= after) return { ok: false, message: `Choose a date after ${fmtDate(after)}.` };
  return { ok: true, value: t };
}

/* ---------- Rendering ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
let view = 'overview';
const openMenus = new Set();

function render() {
  view = (location.hash || '#overview').slice(1);
  if (!['overview', 'components', 'rides', 'maintenance'].includes(view)) view = 'overview';
  document.querySelectorAll('nav a').forEach((a) => {
    const on = a.dataset.view === view;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const titles = { overview: 'Overview', components: 'Components', rides: 'Rides', maintenance: 'Maintenance' };
  $('#breadcrumb').textContent = titles[view];
  renderSelector();
  const bike = bikeOf(state.selected);
  const heading = {
    overview: [bikeName(bike), `${bike.make} ${bike.model} · ${bike.year}`],
    components: ['Components', 'Every part on this bike, grouped. Usage and history stay with each part, wherever it is fitted.'],
    rides: ['Rides', 'Each ride counts toward the parts fitted when it started.'],
    maintenance: ['Maintenance', 'Unchanged in this feature. See the approved V1 preview.'],
  }[view];
  $('#page-title').textContent = heading[0];
  $('#page-subtitle').textContent = heading[1];
  const content = $('#view-content');
  content.innerHTML = { overview: overviewView, components: componentsView, rides: ridesView, maintenance: maintenanceView }[view](bike);
}

function renderSelector() {
  $('#bike-selector').innerHTML = state.bikes.map((b) => {
    const missing = missingPositions(b.id);
    const active = b.id === state.selected;
    return `<button type="button" class="bike-choice${active ? ' active' : ''}" data-bike="${b.id}" aria-pressed="${active}">
      <svg style="--bike-color:${b.color}" aria-hidden="true"><use href="#bike-art"/></svg>
      <span><strong>${esc(bikeName(b))}</strong><small>${esc(b.make)} ${esc(b.model)}</small>
      ${missing.length ? `<span class="incomplete">${icon('i-alert')}Incomplete · ${plural(missing.length, 'part')} missing</span>` : ''}</span>
      ${active ? '<span class="choice-dot"></span>' : ''}</button>`;
  }).join('');
}

function incompleteNotice(bike, context) {
  const list = missingText(bike.id);
  if (!list.length) return '';
  const names = list.map(({ p, since }) => `<strong>${ENTRY[p].label.toLowerCase()}</strong> missing since ${fmtDate(since)}`).join(', ');
  const action = context === 'components'
    ? `<button type="button" class="button small secondary" data-action="fit" data-position="${list[0].p}">Fit ${ENTRY[list[0].p].label.toLowerCase()}</button>`
    : '<a class="button small secondary" href="#components">View parts</a>';
  return `<div class="notice" role="status">${icon('i-alert')}<div>This bike is incomplete: ${names}. Rides can still be logged; they will show a gap for the missing ${list.length === 1 ? 'part' : 'parts'}.</div><div class="notice-actions">${action}</div></div>`;
}

function overviewView(bike) {
  const rides = state.rides.filter((r) => r.bike === bike.id);
  const w = weights(bike.id);
  const missing = missingText(bike.id);
  const gaps = positionGaps(bike.id);
  const fittedCount = w.partCount;
  const gapLine = (g) => {
    const st = status(bike.id, g.position);
    const pill = st.state === 'missing' ? `<span class="pill missing">${icon('i-alert')}Missing</span>` : '<span class="pill quiet">Not recorded</span>';
    return `<div class="gap-line">${pill}<div><strong>${ENTRY[g.position].label}</strong>: ${plural(g.count, 'ride')} without a recorded part<small>${fmtDate(g.first)} – ${fmtDate(g.last)}</small></div></div>`;
  };
  const shown = gaps.slice(0, 3), rest = gaps.slice(3);
  return `${incompleteNotice(bike, 'overview')}
  <div class="overview-grid">
    <div>
      <section class="card hero" aria-label="${esc(bikeName(bike))}">
        <div class="hero-top"><div><h2>${esc(bikeName(bike))}</h2><p>${esc(bike.make)} ${esc(bike.model)} · ${esc(bike.kind)} · ${bike.year}</p>
          ${missing.length ? '' : '<div class="hero-status"><span class="pill fitted">All recorded parts fitted</span></div>'}</div>
          <span class="label-pill">${plural(fittedCount, 'part')} fitted</span></div>
        <svg style="--bike-color:${bike.color}" aria-hidden="true"><use href="#bike-art"/></svg>
        <div class="hero-bottom"><span>${plural(rides.length, 'ride')} recorded</span><a class="text-button" href="#components">Explore components</a></div>
      </section>
      <div class="facts">
        <div><span>Recorded distance</span><strong>${fmtKm(rides.reduce((a, r) => a + r.metres, 0))}<small>km</small></strong><p>${plural(rides.length, 'ride')}</p></div>
        <div><span>Bike weight</span><strong>${fmtKg(w.total)}</strong><p>${w.missing ? `Incomplete: ${plural(w.missing, 'item')} without weight` : 'Frame and all fitted parts'}</p></div>
        <div><span>Parts fitted</span><strong>${fittedCount}<small>of ${CATALOG.length}</small></strong><p>${CATALOG.length - fittedCount - CATALOG.filter((e) => status(bike.id, e.position).state === 'exempt').length} not fitted or not recorded</p></div>
      </div>
    </div>
    <div style="display:grid;gap:16px">
      <section class="gaps-card" aria-labelledby="gaps-title">
        <h2 id="gaps-title">Usage gaps</h2>
        <p>Rides that started while a position had no recorded part. Those rides add no usage for that position; nothing is estimated.</p>
        ${gaps.length ? shown.map(gapLine).join('') + (rest.length ? `<details><summary>Show ${plural(rest.length, 'more position')}</summary>${rest.map(gapLine).join('')}</details>` : '') : '<p class="no-gap">No gaps. Every ride is fully allocated.</p>'}
      </section>
      <section class="fitted-card" aria-labelledby="weight-title">
        <h2 id="weight-title">Weight by group</h2>
        ${w.groups.map((g) => `<div class="group-mini"><span>${g.label}</span><span class="tabular"><strong>${fmtKg(g.grams)}</strong>${g.missing ? `<small>${plural(g.missing, 'part')} without weight</small>` : ''}</span></div>`).join('')}
        <div class="group-mini"><span>Frame</span><span class="tabular">${w.frame === null ? '<small>Weight not recorded</small> <button type="button" class="text-button" data-action="edit-bike">Add</button>' : `<strong>${fmtKg(w.frame)}</strong>`}</span></div>
      </section>
    </div>
  </div>`;
}

function rowFor(bike, e) {
  const st = status(bike.id, e.position);
  const menuId = `menu-${e.position}`;
  if (st.state === 'fitted') {
    const life = lifetime(st.comp.id);
    return `<div class="pos-row state-fitted">
      <span class="pos-label">${e.label}</span>
      <span class="part"><button type="button" class="part-link" data-action="passport" data-comp="${st.comp.id}">${esc(st.comp.make)} ${esc(st.comp.model)}</button><small>On this bike since ${fmtDate(st.since)}</small></span>
      <span class="weight${st.comp.weight === null ? ' unknown' : ''}">${st.comp.weight === null ? 'No weight' : fmtG(st.comp.weight)}</span>
      <span class="km">${fmtKm(life.combined)} km${life.estimate ? '<small>incl. estimate</small>' : '<small>lifetime</small>'}</span>
      <span class="actions"><button type="button" class="text-button" data-action="replace" data-install="${st.install.id}">Replace</button>
        <button type="button" class="more-button keep" aria-label="More actions for ${e.label.toLowerCase()}" aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}" data-menu="${menuId}">${icon('i-more')}</button></span>
      <div class="menu" id="${menuId}" role="menu" hidden>
        <button type="button" role="menuitem" data-action="replace" data-install="${st.install.id}">Replace…</button>
        <button type="button" role="menuitem" data-action="move" data-install="${st.install.id}">Move to another bike…</button>
        <button type="button" role="menuitem" data-action="remove" data-install="${st.install.id}">Remove from bike…</button>
        ${e.exemption === 'none-fitted' ? `<button type="button" role="menuitem" data-action="none-fitted" data-position="${e.position}">Mark none fitted…</button>` : ''}
        <hr><button type="button" role="menuitem" data-action="passport" data-comp="${st.comp.id}">History and details</button>
      </div></div>`;
  }
  if (st.state === 'exempt') {
    const text = st.reason === 'tubeless' ? 'Not applicable (tubeless)' : 'None fitted';
    const action = st.reason === 'tubeless'
      ? `<button type="button" class="text-button keep" data-action="tubed" data-position="${e.position}">Switch to tubed</button>`
      : `<button type="button" class="text-button keep" data-action="fit" data-position="${e.position}">Fit one</button>`;
    return `<div class="pos-row state-empty"><span class="pos-label">${e.label}</span>
      <span class="part"><span class="pill quiet">${text}</span><small>Since ${fmtDate(st.since)} · receives no usage and shows no gaps</small></span>
      <span class="weight unknown"></span><span class="km"></span><span class="actions">${action}</span></div>`;
  }
  if (st.state === 'missing') {
    return `<div class="pos-row state-missing"><span class="pos-label">${e.label}</span>
      <span class="part"><span class="pill missing">${icon('i-alert')}Missing since ${fmtDate(st.since)}</span><small>Rides from that date show a gap for this part</small></span>
      <span class="weight unknown"></span><span class="km"></span>
      <span class="actions"><button type="button" class="button small primary keep" data-action="fit" data-position="${e.position}">Fit part</button>
      ${e.exemption === 'none-fitted' ? `<button type="button" class="more-button keep" aria-label="More actions for ${e.label.toLowerCase()}" aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}" data-menu="${menuId}">${icon('i-more')}</button>` : ''}</span>
      ${e.exemption === 'none-fitted' ? `<div class="menu" id="${menuId}" role="menu" hidden><button type="button" role="menuitem" data-action="none-fitted" data-position="${e.position}">Mark none fitted…</button></div>` : ''}</div>`;
  }
  return `<div class="pos-row state-empty"><span class="pos-label">${e.label}</span>
    <span class="part"><span class="pill quiet">Not recorded</span></span><span class="weight unknown"></span><span class="km"></span>
    <span class="actions"><button type="button" class="text-button keep" data-action="fit" data-position="${e.position}">${icon('i-plus')}Fit</button>
    ${e.exemption === 'none-fitted' ? `<button type="button" class="more-button keep" aria-label="More actions for ${e.label.toLowerCase()}" aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}" data-menu="${menuId}">${icon('i-more')}</button><div class="menu" id="${menuId}" role="menu" hidden><button type="button" role="menuitem" data-action="none-fitted" data-position="${e.position}">Mark none fitted…</button></div>` : ''}</span></div>`;
}

function wheelSetup(bike) {
  const card = (end) => {
    const pos = `${end}-inner-tube`;
    const st = status(bike.id, pos);
    const tubeless = st.state === 'exempt';
    const wheel = end === 'front' ? 'Front wheel' : 'Rear wheel';
    return `<div class="wheel-card">${icon('i-wheel')}<div><strong>${wheel}: ${tubeless ? 'tubeless' : 'tubed'}</strong><small>${tubeless ? `Since ${fmtDate(st.since)}` : st.state === 'fitted' ? `Tube fitted since ${fmtDate(st.since)}` : st.state === 'missing' ? `Tube missing since ${fmtDate(st.since)}` : 'No tube recorded'}</small></div>
      <button type="button" class="text-button" data-action="${tubeless ? 'tubed' : 'tubeless'}" data-position="${pos}">Switch to ${tubeless ? 'tubed' : 'tubeless'}</button></div>`;
  };
  const history = state.exemptions.filter((x) => x.bike === bike.id && x.reason === 'tubeless').sort((a, b) => b.start - a.start);
  return `<div class="wheel-setup" aria-label="Wheel setup">${card('front')}${card('rear')}
    ${history.length ? `<details class="wheel-history"><summary>Tubeless history</summary><ol>${history.map((x) => `<li>${ENTRY[x.position].end === 'front' ? 'Front' : 'Rear'} wheel tubeless ${fmtDate(x.start)} – ${x.end ? fmtDate(x.end) : 'now'}</li>`).join('')}</ol></details>` : ''}</div>`;
}

function componentsView(bike) {
  const w = weights(bike.id);
  const groups = GROUPS.map((g) => {
    const entries = CATALOG.filter((e) => e.group === g.id);
    const main = entries.filter((e) => status(bike.id, e.position).state !== 'not-recorded');
    const quiet = entries.filter((e) => status(bike.id, e.position).state === 'not-recorded');
    const gw = w.groups.find((x) => x.id === g.id);
    return `<section class="group" aria-labelledby="group-${g.id}">
      <div class="group-head"><h2 id="group-${g.id}">${g.label}</h2><span class="subtotal tabular">${fmtKg(gw.grams)}${gw.missing ? `<small>${plural(gw.missing, 'part')} without weight</small>` : ''}</span></div>
      ${g.id === 'wheels' ? wheelSetup(bike) : ''}
      ${main.map((e) => rowFor(bike, e)).join('')}
      ${quiet.length ? `<details class="unrecorded"><summary>${icon('i-plus')}<span><strong>${quiet.length} not recorded</strong> · ${quiet.map((e) => e.label.toLowerCase()).join(', ')}</span>${icon('i-chevron', 'i chev')}</summary>${quiet.map((e) => rowFor(bike, e)).join('')}</details>` : ''}
    </section>`;
  }).join('');
  const garage = state.components.filter((c) => !currentInstallOf(c.id));
  return `${incompleteNotice(bike, 'components')}
  <div class="board-summary">
    <div class="metric"><span>Bike weight</span><strong>${fmtKg(w.total)}</strong><small>${w.frame === null ? 'Frame weight not recorded' : `Frame ${fmtKg(w.frame)}`} + ${plural(w.partCount, 'part')}</small></div>
    <div class="metric"><span>Weights recorded</span><strong>${w.missing ? `${w.missing} missing` : 'All'}</strong><small>${w.missing ? 'Total counts recorded weights only' : 'Total is complete'}</small></div>
    <div class="summary-actions">${w.frame === null ? '<button type="button" class="button small secondary" data-action="edit-bike">Add frame weight</button>' : ''}</div>
  </div>
  ${groups}
  <section class="garage-card" aria-labelledby="garage-title">
    <h2 id="garage-title">Parts in your garage</h2>
    <p>Not fitted to any bike. Their history and usage stay with them; fit one to any bike from here or when replacing a part.</p>
    <div class="garage-list">${garage.length ? garage.map((c) => {
      const last = state.installations.filter((i) => i.comp === c.id).sort((a, b) => b.start - a.start)[0];
      return `<div class="garage-item"><div><button type="button" class="part-link text-button" style="color:var(--ink);font-weight:550" data-action="passport" data-comp="${c.id}">${esc(c.make)} ${esc(c.model)}</button><small>${TYPE_LABEL[c.type][0].toUpperCase()}${TYPE_LABEL[c.type].slice(1)} · ${last ? `last on ${esc(bikeName(bikeOf(last.bike)))} until ${fmtDate(last.end)}` : 'never fitted'}</small></div>
        <span class="tabular">${c.weight === null ? '<small>No weight</small>' : fmtG(c.weight)}</span><span class="tabular">${fmtKm(lifetime(c.id).combined)} km</span>
        <button type="button" class="text-button" data-action="fit-from-garage" data-comp="${c.id}">Fit to a bike</button></div>`;
    }).join('') : '<p class="no-gap">No spare parts.</p>'}</div>
  </section>`;
}

function ridesView(bike) {
  const rides = state.rides.filter((r) => r.bike === bike.id).sort((a, b) => b.start - a.start).slice(0, 20);
  return `${incompleteNotice(bike, 'rides')}
  <section class="rides-card"><div class="table-wrap" tabindex="0" role="region" aria-label="Rides"><table>
    <thead><tr><th>Ride</th><th>Date</th><th class="number">Distance</th><th>Allocation</th></tr></thead>
    <tbody>${rides.map((r) => {
      const gaps = rideGaps(r);
      return `<tr><td>${esc(r.name)}</td><td><time datetime="${iso(r.start)}">${fmtDate(r.start)}</time></td><td class="number">${fmtKm(r.metres)} km</td>
        <td>${gaps.length ? `<details class="gap-count"><summary>${icon('i-alert')}${plural(gaps.length, 'position')} not recorded</summary><ul>${gaps.map((p) => `<li>${ENTRY[p].label}${status(bike.id, p).state === 'missing' ? ' (missing now)' : ''}</li>`).join('')}</ul></details>` : '<span class="no-gap">Fully allocated</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="no-gap" style="font-size:12px;margin-top:12px">Showing the 20 most recent rides.</p></section>`;
}

function maintenanceView() {
  return '<div class="notice calm">Maintenance is unchanged by this feature. Use the approved V1 preview for maintenance flows.</div>';
}

/* ---------- Dialogs ---------- */
const dialog = $('#dialog');
let active = null; // { render(draft), submit(form, draft) → string|null, draft }

function openDialog(spec) {
  active = { draft: {}, ...spec };
  $('#dialog-title').textContent = spec.title;
  $('#dialog-submit').textContent = spec.submitLabel ?? 'Save';
  $('#dialog-submit').hidden = spec.submitLabel === null;
  dialog.classList.toggle('wide', !!spec.wide);
  paintDialog();
  $('#dialog-error').textContent = '';
  if (!dialog.open) dialog.showModal();
  const first = dialog.querySelector('#dialog-body input:not([type=hidden]), #dialog-body select, #dialog-body button');
  first?.focus();
}
function paintDialog() {
  $('#dialog-body').innerHTML = active.render(active.draft);
}
function readForm() {
  const data = {};
  for (const el of $('#dialog-form').elements) {
    if (!el.name) continue;
    if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; } else if (el.type === 'checkbox') data[el.name] = el.checked; else data[el.name] = el.value;
  }
  return data;
}
function fieldError(name, message) {
  const el = $(`#dialog-body [name="${name}"]`);
  if (!el) { $('#dialog-error').textContent = message; return; }
  el.classList.add('invalid');
  el.setAttribute('aria-invalid', 'true');
  const err = document.createElement('span');
  err.className = 'field-error'; err.id = `${name}-error`; err.textContent = message;
  el.setAttribute('aria-describedby', err.id);
  el.insertAdjacentElement('afterend', err);
  el.focus();
}
function clearErrors() {
  $('#dialog-error').textContent = '';
  dialog.querySelectorAll('.field-error').forEach((e) => e.remove());
  dialog.querySelectorAll('.invalid').forEach((e) => { e.classList.remove('invalid'); e.removeAttribute('aria-invalid'); });
}
$('#dialog-form').addEventListener('change', (ev) => {
  if (!active || !ev.target.matches('[data-rerender]')) return;
  Object.assign(active.draft, readForm());
  paintDialog();
  $(`#dialog-body [name="${ev.target.name}"]${ev.target.type === 'radio' ? `[value="${ev.target.value}"]` : ''}`)?.focus();
});
$('#dialog-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  clearErrors();
  Object.assign(active.draft, readForm());
  const result = active.submit(active.draft);
  if (result && result.field) { fieldError(result.field, result.message); return; }
  if (result) { $('#dialog-error').textContent = result; return; }
  dialog.close();
  render();
});
dialog.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) dialog.close(); });
dialog.addEventListener('close', () => { active = null; });

function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('visible');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('visible'), 3200);
}

const field = (label, name, value = '', attrs = '', help = '') => `<label class="field">${label}<input name="${name}" value="${esc(value)}" ${attrs}>${help ? `<small>${help}</small>` : ''}</label>`;
const dateField = (label, name, value) => field(label, name, value ?? iso(TODAY), `type="date" max="${iso(TODAY)}" required`);
const weightField = (value) => field('Weight (g) <span style="font-weight:400;color:var(--muted)">optional</span>', 'weight', value ?? '', 'inputmode="numeric" autocomplete="off" placeholder="e.g. 245"', 'Whole grams, 1–20,000. Leave empty if unknown; add it later.');
const segmented = (name, value, options) => `<div class="segmented" role="radiogroup" aria-label="Source of the part">${options.map((o) => `<label><input type="radio" name="${name}" value="${o.value}" ${o.value === value ? 'checked' : ''} data-rerender>${o.label}${o.note ? `<small>${o.note}</small>` : ''}</label>`).join('')}</div>`;

function garagePartsOfType(type) { return state.components.filter((c) => c.type === type && !currentInstallOf(c.id)); }
function otherBikePartsOfType(type, bike) {
  return state.installations.filter((i) => covers(i, TODAY) && i.bike !== bike && compOf(i.comp).type === type).map((i) => ({ install: i, comp: compOf(i.comp) }));
}
function choiceList(name, items, selected) {
  return `<div class="choice-list" role="radiogroup">${items.map((it) => `<label class="choice"><input type="radio" name="${name}" value="${it.value}" ${it.value === selected ? 'checked' : ''} data-rerender><span>${it.title}<small>${it.sub}</small></span><span class="meta">${it.meta}</span></label>`).join('')}</div>`;
}

/* Fit into an empty, missing or exempt position; Replace a fitted one. Same three sources. */
function partDialog(bike, position, install = null) {
  const e = ENTRY[position];
  const replacing = !!install;
  const current = replacing ? compOf(install.comp) : null;
  const garage = garagePartsOfType(e.type);
  const others = otherBikePartsOfType(e.type, bike.id);
  const opposite = e.end ? CATALOG.find((x) => x.type === e.type && x.end && x.end !== e.end) : null;
  const pairOffered = !replacing && opposite && PAIR_TYPES.has(e.type) && ['not-recorded', 'missing'].includes(status(bike.id, opposite.position).state);
  openDialog({
    title: `${replacing ? 'Replace' : 'Fit'} ${e.label.toLowerCase()}`,
    submitLabel: replacing ? 'Replace part' : 'Fit part',
    wide: true,
    draft: { source: 'new', pair: pairOffered && PAIR_DEFAULT.has(e.type) },
    render: (d) => {
      const src = d.source;
      let body = '';
      if (src === 'new') {
        body = `<div class="field-pair">${field('Make', 'make', d.make, 'autocomplete="off" required')}${field('Model', 'model', d.model, 'autocomplete="off" required')}</div>
          <div class="field-pair">${weightField(d.weight)}${replacing ? field('Cost <span style="font-weight:400;color:var(--muted)">optional</span>', 'cost', d.cost, 'inputmode="decimal" placeholder="e.g. 39.90"') : field('Known starting usage (km) <span style="font-weight:400;color:var(--muted)">optional</span>', 'estimate', d.estimate, 'inputmode="numeric" placeholder="0"', 'For a used part. Shown as an estimate.')}</div>
          ${pairOffered ? `<label class="check"><input type="checkbox" name="pair" ${d.pair ? 'checked' : ''}><span>Also fit to the ${opposite.label.toLowerCase()}<small>Same make, model and weight. Creates two separate parts, so either can be replaced on its own.</small></span></label>` : ''}`;
      } else if (src === 'garage') {
        body = garage.length ? choiceList('pick', garage.map((c) => ({ value: c.id, title: `${esc(c.make)} ${esc(c.model)}`, sub: (() => { const l = state.installations.filter((i) => i.comp === c.id).sort((a, b) => b.start - a.start)[0]; return l ? `Last on ${esc(bikeName(bikeOf(l.bike)))} until ${fmtDate(l.end)}` : 'Never fitted'; })(), meta: `${fmtKm(lifetime(c.id).combined)} km<br>${c.weight === null ? 'No weight' : fmtG(c.weight)}` })), d.pick)
          : `<p class="empty-choice">No spare ${TYPE_LABEL[e.type]}s in your garage. Choose <strong>New part</strong>, or take one from another bike.</p>`;
      } else {
        const chosen = others.find((o) => o.install.id === d.pick);
        body = others.length ? choiceList('pick', others.map((o) => ({ value: o.install.id, title: `${esc(o.comp.make)} ${esc(o.comp.model)}`, sub: `Fitted to ${esc(bikeName(bikeOf(o.install.bike)))} · ${ENTRY[o.install.position].label.toLowerCase()}`, meta: `${fmtKm(lifetime(o.comp.id).combined)} km<br>${o.comp.weight === null ? 'No weight' : fmtG(o.comp.weight)}` })), d.pick)
          + (chosen ? `<div class="notice inline">${icon('i-alert')}<div><strong>${esc(bikeName(bikeOf(chosen.install.bike)))} will be incomplete.</strong> It will have no ${ENTRY[chosen.install.position].label.toLowerCase()} from the date below until you fit one. Rides can still be logged on it.</div></div>` : '')
          : `<p class="empty-choice">No ${TYPE_LABEL[e.type]} is fitted to your other bikes.</p>`;
      }
      return `<p class="fixed-type">${icon('i-dash')}Only ${TYPE_LABEL[e.type]}s can go here${e.end ? `; front and rear ${TYPE_LABEL[e.type]}s are interchangeable` : ''}.</p>
        ${segmented('source', src, [
          { value: 'new', label: 'New part' },
          { value: 'garage', label: 'From your garage', note: garage.length ? plural(garage.length, 'spare') : 'none' },
          { value: 'bike', label: 'From another bike', note: others.length ? plural(others.length, 'fitted', 'fitted') : 'none' },
        ])}
        ${body}
        ${dateField(replacing ? 'Replaced on' : 'Fitted on', 'date', d.date)}
        ${replacing ? `<p class="dialog-description">${esc(current.make)} ${esc(current.model)} comes off and goes to your garage with its ${fmtKm(lifetime(current.id).combined)} km and history.</p>` : ''}`;
    },
    submit: (d) => {
      const afterStart = replacing ? install.start : null;
      const date = validDate(d.date, afterStart);
      if (!date.ok) return { field: 'date', message: date.message };
      const t = date.value;
      const ignore = replacing ? [install.id] : [];
      const exempt = !replacing && status(bike.id, position).state === 'exempt' ? status(bike.id, position).exemption : null;
      if (exempt) ignore.push(exempt.id);
      if (conflictAt(bike.id, position, t, ignore)) return { field: 'date', message: `The ${e.label.toLowerCase()} already has history on or after this date. Choose a later date.` };
      let compId, from = null;
      if (d.source === 'new') {
        if (!d.make?.trim()) return { field: 'make', message: 'Enter the make.' };
        if (!d.model?.trim()) return { field: 'model', message: 'Enter the model.' };
        const wv = validWeight(d.weight);
        if (!wv.ok) return { field: 'weight', message: wv.message };
        const est = d.estimate?.trim() ? Number(d.estimate) : 0;
        if (!Number.isFinite(est) || est < 0) return { field: 'estimate', message: 'Enter whole kilometres, or leave empty.' };
        if (d.pair && conflictAt(bike.id, opposite.position, t)) return `The ${opposite.label.toLowerCase()} already has history on or after this date, so nothing was saved. Fit it separately or untick “Also fit”.`;
        compId = nid('c');
        state.components.push({ id: compId, type: e.type, make: d.make.trim(), model: d.model.trim(), weight: wv.value, estimate: Math.round(est * 1000) });
        if (d.pair) {
          const twin = nid('c');
          state.components.push({ id: twin, type: e.type, make: d.make.trim(), model: d.model.trim(), weight: wv.value, estimate: 0 });
          state.installations.push({ id: nid('i'), bike: bike.id, position: opposite.position, comp: twin, start: t, end: null });
        }
      } else if (d.source === 'garage') {
        if (!d.pick) return 'Choose a part from your garage.';
        compId = d.pick;
      } else {
        if (!d.pick) return 'Choose a part from another bike.';
        from = state.installations.find((i) => i.id === d.pick);
        if (t <= from.start) return { field: 'date', message: `Choose a date after ${fmtDate(from.start)}, when it was fitted to ${bikeName(bikeOf(from.bike))}.` };
        compId = from.comp;
      }
      if (exempt) exempt.end = t;
      if (replacing) install.end = t;
      if (from) from.end = t;
      state.installations.push({ id: nid('i'), bike: bike.id, position, comp: compId, start: t, end: null });
      const c = compOf(compId);
      toast(`${c.make} ${c.model} fitted as ${e.label.toLowerCase()}${d.pair ? ` and ${opposite.label.toLowerCase()}` : ''}.${from ? ` ${bikeName(bikeOf(from.bike))} is now incomplete.` : ''}`);
      return null;
    },
  });
}

function moveDialog(compId, install) {
  const c = compOf(compId);
  const targets = (bikeId) => CATALOG.filter((e) => e.type === c.type).map((e) => ({ e, st: status(bikeId, e.position) }))
    .filter(({ e }) => !(install && install.bike === bikeId && install.position === e.position));
  openDialog({
    title: install ? `Move ${c.make} ${c.model}` : `Fit ${c.make} ${c.model}`,
    submitLabel: install ? 'Move part' : 'Fit part',
    draft: { bike: state.bikes.find((b) => !install || b.id !== install.bike)?.id ?? state.selected },
    render: (d) => {
      const list = targets(d.bike);
      const pos = d.position && list.some((x) => x.e.position === d.position) ? d.position : list[0]?.e.position;
      d.position = pos;
      const chosen = list.find((x) => x.e.position === pos);
      const occupied = chosen?.st.state === 'fitted' ? chosen.st.comp : null;
      const exempt = chosen?.st.state === 'exempt';
      return `${install ? `<p class="dialog-description">Currently the ${ENTRY[install.position].label.toLowerCase()} on ${esc(bikeName(bikeOf(install.bike)))}. Its ${fmtKm(lifetime(c.id).combined)} km and history move with it.</p>` : ''}
        <label class="field">Bike<select name="bike" data-rerender>${state.bikes.map((b) => `<option value="${b.id}" ${b.id === d.bike ? 'selected' : ''}>${esc(bikeName(b))}</option>`).join('')}</select></label>
        <label class="field">Position<select name="position" data-rerender>${list.map(({ e, st }) => `<option value="${e.position}" ${e.position === pos ? 'selected' : ''}>${e.label} — ${st.state === 'fitted' ? `fitted: ${esc(st.comp.make)} ${esc(st.comp.model)}` : st.state === 'missing' ? 'missing' : st.state === 'exempt' ? (st.reason === 'tubeless' ? 'tubeless' : 'none fitted') : 'empty'}</option>`).join('')}</select></label>
        ${dateField(install ? 'Moved on' : 'Fitted on', 'date', d.date)}
        ${occupied ? `<p class="dialog-description">${esc(occupied.make)} ${esc(occupied.model)} comes off ${esc(bikeName(bikeOf(d.bike)))} and goes to your garage.</p>` : ''}
        ${exempt && chosen.st.reason === 'tubeless' ? '<p class="dialog-description">This wheel is tubeless. Switch it to tubed before fitting a tube.</p>' : ''}
        ${install && install.bike !== d.bike ? `<div class="notice inline">${icon('i-alert')}<div><strong>${esc(bikeName(bikeOf(install.bike)))} will be incomplete</strong> until you fit another ${TYPE_LABEL[c.type]}. Rides can still be logged on it.</div></div>` : ''}`;
    },
    submit: (d) => {
      const date = validDate(d.date, install ? install.start : null);
      if (!date.ok) return { field: 'date', message: date.message };
      const t = date.value;
      const st = status(d.bike, d.position);
      if (st.state === 'exempt' && st.reason === 'tubeless') return 'This wheel is tubeless. Switch it to tubed first.';
      const ignore = [];
      if (st.state === 'fitted') ignore.push(st.install.id);
      if (st.state === 'exempt') ignore.push(st.exemption.id);
      if (st.state === 'fitted' && t <= st.install.start) return { field: 'date', message: `Choose a date after ${fmtDate(st.install.start)}, when the current part was fitted.` };
      if (conflictAt(d.bike, d.position, t, ignore)) return { field: 'date', message: 'That position already has history on or after this date.' };
      if (install) install.end = t;
      if (st.state === 'fitted') st.install.end = t;
      if (st.state === 'exempt') st.exemption.end = t;
      state.installations.push({ id: nid('i'), bike: d.bike, position: d.position, comp: c.id, start: t, end: null });
      toast(`${c.make} ${c.model} is now the ${ENTRY[d.position].label.toLowerCase()} on ${bikeName(bikeOf(d.bike))}.`);
      return null;
    },
  });
}

function removeDialog(install) {
  const c = compOf(install.comp), e = ENTRY[install.position], b = bikeOf(install.bike);
  openDialog({
    title: `Remove ${e.label.toLowerCase()}`,
    submitLabel: 'Remove part',
    render: (d) => `<p class="dialog-description">${esc(c.make)} ${esc(c.model)} goes to your garage with its ${fmtKm(lifetime(c.id).combined)} km and history. You can fit it again later, to any bike.</p>
      ${dateField('Removed on', 'date', d.date)}
      <div class="notice inline">${icon('i-alert')}<div><strong>${esc(bikeName(b))} will be incomplete</strong> until you fit another ${TYPE_LABEL[c.type]}. Rides can still be logged; they will show a gap.</div></div>`,
    submit: (d) => {
      const date = validDate(d.date, install.start);
      if (!date.ok) return { field: 'date', message: date.message };
      install.end = date.value;
      toast(`${c.make} ${c.model} removed. It is in your garage.`);
      return null;
    },
  });
}

function noneFittedDialog(bike, position) {
  const st = status(bike.id, position);
  openDialog({
    title: 'Mark front derailleur as none fitted',
    submitLabel: 'Mark none fitted',
    render: (d) => `<p class="dialog-description">For a 1x drivetrain. From this date the position gets no usage and shows no gaps, and the bike is not counted as incomplete.</p>
      ${dateField('From', 'date', d.date)}
      ${st.state === 'fitted' ? `<p class="dialog-description">${esc(st.comp.make)} ${esc(st.comp.model)} comes off and goes to your garage.</p>` : ''}`,
    submit: (d) => {
      const date = validDate(d.date, st.state === 'fitted' ? st.install.start : null);
      if (!date.ok) return { field: 'date', message: date.message };
      const ignore = st.state === 'fitted' ? [st.install.id] : [];
      if (conflictAt(bike.id, position, date.value, ignore)) return { field: 'date', message: 'The front derailleur already has history on or after this date.' };
      if (st.state === 'fitted') st.install.end = date.value;
      state.exemptions.push({ id: nid('e'), bike: bike.id, position, reason: 'none-fitted', start: date.value, end: null });
      toast('Front derailleur marked as none fitted.');
      return null;
    },
  });
}

function tubelessDialog(bike, position, toTubeless) {
  const e = ENTRY[position];
  const wheel = e.end === 'front' ? 'front wheel' : 'rear wheel';
  const st = status(bike.id, position);
  openDialog({
    title: `Switch ${wheel} to ${toTubeless ? 'tubeless' : 'tubed'}`,
    submitLabel: `Switch to ${toTubeless ? 'tubeless' : 'tubed'}`,
    render: (d) => `${dateField('From', 'date', d.date)}
      ${toTubeless
        ? (st.state === 'fitted' ? `<p class="dialog-description">${esc(st.comp.make)} ${esc(st.comp.model)} comes out and goes to your garage with its ${fmtKm(lifetime(st.comp.id).combined)} km. While tubeless, the ${e.label.toLowerCase()} is not applicable and shows no gaps.</p>` : `<p class="dialog-description">While tubeless, the ${e.label.toLowerCase()} is not applicable and shows no gaps.</p>`)
        : `<div class="notice inline">${icon('i-alert')}<div>The ${e.label.toLowerCase()} will be <strong>missing</strong> until you fit a tube, and ${esc(bikeName(bike))} will be incomplete. Rides can still be logged.</div></div>`}`,
    submit: (d) => {
      if (toTubeless) {
        const date = validDate(d.date, st.state === 'fitted' ? st.install.start : null);
        if (!date.ok) return { field: 'date', message: date.message };
        const ignore = st.state === 'fitted' ? [st.install.id] : [];
        if (conflictAt(bike.id, position, date.value, ignore)) return { field: 'date', message: 'This wheel already has history on or after this date.' };
        if (st.state === 'fitted') st.install.end = date.value;
        state.exemptions.push({ id: nid('e'), bike: bike.id, position, reason: 'tubeless', start: date.value, end: null });
        toast(`${wheel[0].toUpperCase()}${wheel.slice(1)} is tubeless from ${fmtDate(date.value)}.`);
      } else {
        const date = validDate(d.date, st.exemption.start);
        if (!date.ok) return { field: 'date', message: date.message };
        st.exemption.end = date.value;
        toast(`${wheel[0].toUpperCase()}${wheel.slice(1)} is tubed from ${fmtDate(date.value)}. Fit a tube to complete the bike.`);
      }
      return null;
    },
  });
}

function passportDialog(compId) {
  const c = compOf(compId);
  const life = lifetime(compId);
  const now = currentInstallOf(compId);
  const hist = state.installations.filter((i) => i.comp === compId).sort((a, b) => b.start - a.start);
  openDialog({
    title: `${c.make} ${c.model}`,
    submitLabel: null,
    wide: true,
    render: () => `<p class="dialog-description" style="margin-top:-10px">${TYPE_LABEL[c.type][0].toUpperCase()}${TYPE_LABEL[c.type].slice(1)} · ${now ? `${ENTRY[now.position].label} on ${esc(bikeName(bikeOf(now.bike)))}` : 'In your garage'}</p>
      <div class="passport-stats">
        <div><span>Lifetime</span><strong>${fmtKm(life.combined)} km</strong><small>${life.estimate ? `incl. ${fmtKm(life.estimate)} km estimate` : 'calculated from rides'}</small></div>
        <div><span>Weight</span><strong>${c.weight === null ? '—' : fmtG(c.weight)}</strong><small>${c.weight === null ? 'not recorded' : 'as entered'}</small></div>
        <div><span>Fitted</span><strong>${plural(hist.length, 'time')}</strong><small>${new Set(hist.map((h) => h.bike)).size > 1 ? 'on more than one bike' : 'on one bike'}</small></div>
      </div>
      <h3 style="font-size:14px;margin-bottom:4px">Installation history</h3>
      <ol class="history">${hist.length ? hist.map((h) => `<li><span><strong>${esc(bikeName(bikeOf(h.bike)))}</strong> · ${ENTRY[h.position].label.toLowerCase()}<small>${fmtDate(h.start)} – ${h.end ? fmtDate(h.end) : 'now'}</small></span><span class="tabular">${fmtKm(installMetres(h))} km</span></li>`).join('') : '<li><span>Never fitted.</span></li>'}</ol>
      <div class="passport-actions">
        <button type="button" class="button small secondary" data-action="edit-part" data-comp="${c.id}">Edit details</button>
        ${now ? `<button type="button" class="button small secondary" data-action="move" data-install="${now.id}">Move to another bike</button><button type="button" class="button small secondary" data-action="remove" data-install="${now.id}">Remove from bike</button>` : `<button type="button" class="button small secondary" data-action="fit-from-garage" data-comp="${c.id}">Fit to a bike</button>`}
      </div>`,
    submit: () => null,
  });
}

function editPartDialog(compId) {
  const c = compOf(compId);
  openDialog({
    title: 'Edit part details',
    draft: { make: c.make, model: c.model, weight: c.weight ?? '' },
    render: (d) => `<p class="fixed-type">${icon('i-dash')}Type: ${TYPE_LABEL[c.type]} (cannot be changed)</p>
      <div class="field-pair">${field('Make', 'make', d.make, 'required')}${field('Model', 'model', d.model, 'required')}</div>${weightField(d.weight)}
      <p class="dialog-description">Editing details never changes the part's history or usage.</p>`,
    submit: (d) => {
      if (!d.make.trim()) return { field: 'make', message: 'Enter the make.' };
      if (!d.model.trim()) return { field: 'model', message: 'Enter the model.' };
      const wv = validWeight(d.weight);
      if (!wv.ok) return { field: 'weight', message: wv.message };
      Object.assign(c, { make: d.make.trim(), model: d.model.trim(), weight: wv.value });
      toast('Part details saved.');
      return null;
    },
  });
}

function bikeDialog(bike) {
  openDialog({
    title: 'Edit bike',
    draft: { ...bike, frameWeight: bike.frameWeight ?? '' },
    render: (d) => `${field('Name <span style="font-weight:400;color:var(--muted)">optional</span>', 'name', d.name)}
      <div class="field-pair">${field('Frame make', 'make', d.make, 'required')}${field('Frame model', 'model', d.model, 'required')}</div>
      <div class="field-pair">${field('Year', 'year', d.year, 'inputmode="numeric"')}${field('Frame weight (g) <span style="font-weight:400;color:var(--muted)">optional</span>', 'frameWeight', d.frameWeight, 'inputmode="numeric" placeholder="e.g. 1180"')}</div>
      <p class="dialog-description">Make and model describe the frame. The frame is not a replaceable part: a different frame means a different bike, so add a new bike instead.</p>`,
    submit: (d) => {
      if (!d.make.trim()) return { field: 'make', message: 'Enter the frame make.' };
      if (!d.model.trim()) return { field: 'model', message: 'Enter the frame model.' };
      const wv = validWeight(d.frameWeight);
      if (!wv.ok) return { field: 'frameWeight', message: wv.message };
      Object.assign(bike, { name: d.name.trim(), make: d.make.trim(), model: d.model.trim(), year: Number(d.year) || bike.year, frameWeight: wv.value });
      toast('Bike details saved.');
      return null;
    },
  });
}

function rideDialog() {
  openDialog({
    title: 'Add a ride',
    submitLabel: 'Save ride',
    draft: { bike: state.selected },
    render: (d) => {
      const missing = missingText(d.bike);
      return `<label class="field">Bike<select name="bike" data-rerender>${state.bikes.map((b) => `<option value="${b.id}" ${b.id === d.bike ? 'selected' : ''}>${esc(bikeName(b))}${missingPositions(b.id).length ? ' (incomplete)' : ''}</option>`).join('')}</select></label>
        ${missing.length ? `<div class="notice inline">${icon('i-alert')}<div>This bike is missing ${missing.map((m) => `a ${ENTRY[m.p].label.toLowerCase()}`).join(' and ')}. The ride will be saved, and ${missing.length === 1 ? 'that part shows' : 'those parts show'} a gap for it.</div></div>` : ''}
        ${field('Name <span style="font-weight:400;color:var(--muted)">optional</span>', 'name', d.name, 'autocomplete="off"')}
        <div class="field-pair">${dateField('Started on', 'date', d.date)}${field('Distance (km)', 'km', d.km, 'inputmode="decimal" required placeholder="e.g. 65"')}</div>`;
    },
    submit: (d) => {
      const date = validDate(d.date);
      if (!date.ok) return { field: 'date', message: date.message };
      const km = Number(String(d.km).replace(',', '.'));
      if (!Number.isFinite(km) || km <= 0) return { field: 'km', message: 'Enter a distance above 0 km.' };
      state.rides.push({ id: nid('r'), bike: d.bike, start: date.value, metres: Math.round(km * 1000), name: d.name?.trim() || `Ride ${fmtShort(date.value)}` });
      state.selected = d.bike;
      const gaps = rideGaps(state.rides.at(-1)).length;
      toast(`Ride saved.${gaps ? ` ${plural(gaps, 'position')} not recorded for it.` : ''}`);
      return null;
    },
  });
}

/* ---------- Events ---------- */
function closeMenus() {
  document.querySelectorAll('.menu:not([hidden])').forEach((m) => { m.hidden = true; });
  document.querySelectorAll('[data-menu][aria-expanded=true]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('click', (ev) => {
  const menuBtn = ev.target.closest('[data-menu]');
  if (menuBtn) {
    const menu = document.getElementById(menuBtn.dataset.menu);
    const willOpen = menu.hidden;
    closeMenus();
    menu.hidden = !willOpen;
    menuBtn.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) menu.querySelector('button')?.focus();
    return;
  }
  if (!ev.target.closest('.menu')) closeMenus();
  const bikeBtn = ev.target.closest('[data-bike]');
  if (bikeBtn) { state.selected = bikeBtn.dataset.bike; render(); return; }
  if (ev.target.closest('[data-reset], #reset-demo')) { state = fixtures(); render(); toast('Preview reset.'); return; }
  const a = ev.target.closest('[data-action]');
  if (!a) return;
  closeMenus();
  const bike = bikeOf(state.selected);
  const install = a.dataset.install ? state.installations.find((i) => i.id === a.dataset.install) : null;
  switch (a.dataset.action) {
    case 'fit': partDialog(bike, a.dataset.position); break;
    case 'replace': partDialog(bike, install.position, install); break;
    case 'move': moveDialog(install.comp, install); break;
    case 'remove': removeDialog(install); break;
    case 'none-fitted': noneFittedDialog(bike, a.dataset.position); break;
    case 'tubeless': tubelessDialog(bike, a.dataset.position, true); break;
    case 'tubed': tubelessDialog(bike, a.dataset.position, false); break;
    case 'passport': passportDialog(a.dataset.comp); break;
    case 'edit-part': editPartDialog(a.dataset.comp); break;
    case 'fit-from-garage': moveDialog(a.dataset.comp, null); break;
    case 'edit-bike': bikeDialog(bike); break;
    case 'add-ride': rideDialog(); break;
    default: break;
  }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.querySelector('.menu:not([hidden])')) {
    const open = document.querySelector('[data-menu][aria-expanded=true]');
    closeMenus(); open?.focus();
  }
});
window.addEventListener('hashchange', render);
render();
