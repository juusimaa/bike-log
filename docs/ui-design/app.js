/* Standalone, synthetic UI demonstration. No API calls or persistent storage. */
"use strict";

const DEMO_TIME = "2026-10-01T16:00:00Z";
const $ = (selector) => document.querySelector(selector);
const km = (metres) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(metres / 1000);
const money = (value) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
const dateLabel = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bikeSvg = (color, className = "") => `<svg class="${className}" style="--bike-color:${color}" aria-hidden="true" viewBox="0 0 600 300"><use href="#bike-art"></use></svg>`;

function seedData() {
  const bikes = [
    { id: "gravel", name: "The everyday escape", make: "Canyon", model: "Grizl 7", type: "Gravel", color: "#829c83", year: "2025", threshold: 150000 },
    { id: "road", name: "", make: "Specialized", model: "Allez", type: "Road", color: "#859db5", year: "2023", threshold: 200000 },
  ];
  const components = [];
  const installations = [];
  for (const bike of bikes) {
    for (const [position, name, category, estimate] of [
      ["chain", bike.id === "gravel" ? "Shimano CN-HG601" : "Shimano CN-HG701", "Chain", 0],
      ["cassette", "Shimano 105 · 11–34T", "Cassette", 0],
      ["front-tyre", bike.id === "gravel" ? "Schwalbe G-One · 45 mm" : "Continental GP5000 · 28 mm", "Front tyre", 120000],
      ["rear-tyre", bike.id === "gravel" ? "Schwalbe G-One · 45 mm" : "Continental GP5000 · 28 mm", "Rear tyre", 120000],
    ]) {
      const id = `${bike.id}-${position}`;
      components.push({ id, name, category, position, estimate });
      installations.push({ id: `install-${id}`, componentId: id, bikeId: bike.id, start: "2026-06-01T07:00:00Z", end: null });
    }
  }
  // Chain replacement separates identities and uses [start, end) intervals.
  const previous = installations.find((i) => i.componentId === "gravel-chain");
  previous.end = "2026-09-01T08:00:00Z";
  components.push({ id: "gravel-chain-new", name: "Shimano CN-HG601", category: "Chain", position: "chain", estimate: 0 });
  installations.push({ id: "install-gravel-chain-new", componentId: "gravel-chain-new", bikeId: "gravel", start: previous.end, end: null });
  const rides = [
    ["Jun 08", 62, "Lakeside loop"], ["Jun 20", 48, "After-work escape"], ["Jul 05", 81, "Long way home"],
    ["Jul 18", 43, "Coffee and gravel"], ["Aug 02", 74, "Forest roads"], ["Aug 14", 38, "Evening spin"],
    ["Aug 26", 91, "Coast and countryside"], ["Sep 05", 56, "First autumn miles"], ["Sep 12", 42, "Through the woods"],
    ["Sep 19", 68, "Weekend wander"], ["Sep 23", 47, "Evening gravel"], ["Sep 27", 72, "Sunday coffee loop"],
    ["Oct 01", 65, "Autumn gravel loop"],
  ].map(([day, distance, name], index) => ({ id: `gravel-ride-${index}`, bikeId: "gravel", name, start: new Date(`${day} 2026 08:00:00 GMT`).toISOString(), metres: distance * 1000, seconds: Math.round(distance / 22 * 3600) }));
  for (const [index, [day, distance, name]] of [["Jun 14", 82, "Country lanes"], ["Jul 12", 106, "The big Sunday"], ["Aug 09", 64, "Rolling hills"], ["Sep 13", 78, "A quiet morning"], ["Sep 28", 54, "Coffee club"]].entries()) {
    rides.push({ id: `road-ride-${index}`, bikeId: "road", name, start: new Date(`${day} 2026 09:00:00 GMT`).toISOString(), metres: distance * 1000, seconds: Math.round(distance / 28 * 3600) });
  }
  const maintenance = [
    { id: "service-1", bikeId: "gravel", componentId: "gravel-chain", task: "Lubricate chain", performed: "2026-08-15T10:00:00Z", notes: "Cleaned and applied wet-weather lubricant.", cost: 0 },
    { id: "service-2", bikeId: "gravel", componentId: "gravel-chain-new", task: "Replace chain", performed: "2026-09-01T08:00:00Z", notes: "New chain fitted. Previous chain retained in history.", cost: 24.90 },
    { id: "service-3", bikeId: "gravel", componentId: "gravel-chain-new", task: "Lubricate chain", performed: "2026-09-20T10:00:00Z", notes: "Drivetrain cleaned after a wet ride.", cost: 0 },
    { id: "service-4", bikeId: "road", componentId: null, task: "General inspection", performed: "2026-09-15T12:00:00Z", notes: "Checked bolts, tyres and brakes.", cost: 0 },
    { id: "service-5", bikeId: "road", componentId: "road-chain", task: "Lubricate chain", performed: "2026-09-15T12:00:00Z", notes: "Fresh lubricant before the next ride.", cost: 0 },
  ];
  return { bikes, components, installations, rides, maintenance };
}

let data = seedData();
let selectedBike = "gravel";
let currentView = "overview";
let entryKind = "ride";
let componentFilter = "current";
let toastTimer;
const bike = () => data.bikes.find((b) => b.id === selectedBike);
const bikeModel = (b) => `${b.make} ${b.model}`;
const bikeName = (b) => b.name.trim() || bikeModel(b);
const bikeRides = () => data.rides.filter((r) => r.bikeId === selectedBike).sort((a, b) => b.start.localeCompare(a.start));
const bikeMaintenance = () => data.maintenance.filter((m) => m.bikeId === selectedBike).sort((a, b) => b.performed.localeCompare(a.performed));
const currentInstallations = () => data.installations.filter((i) => i.bikeId === selectedBike && !i.end);
const component = (id) => data.components.find((c) => c.id === id);
const chainInstallation = () => currentInstallations().find((i) => component(i.componentId).position === "chain");
function isWithin(instant, installation) { return instant >= installation.start && (!installation.end || instant < installation.end); }
function usage(componentId, installationId = null) {
  return data.rides.filter((r) => data.installations.some((i) => i.componentId === componentId && (!installationId || i.id === installationId) && i.bikeId === r.bikeId && isWithin(r.start, i))).reduce((total, r) => total + r.metres, 0);
}
function chainReminder() {
  const install = chainInstallation();
  const last = bikeMaintenance().find((m) => m.componentId === install.componentId && m.task === "Lubricate chain");
  const baseline = last ? last.performed : install.start;
  const distance = bikeRides().filter((r) => isWithin(r.start, install) && r.start >= baseline).reduce((sum, r) => sum + r.metres, 0);
  return { distance, threshold: bike().threshold, last, due: distance >= bike().threshold };
}
function hasGap(ride) {
  return !data.installations.some((i) => i.bikeId === ride.bikeId && component(i.componentId).position === "chain" && isWithin(ride.start, i));
}
function showToast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3400);
}
function render() {
  const titles = { overview: ["Your garage, in good order.", "A little attention today. A better ride tomorrow."], components: ["Every part has a story.", "See what’s fitted, what’s been replaced, and the miles in between."], rides: ["Miles worth remembering.", "Your rides, and the components that came along."], maintenance: ["Care that goes the distance.", "A useful history of the little things that keep you rolling."] };
  $("#page-title").textContent = titles[currentView][0];
  $("#page-subtitle").textContent = titles[currentView][1];
  $("#breadcrumb").textContent = currentView[0].toUpperCase() + currentView.slice(1);
  document.querySelectorAll("[data-view]").forEach((link) => {
    const active = link.dataset.view === currentView;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  $("#nav-count").textContent = chainReminder().due ? "1" : "";
  $("#nav-count").hidden = !chainReminder().due;
  $("#bike-selector").innerHTML = data.bikes.map((b) => `<button class="bike-choice ${b.id === selectedBike ? "active" : ""}" type="button" data-bike="${b.id}" aria-pressed="${b.id === selectedBike}">${bikeSvg(b.color)}<span><strong>${escapeHtml(bikeName(b))}</strong><small>${escapeHtml(bikeModel(b))} · ${b.type} · ${b.year}</small></span>${b.id === selectedBike ? '<span class="choice-dot"></span>' : ""}</button>`).join("");
  const gaps = bikeRides().filter(hasGap);
  const gapNotice = gaps.length ? `<div class="gap-notice">${gaps.length} ride${gaps.length === 1 ? " has" : "s have"} no chain installation at its start time. Those miles are recorded for the bike but not assigned to a chain.</div>` : "";
  $("#view-content").innerHTML = gapNotice + ({ overview: renderOverview, components: renderComponents, rides: renderRides, maintenance: renderMaintenance }[currentView])();
}
function renderStats() {
  const rides = bikeRides();
  const total = rides.reduce((sum, r) => sum + r.metres, 0);
  const maintenance = bikeMaintenance();
  return `<section class="stats" aria-label="Bike summary"><div class="card stat"><div class="stat-label">Recorded distance <span>↗</span></div><div class="stat-value">${km(total)}<small>km</small></div><p class="stat-caption">${rides.length} rides since June</p></div><div class="card stat"><div class="stat-label">Current chain <span>⌁</span></div><div class="stat-value">${km(usage(chainInstallation().componentId))}<small>km</small></div><p class="stat-caption">Calculated lifetime distance</p></div><div class="card stat"><div class="stat-label">Maintenance spend <span>€</span></div><div class="stat-value">${money(maintenance.reduce((sum, m) => sum + m.cost, 0))}</div><p class="stat-caption">${maintenance.length} service records</p></div></section>`;
}
function renderReminder() {
  const reminder = chainReminder();
  const remaining = Math.max(0, reminder.threshold - reminder.distance);
  return `<aside class="card service-card"><div class="card-title"><h2>A little attention</h2><span class="count">${reminder.due ? "1 reminder" : "Up to date"}</span></div><div class="service-header"><span class="service-symbol">⌁</span><div><h3>Lubricate your chain</h3><small>${escapeHtml(bikeName(bike()))}</small></div></div><span class="status ${reminder.due ? "amber" : "green"}">${reminder.due ? "◷ Service reminder" : "✓ Looking good"}</span><div class="progress"><span style="width:${Math.min(100, reminder.distance / reminder.threshold * 100)}%"></span></div><div class="progress-labels"><span>${km(reminder.distance)} km since ${reminder.last ? "service" : "installation"}</span><span>${km(reminder.threshold)} km</span></div><button class="button secondary" data-action="lubricate">${reminder.due ? "Log chain lubrication" : "Log maintenance"}<span>↗</span></button><p class="service-footnote">${reminder.last ? `Last lubricated ${dateLabel(reminder.last.performed)}.` : "No lubrication logged for this chain."} ${remaining > 0 ? `${km(remaining)} km to your reminder.` : "Your distance threshold has been reached."}<br>Reminders follow your chosen interval.</p><button class="text-button" style="margin-top:10px" data-action="threshold">Edit reminder interval</button></aside>`;
}
function renderOverview() {
  const b = bike();
  return `<div class="dashboard-grid"><section class="card hero"><div class="hero-top"><div><h2>${escapeHtml(bikeName(b))}</h2><p>${escapeHtml(bikeModel(b))} · ${b.type} · ${b.year}</p></div><div class="hero-actions"><span class="label-pill">YOUR ${b.type.toUpperCase()} BIKE</span><button class="text-button" data-action="bike-name">Edit bike name</button></div></div>${bikeSvg(b.color)}<div class="hero-bottom"><span>● ${currentInstallations().length} components fitted</span><button data-go="components">Explore components ↗</button></div></section>${renderReminder()}</div>${renderStats()}<div class="content-grid"><section class="card table-card"><div class="card-title"><h2>Currently on your bike</h2><a href="#components">View all ↗</a></div>${componentTable(currentInstallations())}</section><aside class="card activity-card"><div class="card-title"><h2>The latest chapter</h2><span class="count">RECENT ACTIVITY</span></div><div class="activity-list">${recentActivity()}</div></aside></div>`;
}
function componentTable(installations) {
  return `<div class="table-wrap"><table><thead><tr><th>Component</th><th>Lifetime</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${installations.map((i) => {
    const c = component(i.componentId);
    const due = !i.end && c.position === "chain" && chainReminder().due;
    return `<tr><td><div class="item-name"><span class="part-icon">${c.position === "chain" ? "⌁" : c.position === "cassette" ? "⚙" : "◯"}</span><span><strong>${c.category}</strong><small>${escapeHtml(c.name)}</small></span></div></td><td class="number">${km(usage(c.id) + c.estimate)} km${c.estimate ? '<small class="estimate-label">Includes estimate</small>' : ""}</td><td><span class="status ${i.end ? "gray" : due ? "amber" : "green"}">${i.end ? "Archived" : due ? "Service reminder" : "Fitted"}</span></td><td><div class="component-actions">${!i.end ? `<button class="text-button" data-action="replace" data-replace-component="${c.id}" aria-label="Replace ${c.category.toLowerCase()}">Replace</button>` : ""}<button class="row-button" data-component="${c.id}" aria-label="View ${c.category.toLowerCase()} history">↗</button></div></td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function recentActivity() {
  const activity = [...bikeRides().map((r) => ({ title: r.name, subtitle: `${km(r.metres)} km · Manual ride`, date: r.start, kind: "ride" })), ...bikeMaintenance().map((m) => ({ title: m.task, subtitle: m.componentId ? component(m.componentId).name : "Bike maintenance", date: m.performed, kind: "maintenance" }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  return activity.map((a) => `<div class="activity ${a.kind}"><span class="activity-icon">${a.kind === "ride" ? "↗" : "⌁"}</span><div><strong>${escapeHtml(a.title)}</strong><p>${escapeHtml(a.subtitle)}</p><time datetime="${a.date}">${dateLabel(a.date)}</time></div></div>`).join("");
}
function renderComponents() {
  const installations = data.installations.filter((i) => i.bikeId === selectedBike && (componentFilter === "all" || !i.end));
  return `${renderStats()}<section class="card table-card"><div class="card-title"><h2>Component collection</h2><button class="button secondary" data-action="replace">Replace component ↗</button></div><div class="section-intro"><p>Lifetime mileage stays with the component.<br>Open a component to see calculated usage and installation history.</p><select class="filter" id="component-filter" aria-label="Filter components"><option value="current" ${componentFilter === "current" ? "selected" : ""}>Currently fitted</option><option value="all" ${componentFilter === "all" ? "selected" : ""}>Include replaced parts</option></select></div>${componentTable(installations)}</section>`;
}
function renderRides() {
  return `${renderStats()}<section class="card table-card"><div class="card-title"><h2>Your ride log</h2><span class="count">${bikeRides().length} RIDES</span></div><div class="section-intro"><p>Each ride belongs to the components fitted at its start.<br>Times are shown in your browser’s local timezone.</p></div><div class="table-wrap"><table class="full-table"><thead><tr><th>Ride</th><th>Date</th><th>Distance</th><th>Duration</th><th>Allocation</th></tr></thead><tbody>${bikeRides().map((r) => `<tr><td><strong>${escapeHtml(r.name)}</strong></td><td>${dateLabel(r.start)}</td><td>${km(r.metres)} km</td><td>${r.seconds === null ? "Not recorded" : `${Math.round(r.seconds / 60)} min`}</td><td><span class="status ${hasGap(r) ? "amber" : "green"}">${hasGap(r) ? "Chain history gap" : "Allocated"}</span></td></tr>`).join("")}</tbody></table></div></section>`;
}
function renderMaintenance() {
  return `${renderStats()}<div class="content-grid"><section class="card table-card"><div class="card-title"><h2>Maintenance history</h2><span class="count">${bikeMaintenance().length} RECORDS</span></div><p class="dialog-description">Service creates a new chapter. It never resets a component’s lifetime mileage.</p><div class="table-wrap"><table class="full-table"><thead><tr><th>Work performed</th><th>Date</th><th>Component</th><th>Cost</th></tr></thead><tbody>${bikeMaintenance().map((m) => `<tr><td><strong>${escapeHtml(m.task)}</strong><small class="maintenance-note">${escapeHtml(m.notes || "No notes")}</small></td><td>${dateLabel(m.performed)}</td><td>${m.componentId ? escapeHtml(component(m.componentId).category) : "Whole bike"}</td><td>${money(m.cost)}</td></tr>`).join("")}</tbody></table></div></section>${renderReminder()}</div>`;
}
function localDateTime(iso = DEMO_TIME) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
const field = (label, content, hint = "") => `<label class="field">${label}${content}${hint ? `<small>${hint}</small>` : ""}</label>`;
function openEntry(kind, componentId = null) {
  entryKind = kind;
  $("#form-error").textContent = "";
  $("#dialog-eyebrow").textContent = bikeName(bike());
  const timeField = field(kind === "replace" ? "Replacement time" : "Date and time", `<input name="instant" type="datetime-local" value="${localDateTime()}" required>`, "Displayed in your local timezone.");
  if (kind === "ride") {
    $("#dialog-title").textContent = "A few more miles.";
    $("#submit-entry").textContent = "Save ride";
    $("#form-fields").innerHTML = field("Ride name", '<input name="name" placeholder="e.g. The long way home" maxlength="100" required>') + timeField + `<div class="field-pair">${field("Distance · km", '<input name="distance" type="number" min="0.001" max="10000" step="0.001" placeholder="65" required>')}${field("Duration · minutes", '<input name="duration" type="number" min="1" max="100000" step="1" placeholder="Optional">')}</div><p class="dialog-description">Miles are allocated to components fitted when this ride started.</p>`;
  } else if (kind === "service" || kind === "lubricate") {
    $("#dialog-title").textContent = "Give your bike some care.";
    $("#submit-entry").textContent = "Save maintenance";
    const chain = chainInstallation().componentId;
    const options = currentInstallations().map((i) => `<option value="${i.componentId}" ${kind === "lubricate" && i.componentId === chain ? "selected" : ""}>${component(i.componentId).category} · ${escapeHtml(component(i.componentId).name)}</option>`).join("");
    $("#form-fields").innerHTML = field("Task", `<select name="task"><option>Lubricate chain</option><option>Clean drivetrain</option><option>Inspect chain</option><option>Check tyre pressure</option><option ${kind === "service" ? "selected" : ""}>General inspection</option></select>`) + field("For", `<select name="componentId"><option value="">Whole bike</option>${options}</select>`) + timeField + field("Notes", '<textarea name="notes" rows="2" maxlength="500" placeholder="What did you do?"></textarea>') + field("Cost · EUR", '<input name="cost" type="number" min="0" max="100000" step="0.01" placeholder="Optional">');
  } else if (kind === "replace") {
    $("#dialog-title").textContent = "New part. Next chapter.";
    $("#submit-entry").textContent = "Replace component";
    const selectedId = componentId || chainInstallation().componentId;
    const options = currentInstallations().map((i) => {
      const c = component(i.componentId);
      return `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${c.category} · ${escapeHtml(c.name)}</option>`;
    }).join("");
    $("#form-fields").innerHTML = '<p class="dialog-description">The selected component moves into history with its mileage intact. The new part starts at zero calculated kilometres.</p>' + field("Component to replace", `<select name="componentId">${options}</select>`) + field("New component model", '<input name="model" placeholder="Make and model of the new part" maxlength="100" required>') + timeField + field("Cost · EUR", '<input name="cost" type="number" min="0" max="100000" step="0.01" placeholder="Optional">');
  } else if (kind === "bike-name") {
    $("#dialog-title").textContent = "Make it your own.";
    $("#submit-entry").textContent = "Save bike name";
    $("#form-fields").innerHTML = field("Bike name", `<input name="name" value="${escapeHtml(bike().name)}" placeholder="${escapeHtml(bikeModel(bike()))}" maxlength="100">`, `Leave blank to use ${escapeHtml(bikeModel(bike()))}.`);
  } else {
    $("#dialog-title").textContent = "Your reminder, your rhythm.";
    $("#submit-entry").textContent = "Save interval";
    $("#form-fields").innerHTML = field("Remind me to lubricate every · km", `<input name="threshold" type="number" min="1" max="10000" step="1" value="${bike().threshold / 1000}" required>`) + '<p class="dialog-description">This is your service prompt, not a measurement of chain wear or a guarantee of safety.</p>';
  }
  $("#entry-dialog").showModal();
}
function saveEntry(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  const id = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const instant = values.instant ? new Date(values.instant).toISOString() : null;
  const fail = (message) => { $("#form-error").textContent = message; };
  let message;
  if (entryKind === "ride") {
    if (!values.name.trim()) return fail("Give this ride a name.");
    data.rides.push({ id, bikeId: selectedBike, name: values.name.trim(), start: instant, metres: Math.round(Number(values.distance) * 1000), seconds: values.duration ? Number(values.duration) * 60 : null });
    message = "Ride saved. Component mileage updated.";
  } else if (entryKind === "service" || entryKind === "lubricate") {
    if (values.componentId && !data.installations.some((i) => i.bikeId === selectedBike && i.componentId === values.componentId && isWithin(instant, i))) return fail("That component was not fitted at this time. Choose a date within its installation or record whole-bike maintenance.");
    if (values.task === "Lubricate chain" && (!values.componentId || component(values.componentId).position !== "chain")) return fail("Choose the chain to update its lubrication reminder.");
    data.maintenance.push({ id, bikeId: selectedBike, componentId: values.componentId || null, task: values.task, performed: instant, notes: values.notes.trim(), cost: Number(values.cost || 0) });
    message = "Maintenance saved. Lifetime mileage preserved.";
  } else if (entryKind === "replace") {
    const old = currentInstallations().find((i) => i.componentId === values.componentId);
    if (!old) return fail("Choose a currently fitted component to replace.");
    const previous = component(old.componentId);
    if (!values.model.trim()) return fail("Enter the new component model.");
    if (instant <= old.start) return fail("The replacement must be after this component was installed.");
    if (data.maintenance.some((m) => m.componentId === old.componentId && m.performed >= instant)) return fail("Existing maintenance belongs to this component after that time. Choose a later replacement time.");
    old.end = instant;
    data.components.push({ id, name: values.model.trim(), category: previous.category, position: previous.position, estimate: 0 });
    data.installations.push({ id: `install-${id}`, componentId: id, bikeId: selectedBike, start: instant, end: null });
    data.maintenance.push({ id: `service-${id}`, bikeId: selectedBike, componentId: id, task: `Replace ${previous.category.toLowerCase()}`, performed: instant, notes: "New component fitted. Previous component retained in history.", cost: Number(values.cost || 0) });
    componentFilter = "all";
    message = `${previous.category} replaced. The previous component is in history.`;
  } else if (entryKind === "bike-name") {
    bike().name = values.name.trim();
    message = "Bike name updated.";
  } else {
    bike().threshold = Number(values.threshold) * 1000;
    message = "Reminder interval updated.";
  }
  $("#entry-dialog").close();
  render();
  showToast(message);
}
function openComponent(id) {
  const c = component(id);
  const installs = data.installations.filter((i) => i.componentId === id);
  const current = installs.find((i) => !i.end);
  $("#component-title").textContent = c.name;
  const services = data.maintenance.filter((m) => m.componentId === id).sort((a, b) => b.performed.localeCompare(a.performed));
  $("#component-details").innerHTML = `<p class="dialog-description">${c.category} · ${current ? "Currently fitted" : "Retained in component history"}</p><div class="detail-stats"><div><span>Calculated lifetime</span><strong>${km(usage(id))} <small>km</small></strong></div><div><span>${current ? "Current installation" : "Last installation"}</span><strong>${km(usage(id, (current || installs.at(-1)).id))} <small>km</small></strong></div></div>${c.estimate ? `<p class="dialog-description">Starting estimate: ${km(c.estimate)} km, entered separately from calculated mileage. Combined total: ${km(usage(id) + c.estimate)} km.</p>` : ""}<div class="detail-section"><h3>Installation history</h3>${installs.map((i) => `<p><strong>${escapeHtml(bikeName(data.bikes.find((b) => b.id === i.bikeId)))}</strong><br>${dateLabel(i.start)} ${new Date(i.start).getFullYear()} → ${i.end ? `${dateLabel(i.end)} ${new Date(i.end).getFullYear()}` : "Present"} · ${km(usage(id, i.id))} km</p>`).join("")}</div><div class="detail-section"><h3>Maintenance history</h3>${services.length ? services.map((m) => `<p><strong>${escapeHtml(m.task)}</strong> · ${dateLabel(m.performed)}<br>${escapeHtml(m.notes || "No notes")}</p>`).join("") : '<p>No maintenance recorded for this component.</p>'}</div>${current ? `<div class="dialog-actions"><button class="button secondary" data-action="replace" data-replace-component="${c.id}">Replace this ${c.category.toLowerCase()} ↗</button></div>` : ""}`;
  $("#component-dialog").showModal();
}
function setViewFromHash() {
  const view = location.hash.slice(1);
  currentView = ["overview", "components", "rides", "maintenance"].includes(view) ? view : "overview";
  render();
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.hasAttribute("data-close")) target.closest("dialog").close();
  if (target.dataset.bike) { selectedBike = target.dataset.bike; render(); }
  if (target.dataset.go) location.hash = target.dataset.go;
  if (target.dataset.component) openComponent(target.dataset.component);
  if (target.dataset.action) { $("#component-dialog").close(); openEntry(target.dataset.action, target.dataset.replaceComponent); }
  if (target.id === "reset-demo" || target.hasAttribute("data-reset")) { data = seedData(); selectedBike = "gravel"; componentFilter = "current"; render(); showToast("Demo restored to its original data."); }
});
document.addEventListener("change", (event) => { if (event.target.id === "component-filter") { componentFilter = event.target.value; render(); } });
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } }));
$("#entry-form").addEventListener("submit", saveEntry);
window.addEventListener("hashchange", setViewFromHash);
setViewFromHash();
