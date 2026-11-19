(() => {
  "use strict";

  // ===== Настройки: поменяй под себя =====
  const CONFIG = Object.freeze({
    herName: "",             // например "Аня" → «Привет, Аня.»
    signature: "Твой бармен", // подпись в билете
    // Уведомление в Telegram об итоговом выборе. Пустые строки = уведомления выключены.
    telegramToken: "9135478408:AAFxF5OA8oTqbPCGwrU1P_87dg8QiZ1diOI", // @alyonasladkayabot
    telegramChatId: "422404219"
  });

  const PAGES = Object.freeze({
    ask: "index.html",
    plan: "plan.html",
    when: "when.html",
    time: "time.html",
    done: "done.html"
  });

  const PLANS = Object.freeze({
    billiard: Object.freeze({ title: "Бильярд", emoji: "🎱", echo: "Бильярд! Иду мелить кий и тренировать лицо проигравшего." }),
    walk: Object.freeze({ title: "Прогулка, шаурма и пивко", emoji: "🍻", echo: "Прогулка с пивком! Охлаждаю бокалы. Ну, банки." }),
    home: Object.freeze({ title: "Плед, фильм и пицца", emoji: "🛋️", echo: "Плед уже греется. Пицца в пути. Почти." })
  });
  const TIMES = Object.freeze(["21:00", "21:30", "22:00", "22:30", "23:00"]);
  const TODAY = "today";

  const NO_TAUNTS = Object.freeze([
    ["Не-а", "Кнопка «Нет» временно недоступна 🙅"],
    ["Точно?", "Ошибка 404: отказ не найден"],
    ["Подумай", "Мама сказала, так нельзя"],
    ["Не поймаешь", "Эта кнопка только для премиум-подписчиков"],
    ["Ой", "Кот в шоке. Я тоже."],
    ["Я обижусь 🥺", "Ты правда пытаешься нажать «нет»?"],
    ["Уже бегу", "Кнопка ушла за хлебом и не вернулась"],
    ["Нет-нет", "Сопротивление бесполезно"],
    ["Ну пожалуйста", "У тебя ещё есть шанс нажать «Да»"],
    ["🤡", "Окей, кнопка победила. Жми «Да»"]
  ]);
  const DODGE_TAUNTS = Object.freeze([
    "Ты не прикалывайся, мы же сегодня договорились 😤",
    "Ещё раз: СЕГОДНЯ. Мы договорились 🤝",
    "Не-не-не, перенос не принимается",
    "Кнопка «Сегодня» вон там, первая 👆"
  ]);

  const MAX_COUNT = 999;
  const MAX_GROW = 1.9;
  const GROW_STEP = 0.1;
  const HINT_AFTER = 4;
  const FLEE_MARGIN = 16;
  const MIN_JUMP = 140;
  const LEAVE_MS = 320;

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  // ===== Состояние живёт в адресе страницы =====
  const toCount = (value) => {
    const n = Number.parseInt(value ?? "0", 10);
    return Number.isFinite(n) ? Math.min(MAX_COUNT, Math.max(0, n)) : 0;
  };

  const readState = () => {
    const p = new URLSearchParams(window.location.search);
    const plan = p.get("plan");
    const time = p.get("time");
    return Object.freeze({
      tries: toCount(p.get("tries")),
      dodges: toCount(p.get("dodges")),
      plan: plan && hasOwn(PLANS, plan) ? plan : null,
      time: TIMES.includes(time) ? time : null
    });
  };

  const buildUrl = (page, params) => {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) p.set(key, String(value));
    });
    const query = p.toString();
    return query ? `${PAGES[page]}?${query}` : PAGES[page];
  };

  const go = (page, params) => {
    const url = buildUrl(page, params);
    if (reduceMotion) { window.location.href = url; return; }
    document.body.classList.add("is-leaving");
    window.setTimeout(() => { window.location.href = url; }, LEAVE_MS);
  };

  // Кнопка «назад» достаёт страницу из кэша вместе с классом ухода — снимаем его
  window.addEventListener("pageshow", () => document.body.classList.remove("is-leaving"));

  const REQUIRES = Object.freeze({ when: ["plan"], time: ["plan"], done: ["plan", "time"] });

  const guard = (page, state) => {
    const missing = (REQUIRES[page] || []).find((key) => state[key] === null);
    if (!missing) return true;
    window.location.replace(buildUrl(missing, { ...state, [missing]: null }));
    return false;
  };

  const onOption = (containerId, handler) => {
    $(containerId).addEventListener("click", (e) => {
      const opt = e.target.closest(".option");
      if (opt) handler(opt);
    });
  };

  // ===== Страница 1: приглашение и убегающая «Нет» =====
  const initAsk = () => {
    const name = CONFIG.herName.trim();
    if (name) $("greeting").textContent = `Привет, ${name}.`;

    const noBtn = $("noBtn");
    const yesBtn = $("yesBtn");
    const pos = { x: 0, y: 0 };
    let tries = 0;

    const startRunning = () => {
      if (noBtn.classList.contains("is-running")) return;
      const r = noBtn.getBoundingClientRect();
      $("noSlot").style.width = `${r.width}px`;
      $("noSlot").style.height = `${r.height}px`;
      pos.x = r.left;
      pos.y = r.top;
      document.body.appendChild(noBtn);
      noBtn.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      noBtn.classList.add("is-running");
      noBtn.getBoundingClientRect(); // фиксируем старт до анимации
    };

    const randomTarget = (w, h) => {
      const maxX = Math.max(FLEE_MARGIN, window.innerWidth - w - FLEE_MARGIN);
      const maxY = Math.max(FLEE_MARGIN, window.innerHeight - h - FLEE_MARGIN);
      for (let i = 0; i < 12; i++) {
        const x = FLEE_MARGIN + Math.random() * (maxX - FLEE_MARGIN);
        const y = FLEE_MARGIN + Math.random() * (maxY - FLEE_MARGIN);
        if (Math.hypot(x - pos.x, y - pos.y) >= MIN_JUMP) return { x, y };
      }
      return { x: pos.x > maxX / 2 ? FLEE_MARGIN : maxX, y: pos.y > maxY / 2 ? FLEE_MARGIN : maxY };
    };

    const flee = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      startRunning();
      const r = noBtn.getBoundingClientRect();
      const target = randomTarget(r.width, r.height);
      pos.x = target.x;
      pos.y = target.y;
      noBtn.style.transform = `translate(${pos.x}px, ${pos.y}px)`;

      tries += 1;
      const [label, taunt] = NO_TAUNTS[Math.min(tries - 1, NO_TAUNTS.length - 1)];
      noBtn.textContent = label;
      $("taunt").textContent = taunt;
      $("hint").hidden = tries < HINT_AFTER;
      yesBtn.style.setProperty("--grow", Math.min(MAX_GROW, 1 + tries * GROW_STEP).toFixed(2));
    };

    noBtn.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") flee(e); });
    noBtn.addEventListener("pointerdown", flee);
    noBtn.addEventListener("touchstart", flee, { passive: false });
    noBtn.addEventListener("click", flee);
    noBtn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") flee(e); });

    window.addEventListener("resize", () => {
      if (!noBtn.classList.contains("is-running")) return;
      const r = noBtn.getBoundingClientRect();
      pos.x = Math.min(pos.x, Math.max(FLEE_MARGIN, window.innerWidth - r.width - FLEE_MARGIN));
      pos.y = Math.min(pos.y, Math.max(FLEE_MARGIN, window.innerHeight - r.height - FLEE_MARGIN));
      noBtn.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    });

    yesBtn.addEventListener("click", () => {
      noBtn.hidden = true;
      go("plan", { tries, yay: 1 });
    });
  };

  // ===== Страница 2: вариант свидания =====
  const initPlan = (state) => {
    if (new URLSearchParams(window.location.search).get("yay") === "1") burst(50);
    onOption("planOptions", (opt) => go("when", { ...state, plan: opt.dataset.plan, time: null }));
  };

  // ===== Страница 3: когда (только сегодня) =====
  const initWhen = (state) => {
    $("planEcho").textContent = PLANS[state.plan].echo;
    let dodges = state.dodges;

    onOption("whenOptions", (opt) => {
      if (opt.dataset.day === TODAY) { go("time", { ...state, dodges }); return; }
      dodges += 1;
      opt.classList.add("is-rejected");
      opt.classList.remove("wobble");
      void opt.offsetWidth; // перезапуск анимации
      opt.classList.add("wobble");
      $("whenTaunt").textContent = DODGE_TAUNTS[Math.min(dodges - 1, DODGE_TAUNTS.length - 1)];
    });
  };

  // ===== Страница 4: во сколько =====
  const initTime = (state) => {
    onOption("timeOptions", (opt) => go("done", { ...state, time: opt.dataset.time }));
  };

  // ===== Страница 5: билет =====
  const answerText = (state) => {
    const plan = PLANS[state.plan];
    return [
      "Я согласна на свидание! 💘",
      `Что: ${plan.title}`,
      `Когда: сегодня в ${state.time}`,
      `Попыток нажать «Нет»: ${state.tries}`,
      `Попыток перенести: ${state.dodges}`
    ].join("\n");
  };

  // ===== Уведомление в Telegram =====
  const NOTIFY_KEY_PREFIX = "svidanie-notified:";

  const notifyText = (state) => {
    const plan = PLANS[state.plan];
    const when = new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
    return [
      "💘 Она согласилась на свидание!",
      "",
      `${plan.emoji} Что: ${plan.title}`,
      `🕘 Когда: сегодня в ${state.time}`,
      `🙅 Попыток нажать «Нет»: ${state.tries}`,
      `📅 Попыток перенести: ${state.dodges}`,
      "",
      `Ответ получен: ${when}`
    ].join("\n");
  };

  // Повторная загрузка страницы с тем же выбором не шлёт дубль
  const alreadyNotified = (key) => {
    try { return window.sessionStorage.getItem(key) === "1"; } catch { return false; }
  };
  const markNotified = (key) => {
    try { window.sessionStorage.setItem(key, "1"); } catch { /* хранилище недоступно: возможен дубль, не критично */ }
  };

  const notifyTelegram = (state) => {
    const token = CONFIG.telegramToken.trim();
    const chatId = CONFIG.telegramChatId.trim();
    if (!token || !chatId) return;
    const key = `${NOTIFY_KEY_PREFIX}${state.plan}|${state.time}|${state.tries}|${state.dodges}`;
    if (alreadyNotified(key)) return;

    // form-urlencoded — «простой» запрос без CORS-preflight, Telegram его принимает
    const body = new URLSearchParams({ chat_id: chatId, text: notifyText(state) });
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", body })
      .then((res) => {
        document.body.dataset.notify = res.ok ? "sent" : `failed-${res.status}`;
        if (res.ok) markNotified(key);
      })
      .catch(() => { document.body.dataset.notify = "failed-network"; }); // ей ошибку не показываем
  };

  const initDone = (state) => {
    const plan = PLANS[state.plan];
    $("tNo").textContent = `№ ${Math.floor(100000 + Math.random() * 900000)}`;
    $("tWhat").textContent = `${plan.emoji} ${plan.title}`;
    $("tWhen").textContent = `Сегодня в ${state.time}`;
    $("tTries").textContent = state.tries === 0 ? "0 — сразу согласилась, умница" : `${state.tries} (все безуспешные)`;
    $("tDodges").textContent = state.dodges === 0 ? "0 — сегодня, без вариантов" : `${state.dodges} (не прокатило)`;
    $("tFrom").textContent = CONFIG.signature;

    $("copyBtn").addEventListener("click", () => {
      const text = answerText(state);
      const show = (msg) => { $("copied").textContent = msg; };
      if (!navigator.clipboard) { show(text); return; }
      navigator.clipboard.writeText(text)
        .then(() => show("Скопировано! Вставь мне в чат 😘"))
        .catch(() => show(text));
    });
    $("againBtn").addEventListener("click", () => go("plan", { tries: state.tries, dodges: state.dodges }));

    burst(130);
    notifyTelegram(state);
  };

  // ===== Конфетти из сердечек (спрайты, без fillText каждый кадр) =====
  const GLYPHS = ["💖", "💘", "✨", "🌸", "💕", "🎉"];
  const SPRITE_PX = 64;
  const MAX_DPR = 2;
  const FRAME_MS = 1000 / 60;
  const GRAVITY = 0.32;
  const FADE = 0.007;
  const fx = { canvas: null, ctx: null, sprites: null, particles: [], raf: 0, last: 0, dpr: 1 };

  const buildSprites = () => GLYPHS.map((glyph) => {
    const c = document.createElement("canvas");
    c.width = c.height = SPRITE_PX;
    const g = c.getContext("2d");
    g.font = `${SPRITE_PX * 0.8}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(glyph, SPRITE_PX / 2, SPRITE_PX / 2 + SPRITE_PX * 0.05);
    return c;
  });

  const resizeFx = () => {
    fx.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    fx.canvas.width = Math.round(window.innerWidth * fx.dpr);
    fx.canvas.height = Math.round(window.innerHeight * fx.dpr);
  };

  const setupFx = () => {
    fx.canvas = document.createElement("canvas");
    fx.canvas.className = "confetti";
    fx.canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(fx.canvas);
    fx.ctx = fx.canvas.getContext("2d");
    fx.sprites = buildSprites();
    resizeFx();
    window.addEventListener("resize", resizeFx);
  };

  const makeParticle = () => ({
    x: window.innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: window.innerHeight * 0.55,
    vx: (Math.random() - 0.5) * 14,
    vy: -8 - Math.random() * 10,
    size: 18 + Math.random() * 18,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.2,
    sprite: fx.sprites[Math.floor(Math.random() * fx.sprites.length)],
    life: 1
  });

  // Горячий цикл: частицы обновляются на месте, чтобы не нагружать сборщик мусора каждый кадр
  const advance = (p, k) => {
    p.vy += GRAVITY * k;
    p.vx *= Math.pow(0.99, k);
    p.x += p.vx * k;
    p.y += p.vy * k;
    p.rot += p.vr * k;
    p.life -= FADE * k;
    return p.life > 0 && p.y < window.innerHeight + 60;
  };

  const drawParticle = (p) => {
    const cos = Math.cos(p.rot) * fx.dpr;
    const sin = Math.sin(p.rot) * fx.dpr;
    fx.ctx.setTransform(cos, sin, -sin, cos, p.x * fx.dpr, p.y * fx.dpr);
    fx.ctx.globalAlpha = Math.min(1, p.life * 1.5);
    fx.ctx.drawImage(p.sprite, -p.size / 2, -p.size / 2, p.size, p.size);
  };

  const tick = (ts) => {
    const k = fx.last ? Math.min(3, (ts - fx.last) / FRAME_MS) : 1;
    fx.last = ts;
    fx.ctx.setTransform(1, 0, 0, 1, 0, 0);
    fx.ctx.globalAlpha = 1;
    fx.ctx.clearRect(0, 0, fx.canvas.width, fx.canvas.height);
    fx.particles = fx.particles.filter((p) => advance(p, k));
    fx.particles.forEach(drawParticle);
    fx.raf = fx.particles.length ? requestAnimationFrame(tick) : 0;
    if (!fx.raf) fx.last = 0;
  };

  function burst(count) {
    if (reduceMotion) return;
    if (!fx.canvas) setupFx();
    fx.particles = fx.particles.concat(Array.from({ length: count }, makeParticle));
    if (!fx.raf) fx.raf = requestAnimationFrame(tick);
  }

  // ===== Запуск =====
  const INITS = Object.freeze({ ask: initAsk, plan: initPlan, when: initWhen, time: initTime, done: initDone });
  const page = document.body.dataset.page;
  const state = readState();
  if (hasOwn(INITS, page) && guard(page, state)) INITS[page](state);
})();
