// ===== Storage keys =====
const CREDS_KEY = "mp_creds_v2";
const RUNS_KEY = "mp_runs_v2";
const SESSION_KEY = "mp_session_v2";

// ===== Helpers =====
function $(id) { return document.getElementById(id); }

function nowLocalDatetimeValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function loadCreds() {
  const raw = localStorage.getItem(CREDS_KEY);
  return raw ? JSON.parse(raw) : null;
}
function saveCreds(username, passHashHex) {
  localStorage.setItem(CREDS_KEY, JSON.stringify({ username, passHashHex }));
}

function loadRuns() {
  const raw = localStorage.getItem(RUNS_KEY);
  return raw ? JSON.parse(raw) : [];
}
function saveRuns(runs) {
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
}

function setSession(isLoggedIn) {
  sessionStorage.setItem(SESSION_KEY, isLoggedIn ? "1" : "0");
}
function getSession() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
}

function show(sectionId) {
  $("loginSection").classList.add("hidden");
  $("appSection").classList.add("hidden");
  $(sectionId).classList.remove("hidden");
}

// ===== Scoring model (Yes/No) =====
// Points:
// setup30: 50
// aslCopies/aslFormat/aslAccurate/aslLabels: 25 each
// 12 actions: 50 each
// startAction: 100
// bell: 100
// noAdjustments: 75

const ACTIONS = [
  "i. Wheel & axle raises 50g ≥15cm",
  "ii. Remove wedge so golf ball rolls ≥20cm",
  "iii. Screw action moves object 5cm horizontally",
  "iv. Inclined plane raises 100g object ≥10cm",
  "v. 2nd + 3rd class lever combo raises object 15cm",
  "vi. Pulley system raises object ≥15cm",
  "vii. Marble knocks 5 dominoes; last moves marble",
  "viii. 1st class lever launches ping pong ball out/top and back",
  "ix. Marble chain of 5; last moves ≥15cm",
  "x. Water raises golf ball ≥5cm then rolls out",
  "xi. Paddlewheel raises 50g object ≥5cm",
  "xii. Archimedes screw raises marble 20cm"
];

function ynPoints(selectId, pts) {
  return $(selectId).value === "yes" ? pts : 0;
}

function renderActions() {
  const wrap = $("actionsWrap");
  wrap.innerHTML = "";
  ACTIONS.forEach((label, i) => {
    const div = document.createElement("div");
    div.innerHTML = `
      <label>Action ${label} (50 pts)</label>
      <select id="act_${i}">
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    `;
    wrap.appendChild(div);
  });
}

function computeRuleScore() {
  let score = 0;

  score += ynPoints("setup30", 50);

  score += ynPoints("aslCopies", 25);
  score += ynPoints("aslFormat", 25);
  score += ynPoints("aslAccurate", 25);
  score += ynPoints("aslLabels", 25);

  for (let i = 0; i < 12; i++) {
    score += ynPoints(`act_${i}`, 50);
  }

  score += ynPoints("startAction", 100);
  score += ynPoints("bell", 100);
  score += ynPoints("noAdjustments", 75);

  return score;
}

function updateTotalPreview() {
  $("totalScore").value = String(computeRuleScore());
}

function wireScoreUpdates() {
  const ids = [
    "setup30","aslCopies","aslFormat","aslAccurate","aslLabels",
    "startAction","bell","noAdjustments",
    ...Array.from({ length: 12 }, (_, i) => `act_${i}`)
  ];
  ids.forEach(id => $(id).addEventListener("change", updateTotalPreview));
}

// ===== Table rendering =====
function safeText(s) {
  return String(s ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function summarizeRunDetails(r) {
  const condYes = [
    ["Setup≤30", r.setup30],
    ["ASL copies", r.aslCopies],
    ["ASL format", r.aslFormat],
    ["ASL accurate", r.aslAccurate],
    ["ASL labels", r.aslLabels],
    ["Start", r.startAction],
    ["Bell", r.bell],
    ["No adjust", r.noAdjustments],
  ].filter(x => x[1] === "yes").map(x => x[0]);

  const actionsYesCount = (r.actions || []).filter(v => v === "yes").length;

  return `Yes: ${condYes.join(", ") || "none"} • Actions yes: ${actionsYesCount}/12`;
}

function renderTable() {
  const runs = loadRuns().sort((a,b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const tbody = $("runsTable").querySelector("tbody");
  tbody.innerHTML = "";

  for (const r of runs) {
    const tr = document.createElement("tr");
    const dateStr = new Date(r.occurredAt).toLocaleString();
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td><b>${r.totalScore}</b></td>
      <td>${safeText(r.notes || "")}</td>
      <td><small>${safeText(summarizeRunDetails(r))}</small></td>
      <td><button data-del="${r.id}" class="secondary">Delete</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      const next = loadRuns().filter(r => r.id !== id);
      saveRuns(next);
      renderTable();
    });
  });
}

// ===== CSV export =====
function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

function exportCSV() {
  const runs = loadRuns().sort((a,b) => new Date(a.occurredAt) - new Date(b.occurredAt));

  const header = [
    "Run ID","Occurred At","Notes",
    "setup30","aslCopies","aslFormat","aslAccurate","aslLabels",
    "startAction","bell","noAdjustments",
    ...Array.from({length:12}, (_,i)=>`action_${i+1}`),
    "Total Score"
  ];

  const lines = [
    header.join(","),
    ...runs.map(r => {
      const row = [
        r.id,
        r.occurredAt,
        r.notes || "",
        r.setup30, r.aslCopies, r.aslFormat, r.aslAccurate, r.aslLabels,
        r.startAction, r.bell, r.noAdjustments,
        ...(r.actions || Array(12).fill("no")),
        r.totalScore
      ];
      return row.map(csvEscape).join(",");
    })
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "mission-possible-runs.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===== Login handlers =====
$("setCredsBtn").addEventListener("click", async () => {
  const u = $("username").value.trim();
  const p = $("password").value;
  if (!u || !p) {
    $("loginMsg").textContent = "Enter a username and password first.";
    return;
  }
  const hash = await sha256Hex(p);
  saveCreds(u, hash);
  $("loginMsg").textContent = "Login saved. Now press Log in.";
});

$("loginBtn").addEventListener("click", async () => {
  const creds = loadCreds();
  if (!creds) {
    $("loginMsg").textContent = "No login set yet. Enter username/password and click Set/Change Login.";
    return;
  }

  const u = $("username").value.trim();
  const p = $("password").value;

  const hash = await sha256Hex(p);
  if (u === creds.username && hash === creds.passHashHex) {
    setSession(true);
    initApp();
    show("appSection");
    $("loginMsg").textContent = "";
  } else {
    $("loginMsg").textContent = "Wrong username or password.";
  }
});

$("logoutBtn").addEventListener("click", () => {
  setSession(false);
  $("password").value = "";
  show("loginSection");
});

// ===== App handlers =====
$("exportBtn").addEventListener("click", exportCSV);

$("addRunBtn").addEventListener("click", () => {
  const occurredAt = $("occurredAt").value;
  const notes = $("notes").value.trim();

  if (!occurredAt) {
    $("appMsg").textContent = "Please set the date/time.";
    return;
  }

  const run = {
    id: uuid(),
    occurredAt: new Date(occurredAt).toISOString(),
    notes,

    setup30: $("setup30").value,
    aslCopies: $("aslCopies").value,
    aslFormat: $("aslFormat").value,
    aslAccurate: $("aslAccurate").value,
    aslLabels: $("aslLabels").value,
    startAction: $("startAction").value,
    bell: $("bell").value,
    noAdjustments: $("noAdjustments").value,

    actions: Array.from({ length: 12 }, (_, i) => $("act_" + i).value),
    totalScore: computeRuleScore(),
  };

  const runs = loadRuns();
  runs.push(run);
  saveRuns(runs);

  $("appMsg").textContent = "Saved!";
  $("notes").value = "";
  renderTable();
});

// ===== Init =====
function initApp() {
  $("occurredAt").value = nowLocalDatetimeValue();

  renderActions();
  wireScoreUpdates();
  updateTotalPreview();
  renderTable();

  $("appMsg").textContent = "";
}

// Auto-show correct screen
if (getSession()) {
  initApp();
  show("appSection");
} else {
  show("loginSection");
}
