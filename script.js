"use strict";

/* =====================================================
   1. ПЕРЕВОДЫ
   ===================================================== */

// Правильное окончание для русских слов: 1 задача, 2 задачи, 5 задач
function pluralRu(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const translations = {
  ru: {
    pageTitle: "TaskFlow — трекер задач",
    subtitle: "Планируй. Делай. Отмечай.",
    inputPlaceholder: "Что нужно сделать?",
    searchPlaceholder: "Поиск…",
    priorityLow: "Низкий",
    priorityMedium: "Средний",
    priorityHigh: "Высокий",
    add: "Добавить",
    filterAll: "Все",
    filterActive: "Активные",
    filterDone: "Выполненные",
    clearDone: "Удалить выполненные",
    empty: "Задач пока нет. Добавь первую!",
    notFound: "Ничего не найдено",
    errorEmpty: "Введите название задачи",
    errorShort: "Минимум 3 символа",
    deleted: "Задача удалена",
    undo: "Отменить",
    delete: "Удалить задачу",
    editHint: "Двойной клик — редактировать",
    progress: (done, total) => `Выполнено ${done} из ${total}`,
    counter: (n) =>
      `${n} ${pluralRu(n, ["задача", "задачи", "задач"])} в работе`,
  },
  en: {
    pageTitle: "TaskFlow — task tracker",
    subtitle: "Plan. Do. Check off.",
    inputPlaceholder: "What needs to be done?",
    searchPlaceholder: "Search…",
    priorityLow: "Low",
    priorityMedium: "Medium",
    priorityHigh: "High",
    add: "Add",
    filterAll: "All",
    filterActive: "Active",
    filterDone: "Completed",
    clearDone: "Clear completed",
    empty: "No tasks yet. Add the first one!",
    notFound: "Nothing found",
    errorEmpty: "Enter a task name",
    errorShort: "At least 3 characters",
    deleted: "Task deleted",
    undo: "Undo",
    delete: "Delete task",
    editHint: "Double-click to edit",
    progress: (done, total) => `Completed ${done} of ${total}`,
    counter: (n) => `${n} task${n === 1 ? "" : "s"} in progress`,
  },
};

/* =====================================================
   2. ХРАНИЛИЩЕ (localStorage)
   ===================================================== */

const STORAGE_KEYS = {
  tasks: "taskflow.tasks",
  theme: "taskflow.theme",
  lang: "taskflow.lang",
};

// Обёртка над localStorage: в приватном режиме браузера он может быть недоступен
const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // хранилище недоступно — приложение работает без сохранения
    }
  },
};

/* =====================================================
   3. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
   ===================================================== */

const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;

const state = {
  tasks: storage.get(STORAGE_KEYS.tasks, []),
  filter: "all", // all | active | done
  search: "",
  theme: storage.get(STORAGE_KEYS.theme, prefersLight ? "light" : "dark"),
  lang: storage.get(STORAGE_KEYS.lang, "ru"),
  errorKey: null, // текущая ошибка формы (ключ перевода)
  justAddedId: null, // id задачи, которой нужна анимация появления
  lastDeleted: null, // { task, index } — для кнопки «Отменить»
  shownPercent: 0, // процент, который сейчас показан на экране
};

/* =====================================================
   4. ЭЛЕМЕНТЫ СТРАНИЦЫ
   ===================================================== */

const $ = (selector) => document.querySelector(selector);

const els = {
  form: $("#task-form"),
  input: $("#task-input"),
  priority: $("#task-priority"),
  formError: $("#form-error"),
  list: $("#task-list"),
  empty: $("#empty-state"),
  emptyText: $("#empty-text"),
  filters: $("#filters"),
  search: $("#search"),
  counter: $("#counter"),
  clearDone: $("#clear-done"),
  progressText: $("#progress-text"),
  progressPercent: $("#progress-percent"),
  progressFill: $("#progress-fill"),
  themeToggle: $("#theme-toggle"),
  langToggle: $("#lang-toggle"),
  toast: $("#toast"),
  toastUndo: $("#toast-undo"),
};

const t = () => translations[state.lang];

/* =====================================================
   5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ===================================================== */

function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function saveTasks() {
  storage.set(STORAGE_KEYS.tasks, state.tasks);
}

function findTask(id) {
  return state.tasks.find((task) => task.id === id);
}

// Плавно меняет число на экране от from до to за duration мс
function animateNumber(element, from, to, duration = 500) {
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // замедление в конце
    element.textContent = `${Math.round(from + (to - from) * eased)}%`;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* =====================================================
   6. ОТРИСОВКА
   ===================================================== */

const DELETE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
  </svg>`;

// Создаёт HTML-элемент одной задачи.
// Текст задачи вставляется через textContent, а не innerHTML,
// чтобы введённый пользователем код (например, <script>) не выполнился.
function createTaskElement(task) {
  const tr = t();
  const priorityNames = {
    low: tr.priorityLow,
    medium: tr.priorityMedium,
    high: tr.priorityHigh,
  };

  const li = document.createElement("li");
  li.className = `task task--${task.priority}`;
  li.classList.toggle("task--done", task.done);
  li.classList.toggle("task--enter", task.id === state.justAddedId);
  li.dataset.id = task.id;
  li.dataset.testid = "task-item";

  const checkWrap = document.createElement("label");
  checkWrap.className = "task__check-wrap";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task__check";
  checkbox.checked = task.done;
  checkbox.dataset.testid = "task-checkbox";
  checkbox.setAttribute("aria-label", task.title);

  const box = document.createElement("span");
  box.className = "task__box";
  checkWrap.append(checkbox, box);

  const title = document.createElement("span");
  title.className = "task__title";
  title.textContent = task.title;
  title.title = tr.editHint;
  title.dataset.testid = "task-title";

  const badge = document.createElement("span");
  badge.className = "task__badge";
  badge.textContent = priorityNames[task.priority];
  badge.dataset.testid = "task-priority-badge";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "task__delete";
  deleteBtn.innerHTML = DELETE_ICON;
  deleteBtn.setAttribute("aria-label", tr.delete);
  deleteBtn.dataset.testid = "task-delete";

  li.append(checkWrap, title, badge, deleteBtn);
  return li;
}

// Задачи с учётом выбранного фильтра и поиска
function getVisibleTasks() {
  const query = state.search.trim().toLowerCase();

  return state.tasks.filter((task) => {
    if (state.filter === "active" && task.done) return false;
    if (state.filter === "done" && !task.done) return false;
    return task.title.toLowerCase().includes(query);
  });
}

// Обновляет прогресс, счётчик и кнопку очистки
function updateStats() {
  const tr = t();
  const total = state.tasks.length;
  const done = state.tasks.filter((task) => task.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  els.progressText.textContent = tr.progress(done, total);
  els.progressFill.style.width = `${percent}%`;
  els.counter.textContent = tr.counter(total - done);
  els.clearDone.disabled = done === 0;

  if (percent !== state.shownPercent) {
    animateNumber(els.progressPercent, state.shownPercent, percent);
    state.shownPercent = percent;
  }
}

// Главная функция: перерисовывает список по текущему состоянию
function render() {
  const visible = getVisibleTasks();

  els.list.replaceChildren(...visible.map(createTaskElement));
  state.justAddedId = null;

  const isEmpty = visible.length === 0;
  els.empty.classList.toggle("is-visible", isEmpty);
  if (isEmpty) {
    els.emptyText.textContent =
      state.tasks.length === 0 ? t().empty : t().notFound;
  }

  updateStats();
}

/* =====================================================
   7. ДЕЙСТВИЯ С ЗАДАЧАМИ
   ===================================================== */

// Проверка названия: возвращает ключ ошибки или null
function validateTitle(title) {
  if (title.length === 0) return "errorEmpty";
  if (title.length < 3) return "errorShort";
  return null;
}

function showError(errorKey) {
  state.errorKey = errorKey;
  els.formError.textContent = t()[errorKey];
  els.form.classList.add("has-error");

  // Перезапуск анимации «тряски»: убрать класс, заставить браузер
  // пересчитать стили (чтение offsetWidth) и добавить класс снова
  els.form.classList.remove("shake");
  void els.form.offsetWidth;
  els.form.classList.add("shake");
}

function clearError() {
  state.errorKey = null;
  els.formError.textContent = "";
  els.form.classList.remove("has-error");
}

function addTask(title, priority) {
  const task = {
    id: createId(),
    title,
    priority,
    done: false,
    createdAt: Date.now(),
  };

  state.tasks.unshift(task);
  state.justAddedId = task.id;
  saveTasks();

  // Новая задача активна — в фильтре «Выполненные» её не было бы видно
  if (state.filter === "done") {
    setFilter("all");
  } else {
    render();
  }
}

function toggleTask(id, li) {
  const task = findTask(id);
  if (!task) return;

  task.done = !task.done;
  saveTasks();

  // Меняем класс на месте, чтобы сработала CSS-анимация зачёркивания
  li.classList.toggle("task--done", task.done);
  updateStats();

  // Если включён фильтр, задача должна исчезнуть из списка — после анимации
  if (state.filter !== "all") {
    setTimeout(render, 300);
  }
}

function deleteTask(id, li) {
  li.classList.add("task--leaving");

  setTimeout(() => {
    const index = state.tasks.findIndex((task) => task.id === id);
    if (index === -1) return;

    const [removed] = state.tasks.splice(index, 1);
    state.lastDeleted = { task: removed, index };
    saveTasks();
    render();
    showToast();
  }, 250);
}

function undoDelete() {
  if (!state.lastDeleted) return;

  const { task, index } = state.lastDeleted;
  state.tasks.splice(index, 0, task);
  state.lastDeleted = null;
  state.justAddedId = task.id;
  saveTasks();
  render();
  hideToast();
}

function clearCompleted() {
  state.tasks = state.tasks.filter((task) => !task.done);
  saveTasks();
  render();
}

// Редактирование: название заменяется полем ввода
function startEdit(li, task) {
  const titleEl = li.querySelector(".task__title");

  const input = document.createElement("input");
  input.className = "task__edit";
  input.value = task.title;
  input.maxLength = 120;
  input.dataset.testid = "task-edit-input";

  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;

  function finish(save) {
    if (finished) return; // защита от двойного вызова (Enter + потеря фокуса)
    finished = true;

    const value = input.value.trim();
    if (save && validateTitle(value) === null) {
      task.title = value;
      saveTasks();
    }
    render();
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

/* =====================================================
   8. ФИЛЬТРЫ, ТЕМА, ЯЗЫК, УВЕДОМЛЕНИЕ
   ===================================================== */

function setFilter(filter) {
  state.filter = filter;
  els.filters.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === filter);
  });
  render();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  storage.set(STORAGE_KEYS.theme, state.theme);
}

// Переводит все элементы с атрибутами data-i18n и data-i18n-placeholder
function applyLanguage() {
  const tr = t();

  document.documentElement.lang = state.lang;
  document.title = tr.pageTitle;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = tr[el.dataset.i18n];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = tr[el.dataset.i18nPlaceholder];
  });

  els.langToggle.textContent = state.lang === "ru" ? "EN" : "RU";
  if (state.errorKey) els.formError.textContent = tr[state.errorKey];

  storage.set(STORAGE_KEYS.lang, state.lang);
  render();
}

let toastTimer = null;

function showToast() {
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4000);
}

function hideToast() {
  els.toast.classList.remove("is-visible");
  clearTimeout(toastTimer);
}

/* =====================================================
   9. ОБРАБОТЧИКИ СОБЫТИЙ
   ===================================================== */

els.form.addEventListener("submit", (event) => {
  event.preventDefault(); // не перезагружать страницу

  const title = els.input.value.trim();
  const errorKey = validateTitle(title);

  if (errorKey) {
    showError(errorKey);
    els.input.focus();
    return;
  }

  clearError();
  addTask(title, els.priority.value);
  els.input.value = "";
  els.input.focus();
});

els.input.addEventListener("input", () => {
  if (state.errorKey) clearError();
});

// Делегирование событий: один обработчик на весь список,
// а не отдельный на каждую задачу
els.list.addEventListener("change", (event) => {
  if (!event.target.matches(".task__check")) return;
  const li = event.target.closest(".task");
  toggleTask(li.dataset.id, li);
});

els.list.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest(".task__delete");
  if (!deleteBtn) return;
  const li = deleteBtn.closest(".task");
  deleteTask(li.dataset.id, li);
});

els.list.addEventListener("dblclick", (event) => {
  const titleEl = event.target.closest(".task__title");
  if (!titleEl) return;
  const li = titleEl.closest(".task");
  const task = findTask(li.dataset.id);
  if (task) startEdit(li, task);
});

els.filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (button) setFilter(button.dataset.filter);
});

els.search.addEventListener("input", () => {
  state.search = els.search.value;
  render();
});

els.clearDone.addEventListener("click", clearCompleted);
els.toastUndo.addEventListener("click", undoDelete);

els.themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
});

els.langToggle.addEventListener("click", () => {
  state.lang = state.lang === "ru" ? "en" : "ru";
  applyLanguage();
});

/* =====================================================
   10. ЗАПУСК
   ===================================================== */

applyTheme();
applyLanguage(); // внутри вызывается render()
