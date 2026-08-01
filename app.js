/* ==========================================================
   HABIT LEDGER — app.js
   Vanilla JS. No dependencies. All state persisted to
   localStorage so the dashboard survives reloads / offline.
   ========================================================== */

(function () {
  "use strict";

  /* ---------- storage keys ---------- */
  const LS_HABITS = "ht_habits";
  const LS_CHECKINS = "ht_checkins";
  const LS_WEEK_OFFSET = "ht_week_offset";

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const DEFAULT_HABITS = [
    { id: "h1", emoji: "⏰", name: "Wake up at 05:00" },
    { id: "h2", emoji: "💪", name: "Gym" },
    { id: "h3", emoji: "📖", name: "Reading / Learning" },
    { id: "h4", emoji: "🎯", name: "Project Work" },
    { id: "h5", emoji: "🗓️", name: "Day Planning" },
    { id: "h6", emoji: "🌿", name: "Social Media Detox" },
  ];

  /* ---------- state ---------- */
  let habits = loadHabits();
  let checkins = loadCheckins(); // { "YYYY-MM-DD": { habitId: true } }
  let weekOffset = parseInt(localStorage.getItem(LS_WEEK_OFFSET) || "0", 10);
  let analyticsScope = "week"; // 'week' | 'month'

  /* ---------- persistence ---------- */
  function loadHabits() {
    try {
      const raw = localStorage.getItem(LS_HABITS);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to defaults */ }
    localStorage.setItem(LS_HABITS, JSON.stringify(DEFAULT_HABITS));
    return DEFAULT_HABITS.slice();
  }

  function loadCheckins() {
    try {
      const raw = localStorage.getItem(LS_CHECKINS);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through */ }
    return {};
  }

  function saveHabits() {
    localStorage.setItem(LS_HABITS, JSON.stringify(habits));
  }
  function saveCheckins() {
    localStorage.setItem(LS_CHECKINS, JSON.stringify(checkins));
  }
  function saveWeekOffset() {
    localStorage.setItem(LS_WEEK_OFFSET, String(weekOffset));
  }

  /* ---------- date helpers ---------- */
  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function isSameDay(a, b) {
    return toKey(a) === toKey(b);
  }

  // Monday-start week containing `today + offset weeks`
  function getWeekStart(offset) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + offset * 7);
    const dow = now.getDay(); // 0 Sun ... 6 Sat
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    now.setDate(now.getDate() + diffToMonday);
    return now;
  }

  function getWeekDates(offset) {
    const start = getWeekStart(offset);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  function formatWeekRange(dates) {
    const opts = { month: "short", day: "numeric" };
    const first = dates[0].toLocaleDateString(undefined, opts);
    const last = dates[6].toLocaleDateString(undefined, opts);
    const year = dates[6].getFullYear();
    return `${first} – ${last}, ${year}`;
  }

  function getMonthDates(referenceDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const y = referenceDate.getFullYear();
    const m = referenceDate.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    const cap = end < today ? end : today; // don't count future days as "target"
    const dates = [];
    for (let d = new Date(start); d <= cap; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    return dates;
  }

  /* ---------- DOM refs ---------- */
  const gridHeadRow = document.getElementById("gridHeadRow");
  const gridBody = document.getElementById("gridBody");
  const emptyState = document.getElementById("emptyState");
  const weekRangeLabel = document.getElementById("weekRangeLabel");
  const statTotalHabits = document.getElementById("statTotalHabits");
  const statCompletedToday = document.getElementById("statCompletedToday");
  const ringFill = document.getElementById("ringFill");
  const ringPercent = document.getElementById("ringPercent");
  const analyticsBody = document.getElementById("analyticsBody");
  const offlineBadge = document.getElementById("offlineBadge");

  const RING_CIRC = 2 * Math.PI * 36; // r=36

  /* ---------- rendering ---------- */
  function render() {
    const weekDates = getWeekDates(weekOffset);
    weekRangeLabel.textContent = formatWeekRange(weekDates);
    renderGridHead(weekDates);
    renderGridBody(weekDates);
    renderHeaderStats(weekDates);
    renderAnalytics(weekDates);
  }

  function renderGridHead(weekDates) {
    gridHeadRow.innerHTML = '<th class="habit-grid__habit-col">Habit</th>';
    const today = new Date();
    weekDates.forEach((d) => {
      const th = document.createElement("th");
      th.className = "day-col" + (isSameDay(d, today) ? " is-today" : "");
      th.innerHTML = `${DAY_LABELS[(d.getDay() + 6) % 7]}<br>${d.getDate()}`;
      gridHeadRow.appendChild(th);
    });
  }

  function renderGridBody(weekDates) {
    gridBody.innerHTML = "";
    emptyState.classList.toggle("hidden", habits.length > 0);
    const today = new Date();

    habits.forEach((habit) => {
      const tr = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.className = "habit-cell";
      nameCell.innerHTML = `
        <div class="habit-cell__row">
          <span class="habit-cell__name">
            <span class="habit-cell__emoji">${escapeHtml(habit.emoji || "•")}</span>
            <span>${escapeHtml(habit.name)}</span>
          </span>
          <button class="habit-cell__del" data-habit-id="${habit.id}" aria-label="Delete habit">✕</button>
        </div>`;
      tr.appendChild(nameCell);

      weekDates.forEach((d) => {
        const key = toKey(d);
        const checked = !!(checkins[key] && checkins[key][habit.id]);
        const td = document.createElement("td");
        td.className =
          "check-cell" + (checked ? " is-checked" : "") + (isSameDay(d, today) ? " is-today-col" : "");
        td.dataset.habitId = habit.id;
        td.dataset.dateKey = key;
        td.innerHTML = `<span class="box">✓</span>`;
        tr.appendChild(td);
      });

      gridBody.appendChild(tr);
    });
  }

  function renderHeaderStats(weekDates) {
    const today = new Date();
    const todayKey = toKey(today);
    const totalHabits = habits.length;
    const completedToday = habits.filter((h) => checkins[todayKey] && checkins[todayKey][h.id]).length;

    statTotalHabits.textContent = String(totalHabits);
    statCompletedToday.textContent = `${completedToday}/${totalHabits}`;

    const pct = totalHabits === 0 ? 0 : Math.round((completedToday / totalHabits) * 100);
    ringPercent.textContent = `${pct}%`;
    const offset = RING_CIRC - (pct / 100) * RING_CIRC;
    ringFill.style.strokeDasharray = String(RING_CIRC);
    ringFill.style.strokeDashoffset = String(offset);
  }

  function renderAnalytics(weekDates) {
    const scopeDates = analyticsScope === "week" ? weekDates.filter((d) => d <= new Date()) : getMonthDates(new Date());
    analyticsBody.innerHTML = "";

    if (habits.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px 8px;">No habits to analyze yet.</td>`;
      analyticsBody.appendChild(tr);
      return;
    }

    habits.forEach((habit) => {
      const target = scopeDates.length;
      const completed = scopeDates.filter((d) => {
        const key = toKey(d);
        return checkins[key] && checkins[key][habit.id];
      }).length;
      const pct = target === 0 ? 0 : Math.round((completed / target) * 100);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="hab-name">${escapeHtml(habit.emoji || "•")} ${escapeHtml(habit.name)}</span></td>
        <td><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></td>
        <td class="num">${completed}</td>
        <td class="num">${target}</td>
        <td class="num pct-pill" style="color:${pctColor(pct)}">${pct}%</td>
      `;
      analyticsBody.appendChild(tr);
    });
  }

  function pctColor(pct) {
    if (pct >= 80) return "var(--accent-2)";
    if (pct >= 50) return "var(--accent)";
    return "var(--danger)";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------- event handlers ---------- */
  gridBody.addEventListener("click", (e) => {
    const cell = e.target.closest(".check-cell");
    const delBtn = e.target.closest(".habit-cell__del");

    if (delBtn) {
      const habitId = delBtn.dataset.habitId;
      const habit = habits.find((h) => h.id === habitId);
      if (habit && confirm(`Remove "${habit.name}" from your habit list? Its check‑in history will also be cleared.`)) {
        habits = habits.filter((h) => h.id !== habitId);
        Object.keys(checkins).forEach((dateKey) => {
          if (checkins[dateKey]) delete checkins[dateKey][habitId];
        });
        saveHabits();
        saveCheckins();
        render();
      }
      return;
    }

    if (cell) {
      const { habitId, dateKey } = cell.dataset;
      if (!checkins[dateKey]) checkins[dateKey] = {};
      checkins[dateKey][habitId] = !checkins[dateKey][habitId];
      if (!checkins[dateKey][habitId]) delete checkins[dateKey][habitId];
      saveCheckins();
      render();
    }
  });

  document.getElementById("prevWeekBtn").addEventListener("click", () => {
    weekOffset -= 1;
    saveWeekOffset();
    render();
  });
  document.getElementById("nextWeekBtn").addEventListener("click", () => {
    weekOffset += 1;
    saveWeekOffset();
    render();
  });
  document.getElementById("todayBtn").addEventListener("click", () => {
    weekOffset = 0;
    saveWeekOffset();
    render();
  });

  /* ---------- add habit form ---------- */
  const addHabitBtn = document.getElementById("addHabitBtn");
  const addHabitForm = document.getElementById("addHabitForm");
  const newHabitEmoji = document.getElementById("newHabitEmoji");
  const newHabitName = document.getElementById("newHabitName");

  addHabitBtn.addEventListener("click", () => {
    addHabitForm.classList.toggle("hidden");
    if (!addHabitForm.classList.contains("hidden")) newHabitName.focus();
  });
  document.getElementById("cancelHabitBtn").addEventListener("click", () => {
    addHabitForm.classList.add("hidden");
    newHabitEmoji.value = "";
    newHabitName.value = "";
  });
  document.getElementById("saveHabitBtn").addEventListener("click", saveNewHabit);
  newHabitName.addEventListener("keydown", (e) => { if (e.key === "Enter") saveNewHabit(); });

  function saveNewHabit() {
    const name = newHabitName.value.trim();
    if (!name) { newHabitName.focus(); return; }
    const emoji = newHabitEmoji.value.trim() || "✅";
    const id = "h" + Date.now();
    habits.push({ id, emoji, name });
    saveHabits();
    newHabitEmoji.value = "";
    newHabitName.value = "";
    addHabitForm.classList.add("hidden");
    render();
  }

  /* ---------- analytics scope toggle ---------- */
  document.querySelectorAll(".scope-toggle__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".scope-toggle__btn").forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      analyticsScope = btn.dataset.scope;
      render();
    });
  });

  /* ---------- menu / reset ---------- */
  const menuBtn = document.getElementById("menuBtn");
  const menuPanel = document.getElementById("menuPanel");
  menuBtn.addEventListener("click", () => {
    const isHidden = menuPanel.classList.toggle("hidden");
    menuBtn.setAttribute("aria-expanded", String(!isHidden));
  });
  document.addEventListener("click", (e) => {
    if (!menuPanel.contains(e.target) && e.target !== menuBtn && !menuPanel.classList.contains("hidden")) {
      menuPanel.classList.add("hidden");
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });

  document.getElementById("resetWeekBtn").addEventListener("click", () => {
    if (!confirm("Clear all check‑ins for the week currently in view? This can't be undone.")) return;
    getWeekDates(weekOffset).forEach((d) => { delete checkins[toKey(d)]; });
    saveCheckins();
    menuPanel.classList.add("hidden");
    render();
  });

  document.getElementById("resetAllBtn").addEventListener("click", () => {
    if (!confirm("Reset ALL data — habits and every check‑in you've ever logged? This can't be undone.")) return;
    habits = DEFAULT_HABITS.slice();
    checkins = {};
    weekOffset = 0;
    saveHabits();
    saveCheckins();
    saveWeekOffset();
    menuPanel.classList.add("hidden");
    render();
  });

  /* ---------- offline badge ---------- */
  function updateOnlineStatus() {
    offlineBadge.classList.toggle("hidden", navigator.onLine);
  }
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  /* ---------- service worker registration (PWA offline support) ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    });
  }

  /* ---------- init ---------- */
  render();
})();
