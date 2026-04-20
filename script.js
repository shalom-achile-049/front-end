// script.js
(() => {
  "use strict";

  /***********************
   * Storage Keys
   ***********************/
  const LS = {
    examSet: "onplex_examSet_v1",
    answers: "onplex_answers_v1",
    antiCheat: "onplex_antiCheat_v1",
    lastRun: "onplex_lastRun_v1",
  };

  /***********************
   * Default Demo Exam
   ***********************/
  const demoExam = [
    {
      id: cryptoRandomId(),
      type: "mcq",
      title: "Which language is primarily used for styling web pages?",
      hint: "Think CSS + HTML.",
      options: ["HTML", "CSS", "JavaScript", "Python"],
      correct: "CSS",
      score: 1,
    },
    {
      id: cryptoRandomId(),
      type: "tf",
      title:
        "True or False: A timer helps you finish an exam within time limits.",
      hint: "This is a proctor-friendly statement.",
      options: ["True", "False"],
      correct: "true",
      score: 1,
    },
    {
      id: cryptoRandomId(),
      type: "text",
      title:
        "Short answer: Name one anti-cheating technique used in this UI demo.",
      hint: "Tab switching triggers warnings (Visibility API).",
      options: [],
      correct: "visibility",
      score: 1,
    },
  ];

  /***********************
   * App State
   ***********************/
  const state = {
    pages: {
      landing: document.querySelector('[data-page="landing"]'),
      student: document.querySelector('[data-page="student"]'),
      teacher: document.querySelector('[data-page="teacher"]'),
      results: document.querySelector('[data-page="results"]'),
    },
    examSet: [],
    answers: {}, // { [questionId]: { value: any } }
    antiCheat: { warnings: 0, events: [] },
    student: {
      index: 0,
      timeLeftSec: 0,
      timerId: null,
      durationSec: 10 * 60, // 10 minutes demo
      submitted: false,
    },
  };

  /***********************
   * DOM Helpers
   ***********************/
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function cryptoRandomId() {
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint32Array(3);
      crypto.getRandomValues(a);
      return Array.from(a)
        .map((n) => n.toString(16))
        .join("-");
    }
    return "id-" + Math.random().toString(16).slice(2) + "-" + Date.now();
  }

  function formatTime(sec) {
    const s = Math.max(0, sec);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function normalize(s) {
    return String(s ?? "")
      .trim()
      .toLowerCase();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /***********************
   * Page Navigation
   ***********************/
  function showPage(name) {
    Object.values(state.pages).forEach((p) => p.classList.remove("is-active"));
    state.pages[name].classList.add("is-active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Wire nav buttons (topbar + CTAs)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-show");
    if (!btn) return;
    const target = btn.getAttribute("data-target");
    if (target && state.pages[target]) {
      showPage(target);
      // Ensure student interface is hydrated if we enter it
      if (target === "student") bootStudentFromStorageOrDemo();
      if (target === "teacher") bootTeacher();
    }
  });

  /***********************
   * Theme (Bonus: Dark Mode toggle)
   ***********************/
  const darkToggle = $("#darkModeToggle");
  const themeKey = "onplex_theme_v1";

  function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    // Update label icon quickly
    const isLight = theme === "light";
    darkToggle.querySelector(".icon-btn__icon").textContent = isLight
      ? "☀"
      : "☾";
    darkToggle.querySelector(".icon-btn__label").textContent = isLight
      ? "Light"
      : "Dark";
  }

  function initTheme() {
    const saved = localStorage.getItem(themeKey);
    if (saved === "light" || saved === "dark") {
      applyTheme(saved);
      return;
    }
    // Default: dark
    applyTheme("dark");
  }

  darkToggle?.addEventListener("click", () => {
    const current =
      document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(themeKey, next);
    applyTheme(next);
  });

  /***********************
   * Loader
   ***********************/
  const loader = $("#loader");
  function hideLoaderSoon() {
    // Short, deliberate loading for portfolio polish
    const t0 = performance.now();
    setTimeout(() => {
      loader.setAttribute("aria-hidden", "true");
      loader.style.opacity = "0";
      loader.style.pointerEvents = "none";
      const elapsed = performance.now() - t0;
      // Ensure it doesn't flicker
      setTimeout(() => loader.remove(), Math.max(0, 220 - elapsed));
    }, 650);
  }

  /***********************
   * Anti-cheat Simulation (Visibility API)
   ***********************/
  function initAntiCheatUI() {
    const cheatLog = $("#cheatLog");
    const badge = $("#proctorWarningBadge");
    const chipDot = $("#chipDot");
    const chipText = $("#chipText");
    const scanline = $("#scanline");

    function setFocusState(good) {
      chipDot.style.background = good
        ? "rgba(59,227,139,.95)"
        : "rgba(255,176,32,.95)";
      chipDot.style.boxShadow = good
        ? "0 0 0 4px rgba(59,227,139,.18)"
        : "0 0 0 4px rgba(255,176,32,.18)";
      chipText.textContent = good ? "Focus: Good" : "Focus: Warning";
      badge.textContent = good ? "No Warnings" : "Warnings Triggered";
      badge.classList.toggle("badge--warn", !good);
      badge.classList.toggle("badge--ok", good);
      if (scanline) scanline.style.opacity = good ? "1" : "0.75";
    }

    setFocusState(true);

    document.addEventListener("visibilitychange", () => {
      // If user switches away, document becomes hidden.
      const isHidden = document.visibilityState === "hidden";
      if (!isHidden) return;

      // Record warning event
      state.antiCheat.warnings += 1;
      const timestamp = new Date();
      const item = {
        t: timestamp.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        msg: "Tab switch detected. Focus lost (demo warning).",
      };
      state.antiCheat.events.unshift(item);
      state.antiCheat.events = state.antiCheat.events.slice(0, 8);

      // Render log
      if (cheatLog) {
        cheatLog.innerHTML = state.antiCheat.events
          .map(
            (ev) => `
          <li>
            <div class="focusLog__time">${escapeHtml(ev.t)}</div>
            <div class="focusLog__msg">${escapeHtml(ev.msg)}</div>
          </li>
        `,
          )
          .join("");
      }

      // Update badge / chip
      setFocusState(false);

      // UI alert (demo simulation)
      // Use a non-blocking custom behavior? We'll do a friendly alert once per second to avoid spamming.
      if (
        !state.student._lastWarnAt ||
        Date.now() - state.student._lastWarnAt > 1000
      ) {
        state.student._lastWarnAt = Date.now();
        window.alert(
          "Anti-cheat (demo): Switching tabs may be flagged. Please remain focused.",
        );
      }
    });
  }

  /***********************
   * Student Boot + Rendering
   ***********************/
  function bootStudentFromStorageOrDemo() {
    // Load exam set
    const savedSet = safeParse(localStorage.getItem(LS.examSet));
    state.examSet =
      Array.isArray(savedSet) && savedSet.length ? savedSet : demoExam;

    // Load answers
    const savedAnswers = safeParse(localStorage.getItem(LS.answers));
    state.answers =
      savedAnswers && typeof savedAnswers === "object" ? savedAnswers : {};

    // Anti-cheat
    const savedAnti = safeParse(localStorage.getItem(LS.antiCheat));
    state.antiCheat =
      savedAnti && typeof savedAnti === "object"
        ? {
            warnings: savedAnti.warnings ?? 0,
            events: Array.isArray(savedAnti.events) ? savedAnti.events : [],
          }
        : { warnings: 0, events: [] };

    // Student run state
    state.student.index = 0;
    state.student.submitted =
      safeParse(localStorage.getItem(LS.lastRun))?.submitted ?? false;

    // Duration reset for demo
    state.student.durationSec = 10 * 60;

    // Timer: If we already have time left, resume; else start fresh.
    const run = safeParse(localStorage.getItem(LS.lastRun));
    const resumeTimeLeft = run?.timeLeftSec;
    state.student.timeLeftSec =
      typeof resumeTimeLeft === "number" && resumeTimeLeft > 0
        ? resumeTimeLeft
        : state.student.durationSec;

    hydrateStudentUI();
    renderStudentQuestion();
    renderProgress();

    startTimer();
    initAntiCheatUI();
  }

  function hydrateStudentUI() {
    // Ensure nav state
    const prevBtn = $("#prevBtn");
    const nextBtn = $("#nextBtn");
    const submitBtn = $("#submitBtn");

    prevBtn.disabled = state.student.index === 0;
    nextBtn.disabled = state.student.index >= state.examSet.length - 1;

    // Submit text update
    submitBtn.textContent = "Submit Exam";
    submitBtn.disabled = false;

    // Anti-cheat UI log
    const cheatLog = $("#cheatLog");
    if (cheatLog) {
      cheatLog.innerHTML = (state.antiCheat.events || [])
        .map(
          (ev) => `
        <li>
          <div class="focusLog__time">${escapeHtml(ev.t || "")}</div>
          <div class="focusLog__msg">${escapeHtml(ev.msg || "")}</div>
        </li>
      `,
        )
        .join("");
    }

    // Focus badge initial
    const badge = $("#proctorWarningBadge");
    badge &&
      badge.classList.toggle("badge--ok", state.antiCheat.warnings === 0);
    badge &&
      badge.classList.toggle("badge--warn", state.antiCheat.warnings > 0);
    if (badge)
      badge.textContent =
        state.antiCheat.warnings > 0 ? "Warnings Triggered" : "No Warnings";
  }

  function renderProgress() {
    const total = state.examSet.length || 1;
    const idx = state.student.index;
    const current = idx + 1;
    const pct = clamp(Math.round((current / total) * 100), 1, 100);

    $("#progressFill").style.width = `${pct}%`;
    $("#progressMeta").textContent = `Question ${current} of ${total}`;
    $("#progressPct").textContent = `${pct}%`;
  }

  function renderStudentQuestion() {
    const q = state.examSet[state.student.index];
    const questionType = $("#questionType");
    const questionIndex = $("#questionIndex");
    const questionTitle = $("#questionTitle");
    const questionHint = $("#questionHint");
    const questionBody = $("#questionBody");

    if (!q) {
      questionType.textContent = "Type: --";
      questionIndex.textContent = "—";
      questionTitle.textContent = "No questions.";
      questionHint.textContent = "";
      questionBody.innerHTML = `<div class="tiny muted">Create questions in the Teacher panel.</div>`;
      $("#prevBtn").disabled = true;
      $("#nextBtn").disabled = true;
      $("#submitBtn").disabled = true;
      stopTimer();
      return;
    }

    questionType.textContent = `Type: ${typeLabel(q.type)}`;
    questionIndex.textContent = `Q${state.student.index + 1}`;
    questionTitle.textContent = q.title || "";
    questionHint.textContent = q.hint ? q.hint : "";

    // Determine existing answer value for selected question
    const ans = state.answers[q.id]?.value;

    // Render based on type
    if (q.type === "mcq") {
      const options = q.options || [];
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      questionBody.innerHTML = `
        <div class="qChoices" role="radiogroup" aria-label="Multiple choice options">
          ${options
            .map((opt, i) => {
              const letter = letters[i] || String(i + 1);
              const selected = normalize(ans) === normalize(opt);
              return `
              <label class="choice ${selected ? "is-selected" : ""}">
                <span class="choice__letter">${escapeHtml(letter)}</span>
                <span class="choice__main">
                  <input
                    type="radio"
                    name="mcq-${escapeHtml(q.id)}"
                    value="${escapeHtml(opt)}"
                    ${selected ? "checked" : ""}
                    aria-label="Option ${letter}"
                    data-qid="${escapeHtml(q.id)}"
                    data-value="${escapeHtml(opt)}"
                  />
                  <span class="choice__label">${escapeHtml(opt)}</span>
                </span>
              </label>
            `;
            })
            .join("")}
        </div>
      `;
    } else if (q.type === "tf") {
      // Expect options ["True","False"] but allow any
      const options = q.options?.length ? q.options : ["True", "False"];
      const letters = "TF";

      questionBody.innerHTML = `
        <div class="qChoices" role="radiogroup" aria-label="True or False options">
          ${options
            .map((opt, i) => {
              const letter = letters[i] || String(i + 1);
              const selected =
                normalize(ans) === normalize(opt) ||
                normalize(ans) ===
                  (normalize(opt) === "true" ? "true" : "false");
              return `
              <label class="choice ${selected ? "is-selected" : ""}">
                <span class="choice__letter">${escapeHtml(letter)}</span>
                <span class="choice__main">
                  <input
                    type="radio"
                    name="tf-${escapeHtml(q.id)}"
                    value="${escapeHtml(opt)}"
                    ${selected ? "checked" : ""}
                    data-qid="${escapeHtml(q.id)}"
                    data-value="${escapeHtml(opt)}"
                    aria-label="Option ${letter}"
                  />
                  <span class="choice__label">${escapeHtml(opt)}</span>
                </span>
              </label>
            `;
            })
            .join("")}
        </div>
      `;
    } else if (q.type === "text") {
      const v = typeof ans === "string" ? ans : (ans ?? "");
      questionBody.innerHTML = `
        <div>
          <input class="textInput" id="textAnswerInput" type="text" maxlength="140"
            placeholder="Type your short answer…"
            value="${escapeHtml(v)}"
            data-qid="${escapeHtml(q.id)}"
          />
          <div class="tiny muted" style="margin-top:8px;">
            Scoring demo: answers are checked for keyword overlap (case-insensitive).
          </div>
        </div>
      `;
    } else {
      questionBody.innerHTML = `<div class="tiny muted">Unknown question type.</div>`;
    }

    // Update nav buttons enabled state
    $("#prevBtn").disabled = state.student.index === 0;
    $("#nextBtn").disabled = state.student.index >= state.examSet.length - 1;

    // Bind input handlers
    bindQuestionAnswerInputs();
  }

  function bindQuestionAnswerInputs() {
    // MCQ/TF radios
    const radios = $$(`input[type="radio"][data-qid]`, $("#questionBody"));
    radios.forEach((r) => {
      r.addEventListener("change", () => {
        const qid = r.getAttribute("data-qid");
        const val = r.getAttribute("data-value");
        state.answers[qid] = { value: val };
        persistAnswers();
        // Re-render selection class for visual polish
        renderStudentQuestion();
      });
    });

    // Text input
    const textInput = $("#textAnswerInput");
    if (textInput) {
      // Save on input (debounced-ish)
      let t = null;
      textInput.addEventListener("input", () => {
        const qid = textInput.getAttribute("data-qid");
        const val = textInput.value;
        clearTimeout(t);
        t = setTimeout(() => {
          state.answers[qid] = { value: val };
          persistAnswers();
        }, 120);
      });

      // Immediate save on blur as well
      textInput.addEventListener("blur", () => {
        const qid = textInput.getAttribute("data-qid");
        state.answers[qid] = { value: textInput.value };
        persistAnswers();
      });
    }
  }

  function persistAnswers() {
    localStorage.setItem(LS.answers, JSON.stringify(state.answers));
  }

  /***********************
   * Timer + Submit
   ***********************/
  function startTimer() {
    stopTimer();
    const timerValue = $("#timerValue");
    timerValue.textContent = formatTime(state.student.timeLeftSec);

    state.student.timerId = setInterval(() => {
      state.student.timeLeftSec -= 1;

      // Persist run state
      persistRunState({ submitted: false });

      timerValue.textContent = formatTime(state.student.timeLeftSec);

      // If time is up, submit automatically
      if (state.student.timeLeftSec <= 0) {
        timerValue.textContent = formatTime(0);
        stopTimer();
        autoSubmit("Time ended. Auto-submitting your exam.");
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.student.timerId) {
      clearInterval(state.student.timerId);
      state.student.timerId = null;
    }
  }

  function persistRunState(extra = {}) {
    const run = {
      submitted: extra.submitted ?? state.student.submitted,
      timeLeftSec: state.student.timeLeftSec,
      updatedAt: Date.now(),
    };
    localStorage.setItem(LS.lastRun, JSON.stringify(run));
    // Also persist anti-cheat
    localStorage.setItem(LS.antiCheat, JSON.stringify(state.antiCheat));
  }

  function autoSubmit(message) {
    // prevent multiple submits
    if (state.student.submitted) return;
    state.student.submitted = true;
    persistRunState({ submitted: true });
    // quick message
    if (message) window.alert(message);
    computeAndShowResults();
  }

  $("#prevBtn")?.addEventListener("click", () => {
    if (state.student.submitted) return;
    state.student.index = Math.max(0, state.student.index - 1);
    persistRunState({ submitted: false });
    renderStudentQuestion();
    renderProgress();
  });

  $("#nextBtn")?.addEventListener("click", () => {
    if (state.student.submitted) return;
    state.student.index = Math.min(
      state.examSet.length - 1,
      state.student.index + 1,
    );
    persistRunState({ submitted: false });
    renderStudentQuestion();
    renderProgress();
  });

  $("#submitBtn")?.addEventListener("click", () => {
    if (state.student.submitted) return;
    state.student.submitted = true;
    persistRunState({ submitted: true });
    stopTimer();
    // Friendly submit confirmation
    window.alert("Submitted! Calculating your score (demo)...");
    computeAndShowResults();
  });

  /***********************
   * Scoring + Results Page
   ***********************/
  function typeLabel(t) {
    if (t === "mcq") return "MCQ";
    if (t === "tf") return "True/False";
    if (t === "text") return "Text";
    return "—";
  }

  function scoreQuestion(q, userValue) {
    const correct = q.correct;
    const type = q.type;

    if (type === "mcq") {
      return normalize(userValue) === normalize(correct);
    }
    if (type === "tf") {
      // Accept true/false as various strings
      const u = normalize(userValue);
      const c = normalize(correct);
      const toBool = (s) => {
        if (["true", "t", "1", "yes"].includes(s)) return "true";
        if (["false", "f", "0", "no"].includes(s)) return "false";
        return s;
      };
      return toBool(u) === toBool(c);
    }
    if (type === "text") {
      const keyword = normalize(correct);
      const answer = normalize(userValue);
      if (!keyword) return false;
      // keyword contained => correct (simple demo)
      return answer.includes(keyword);
    }
    return false;
  }

  function computeAndShowResults() {
    const total = state.examSet.length;
    let correctCount = 0;

    const breakdown = state.examSet.map((q, i) => {
      const user = state.answers[q.id]?.value;
      const ok = scoreQuestion(q, user);
      if (ok) correctCount += 1;
      return {
        idx: i + 1,
        title: q.title,
        type: typeLabel(q.type),
        ok,
        user,
        correct: q.correct,
      };
    });

    const scoreStr = `${correctCount}/${total}`;
    $("#scoreValue").textContent = scoreStr;

    // Performance message
    const pct = total ? (correctCount / total) * 100 : 0;
    let label = "Good effort";
    let msg =
      "You’re building momentum. Review the questions you missed and try again for a stronger run.";

    if (pct >= 90) {
      label = "Excellent!";
      msg =
        "Strong performance. Your focus and understanding came through clearly in this demo run.";
    } else if (pct >= 60) {
      label = "Nice work!";
      msg =
        "You’re on the right track. A few improvements will make this even better.";
    } else if (pct >= 30) {
      label = "Keep going";
      msg =
        "Some answers were on the way. Try again and aim for steady progress and clarity.";
    } else {
      label = "Don’t worry—retry";
      msg =
        "This is a demo scoring. Retry to see the full flow and refine answers.";
    }

    $("#scoreLabel").textContent = label;
    $("#resultMessage").textContent = msg;

    $("#resultMeta").textContent =
      `Warnings: ${state.antiCheat.warnings} • Anti-cheat demo (Visibility API)`;

    const resultBadge = $("#resultBadge");
    resultBadge.textContent = "Completed";

    // Render breakdown list
    $("#breakdownList").innerHTML = breakdown
      .map(
        (b) => `
      <div class="breakRow">
        <div class="breakRow__left">
          <div class="breakRow__title">${escapeHtml(`Q${b.idx} • ${b.type}`)}</div>
          <div class="breakRow__sub">${escapeHtml(b.ok ? "Correct" : "Needs Improvement")} • User: ${escapeHtml(String(b.user ?? "—"))}</div>
        </div>
        <div class="breakRow__badge ${b.ok ? "ok" : "no"}">${b.ok ? "✓" : "✕"}</div>
      </div>
    `,
      )
      .join("");

    // Persist results summary
    localStorage.setItem(
      LS.lastRun,
      JSON.stringify({
        submitted: true,
        timeLeftSec: state.student.timeLeftSec,
        updatedAt: Date.now(),
        correctCount,
        total,
      }),
    );

    showPage("results");
  }

  $("#retryBtn")?.addEventListener("click", () => {
    // Reset student state and answers, keep exam set
    stopTimer();

    localStorage.removeItem(LS.answers);
    localStorage.removeItem(LS.antiCheat);
    localStorage.removeItem(LS.lastRun);

    state.answers = {};
    state.antiCheat = { warnings: 0, events: [] };
    state.student.index = 0;
    state.student.submitted = false;
    state.student.timeLeftSec = state.student.durationSec;

    showPage("student");
    bootStudentFromStorageOrDemo();
  });

  /***********************
   * Teacher Panel
   ***********************/
  const teacher = {
    form: $("#questionForm"),
    qTitle: $("#qTitle"),
    qType: $("#qType"),
    addOptionBtn: $("#addOptionBtn"),
    optionsArea: $("#optionsArea"),
    correctValue: $("#correctValue"),
    addQuestionBtn: $("#addQuestionBtn"),
    clearQuestionsBtn: $("#clearQuestionsBtn"),
    loadDemoExamBtn: $("#loadDemoExamBtn"),
    questionsList: $("#questionsList"),
    questionsCount: $("#questionsCount"),
    startFromTeacherBtn: $("#startFromTeacherBtn"),
  };

  function bootTeacher() {
    // Load saved exam if exists
    const savedSet = safeParse(localStorage.getItem(LS.examSet));
    state.examSet = Array.isArray(savedSet) && savedSet.length ? savedSet : [];
    renderTeacherQuestions();
    resetTeacherFormUI();
    updateTeacherMeta("Ready");
  }

  function updateTeacherMeta(text) {
    $("#teacherMeta").textContent = text;
  }

  function resetTeacherFormUI() {
    teacher.qTitle.value = "";
    teacher.qType.value = "mcq";
    teacher.correctValue.value = "";
    teacher.optionsArea.innerHTML = "";
    // Start with defaults for MCQ and TF
    if (teacher.qType.value === "tf") {
      renderTFDefaults();
      teacher.correctValue.placeholder = "e.g., true (or false)";
    } else if (teacher.qType.value === "text") {
      teacher.addOptionBtn.style.display = "none";
      teacher.optionsArea.innerHTML = `<div class="tiny muted">Text questions don't need options.</div>`;
      teacher.correctValue.placeholder = "e.g., visibility";
    } else {
      teacher.addOptionBtn.style.display = "inline-flex";
      renderMCQDefaults();
      teacher.correctValue.placeholder =
        "e.g., CSS (exact option match for demo)";
    }
  }

  function renderTFDefaults() {
    teacher.addOptionBtn.style.display = "none";
    const trueVal = "True";
    const falseVal = "False";

    teacher.optionsArea.innerHTML = `
      <div class="optionRow">
        <input class="input" type="text" value="${escapeAttr(trueVal)}" disabled />
        <span class="badge badge--ok">Default</span>
      </div>
      <div class="optionRow">
        <input class="input" type="text" value="${escapeAttr(falseVal)}" disabled />
        <span class="badge badge--warn">Default</span>
      </div>
    `;
    // Set correct keyword placeholder
    teacher.correctValue.value = "";
    teacher.correctValue.placeholder = "e.g., true or false";
  }

  function renderMCQDefaults() {
    teacher.addOptionBtn.style.display = "inline-flex";
    // Two default options
    teacher.optionsArea.innerHTML = "";
    teacher.optionsArea.appendChild(makeOptionRow("Option 1"));
    teacher.optionsArea.appendChild(makeOptionRow("Option 2"));
  }

  function makeOptionRow(val) {
    const row = document.createElement("div");
    row.className = "optionRow";

    const input = document.createElement("input");
    input.className = "input";
    input.type = "text";
    input.value = val;
    input.placeholder = "Option text";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--tiny btn--ghost";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      row.remove();
    });

    row.appendChild(input);
    row.appendChild(del);
    return row;
  }

  teacher.qType?.addEventListener("change", () => {
    resetTeacherFormUI();
  });

  teacher.addOptionBtn?.addEventListener("click", () => {
    // Only for MCQ
    if (teacher.qType.value !== "mcq") return;
    teacher.optionsArea.appendChild(
      makeOptionRow(`Option ${teacher.optionsArea.children.length + 1}`),
    );
  });

  teacher.clearQuestionsBtn?.addEventListener("click", () => {
    if (!state.examSet.length) return;
    if (!window.confirm("Clear all created questions?")) return;
    state.examSet = [];
    localStorage.setItem(LS.examSet, JSON.stringify(state.examSet));
    renderTeacherQuestions();
    resetTeacherFormUI();
    updateTeacherMeta("Cleared");
  });

  teacher.loadDemoExamBtn?.addEventListener("click", () => {
    if (!window.confirm("Load demo questions (replaces current set)?")) return;
    state.examSet = demoExam.map((q) => ({ ...q, id: cryptoRandomId() }));
    localStorage.setItem(LS.examSet, JSON.stringify(state.examSet));
    renderTeacherQuestions();
    resetTeacherFormUI();
    updateTeacherMeta("Demo loaded");
  });

  teacher.form?.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = teacher.qTitle.value.trim();
    const type = teacher.qType.value;
    const correct = teacher.correctValue.value.trim();

    if (!title) {
      window.alert("Please enter a question title.");
      return;
    }
    if (!correct) {
      window.alert("Please enter a correct answer for the scoring demo.");
      return;
    }

    const item = {
      id: cryptoRandomId(),
      type,
      title,
      hint: "",
      options: [],
      correct,
      score: 1,
    };

    if (type === "mcq") {
      const optionInputs = $$("input.input", teacher.optionsArea);
      const options = optionInputs
        .map((inp) => inp.value.trim())
        .filter(Boolean);

      if (options.length < 2) {
        window.alert("MCQ needs at least 2 options.");
        return;
      }
      item.options = options;
    } else if (type === "tf") {
      // Hard defaults; scoring expects correct as "true"/"false"
      item.options = ["True", "False"];
      // Keep correct as teacher wrote (demo normalizer will handle)
    } else if (type === "text") {
      item.options = [];
    }

    state.examSet.push(item);
    localStorage.setItem(LS.examSet, JSON.stringify(state.examSet));
    renderTeacherQuestions();

    // Prepare next add
    teacher.qTitle.value = "";
    teacher.correctValue.value = "";
    updateTeacherMeta("Question added ✅");
    setTimeout(() => updateTeacherMeta("Ready"), 700);

    // Keep option UI based on type
    if (type === "mcq") {
      // Keep last edited options; it's nicer for quick iterations.
    } else if (type === "tf") {
      // defaults remain
    } else {
      // no options
    }
  });

  teacher.startFromTeacherBtn?.addEventListener("click", () => {
    // Reset student answers/time when starting from teacher
    stopTimer();

    localStorage.removeItem(LS.answers);
    localStorage.removeItem(LS.antiCheat);
    localStorage.removeItem(LS.lastRun);

    state.answers = {};
    state.antiCheat = { warnings: 0, events: [] };
    state.student.index = 0;
    state.student.submitted = false;
    state.student.timeLeftSec = state.student.durationSec;

    // Persist exam set to ensure student loads created set
    localStorage.setItem(LS.examSet, JSON.stringify(state.examSet));

    showPage("student");
    bootStudentFromStorageOrDemo();
  });

  function renderTeacherQuestions() {
    const count = state.examSet.length;
    teacher.questionsCount.textContent = `${count} question${count === 1 ? "" : "s"}`;

    if (!count) {
      teacher.questionsList.innerHTML = `
        <div class="tiny muted">
          No questions yet. Add your first question to see it here.
        </div>
      `;
      return;
    }

    teacher.questionsList.innerHTML = state.examSet
      .map((q, i) => {
        const meta =
          q.type === "mcq"
            ? `MCQ • ${q.options?.length ?? 0} options`
            : q.type === "tf"
              ? "True/False"
              : "Text (short answer)";

        return `
        <div class="questionItem">
          <div class="questionItem__top">
            <div style="min-width:0;">
              <div class="questionItem__title">${escapeHtml(`Q${i + 1} • ${q.title}`)}</div>
              <div class="questionItem__meta">${escapeHtml(meta)} • Correct: ${escapeHtml(String(q.correct))}</div>
            </div>
          </div>

          <div class="questionItem__actions">
            <button class="btn btn--tiny btn--tinyGhost" type="button" data-edit="${escapeAttr(q.id)}">
              Edit (demo)
            </button>
            <button class="btn btn--tiny btn--dangerSmall" type="button" data-remove="${escapeAttr(q.id)}">
              Remove
            </button>
          </div>
        </div>
      `;
      })
      .join("");

    // Actions
    $$("[data-remove]", teacher.questionsList).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-remove");
        state.examSet = state.examSet.filter((q) => q.id !== id);
        localStorage.setItem(LS.examSet, JSON.stringify(state.examSet));
        renderTeacherQuestions();
      });
    });

    // Edit (simple UX: loads into form, replaces when re-added)
    $$("[data-edit]", teacher.questionsList).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const q = state.examSet.find((x) => x.id === id);
        if (!q) return;

        teacher.qTitle.value = q.title || "";
        teacher.qType.value = q.type;
        teacher.correctValue.value = q.correct || "";

        // Update options UI
        if (q.type === "mcq") {
          teacher.addOptionBtn.style.display = "inline-flex";
          teacher.optionsArea.innerHTML = "";
          (q.options || []).forEach((opt) =>
            teacher.optionsArea.appendChild(makeOptionRow(opt)),
          );
        } else if (q.type === "tf") {
          renderTFDefaults();
        } else if (q.type === "text") {
          teacher.addOptionBtn.style.display = "none";
          teacher.optionsArea.innerHTML = `<div class="tiny muted">Text questions don't need options.</div>`;
        }

        updateTeacherMeta("Loaded into form (add to save)");
        teacher.qTitle.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  /***********************
   * Utilities: Safe Parse, Escape
   ***********************/
  function safeParse(s) {
    try {
      if (!s) return null;
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(str) {
    // Same as escapeHtml for simplicity (used in attributes)
    return escapeHtml(str);
  }

  /***********************
   * Init
   ***********************/
  function init() {
    initTheme();
    // Start on landing
    showPage("landing");

    // Display demo exam set if not exists
    const savedSet = safeParse(localStorage.getItem(LS.examSet));
    if (!Array.isArray(savedSet) || !savedSet.length) {
      // Store demo by default so Student panel has content.
      localStorage.setItem(LS.examSet, JSON.stringify(demoExam));
    }

    // Teacher boot (keeps list ready)
    bootTeacher();

    // Hide loader after a short time
    hideLoaderSoon();

    // Improve feature: Keep focus UI updated if user returns
    document.addEventListener("visibilitychange", () => {
      const chipDot = $("#chipDot");
      const chipText = $("#chipText");
      const badge = $("#proctorWarningBadge");
      if (!chipDot || !chipText || !badge) return;

      const hidden = document.visibilityState === "hidden";
      if (!hidden) {
        chipDot.style.background = "rgba(59,227,139,.95)";
        chipDot.style.boxShadow = "0 0 0 4px rgba(59,227,139,.18)";
        chipText.textContent = `Focus: Good`;
        if (state.antiCheat.warnings > 0) {
          badge.textContent = "Warnings Triggered";
          badge.classList.add("badge--warn");
          badge.classList.remove("badge--ok");
        } else {
          badge.textContent = "No Warnings";
          badge.classList.add("badge--ok");
          badge.classList.remove("badge--warn");
        }
      }
    });

    // Small quality: If user enters student while already submitted, show results instead
    const run = safeParse(localStorage.getItem(LS.lastRun));
    if (run?.submitted) {
      // Do not auto-navigate; keep user intent.
    }
  }

  // Start app
  init();
})();
