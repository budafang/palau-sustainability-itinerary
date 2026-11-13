(function () {
  const STORAGE_KEY = "palau_n103_state_v1";

  const state = {
    activeTab: "itinerary",
    searchQuery: "",
    selectedSdg: "ALL",
    doneDays: {},
    notes: {},
    expenses: {},
    openDrawers: {} // { [day]: "spots" | "expense" | "note" | null }
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.doneDays = parsed.doneDays || {};
        state.notes = parsed.notes || {};
        state.expenses = parsed.expenses || {};
      }
    } catch {
      // ignore storage errors
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          doneDays: state.doneDays,
          notes: state.notes,
          expenses: state.expenses
        })
      );
    } catch {
      // ignore storage errors
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Elements
  const controlsBar = document.getElementById("itinerary-controls");
  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("clear-search");
  const sdgFilterRow = document.getElementById("sdg-filter-row");
  const dayJumpRow = document.getElementById("day-jump-row");
  const itineraryList = document.getElementById("itinerary-list");
  const emptyState = document.getElementById("empty-state");
  const resetFiltersBtn = document.getElementById("reset-filters");
  const progressCount = document.getElementById("progress-count");
  const progressFill = document.getElementById("progress-fill");
  const expenseSummaryValues = document.getElementById("expense-summary-values");
  const btnToday = document.getElementById("btn-today");
  const btnTodayLabel = document.getElementById("btn-today-label");

  function calcDayTotals(dayNum) {
    const list = state.expenses[dayNum] || [];
    let usd = 0;
    let twd = 0;
    list.forEach((item) => {
      const amt = Number(item.amount) || 0;
      if (item.currency === "TWD") twd += amt;
      else usd += amt;
    });
    return { usd, twd, count: list.length };
  }

  function formatMoney(usd, twd) {
    const parts = [];
    if (usd > 0) parts.push(`USD $${usd.toFixed(2)}`);
    if (twd > 0) parts.push(`TWD $${Math.round(twd).toLocaleString()}`);
    return parts.join(" + ");
  }

  function updateExpenseSummary() {
    let totalUsd = 0;
    let totalTwd = 0;
    Object.values(state.expenses).forEach((list) => {
      (list || []).forEach((item) => {
        const amt = Number(item.amount) || 0;
        if (item.currency === "TWD") totalTwd += amt;
        else totalUsd += amt;
      });
    });
    expenseSummaryValues.textContent = `USD $${totalUsd.toFixed(2)} ｜ TWD $${Math.round(totalTwd).toLocaleString()}`;
  }

  function getTargetDayNumber() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const todayIso = `${yyyy}-${mm}-${dd}`;
    const match = PLAN_DATA.itinerary.find((d) => d.isoDate === todayIso);
    if (match) return { day: match.day, isToday: true };

    const nextUndone = PLAN_DATA.itinerary.find((d) => !state.doneDays[d.day]);
    return { day: nextUndone ? nextUndone.day : 1, isToday: false };
  }

  function updateTodayButton() {
    const target = getTargetDayNumber();
    btnTodayLabel.textContent = target.isToday
      ? `今天 Day ${target.day}`
      : `跳至 Day ${target.day}`;
  }

  function scrollToDay(dayNum) {
    if (state.activeTab !== "itinerary") {
      switchTab("itinerary");
    }
    if (state.searchQuery || state.selectedSdg !== "ALL") {
      state.searchQuery = "";
      state.selectedSdg = "ALL";
      searchInput.value = "";
      clearSearchBtn.classList.add("hidden");
      renderSdgFilters();
      renderItinerary();
    }
    const card = document.getElementById(`day-card-${dayNum}`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.classList.remove("highlight-pulse");
    void card.offsetWidth;
    card.classList.add("highlight-pulse");
    setTimeout(() => card.classList.remove("highlight-pulse"), 1400);
  }

  function updateProgress() {
    const total = PLAN_DATA.itinerary.length;
    const done = PLAN_DATA.itinerary.filter((d) => state.doneDays[d.day]).length;
    progressCount.textContent = `${done} / ${total} 天`;
    progressFill.style.width = `${Math.round((done / total) * 100)}%`;
  }

  function renderSdgFilters() {
    sdgFilterRow.innerHTML = "";
    const allChip = el(
      "button",
      `chip ${state.selectedSdg === "ALL" ? "active" : ""}`,
      "全部行程"
    );
    allChip.type = "button";
    allChip.addEventListener("click", () => {
      state.selectedSdg = "ALL";
      renderSdgFilters();
      renderItinerary();
    });
    sdgFilterRow.appendChild(allChip);

    Object.values(PLAN_DATA.sdgInfo).forEach((sdg) => {
      const chip = el(
        "button",
        `chip ${state.selectedSdg === sdg.code ? "active" : ""}`,
        `${sdg.code} ${sdg.label}`
      );
      chip.type = "button";
      chip.addEventListener("click", () => {
        state.selectedSdg = state.selectedSdg === sdg.code ? "ALL" : sdg.code;
        renderSdgFilters();
        renderItinerary();
      });
      sdgFilterRow.appendChild(chip);
    });
  }

  function renderDayJumpRow() {
    dayJumpRow.innerHTML = "";
    PLAN_DATA.itinerary.forEach((d) => {
      const shortDate = d.dateRoc.slice(4);
      const pill = el(
        "button",
        `day-pill ${state.doneDays[d.day] ? "is-done" : ""}`,
        shortDate
      );
      pill.type = "button";
      pill.addEventListener("click", () => scrollToDay(d.day));
      dayJumpRow.appendChild(pill);
    });
  }

  function matchesFilter(dayItem) {
    if (state.selectedSdg !== "ALL" && !dayItem.sdgs.includes(state.selectedSdg)) {
      return false;
    }
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) return true;
    const spotText = (dayItem.spots || [])
      .map((s) => `${s.name} ${s.desc} ${s.tip}`)
      .join(" ");
    const haystack = [
      `day ${dayItem.day}`,
      `d${dayItem.day}`,
      dayItem.dateRoc,
      dayItem.category,
      dayItem.title,
      spotText,
      ...dayItem.items,
      ...dayItem.sdgs,
      ...dayItem.tags
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  }

  function renderItinerary() {
    itineraryList.innerHTML = "";
    const filtered = PLAN_DATA.itinerary.filter(matchesFilter);

    if (filtered.length === 0) {
      emptyState.classList.remove("hidden");
      return;
    }
    emptyState.classList.add("hidden");

    filtered.forEach((d) => {
      const isDone = Boolean(state.doneDays[d.day]);
      const activeDrawer = state.openDrawers[d.day] || null;
      const card = el("article", `day-card ${isDone ? "done" : ""}`);
      card.id = `day-card-${d.day}`;

      // Header
      const header = el("div", "day-card-header");
      const meta = el("div", "day-meta");
      meta.appendChild(el("span", "day-badge", `Day ${d.day}`));
      meta.appendChild(el("span", "day-date", `${d.dateRoc}（${d.weekday}）`));

      const checkBtn = el(
        "button",
        `check-btn ${isDone ? "checked" : ""}`,
        isDone ? "✓ 已完成" : "○ 標記完成"
      );
      checkBtn.type = "button";
      checkBtn.addEventListener("click", () => {
        if (state.doneDays[d.day]) delete state.doneDays[d.day];
        else state.doneDays[d.day] = true;
        saveState();
        updateProgress();
        updateTodayButton();
        renderDayJumpRow();
        renderItinerary();
      });

      header.appendChild(meta);
      header.appendChild(checkBtn);
      card.appendChild(header);

      card.appendChild(el("div", "day-category", d.category));
      card.appendChild(el("h3", "day-title", d.title));

      const ul = el("ul", "day-items");
      d.items.forEach((text) => ul.appendChild(el("li", "", text)));
      card.appendChild(ul);

      // SDG & Tags
      const footer = el("div", "day-footer");
      const badgeGroup = el("div", "sdg-group");

      d.sdgs.forEach((code) => {
        const info = PLAN_DATA.sdgInfo[code];
        const b = el(
          "span",
          "sdg-badge",
          info ? `${info.code} ${info.label}` : code
        );
        if (info) b.style.backgroundColor = info.color;
        badgeGroup.appendChild(b);
      });

      d.tags.forEach((tag) => {
        badgeGroup.appendChild(el("span", "tag-badge", `#${tag}`));
      });
      footer.appendChild(badgeGroup);
      card.appendChild(footer);

      // 3 Action Chips: 景點介紹 / 記花費 / 筆記心得
      const actionsRow = el("div", "card-actions");

      const spotsCount = (d.spots || []).length;
      const spotsBtn = el(
        "button",
        `action-chip-btn ${activeDrawer === "spots" ? "is-active" : ""}`,
        `📍 景點介紹 (${spotsCount})`
      );
      spotsBtn.type = "button";
      spotsBtn.addEventListener("click", () => {
        state.openDrawers[d.day] = activeDrawer === "spots" ? null : "spots";
        renderItinerary();
      });

      const dayTotals = calcDayTotals(d.day);
      const expenseSummaryText = formatMoney(dayTotals.usd, dayTotals.twd);
      const expenseBtn = el(
        "button",
        `action-chip-btn ${dayTotals.count > 0 ? "has-data" : ""} ${activeDrawer === "expense" ? "is-active" : ""}`,
        expenseSummaryText ? `💰 ${expenseSummaryText}` : "💰 記花費"
      );
      expenseBtn.type = "button";
      expenseBtn.addEventListener("click", () => {
        state.openDrawers[d.day] = activeDrawer === "expense" ? null : "expense";
        renderItinerary();
      });

      const hasNote = Boolean(state.notes[d.day] && state.notes[d.day].trim());
      const noteBtn = el(
        "button",
        `action-chip-btn ${hasNote ? "has-data" : ""} ${activeDrawer === "note" ? "is-active" : ""}`,
        hasNote ? "✎ 已寫心得" : "✎ 筆記心得"
      );
      noteBtn.type = "button";
      noteBtn.addEventListener("click", () => {
        state.openDrawers[d.day] = activeDrawer === "note" ? null : "note";
        renderItinerary();
      });

      actionsRow.appendChild(spotsBtn);
      actionsRow.appendChild(expenseBtn);
      actionsRow.appendChild(noteBtn);
      card.appendChild(actionsRow);

      // Drawer 1: 景點詳細介紹
      const spotsDrawer = el(
        "div",
        `drawer-panel ${activeDrawer === "spots" ? "open" : ""}`
      );
      const spotList = el("div", "spot-list");
      (d.spots || []).forEach((spot) => {
        const sCard = el("div", "spot-card");
        sCard.appendChild(el("h4", "spot-name", spot.name));
        sCard.appendChild(el("p", "spot-desc", spot.desc));
        if (spot.tip) {
          sCard.appendChild(el("div", "spot-tip", spot.tip));
        }
        spotList.appendChild(sCard);
      });
      spotsDrawer.appendChild(spotList);
      card.appendChild(spotsDrawer);

      // Drawer 2: 花費記帳
      const expenseDrawer = el(
        "div",
        `drawer-panel ${activeDrawer === "expense" ? "open" : ""}`
      );
      const form = el("form", "expense-form");

      const row1 = el("div", "expense-row-2");
      const titleInput = el("input", "expense-input");
      titleInput.type = "text";
      titleInput.placeholder = "消費項目（例：午餐、防曬乳）";
      titleInput.required = true;

      const catSelect = el("select", "expense-select");
      PLAN_DATA.expenseCategories.forEach((cat) => {
        const opt = el("option", "", cat);
        opt.value = cat;
        catSelect.appendChild(opt);
      });
      row1.appendChild(titleInput);
      row1.appendChild(catSelect);

      const row2 = el("div", "expense-row-3");
      const amtInput = el("input", "expense-input");
      amtInput.type = "number";
      amtInput.step = "0.01";
      amtInput.min = "0";
      amtInput.inputMode = "decimal";
      amtInput.placeholder = "金額";
      amtInput.required = true;

      const curSelect = el("select", "expense-select");
      ["USD", "TWD"].forEach((cur) => {
        const opt = el("option", "", cur);
        opt.value = cur;
        curSelect.appendChild(opt);
      });

      const addBtn = el("button", "expense-add-btn", "+ 新增");
      addBtn.type = "submit";

      row2.appendChild(amtInput);
      row2.appendChild(curSelect);
      row2.appendChild(addBtn);

      form.appendChild(row1);
      form.appendChild(row2);

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const title = titleInput.value.trim();
        const amount = parseFloat(amtInput.value);
        if (!title || isNaN(amount) || amount <= 0) return;

        if (!state.expenses[d.day]) state.expenses[d.day] = [];
        state.expenses[d.day].push({
          id: Date.now() + Math.random().toString(36).slice(2, 6),
          title,
          amount,
          currency: curSelect.value,
          category: catSelect.value
        });
        saveState();
        updateExpenseSummary();
        renderItinerary();
      });

      expenseDrawer.appendChild(form);

      const expList = el("div", "expense-list");
      const dayExpenses = state.expenses[d.day] || [];
      dayExpenses.forEach((item) => {
        const row = el("div", "expense-item");
        const left = el("div", "expense-item-left");
        left.appendChild(el("span", "expense-cat", item.category));
        left.appendChild(el("span", "expense-title", item.title));

        const right = el("div", "expense-item-right");
        const formattedAmt =
          item.currency === "TWD"
            ? `TWD $${Math.round(item.amount).toLocaleString()}`
            : `USD $${Number(item.amount).toFixed(2)}`;
        right.appendChild(el("span", "expense-amt", formattedAmt));

        const delBtn = el("button", "expense-del", "✕");
        delBtn.type = "button";
        delBtn.title = "刪除此筆花費";
        delBtn.addEventListener("click", () => {
          state.expenses[d.day] = (state.expenses[d.day] || []).filter(
            (x) => x.id !== item.id
          );
          saveState();
          updateExpenseSummary();
          renderItinerary();
        });
        right.appendChild(delBtn);

        row.appendChild(left);
        row.appendChild(right);
        expList.appendChild(row);
      });
      expenseDrawer.appendChild(expList);

      if (dayTotals.count > 0) {
        expenseDrawer.appendChild(
          el(
            "div",
            "expense-day-subtotal",
            `本日小計：${formatMoney(dayTotals.usd, dayTotals.twd)}`
          )
        );
      }
      card.appendChild(expenseDrawer);

      // Drawer 3: 筆記心得
      const noteDrawer = el(
        "div",
        `drawer-panel ${activeDrawer === "note" ? "open" : ""}`
      );
      const textarea = el("textarea", "note-textarea");
      textarea.placeholder = `記錄 Day ${d.day} 的五感永續觀察、訪談重點或心得感想...`;
      textarea.value = state.notes[d.day] || "";
      textarea.addEventListener("input", (e) => {
        state.notes[d.day] = e.target.value;
        saveState();
        const written = Boolean(e.target.value.trim());
        noteBtn.textContent = written ? "✎ 已寫心得" : "✎ 筆記心得";
        noteBtn.classList.toggle("has-data", written);
      });

      noteDrawer.appendChild(textarea);
      noteDrawer.appendChild(
        el("div", "note-hint", "心得與花費皆自動儲存在此手機瀏覽器中（離線可用）。")
      );
      card.appendChild(noteDrawer);

      itineraryList.appendChild(card);
    });
  }

  function renderTraining() {
    const container = document.getElementById("training-list");
    container.innerHTML = "";
    PLAN_DATA.training.schedule.forEach((item) => {
      const isBreak = item.type === "Break";
      const card = el("div", `timeline-card ${isBreak ? "is-break" : ""}`);
      const top = el("div", "timeline-top");
      top.appendChild(el("span", "timeline-time", item.time));
      top.appendChild(el("span", "timeline-type", item.type));
      card.appendChild(top);
      card.appendChild(el("h3", "timeline-topic", item.topic));
      const ul = el("ul", "timeline-details");
      item.details.forEach((d) => ul.appendChild(el("li", "", d)));
      card.appendChild(ul);
      container.appendChild(card);
    });
  }

  function renderOrgs() {
    const container = document.getElementById("orgs-list");
    container.innerHTML = "";
    PLAN_DATA.organizations.forEach((org) => {
      const card = el("article", "org-card");
      card.appendChild(el("span", "org-role", org.role));
      card.appendChild(el("h3", "org-name", org.name));
      card.appendChild(el("p", "org-eng", org.eng));
      card.appendChild(el("p", "org-summary", org.summary));

      const link = el("a", "org-link", "開啟參考網站 ↗");
      link.href = org.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      card.appendChild(link);
      container.appendChild(card);
    });
  }

  function renderInfo() {
    const container = document.getElementById("info-content");
    container.innerHTML = "";

    const basicCard = el("section", "info-card");
    basicCard.appendChild(el("h3", "", "計畫基本資訊"));
    const kv = el("div", "info-kv");
    const pairs = [
      ["計畫組別", PLAN_DATA.meta.group],
      ["計畫名稱", `${PLAN_DATA.meta.code} ${PLAN_DATA.meta.title}`],
      ["主題類別", PLAN_DATA.meta.category],
      ["國家／城市", PLAN_DATA.meta.country],
      ["圓夢期間", PLAN_DATA.meta.periodRoc],
      ["見習名額", PLAN_DATA.meta.quota],
      ["行前培訓", `${PLAN_DATA.training.date}（${PLAN_DATA.training.location}）`]
    ];
    pairs.forEach(([k, v]) => {
      kv.appendChild(el("div", "info-k", k));
      kv.appendChild(el("div", "info-v", v));
    });
    basicCard.appendChild(kv);
    container.appendChild(basicCard);

    const noticeCard = el("section", "info-card");
    noticeCard.appendChild(el("h3", "", "重要規範與行前提醒"));
    const noticeUl = el("ul", "info-list");
    PLAN_DATA.requirements.notices.forEach((n) =>
      noticeUl.appendChild(el("li", "", n))
    );
    noticeCard.appendChild(noticeUl);
    container.appendChild(noticeCard);

    const budgetCard = el("section", "info-card");
    budgetCard.appendChild(el("h3", "", "經費規劃概覽"));
    PLAN_DATA.requirements.budget.forEach((b) => {
      const row = el("div", `budget-row ${b.highlight ? "highlight" : ""}`);
      row.appendChild(el("span", "", b.label));
      row.appendChild(el("span", "", b.amount));
      budgetCard.appendChild(row);
    });
    container.appendChild(budgetCard);

    const toolsCard = el("section", "info-card");
    toolsCard.appendChild(el("h3", "", "筆記心得與記帳匯出"));
    const actionRow = el("div", "action-row");

    const exportBtn = el("button", "btn-secondary", "匯出心得與花費 (.txt)");
    exportBtn.type = "button";
    exportBtn.addEventListener("click", exportRecords);

    const clearBtn = el("button", "btn-danger-outline", "清除所有紀錄");
    clearBtn.type = "button";
    clearBtn.addEventListener("click", () => {
      if (confirm("確定要清除所有已標記的完成狀態、花費明細與心得筆記嗎？")) {
        state.doneDays = {};
        state.notes = {};
        state.expenses = {};
        saveState();
        updateProgress();
        updateExpenseSummary();
        updateTodayButton();
        renderDayJumpRow();
        renderItinerary();
      }
    });

    actionRow.appendChild(exportBtn);
    actionRow.appendChild(clearBtn);
    toolsCard.appendChild(actionRow);
    container.appendChild(toolsCard);

    container.appendChild(el("p", "footer-disclaimer", PLAN_DATA.meta.disclaimer));
  }

  function exportRecords() {
    const lines = [
      `${PLAN_DATA.meta.code} ${PLAN_DATA.meta.title} - 田野心得與花費紀錄`,
      `圓夢期間：${PLAN_DATA.meta.periodRoc}`,
      "========================================",
      ""
    ];
    let hasAny = false;
    let totalUsd = 0;
    let totalTwd = 0;

    PLAN_DATA.itinerary.forEach((d) => {
      const note = (state.notes[d.day] || "").trim();
      const dayExpenses = state.expenses[d.day] || [];
      const status = state.doneDays[d.day] ? "[已完成]" : "[未完成]";
      if (note || dayExpenses.length > 0 || state.doneDays[d.day]) {
        hasAny = true;
        lines.push(`Day ${d.day} (${d.dateRoc} 週${d.weekday}) ${status}`);
        lines.push(`主題：${d.title}`);
        if (dayExpenses.length > 0) {
          lines.push("花費明細：");
          dayExpenses.forEach((ex) => {
            const amt = Number(ex.amount) || 0;
            if (ex.currency === "TWD") totalTwd += amt;
            else totalUsd += amt;
            lines.push(`  - [${ex.category}] ${ex.title}: ${ex.currency} $${amt}`);
          });
        }
        if (note) {
          lines.push(`筆記心得：\n${note}`);
        }
        lines.push("");
      }
    });

    if (!hasAny) {
      alert("目前還沒有任何心得筆記、花費或完成紀錄可匯出。");
      return;
    }

    lines.push("========================================");
    lines.push(`總花費統計：USD $${totalUsd.toFixed(2)} ｜ TWD $${Math.round(totalTwd).toLocaleString()}`);

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "帛琉南島永續實踐計畫_心得與花費.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-${tabName}`);
    });
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    controlsBar.classList.toggle("hidden", tabName !== "itinerary");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function initEvents() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      clearSearchBtn.classList.toggle("hidden", !state.searchQuery);
      renderItinerary();
    });

    clearSearchBtn.addEventListener("click", () => {
      state.searchQuery = "";
      searchInput.value = "";
      clearSearchBtn.classList.add("hidden");
      renderItinerary();
      searchInput.focus();
    });

    resetFiltersBtn.addEventListener("click", () => {
      state.searchQuery = "";
      state.selectedSdg = "ALL";
      searchInput.value = "";
      clearSearchBtn.classList.add("hidden");
      renderSdgFilters();
      renderItinerary();
    });

    btnToday.addEventListener("click", () => {
      const target = getTargetDayNumber();
      scrollToDay(target.day);
    });
  }

  function init() {
    loadState();
    renderSdgFilters();
    renderDayJumpRow();
    renderItinerary();
    renderTraining();
    renderOrgs();
    renderInfo();
    updateProgress();
    updateExpenseSummary();
    updateTodayButton();
    initEvents();
  }

  init();
})();
