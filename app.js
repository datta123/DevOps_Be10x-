(() => {
  "use strict";

  const STORAGE_KEY = "pennywise-data-v1";
  const COLORS = ["#4c9a6a", "#e7b650", "#df7966", "#8275c4", "#5ba2a3", "#da9c5d", "#8ba563", "#c8799c", "#7293c6", "#b58b55", "#55a47a", "#8d8993"];
  const DEFAULT_CATEGORIES = [
    { name: "Food & dining", type: "expense", icon: "🍲", color: "#e9ae4b" },
    { name: "Transport", type: "expense", icon: "🚗", color: "#5b9e9b" },
    { name: "Shopping", type: "expense", icon: "🛍", color: "#d77c69" },
    { name: "Bills & utilities", type: "expense", icon: "💡", color: "#8976c2" },
    { name: "Housing", type: "expense", icon: "🏠", color: "#6190bb" },
    { name: "Health", type: "expense", icon: "✚", color: "#55a47a" },
    { name: "Entertainment", type: "expense", icon: "🎬", color: "#d981a4" },
    { name: "Personal care", type: "expense", icon: "✦", color: "#bc8e61" },
    { name: "Education", type: "expense", icon: "📚", color: "#7089bf" },
    { name: "Travel", type: "expense", icon: "✈", color: "#51a0a8" },
    { name: "Groceries", type: "expense", icon: "🥬", color: "#79a25f" },
    { name: "Other", type: "expense", icon: "◈", color: "#958a7a" },
    { name: "Salary", type: "income", icon: "💼", color: "#4b9b6b" },
    { name: "Freelance", type: "income", icon: "✍", color: "#7b78be" },
    { name: "Other income", type: "income", icon: "↗", color: "#5c9eaa" }
  ];
  const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", GBP: "£", EUR: "€", CAD: "CA$", AUD: "A$" };
  const CATEGORY_GLYPHS = { "Food & dining": "🍲", Transport: "🚗", Shopping: "🛍", "Bills & utilities": "💡", Housing: "🏠", Health: "✚", Entertainment: "🎬", "Personal care": "✦", Education: "📚", Travel: "✈", Groceries: "🥬", Other: "◈", Salary: "💼", Freelance: "✍", "Other income": "↗" };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const today = new Date();
  const monthString = (date = today) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const dateString = (date = today) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const defaultState = () => ({
    profile: { name: "Dattatray", currency: "INR" },
    categories: DEFAULT_CATEGORIES.map((category, index) => ({ ...category, id: `cat-${index + 1}`, archived: false })),
    transactions: [],
    budgets: {},
    lastCategory: ""
  });
  let state = loadState();
  let activeType = "expense";
  let editingTransaction = null;
  let importedRows = [];
  let undoTimer = null;
  let toastTimer = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.transactions) || !Array.isArray(saved.categories)) return defaultState();
      const base = defaultState();
      return {
        ...base,
        ...saved,
        profile: { ...base.profile, ...(saved.profile || {}) },
        budgets: saved.budgets && typeof saved.budgets === "object" ? saved.budgets : {},
        transactions: saved.transactions.filter(transaction => transaction && Number.isInteger(transaction.amountMinor) && typeof transaction.date === "string")
      };
    } catch (error) {
      console.error("Could not read saved finance data.", error);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save finance data.", error);
      showToast("Could not save. Your browser storage may be full.");
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function formatMoney(minor, compact = false) {
    const amount = (Number(minor) || 0) / 100;
    const currency = state.profile.currency || "INR";
    const options = compact && amount >= 10000 ? { notation: "compact", maximumFractionDigits: 1 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency, ...options }).format(amount);
    } catch {
      return `${CURRENCY_SYMBOLS[currency] || currency} ${amount.toLocaleString("en-IN", options)}`;
    }
  }

  function categoryById(id) { return state.categories.find(category => category.id === id); }
  function activeCategories(type) { return state.categories.filter(category => category.type === type && !category.archived); }
  function monthTransactions(month) { return state.transactions.filter(transaction => transaction.date.slice(0, 7) === month); }
  function spentFor(categoryId, month) {
    return monthTransactions(month).filter(transaction => transaction.type === "expense" && transaction.categoryId === categoryId).reduce((sum, transaction) => sum + transaction.amountMinor, 0);
  }
  function budgetFor(categoryId, month) {
    let bestKey = "";
    for (const key of Object.keys(state.budgets)) {
      const [budgetMonth, id] = key.split("|");
      if (id === categoryId && budgetMonth <= month && budgetMonth > bestKey) bestKey = budgetMonth;
    }
    return bestKey ? (Number(state.budgets[`${bestKey}|${categoryId}`]) || 0) : 0;
  }
  function getMonthLabel(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    return new Date(year, monthNumber - 1, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
  }
  function showToast(message, actionLabel, action) {
    const region = $("#toast-region");
    clearTimeout(toastTimer);
    const toast = document.createElement("div");
    toast.className = "toast";
    const text = document.createElement("span");
    text.textContent = message;
    toast.append(text);
    if (actionLabel && action) {
      const button = document.createElement("button");
      button.textContent = actionLabel;
      button.addEventListener("click", () => { action(); toast.remove(); });
      toast.append(button);
    }
    region.replaceChildren(toast);
    toastTimer = setTimeout(() => toast.remove(), actionLabel ? 10000 : 3200);
  }
  function colorFor(category) { return category?.color || COLORS[0]; }
  function categoryIcon(category) { return category?.icon || CATEGORY_GLYPHS[category?.name] || "◈"; }
  function setProfileLabels() {
    $("#profile-name").textContent = state.profile.name || "Your account";
    $("#greeting-name").textContent = state.profile.name || "there";
    $("#avatar-letter").textContent = (state.profile.name || "Y").charAt(0).toUpperCase();
    $("#currency-prefix").textContent = CURRENCY_SYMBOLS[state.profile.currency] || state.profile.currency;
  }

  function renderDashboard() {
    const month = $("#dashboard-month").value || monthString();
    const transactions = monthTransactions(month);
    const income = transactions.filter(item => item.type === "income").reduce((sum, item) => sum + item.amountMinor, 0);
    const expenses = transactions.filter(item => item.type === "expense").reduce((sum, item) => sum + item.amountMinor, 0);
    const budgetTotal = activeCategories("expense").reduce((sum, category) => sum + budgetFor(category.id, month), 0);
    const remaining = budgetTotal ? budgetTotal - expenses : 0;
    $("#total-income").textContent = formatMoney(income);
    $("#total-expenses").textContent = formatMoney(expenses);
    $("#net-balance").textContent = `${income - expenses < 0 ? "−" : ""}${formatMoney(Math.abs(income - expenses))}`;
    $("#net-balance").style.color = income - expenses < 0 ? "#c96453" : "";
    $("#net-caption").textContent = income - expenses < 0 ? "⚠ Expenses exceed income" : "Income minus expenses";
    $("#budget-remaining").textContent = `${remaining < 0 ? "−" : ""}${formatMoney(Math.abs(remaining))}`;
    $("#budget-remaining").style.color = remaining < 0 ? "#c96453" : "";
    $("#budget-caption").textContent = budgetTotal ? `${formatMoney(expenses)} of ${formatMoney(budgetTotal)} used` : "Set budgets to get started";
    $("#overall-progress").style.width = `${budgetTotal ? Math.min(100, expenses / budgetTotal * 100) : 0}%`;
    $("#overall-progress").style.background = remaining < 0 ? "#da7564" : "";
    renderSpending(month);
    renderDashboardBudgets(month);
    renderTrend(month);
    renderRecent(transactions);
    renderAlerts(month);
  }

  function renderSpending(month) {
    const categories = activeCategories("expense").map(category => ({ category, amount: spentFor(category.id, month) })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);
    const total = categories.reduce((sum, item) => sum + item.amount, 0);
    $("#donut-total").textContent = formatMoney(total, true);
    const gradient = [];
    let offset = 0;
    const colors = categories.map(item => colorFor(item.category));
    categories.forEach((item, index) => {
      const next = offset + (total ? item.amount / total * 360 : 0);
      gradient.push(`${colors[index]} ${offset}deg ${next}deg`);
      offset = next;
    });
    $("#spending-donut").style.background = gradient.length ? `conic-gradient(${gradient.join(", ")})` : "conic-gradient(#e9ede9 0deg 360deg)";
    $("#spending-legend").innerHTML = categories.length ? categories.slice(0, 5).map(item =>
      `<div class="legend-item"><span class="legend-dot" style="background:${escapeHtml(colorFor(item.category))}"></span><span class="legend-name">${escapeHtml(item.category.name)}</span><span class="legend-value">${formatMoney(item.amount, true)}</span></div>`
    ).join("") : '<p class="empty-copy">Add an expense to see your breakdown.</p>';
  }

  function budgetRowMarkup(category, month) {
    const budget = budgetFor(category.id, month);
    const spent = spentFor(category.id, month);
    const percent = budget ? spent / budget * 100 : 0;
    const status = percent >= 100 ? "over" : percent >= 80 ? "warning" : "";
    return `<div class="budget-row"><div class="budget-row-top"><span class="budget-category"><i class="category-dot" style="background:${escapeHtml(colorFor(category))}"></i>${escapeHtml(category.name)}</span><span class="budget-numbers"><strong>${formatMoney(spent, true)}</strong> / ${formatMoney(budget, true)}</span></div><div class="progress-track"><div class="progress-fill ${status}" style="width:${Math.min(100, percent)}%"></div></div></div>`;
  }

  function renderDashboardBudgets(month) {
    const categories = activeCategories("expense").filter(category => budgetFor(category.id, month) > 0).sort((a, b) => spentFor(b.id, month) / budgetFor(b.id, month) - spentFor(a.id, month) / budgetFor(a.id, month)).slice(0, 4);
    const host = $("#dashboard-budgets");
    host.innerHTML = categories.length ? categories.map(category => budgetRowMarkup(category, month)).join("") : `<div class="budget-empty"><span>Let’s give your money a plan.</span><button class="button button-secondary" data-go="budgets">Set your first budget</button></div>`;
  }

  function renderTrend(selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const months = Array.from({ length: 6 }, (_, index) => new Date(year, month - 6 + index, 1));
    const values = months.map(date => monthTransactions(monthString(date)).filter(item => item.type === "expense").reduce((sum, item) => sum + item.amountMinor, 0));
    const max = Math.max(...values, 1);
    $("#trend-chart").innerHTML = months.map((date, index) => {
      const key = monthString(date);
      const label = date.toLocaleDateString("en", { month: "short" });
      return `<div class="trend-column ${key === selectedMonth ? "current" : ""}" title="${escapeHtml(getMonthLabel(key))}: ${escapeHtml(formatMoney(values[index]))}"><span class="trend-value">${values[index] ? escapeHtml(formatMoney(values[index], true)) : ""}</span><div class="trend-bar" style="height:${Math.max(values[index] ? 7 : 3, values[index] / max * 95)}%"></div><span class="trend-month">${label}</span></div>`;
    }).join("");
  }

  function transactionMarkup(transaction, compact = false) {
    const category = categoryById(transaction.categoryId);
    const name = transaction.note || category?.name || "Transaction";
    const date = new Date(`${transaction.date}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" });
    const symbol = transaction.type === "income" ? "↙" : categoryIcon(category);
    return `<div class="transaction-item"><span class="transaction-symbol">${escapeHtml(symbol)}</span><div class="transaction-main"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(category?.name || "Archived category")} · ${date}</span></div><span class="transaction-amount ${transaction.type}">${transaction.type === "income" ? "+" : "−"}${formatMoney(transaction.amountMinor)}</span>${compact ? "" : `<span class="action-cell"><button class="row-action" data-edit="${escapeHtml(transaction.id)}" aria-label="Edit transaction">✎</button><button class="row-action" data-delete="${escapeHtml(transaction.id)}" aria-label="Delete transaction">×</button></span>`}</div>`;
  }

  function renderRecent(transactions) {
    const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);
    $("#recent-transactions").innerHTML = recent.length ? recent.map(item => transactionMarkup(item, true)).join("") : '<div class="budget-empty">No transactions yet. Add one to get started.</div>';
  }

  function renderAlerts(month) {
    const reached = activeCategories("expense").map(category => {
      const budget = budgetFor(category.id, month);
      const spent = spentFor(category.id, month);
      return { category, budget, spent, percent: budget ? spent / budget * 100 : 0 };
    }).filter(item => item.budget && item.percent >= 80);
    const alertHost = $("#alert-area");
    if (!reached.length) { alertHost.replaceChildren(); return; }
    const top = reached.sort((a, b) => b.percent - a.percent)[0];
    alertHost.innerHTML = `<div class="budget-alert"><span class="alert-badge">!</span><div><strong>${top.percent >= 100 ? "Budget reached" : "Almost there"}: ${escapeHtml(top.category.name)}</strong><p>You’ve used ${Math.round(top.percent)}% of this month’s budget (${formatMoney(top.spent)} of ${formatMoney(top.budget)}).</p></div><button class="alert-close" aria-label="Dismiss alert">×</button></div>`;
  }

  function renderTransactions() {
    const search = $("#transaction-search").value.trim().toLowerCase();
    const type = $("#filter-type").value;
    const categoryId = $("#filter-category").value;
    const month = $("#filter-month").value;
    const rows = state.transactions.filter(item => (!type || item.type === type) && (!categoryId || item.categoryId === categoryId) && (!month || item.date.startsWith(month)) && (!search || `${item.note} ${categoryById(item.categoryId)?.name || ""}`.toLowerCase().includes(search))).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
    $("#transaction-rows").innerHTML = rows.map(item => {
      const category = categoryById(item.categoryId);
      const date = new Date(`${item.date}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
      return `<tr><td>${escapeHtml(item.note || category?.name || "Transaction")}</td><td><span class="table-category"><i class="category-dot" style="background:${escapeHtml(colorFor(category))}"></i>${escapeHtml(category?.name || "Archived category")}</span></td><td>${date}</td><td>${escapeHtml(item.note || "—")}</td><td class="amount-cell ${item.type}">${item.type === "income" ? "+" : "−"}${formatMoney(item.amountMinor)}</td><td class="action-cell"><button class="row-action" data-edit="${escapeHtml(item.id)}" aria-label="Edit transaction">✎</button><button class="row-action" data-delete="${escapeHtml(item.id)}" aria-label="Delete transaction">×</button></td></tr>`;
    }).join("");
    $("#transactions-empty").classList.toggle("hidden", rows.length > 0);
    $(".table-wrap").classList.toggle("hidden", rows.length === 0);
  }

  function renderBudgets() {
    const month = $("#budget-month").value || monthString();
    const categories = activeCategories("expense");
    const totalBudget = categories.reduce((sum, category) => sum + budgetFor(category.id, month), 0);
    const totalSpent = categories.reduce((sum, category) => sum + spentFor(category.id, month), 0);
    $("#budgets-total-label").textContent = totalBudget ? `${formatMoney(totalBudget)} monthly budget` : "Your monthly plan";
    $("#budgets-total-caption").textContent = totalBudget ? `${formatMoney(totalSpent)} spent · ${formatMoney(totalBudget - totalSpent)} ${totalBudget - totalSpent < 0 ? "over budget" : "remaining"}` : "Set category budgets to see your progress.";
    $("#budget-cards").innerHTML = categories.map(category => {
      const budget = budgetFor(category.id, month);
      const spent = spentFor(category.id, month);
      const percent = budget ? spent / budget * 100 : 0;
      const status = percent >= 100 ? "over" : percent >= 80 ? "warning" : "";
      return `<article class="budget-card"><div class="budget-card-heading"><span class="budget-category"><i class="category-dot" style="background:${escapeHtml(colorFor(category))}"></i>${escapeHtml(category.name)}</span><button class="budget-card-edit" data-edit-budget="${escapeHtml(category.id)}" aria-label="Edit ${escapeHtml(category.name)} budget">✎</button></div><div class="budget-card-amounts"><strong>${formatMoney(spent, true)}</strong><span>of ${budget ? formatMoney(budget, true) : "not set"}</span></div><div class="progress-track"><div class="progress-fill ${status}" style="width:${Math.min(100, percent)}%"></div></div><div class="budget-card-foot"><span>${budget ? `${Math.round(percent)}% used` : "No budget set"}</span><span>${budget ? `${formatMoney(Math.max(0, budget - spent), true)} left` : "Set a limit"}</span></div></article>`;
    }).join("");
  }

  function renderCategories() {
    for (const type of ["expense", "income"]) {
      const categories = state.categories.filter(category => category.type === type);
      const active = categories.filter(category => !category.archived);
      $(`#${type}-category-count`).textContent = `${active.length} active`;
      $(`#${type}-categories`).innerHTML = categories.map(category => `<article class="category-card" style="${category.archived ? "opacity:.5" : ""}"><span class="category-emoji">${escapeHtml(categoryIcon(category))}</span><span class="category-info"><strong>${escapeHtml(category.name)}</strong><span>${category.archived ? "Archived" : type === "expense" ? "Expense" : "Income"}</span></span><button class="category-menu" data-category-menu="${escapeHtml(category.id)}" aria-label="Edit ${escapeHtml(category.name)} category">···</button></article>`).join("");
    }
  }

  function refreshAll() {
    setProfileLabels();
    renderDashboard();
    renderTransactions();
    renderBudgets();
    renderCategories();
    populateCategoryFilters();
  }

  function populateCategoryFilters() {
    const selected = $("#filter-category").value;
    $("#filter-category").innerHTML = '<option value="">All categories</option>' + state.categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}${category.archived ? " (archived)" : ""}</option>`).join("");
    $("#filter-category").value = selected;
  }

  function openTransaction(transaction = null) {
    editingTransaction = transaction?.id || null;
    activeType = transaction?.type || "expense";
    $("#transaction-modal-title").textContent = transaction ? "Edit transaction" : "Add transaction";
    $("#transaction-amount").value = transaction ? (transaction.amountMinor / 100).toFixed(2) : "";
    $("#transaction-date").value = transaction?.date || dateString();
    $("#transaction-note").value = transaction?.note || "";
    $("#transaction-recurring").checked = false;
    $("#transaction-error").classList.add("hidden");
    $$(".type-option").forEach(button => button.classList.toggle("active", button.dataset.type === activeType));
    populateTransactionCategories(transaction?.categoryId || state.lastCategory);
    $("#transaction-dialog").showModal();
    setTimeout(() => $("#transaction-amount").focus(), 30);
  }

  function populateTransactionCategories(preferredId = "") {
    const categories = activeCategories(activeType);
    $("#transaction-category").innerHTML = categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(categoryIcon(category))} ${escapeHtml(category.name)}</option>`).join("");
    if (categories.some(category => category.id === preferredId)) $("#transaction-category").value = preferredId;
  }

  function saveTransaction(event) {
    event.preventDefault();
    const amount = Number($("#transaction-amount").value);
    const categoryId = $("#transaction-category").value;
    const date = $("#transaction-date").value;
    const note = $("#transaction-note").value.trim();
    const error = $("#transaction-error");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999999) {
      error.textContent = "Enter an amount greater than zero.";
      error.classList.remove("hidden");
      return;
    }
    if (!categoryById(categoryId) || !date) {
      error.textContent = "Choose a category and date.";
      error.classList.remove("hidden");
      return;
    }
    const amountMinor = Math.round(amount * 100);
    const duplicate = state.transactions.some(item => item.id !== editingTransaction && item.type === activeType && item.amountMinor === amountMinor && item.date === date && item.categoryId === categoryId);
    if (duplicate && !window.confirm("A transaction with the same amount, date, and category already exists. Save another one?")) return;
    if (editingTransaction) {
      const index = state.transactions.findIndex(item => item.id === editingTransaction);
      if (index >= 0) state.transactions[index] = { ...state.transactions[index], type: activeType, amountMinor, date, categoryId, note };
    } else {
      state.transactions.push({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, type: activeType, amountMinor, date, categoryId, note, createdAt: new Date().toISOString() });
    }
    state.lastCategory = categoryId;
    saveState();
    $("#transaction-dialog").close();
    refreshAll();
    showToast(editingTransaction ? "Transaction updated." : "Transaction saved.");
    editingTransaction = null;
  }

  function deleteTransaction(id) {
    const index = state.transactions.findIndex(item => item.id === id);
    if (index < 0) return;
    const [removed] = state.transactions.splice(index, 1);
    saveState();
    refreshAll();
    showToast("Transaction deleted.", "Undo", () => { state.transactions.splice(index, 0, removed); saveState(); refreshAll(); });
  }

  function openBudgetForm(categories = activeCategories("expense")) {
    const month = $("#budget-month").value || monthString();
    $("#budget-form-fields").innerHTML = categories.map(category => `<div class="budget-form-item"><i class="category-dot" style="background:${escapeHtml(colorFor(category))}"></i><label for="budget-${escapeHtml(category.id)}">${escapeHtml(category.name)}</label><span>${escapeHtml(CURRENCY_SYMBOLS[state.profile.currency] || state.profile.currency)}</span><input id="budget-${escapeHtml(category.id)}" data-budget-category="${escapeHtml(category.id)}" type="number" min="0" step="0.01" placeholder="—" value="${budgetFor(category.id, month) ? (budgetFor(category.id, month) / 100).toFixed(2) : ""}"></div>`).join("");
    $("#budget-dialog").showModal();
  }

  function saveBudgets(event) {
    event.preventDefault();
    const month = $("#budget-month").value || monthString();
    $$("[data-budget-category]").forEach(input => {
      const amount = Number(input.value);
      const key = `${month}|${input.dataset.budgetCategory}`;
      if (input.value.trim() && Number.isFinite(amount) && amount > 0) state.budgets[key] = Math.round(amount * 100);
      else delete state.budgets[key];
    });
    saveState();
    $("#budget-dialog").close();
    refreshAll();
    showToast("Budgets saved.");
  }

  function categoryMenu(id) {
    const category = categoryById(id);
    if (!category) return;
    const choice = window.prompt(`Category: ${category.name}\nEnter a new name to rename, "archive" to hide it, "color" to recolour it, or "delete" to remove it.`, category.name);
    if (choice === null) return;
    const command = choice.trim();
    if (command.toLowerCase() === "delete") {
      const related = state.transactions.filter(transaction => transaction.categoryId === id);
      let replacement = null;
      if (related.length) {
        const options = activeCategories(category.type).filter(item => item.id !== id);
        if (!options.length) { showToast("Add another category before deleting this one."); return; }
        const selected = window.prompt(`Move ${related.length} transaction${related.length === 1 ? "" : "s"} to which category?\n${options.map(item => item.name).join(", ")}`);
        if (selected === null) return;
        replacement = options.find(item => item.name.toLowerCase() === selected.trim().toLowerCase());
        if (!replacement) { showToast("Enter the name of an active category of the same type."); return; }
      }
      if (!window.confirm(`Delete "${category.name}"${related.length ? ` and reassign ${related.length} transaction${related.length === 1 ? "" : "s"} to ${replacement.name}` : ""}?`)) return;
      if (replacement) related.forEach(transaction => { transaction.categoryId = replacement.id; });
      state.categories = state.categories.filter(item => item.id !== id);
      Object.keys(state.budgets).forEach(key => { if (key.endsWith(`|${id}`)) delete state.budgets[key]; });
      saveState();
      refreshAll();
      showToast("Category deleted.");
      return;
    } else if (command.toLowerCase() === "archive") {
      category.archived = !category.archived;
    } else if (command.toLowerCase() === "color") {
      category.color = window.prompt("Enter a hex color (for example #4c9a6a):", category.color) || category.color;
      if (!/^#[0-9a-f]{6}$/i.test(category.color)) { showToast("Enter a valid 6-digit hex color."); return; }
    } else if (command && command !== category.name) {
      if (state.categories.some(item => item.type === category.type && item.name.toLowerCase() === command.toLowerCase() && item.id !== id)) { showToast("A category with that name already exists."); return; }
      category.name = command.slice(0, 40);
    }
    saveState();
    refreshAll();
  }

  function addCategory() {
    const name = window.prompt("What would you like to call this category?");
    if (!name?.trim()) return;
    const type = window.confirm("Press OK for an expense category, or Cancel for an income category.") ? "expense" : "income";
    const cleanName = name.trim().slice(0, 40);
    if (state.categories.some(category => category.type === type && category.name.toLowerCase() === cleanName.toLowerCase())) { showToast("That category already exists."); return; }
    const index = state.categories.length;
    state.categories.push({ id: `cat-${Date.now()}`, name: cleanName, type, icon: CATEGORY_GLYPHS[cleanName] || "◈", color: COLORS[index % COLORS.length], archived: false });
    saveState();
    refreshAll();
    showToast("Category added.");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCsv() {
    const rows = [["type", "amount", "date", "category", "note"], ...state.transactions.map(item => [item.type, (item.amountMinor / 100).toFixed(2), item.date, categoryById(item.categoryId)?.name || "Archived category", item.note || ""])];
    const csv = rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "pennywise-transactions.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Your CSV export is ready.");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quoted && char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(field); field = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index++;
        row.push(field);
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        field = "";
      } else field += char;
    }
    if (field || row.length) { row.push(field); if (row.some(value => value.trim())) rows.push(row); }
    return rows;
  }

  function renderImportPreview(headers, rows) {
    const workspace = $("#import-workspace");
    const fields = ["type", "amount", "date", "category", "note"];
    const normalized = headers.map(header => header.trim().toLowerCase());
    const guess = { type: ["type", "transaction type"], amount: ["amount", "value", "debit", "credit"], date: ["date", "transaction date"], category: ["category", "description"], note: ["note", "memo", "description", "details"] };
    const selects = fields.map(field => {
      const index = normalized.findIndex(header => guess[field].includes(header));
      return `<label>${field.charAt(0).toUpperCase() + field.slice(1)}<select data-map="${field}"><option value="">— Skip —</option>${headers.map((header, i) => `<option value="${i}" ${i === index ? "selected" : ""}>${escapeHtml(header || `Column ${i + 1}`)}</option>`).join("")}</select></label>`;
    }).join("");
    const preview = rows.slice(0, 20).map(row => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`).join("");
    workspace.innerHTML = `<p>Previewing ${Math.min(rows.length, 20)} of ${rows.length} rows. Match your file’s columns below.</p><div class="mapping-grid">${selects}</div><div class="preview-wrap"><table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${preview}</tbody></table></div><div class="import-actions"><button class="button button-primary" id="confirm-import">Import rows</button><button class="button button-secondary" id="cancel-import">Cancel</button></div><p class="import-status" id="import-status"></p>`;
    workspace.classList.remove("hidden");
    $("#confirm-import").addEventListener("click", confirmImport);
    $("#cancel-import").addEventListener("click", () => { workspace.classList.add("hidden"); importedRows = []; $("#csv-file").value = ""; });
    importedRows = rows;
  }

  function confirmImport() {
    const mappings = Object.fromEntries($$("[data-map]").map(select => [select.dataset.map, select.value === "" ? -1 : Number(select.value)]));
    if (mappings.amount < 0 || mappings.date < 0 || mappings.category < 0) { showToast("Map amount, date, and category columns before importing."); return; }
    const categoryMap = new Map(state.categories.map(category => [category.name.trim().toLowerCase(), category]));
    let added = 0, skipped = 0;
    importedRows.forEach(row => {
      const amount = Number(String(row[mappings.amount] || "").replace(/[,$£€₹\s]/g, ""));
      const date = normalizeDate(row[mappings.date] || "");
      const categoryName = String(row[mappings.category] || "").trim();
      const category = categoryMap.get(categoryName.toLowerCase());
      const typeRaw = mappings.type < 0 ? "" : String(row[mappings.type] || "").toLowerCase();
      const type = typeRaw.includes("income") || typeRaw.includes("credit") ? "income" : "expense";
      if (!Number.isFinite(amount) || amount <= 0 || !date || !category || category.type !== type) { skipped++; return; }
      state.transactions.push({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, type, amountMinor: Math.round(amount * 100), date, categoryId: category.id, note: mappings.note < 0 ? "" : String(row[mappings.note] || "").slice(0, 200), createdAt: new Date().toISOString() });
      added++;
    });
    saveState();
    refreshAll();
    $("#import-status").textContent = `Imported ${added} row${added === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped} invalid or unmatched row${skipped === 1 ? "" : "s"}` : ""}.`;
    $("#confirm-import").disabled = true;
    showToast(`Imported ${added} transaction${added === 1 ? "" : "s"}.`);
  }

  function normalizeDate(value) {
    const input = String(value).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(input)) {
      const [year, month, day] = input.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
    }
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? "" : dateString(parsed);
  }

  function handleCsvFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast("CSV files must be smaller than 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ""));
      if (parsed.length < 2) { showToast("This CSV has no transaction rows."); return; }
      renderImportPreview(parsed[0], parsed.slice(1));
    };
    reader.onerror = () => showToast("Could not read this file. Please try another CSV.");
    reader.readAsText(file);
  }

  function init() {
    $("#dashboard-month").value = monthString();
    $("#budget-month").value = monthString();
    $("#filter-month").value = monthString();
    $("#today-label").textContent = today.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
    $("#setting-name").value = state.profile.name || "";
    $("#setting-currency").value = state.profile.currency || "INR";
    setProfileLabels();
    refreshAll();
    $$(".nav-item").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
    $$("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
    $$("#add-transaction, #mobile-add, [data-add]").forEach(button => button.addEventListener("click", () => openTransaction()));
    $$("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
    $("#transaction-form").addEventListener("submit", saveTransaction);
    $("#budget-form").addEventListener("submit", saveBudgets);
    $$(".type-option").forEach(button => button.addEventListener("click", () => { activeType = button.dataset.type; $$(".type-option").forEach(item => item.classList.toggle("active", item === button)); populateTransactionCategories(); }));
    $("#dashboard-month").addEventListener("change", renderDashboard);
    $("#budget-month").addEventListener("change", renderBudgets);
    ["transaction-search", "filter-type", "filter-category", "filter-month"].forEach(id => $(`#${id}`).addEventListener(id === "transaction-search" ? "input" : "change", renderTransactions));
    $("#edit-budgets").addEventListener("click", () => openBudgetForm());
    $("#budget-cards").addEventListener("click", event => { const button = event.target.closest("[data-edit-budget]"); if (button) openBudgetForm([categoryById(button.dataset.editBudget)]); });
    $("#add-category").addEventListener("click", addCategory);
    $("#expense-categories").addEventListener("click", event => { const button = event.target.closest("[data-category-menu]"); if (button) categoryMenu(button.dataset.categoryMenu); });
    $("#income-categories").addEventListener("click", event => { const button = event.target.closest("[data-category-menu]"); if (button) categoryMenu(button.dataset.categoryMenu); });
    $("#transaction-rows").addEventListener("click", handleTransactionAction);
    $("#recent-transactions").addEventListener("click", handleTransactionAction);
    $("#alert-area").addEventListener("click", event => { if (event.target.closest(".alert-close")) $("#alert-area").replaceChildren(); });
    $("#export-csv").addEventListener("click", exportCsv);
    $("#csv-file").addEventListener("change", event => handleCsvFile(event.target.files[0]));
    $("#save-settings").addEventListener("click", () => {
      const name = $("#setting-name").value.trim();
      if (!name) { showToast("Please enter a display name."); return; }
      state.profile = { name: name.slice(0, 40), currency: $("#setting-currency").value };
      saveState(); refreshAll(); showToast("Settings saved.");
    });
    $("#clear-data").addEventListener("click", () => {
      if (!window.confirm("Delete all transactions, budgets, and custom categories saved in this browser? This cannot be undone.")) return;
      state = defaultState(); saveState(); $("#setting-name").value = state.profile.name; $("#setting-currency").value = state.profile.currency; refreshAll(); showToast("Local data cleared.");
    });
    [$("#transaction-dialog"), $("#budget-dialog")].forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); }));
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-go]");
      if (button) navigate(button.dataset.go);
    });
  }

  function handleTransactionAction(event) {
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (edit) openTransaction(state.transactions.find(item => item.id === edit.dataset.edit));
    if (remove) deleteTransaction(remove.dataset.delete);
  }

  function navigate(viewName) {
    const names = { dashboard: "Overview", transactions: "Transactions", budgets: "Budgets", categories: "Categories", data: "Import & export", settings: "Settings" };
    if (!names[viewName]) return;
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${viewName}`));
    $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === viewName));
    $("#current-page").textContent = names[viewName];
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
