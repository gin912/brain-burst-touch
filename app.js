/* Brain Burst Touch - single-file vanilla JS app */

const STORAGE_KEY = "bbt.history.v1";
const STORAGE_SETTINGS_KEY = "bbt.settings.v1";
const APP_VERSION = "20260421-1";

/** @typedef {"free" | "timed"} Mode */

/** @type {{mode: Mode, timedMinutes: number, tempoMax: number, accelSeconds: number, centerBias: number}} */
let settings = {
  mode: "free",
  timedMinutes: 10,
  tempoMax: 7.0, // taps per second
  accelSeconds: 30,
  centerBias: 75,
};

const DEFAULTS = {
  tempo: { light: 5.0, normal: 7.0, hard: 9.0 },
  accelSeconds: { fast: 10, std: 30, slow: 60 },
};

const ui = {
  modeLabel: byId("modeLabel"),

  screenSettings: byId("screenSettings"),
  screenPlay: byId("screenPlay"),
  screenResult: byId("screenResult"),

  goSettingsBtn: byId("goSettingsBtn"),

  modeFreeBtn: byId("modeFreeBtn"),
  modeTimedBtn: byId("modeTimedBtn"),
  timedDurationField: byId("timedDurationField"),
  timedMinutes: byId("timedMinutes"),

  tempoLightBtn: byId("tempoLightBtn"),
  tempoNormalBtn: byId("tempoNormalBtn"),
  tempoHardBtn: byId("tempoHardBtn"),
  tempoMax: byId("tempoMax"),
  tempoMaxLabel: byId("tempoMaxLabel"),

  accelFastBtn: byId("accelFastBtn"),
  accelStdBtn: byId("accelStdBtn"),
  accelSlowBtn: byId("accelSlowBtn"),
  accelSeconds: byId("accelSeconds"),
  accelSecondsLabel: byId("accelSecondsLabel"),

  centerBias: byId("centerBias"),
  centerBiasLabel: byId("centerBiasLabel"),

  startBtn: byId("startBtn"),
  clearHistoryBtn: byId("clearHistoryBtn"),
  historyList: byId("historyList"),

  arena: byId("arena"),
  target: byId("target"),

  tapCount: byId("tapCount"),
  missCount: byId("missCount"),
  actualTempo: byId("actualTempo"),
  targetTempo: byId("targetTempo"),
  timeLeft: byId("timeLeft"),

  exitHoldBtn: byId("exitHoldBtn"),
  exitHoldFill: byId("exitHoldFill"),

  rTotal: byId("rTotal"),
  rMiss: byId("rMiss"),
  rAvg: byId("rAvg"),
  rBest: byId("rBest"),
  rReach: byId("rReach"),
  rMode: byId("rMode"),
  playAgainBtn: byId("playAgainBtn"),
  backToSettingsBtn: byId("backToSettingsBtn"),
};

/** @type {{running: boolean, startNow: number, endNow: number | null, targetVisible: boolean, spawnTime: number, targetDeadline: number, nextSpawnTime: number, lastHitTime: number | null, firstHitTime: number | null, tapCount: number, missCount: number, bestTempo: number, reachMaxAtMs: number | null, avgTempo: number}} */
let game = resetGame();

let rafId = 0;
let holdTimer = null;
let holdStart = 0;
const HOLD_MS = 900;

init();

function init() {
  loadSettings();
  applySettingsToUI();
  renderHistory();

  ui.modeLabel.title = `v${APP_VERSION}`;

  ui.goSettingsBtn.addEventListener("click", () => showScreen("settings"));

  ui.modeFreeBtn.addEventListener("click", () => setMode("free"));
  ui.modeTimedBtn.addEventListener("click", () => setMode("timed"));
  ui.timedMinutes.addEventListener("change", () => {
    settings.timedMinutes = clampInt(parseInt(ui.timedMinutes.value, 10), 1, 120);
    saveSettings();
  });

  presetButton(ui.tempoLightBtn, () => setTempoPreset("light"));
  presetButton(ui.tempoNormalBtn, () => setTempoPreset("normal"));
  presetButton(ui.tempoHardBtn, () => setTempoPreset("hard"));
  ui.tempoMax.addEventListener("input", () => {
    settings.tempoMax = round1(parseFloat(ui.tempoMax.value));
    ui.tempoMaxLabel.textContent = settings.tempoMax.toFixed(1);
    clearPresetActive([ui.tempoLightBtn, ui.tempoNormalBtn, ui.tempoHardBtn]);
    saveSettings();
  });

  presetButton(ui.accelFastBtn, () => setAccelPreset("fast"));
  presetButton(ui.accelStdBtn, () => setAccelPreset("std"));
  presetButton(ui.accelSlowBtn, () => setAccelPreset("slow"));
  ui.accelSeconds.addEventListener("input", () => {
    settings.accelSeconds = clampInt(parseInt(ui.accelSeconds.value, 10), 5, 120);
    ui.accelSecondsLabel.textContent = `${settings.accelSeconds}s`;
    clearPresetActive([ui.accelFastBtn, ui.accelStdBtn, ui.accelSlowBtn]);
    saveSettings();
  });

  ui.centerBias.addEventListener("input", () => {
    settings.centerBias = clampInt(parseInt(ui.centerBias.value, 10), 0, 100);
    ui.centerBiasLabel.textContent = `${settings.centerBias}%`;
    saveSettings();
  });

  ui.startBtn.addEventListener("click", startGame);

  ui.target.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!game.running || !game.targetVisible) return;
    onHit();
  });

  ui.exitHoldBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!game.running) return;
    startHoldExit();
  });
  ui.exitHoldBtn.addEventListener("pointerup", cancelHoldExit);
  ui.exitHoldBtn.addEventListener("pointercancel", cancelHoldExit);
  ui.exitHoldBtn.addEventListener("pointerleave", cancelHoldExit);

  document.addEventListener("keydown", (e) => {
    if (!game.running) return;
    if (e.key === "Escape") finishGame("esc");
  });

  ui.playAgainBtn.addEventListener("click", () => startGame());
  ui.backToSettingsBtn.addEventListener("click", () => showScreen("settings"));
  ui.clearHistoryBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
  });

  setMode(settings.mode);
  showScreen("settings");
}

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}

function showScreen(which) {
  ui.screenSettings.classList.toggle("screen--active", which === "settings");
  ui.screenPlay.classList.toggle("screen--active", which === "play");
  ui.screenResult.classList.toggle("screen--active", which === "result");

  ui.goSettingsBtn.style.visibility = which === "play" ? "hidden" : "visible";
  ui.modeLabel.textContent =
    which === "settings" ? "設定" : which === "play" ? (settings.mode === "timed" ? "集中" : "フリー") : "結果";
}

function setMode(mode) {
  settings.mode = mode;
  ui.modeFreeBtn.classList.toggle("is-active", mode === "free");
  ui.modeTimedBtn.classList.toggle("is-active", mode === "timed");
  ui.timedDurationField.style.display = mode === "timed" ? "flex" : "none";
  saveSettings();
}

function presetButton(btn, fn) {
  btn.addEventListener("click", () => {
    fn();
  });
}

function setTempoPreset(name) {
  settings.tempoMax = DEFAULTS.tempo[name];
  ui.tempoMax.value = String(settings.tempoMax);
  ui.tempoMaxLabel.textContent = settings.tempoMax.toFixed(1);
  setPresetActive([ui.tempoLightBtn, ui.tempoNormalBtn, ui.tempoHardBtn], name);
  saveSettings();
}

function setAccelPreset(name) {
  settings.accelSeconds = DEFAULTS.accelSeconds[name];
  ui.accelSeconds.value = String(settings.accelSeconds);
  ui.accelSecondsLabel.textContent = `${settings.accelSeconds}s`;
  setPresetActive([ui.accelFastBtn, ui.accelStdBtn, ui.accelSlowBtn], name);
  saveSettings();
}

function setPresetActive(buttons, name) {
  // mapping by id suffix
  const map = {
    light: ui.tempoLightBtn,
    normal: ui.tempoNormalBtn,
    hard: ui.tempoHardBtn,
    fast: ui.accelFastBtn,
    std: ui.accelStdBtn,
    slow: ui.accelSlowBtn,
  };
  for (const b of buttons) b.classList.remove("is-active");
  if (map[name]) map[name].classList.add("is-active");
}

function clearPresetActive(buttons) {
  for (const b of buttons) b.classList.remove("is-active");
}

function applySettingsToUI() {
  ui.timedMinutes.value = String(settings.timedMinutes);
  ui.tempoMax.value = String(settings.tempoMax);
  ui.tempoMaxLabel.textContent = settings.tempoMax.toFixed(1);
  ui.accelSeconds.value = String(settings.accelSeconds);
  ui.accelSecondsLabel.textContent = `${settings.accelSeconds}s`;
  ui.centerBias.value = String(settings.centerBias);
  ui.centerBiasLabel.textContent = `${settings.centerBias}%`;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    settings = {
      ...settings,
      ...parsed,
      tempoMax: clampNumber(Number(parsed.tempoMax ?? settings.tempoMax), 3, 12),
      accelSeconds: clampInt(Number(parsed.accelSeconds ?? settings.accelSeconds), 5, 120),
      timedMinutes: clampInt(Number(parsed.timedMinutes ?? settings.timedMinutes), 1, 120),
      centerBias: clampInt(Number(parsed.centerBias ?? settings.centerBias), 0, 100),
      mode: parsed.mode === "timed" ? "timed" : "free",
    };
  } catch {
    // ignore
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
}

function resetGame() {
  return {
    running: false,
    startNow: 0,
    endNow: null,
    targetVisible: false,
    spawnTime: 0,
    targetDeadline: 0,
    nextSpawnTime: 0,
    lastHitTime: null,
    firstHitTime: null,
    tapCount: 0,
    missCount: 0,
    bestTempo: 0,
    reachMaxAtMs: null,
    avgTempo: 0,
  };
}

function startGame() {
  stopLoop();
  game = resetGame();
  game.running = true;
  game.startNow = performance.now();
  game.endNow =
    settings.mode === "timed" ? game.startNow + settings.timedMinutes * 60 * 1000 : null;
  game.nextSpawnTime = game.startNow;

  ui.tapCount.textContent = "0";
  ui.missCount.textContent = "0";
  ui.actualTempo.textContent = "0.0";
  ui.targetTempo.textContent = "0.0";
  ui.timeLeft.textContent = settings.mode === "timed" ? fmtMs(game.endNow - game.startNow) : "--:--";
  ui.exitHoldFill.style.width = "0%";

  ui.target.classList.remove("is-hit", "is-missFlash");
  ui.target.classList.add("is-hidden");
  showScreen("play");
  startLoop();
}

function finishGame(reason) {
  if (!game.running) return;
  game.running = false;
  stopLoop();
  cancelHoldExit();
  ui.target.classList.add("is-hidden");

  const summary = computeSummary();
  persistHistory(summary);
  renderHistory();
  showResult(summary);
  showScreen("result");
}

function showResult(s) {
  ui.rTotal.textContent = String(s.totalTaps);
  ui.rMiss.textContent = String(s.missCount);
  ui.rAvg.textContent = s.avgTempo.toFixed(1);
  ui.rBest.textContent = s.bestTempo.toFixed(1);
  ui.rReach.textContent = s.reachMaxAt ? fmtSeconds(s.reachMaxAt) : "—";
  ui.rMode.textContent = s.modeLabel;
}

function computeSummary() {
  const totalTaps = game.tapCount;
  const avgTempo = totalTaps >= 2 && game.firstHitTime != null && game.lastHitTime != null
    ? ((totalTaps - 1) / ((game.lastHitTime - game.firstHitTime) / 1000))
    : 0;
  const modeLabel = settings.mode === "timed" ? `集中 ${settings.timedMinutes}分` : "フリー";
  return {
    at: Date.now(),
    mode: settings.mode,
    modeLabel,
    totalTaps,
    missCount: game.missCount,
    avgTempo: round1(avgTempo),
    bestTempo: round1(game.bestTempo),
    tempoMax: settings.tempoMax,
    accelSeconds: settings.accelSeconds,
    centerBias: settings.centerBias,
    reachMaxAt: game.reachMaxAtMs != null ? game.reachMaxAtMs / 1000 : null,
  };
}

function persistHistory(entry) {
  const list = loadHistory();
  list.unshift(entry);
  const trimmed = list.slice(0, 30);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const list = loadHistory();
  ui.historyList.innerHTML = "";
  if (list.length === 0) {
    const li = document.createElement("li");
    li.className = "historyItem";
    li.textContent = "まだ履歴はありません。";
    ui.historyList.appendChild(li);
    return;
  }

  for (const h of list) {
    const li = document.createElement("li");
    li.className = "historyItem";
    const when = new Date(h.at).toLocaleString();
    li.innerHTML = `<div><strong>${escapeHtml(h.modeLabel)}</strong> — タップ ${h.totalTaps} / ミス ${Number(h.missCount ?? 0)} / 平均 ${Number(h.avgTempo).toFixed(1)} / 最高 ${Number(h.bestTempo).toFixed(1)}</div>
      <div class="historyItem__meta">${escapeHtml(when)} ・ 最速 ${Number(h.tempoMax).toFixed(1)}回/秒 ・ 加速 ${h.accelSeconds}s ・ 中央 ${h.centerBias}%</div>`;
    ui.historyList.appendChild(li);
  }
}

function startLoop() {
  rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function loop(now) {
  if (!game.running) return;

  if (game.endNow != null) {
    const remain = game.endNow - now;
    ui.timeLeft.textContent = fmtMs(Math.max(0, remain));
    if (remain <= 0) {
      finishGame("time");
      return;
    }
  }

  const elapsed = (now - game.startNow) / 1000;
  const tTempo = tempoAt(elapsed);
  ui.targetTempo.textContent = tTempo.toFixed(1);

  if (game.reachMaxAtMs == null && tTempo >= settings.tempoMax - 0.05) {
    game.reachMaxAtMs = now - game.startNow;
  }

  if (!game.targetVisible && now >= game.nextSpawnTime) {
    spawnTarget(now);
  }
  if (game.targetVisible && now >= game.targetDeadline) {
    onMiss(now);
  }

  rafId = requestAnimationFrame(loop);
}

function tempoAt(elapsedSeconds) {
  const startTempo = 2.5;
  const maxTempo = clampNumber(settings.tempoMax, 3, 12);
  const a = clampNumber(settings.accelSeconds, 5, 120);
  const x = clampNumber(elapsedSeconds / a, 0, 1);
  const eased = easeOutCubic(x);
  return startTempo + (maxTempo - startTempo) * eased;
}

function spawnTarget(now) {
  game.targetVisible = true;
  game.spawnTime = now;
  ui.target.classList.remove("is-hit", "is-missFlash");

  const { x, y } = samplePointInArena();
  ui.target.style.left = `${x}px`;
  ui.target.style.top = `${y}px`;
  ui.target.classList.remove("is-hidden");

  const elapsed = (now - game.startNow) / 1000;
  // 指定どおり: ターゲットは 1.0秒で消える（消える前にタッチする仕様）。
  // DS寄せの段階カーブは後で戻せるが、まず体感を安定させる。
  const life = 1000; // ms
  game.targetDeadline = now + life;
}

function onHit() {
  const now = performance.now();
  const elapsed = (now - game.startNow) / 1000;
  const currentTargetTempo = tempoAt(elapsed);
  const interval = 1000 / Math.max(0.1, currentTargetTempo);

  game.tapCount += 1;
  ui.tapCount.textContent = String(game.tapCount);

  if (game.firstHitTime == null) game.firstHitTime = now;
  if (game.lastHitTime != null) {
    const dt = now - game.lastHitTime;
    if (dt > 0) {
      const inst = 1000 / dt;
      game.bestTempo = Math.max(game.bestTempo, inst);
      ui.actualTempo.textContent = round1(inst).toFixed(1);
    }
  } else {
    ui.actualTempo.textContent = "0.0";
  }
  game.lastHitTime = now;

  // DS寄せ: ヒットで白に変えてから次へ（体感はほぼ即）
  game.targetVisible = false;
  ui.target.classList.add("is-hit");
  const delay = 50;
  setTimeout(() => {
    ui.target.classList.add("is-hidden");
    ui.target.classList.remove("is-hit");
  }, delay);
  game.nextSpawnTime = now + Math.max(0, interval - (now - game.spawnTime));
}

function onMiss(now) {
  if (!game.running || !game.targetVisible) return;
  game.missCount += 1;
  ui.missCount.textContent = String(game.missCount);
  game.targetVisible = false;

  ui.target.classList.add("is-missFlash");
  const delay = 70;
  setTimeout(() => {
    ui.target.classList.add("is-hidden");
    ui.target.classList.remove("is-missFlash");
  }, delay);

  // Missしたら即次（テンポ維持）
  game.nextSpawnTime = now;
}

function samplePointInArena() {
  const rect = ui.arena.getBoundingClientRect();
  const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--targetSize")) || 72;
  const margin = 14 + size / 2;
  const w = Math.max(10, rect.width);
  const h = Math.max(10, rect.height);

  const cx = w / 2;
  const cy = h / 2;

  const maxR = Math.max(10, Math.min(w, h) / 2 - margin);
  const bias = clampNumber(settings.centerBias, 0, 100) / 100;
  const rFactor = lerp(1.0, 0.35, bias);
  const r = maxR * rFactor;

  // Uniform in disk
  const a = Math.random() * Math.PI * 2;
  const rr = Math.sqrt(Math.random()) * r;
  let x = cx + Math.cos(a) * rr;
  let y = cy + Math.sin(a) * rr;

  x = clampNumber(x, margin, w - margin);
  y = clampNumber(y, margin, h - margin);

  return { x, y };
}

function startHoldExit() {
  cancelHoldExit();
  holdStart = performance.now();
  ui.exitHoldFill.style.width = "0%";

  const tick = () => {
    if (!game.running) return;
    const now = performance.now();
    const p = clampNumber((now - holdStart) / HOLD_MS, 0, 1);
    ui.exitHoldFill.style.width = `${Math.round(p * 100)}%`;
    if (p >= 1) {
      finishGame("hold");
      return;
    }
    holdTimer = requestAnimationFrame(tick);
  };
  holdTimer = requestAnimationFrame(tick);
}

function cancelHoldExit() {
  if (holdTimer != null) cancelAnimationFrame(holdTimer);
  holdTimer = null;
  ui.exitHoldFill.style.width = "0%";
}

function fmtMs(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtSeconds(sec) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}m ${s.toFixed(1)}s`;
}

function easeOutCubic(x) {
  const t = clampNumber(x, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clampNumber(x, min, max) {
  const n = Number.isFinite(x) ? x : min;
  return Math.min(max, Math.max(min, n));
}

function clampInt(x, min, max) {
  const n = Number.isFinite(x) ? Math.trunc(x) : min;
  return Math.min(max, Math.max(min, n));
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return c;
    }
  });
}

