// Учёт достижений — admin console.
// Talks to the Netlify Functions API; the session lives in the nf_jwt cookie,
// so every request is a same-origin fetch with credentials included by default.

const $ = (id) => document.getElementById(id);
const gate = $("gate");
const shell = $("shell");

const state = {
  students: [],
  events: [],
  levelChoices: [],
  participations: [],
};

/* ---------- helpers ---------- */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function note(target, message, kind = "ok") {
  target.innerHTML = message
    ? `<div class="note${kind === "error" ? " note--error" : ""}" role="status">${escapeHtml(message)}</div>`
    : "";
}

function skeleton(target, rows = 4) {
  target.innerHTML = `<div class="skeleton">${"<span></span>".repeat(rows)}</div>`;
}

function emptyState(title, hint) {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong>${escapeHtml(hint)}</div>`;
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function levelLabel(code) {
  const found = state.levelChoices.find(([value]) => value === code);
  return found ? found[1] : code;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 401 || response.status === 403) {
    let message = "Доступ запрещён.";
    try {
      const body = await response.clone().json();
      if (body?.error) message = body.error;
    } catch { /* non-JSON body */ }
    if (response.status === 401) {
      showGate(message);
      throw new Error(message);
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const body = isJson ? await response.json() : null;
  if (!response.ok) throw new Error(body?.error ?? `Ошибка запроса (${response.status})`);
  return body;
}

/* ---------- auth ---------- */

function showGate(message) {
  shell.hidden = true;
  gate.hidden = false;
  const box = $("loginError");
  if (message) {
    box.textContent = message;
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
  }
}

function showShell(email) {
  gate.hidden = true;
  shell.hidden = false;
  $("whoami").textContent = email ?? "";
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("loginBtn");
  button.disabled = true;
  button.textContent = "Проверка…";
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("email").value, password: $("password").value }),
    });
    $("loginError").classList.add("hidden");
    $("password").value = "";
    showShell(result.email);
    await bootstrap();
    navigate("upload");
  } catch (err) {
    const box = $("loginError");
    box.textContent = err.message;
    box.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Войти";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch { /* clearing the session locally is enough */ }
  showGate();
});

/* ---------- routing ---------- */

function navigate(view) {
  for (const section of document.querySelectorAll(".view")) {
    section.classList.toggle("hidden", section.dataset.view !== view);
  }
  for (const link of document.querySelectorAll(".rail__link")) {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (location.hash.slice(1) !== view) location.hash = view;
}

$("nav").addEventListener("click", (event) => {
  const button = event.target.closest(".rail__link");
  if (button) navigate(button.dataset.view);
});

window.addEventListener("hashchange", () => {
  const view = location.hash.slice(1);
  if (view && document.querySelector(`.view[data-view="${view}"]`)) navigate(view);
});

/* ---------- students ---------- */

function renderStudents() {
  const target = $("studentTable");
  $("studentCount").textContent = state.students.length;
  if (!state.students.length) {
    target.innerHTML = emptyState("Список пуст", "Добавьте студента через форму слева или загрузите файл XLSX.");
    return;
  }
  target.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>ФИО</th><th>Группа</th><th></th></tr></thead>
    <tbody>${state.students.map((s) => `<tr>
      <td>${escapeHtml(s.fullName)}</td>
      <td><span class="tag">${escapeHtml(s.group || "—")}</span></td>
      <td class="act">
        <button class="btn btn--ghost btn--small" data-edit-student="${s.id}">Изменить</button>
        <button class="btn btn--danger btn--small" data-del-student="${s.id}">Удалить</button>
      </td></tr>`).join("")}</tbody></table></div>`;
}

function resetStudentForm() {
  $("studentId").value = "";
  $("studentForm").reset();
  $("studentFormTitle").textContent = "Новый студент";
  $("studentCancel").classList.add("hidden");
}

$("studentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("studentId").value;
  const payload = { fullName: $("studentName").value, group: $("studentGroup").value };
  try {
    await api(id ? `/api/students?id=${id}` : "/api/students", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    note($("studentResult"), id ? "Студент обновлён." : "Студент добавлен.");
    resetStudentForm();
    await loadStudents();
  } catch (err) {
    note($("studentResult"), err.message, "error");
  }
});

$("studentCancel").addEventListener("click", resetStudentForm);

$("studentTable").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-student]");
  if (edit) {
    const student = state.students.find((s) => String(s.id) === edit.dataset.editStudent);
    if (!student) return;
    $("studentId").value = student.id;
    $("studentName").value = student.fullName;
    $("studentGroup").value = student.group;
    $("studentFormTitle").textContent = `Изменение: ${student.fullName}`;
    $("studentCancel").classList.remove("hidden");
    $("studentName").focus();
    return;
  }
  const del = event.target.closest("[data-del-student]");
  if (del) {
    const student = state.students.find((s) => String(s.id) === del.dataset.delStudent);
    if (!student) return;
    if (!confirm(`Удалить студента «${student.fullName}» и все его участия?`)) return;
    try {
      await api(`/api/students?id=${student.id}`, { method: "DELETE" });
      note($("studentResult"), "Студент удалён.");
      await Promise.all([loadStudents(), loadParticipations()]);
    } catch (err) {
      note($("studentResult"), err.message, "error");
    }
  }
});

async function loadStudents() {
  skeleton($("studentTable"));
  state.students = await api("/api/students");
  renderStudents();
  fillStudentSelects();
}

function fillStudentSelects() {
  const options = state.students
    .map((s) => `<option value="${s.id}">${escapeHtml(s.fullName)}${s.group ? ` (${escapeHtml(s.group)})` : ""}</option>`)
    .join("");
  for (const id of ["reportStudent", "partStudent"]) {
    const select = $(id);
    const previous = select.value;
    select.innerHTML = `<option value="">— выберите —</option>${options}`;
    if (previous) select.value = previous;
  }
}

/* ---------- events ---------- */

function renderEvents() {
  const target = $("eventTable");
  $("eventCount").textContent = state.events.length;
  if (!state.events.length) {
    target.innerHTML = emptyState("Мероприятий нет", "Добавьте мероприятие или загрузите файл XLSX.");
    return;
  }
  target.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Название</th><th>Уровень</th><th>Даты</th><th></th></tr></thead>
    <tbody>${state.events.map((e) => `<tr>
      <td>${escapeHtml(e.name)}${e.isFirstTime ? ' <span class="tag tag--copper">впервые</span>' : ""}</td>
      <td>${escapeHtml(levelLabel(e.level))}</td>
      <td class="num">${formatDate(e.startDate)}<br>${formatDate(e.endDate)}</td>
      <td class="act">
        <button class="btn btn--ghost btn--small" data-edit-event="${e.id}">Изменить</button>
        <button class="btn btn--danger btn--small" data-del-event="${e.id}">Удалить</button>
      </td></tr>`).join("")}</tbody></table></div>`;
}

function resetEventForm() {
  $("eventId").value = "";
  $("eventForm").reset();
  $("eventFormTitle").textContent = "Новое мероприятие";
  $("eventCancel").classList.add("hidden");
}

$("eventForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("eventId").value;
  const payload = {
    name: $("eventName").value,
    level: $("eventLevel").value,
    startDate: $("eventStart").value,
    endDate: $("eventEnd").value,
    isFirstTime: $("eventFirstTime").checked,
  };
  try {
    await api(id ? `/api/events?id=${id}` : "/api/events", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    note($("eventResult"), id ? "Мероприятие обновлено." : "Мероприятие добавлено.");
    resetEventForm();
    await loadEvents();
  } catch (err) {
    note($("eventResult"), err.message, "error");
  }
});

$("eventCancel").addEventListener("click", resetEventForm);

$("eventTable").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-event]");
  if (edit) {
    const item = state.events.find((e) => String(e.id) === edit.dataset.editEvent);
    if (!item) return;
    $("eventId").value = item.id;
    $("eventName").value = item.name;
    $("eventLevel").value = item.level;
    $("eventStart").value = String(item.startDate).slice(0, 10);
    $("eventEnd").value = String(item.endDate).slice(0, 10);
    $("eventFirstTime").checked = Boolean(item.isFirstTime);
    $("eventFormTitle").textContent = "Изменение мероприятия";
    $("eventCancel").classList.remove("hidden");
    $("eventName").focus();
    return;
  }
  const del = event.target.closest("[data-del-event]");
  if (del) {
    const item = state.events.find((e) => String(e.id) === del.dataset.delEvent);
    if (!item) return;
    if (!confirm(`Удалить мероприятие «${item.name}» и все связанные участия?`)) return;
    try {
      await api(`/api/events?id=${item.id}`, { method: "DELETE" });
      note($("eventResult"), "Мероприятие удалено.");
      await Promise.all([loadEvents(), loadParticipations()]);
    } catch (err) {
      note($("eventResult"), err.message, "error");
    }
  }
});

async function loadEvents() {
  skeleton($("eventTable"));
  const data = await api("/api/events");
  state.events = data.events;
  state.levelChoices = data.levelChoices;
  $("eventLevel").innerHTML = state.levelChoices
    .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
    .join("");
  renderEvents();
  fillEventSelect();
}

function fillEventSelect() {
  const select = $("partEvent");
  const previous = select.value;
  select.innerHTML = `<option value="">— выберите —</option>${state.events
    .map((e) => `<option value="${e.id}">${escapeHtml(e.name)} · ${formatDate(e.startDate)}</option>`)
    .join("")}`;
  if (previous) select.value = previous;
}

/* ---------- participations ---------- */

function renderParticipations() {
  const target = $("partTable");
  $("partCount").textContent = state.participations.length;

  const totalHours = state.participations.reduce((sum, p) => sum + p.hours, 0);
  $("partStats").innerHTML = `
    <div class="stat"><b>${state.participations.length}</b><span>участий</span></div>
    <div class="stat"><b>${totalHours}</b><span>часов всего</span></div>
    <div class="stat"><b>${state.students.length}</b><span>студентов</span></div>
    <div class="stat"><b>${state.events.length}</b><span>мероприятий</span></div>`;

  if (!state.participations.length) {
    target.innerHTML = emptyState("Участий нет", "Добавьте участие или загрузите файл XLSX.");
    return;
  }
  target.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Студент</th><th>Мероприятие</th><th>Роль</th><th>Часы</th><th></th></tr></thead>
    <tbody>${state.participations.map((p) => `<tr>
      <td>${escapeHtml(p.studentName)}</td>
      <td>${escapeHtml(p.eventName)}</td>
      <td>${escapeHtml(p.role || "—")}</td>
      <td class="num">${p.hours}</td>
      <td class="act">
        <button class="btn btn--ghost btn--small" data-edit-part="${p.id}">Изменить</button>
        <button class="btn btn--danger btn--small" data-del-part="${p.id}">Удалить</button>
      </td></tr>`).join("")}</tbody></table></div>`;
}

function resetPartForm() {
  $("partId").value = "";
  $("partForm").reset();
  $("partFormTitle").textContent = "Новое участие";
  $("partCancel").classList.add("hidden");
}

$("partForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("partId").value;
  const payload = {
    studentId: Number($("partStudent").value),
    eventId: Number($("partEvent").value),
    role: $("partRole").value,
    hours: Number($("partHours").value),
  };
  try {
    await api(id ? `/api/participations?id=${id}` : "/api/participations", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    note($("partResult"), id ? "Участие обновлено." : "Участие добавлено.");
    resetPartForm();
    await loadParticipations();
  } catch (err) {
    note($("partResult"), err.message, "error");
  }
});

$("partCancel").addEventListener("click", resetPartForm);

$("partTable").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-part]");
  if (edit) {
    const item = state.participations.find((p) => String(p.id) === edit.dataset.editPart);
    if (!item) return;
    $("partId").value = item.id;
    $("partStudent").value = item.studentId;
    $("partEvent").value = item.eventId;
    $("partRole").value = item.role;
    $("partHours").value = item.hours;
    $("partFormTitle").textContent = "Изменение участия";
    $("partCancel").classList.remove("hidden");
    $("partRole").focus();
    return;
  }
  const del = event.target.closest("[data-del-part]");
  if (del) {
    const item = state.participations.find((p) => String(p.id) === del.dataset.delPart);
    if (!item) return;
    if (!confirm(`Удалить участие «${item.studentName}» — «${item.eventName}»?`)) return;
    try {
      await api(`/api/participations?id=${item.id}`, { method: "DELETE" });
      note($("partResult"), "Участие удалено.");
      await loadParticipations();
    } catch (err) {
      note($("partResult"), err.message, "error");
    }
  }
});

async function loadParticipations() {
  skeleton($("partTable"));
  state.participations = await api("/api/participations");
  renderParticipations();
}

/* ---------- upload ---------- */

$("uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("file");
  if (!input.files?.length) return;
  const button = $("uploadBtn");
  button.disabled = true;
  button.textContent = "Обработка…";
  note($("uploadResult"), "");
  try {
    const body = new FormData();
    body.append("file", input.files[0]);
    const result = await api("/api/upload", { method: "POST", body });
    const lines = [
      `Обработано листов: ${result.successSheets} из ${result.totalSheets}`,
      `Создано мероприятий: ${result.totalEventsCreated}`,
      `Добавлено участий: ${result.totalParticipationsCreated}, обновлено: ${result.totalParticipationsUpdated}`,
      ...result.sheetMessages.slice(0, 5),
    ];
    if (result.errorSheets.length) {
      lines.push("", "Ошибки на листах:", ...result.errorSheets.slice(0, 5));
    }
    note($("uploadResult"), lines.join("\n"), result.successSheets ? "ok" : "error");
    input.value = "";
    await Promise.all([loadStudents(), loadEvents(), loadParticipations()]);
  } catch (err) {
    note($("uploadResult"), err.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Загрузить";
  }
});

/* ---------- report ---------- */

$("reportForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("reportBtn");
  const params = new URLSearchParams({
    studentId: $("reportStudent").value,
    dateFrom: $("dateFrom").value,
    dateTo: $("dateTo").value,
  });
  button.disabled = true;
  button.textContent = "Формирование…";
  note($("reportResult"), "");
  try {
    const response = await fetch(`/api/report?${params}`);
    if (!response.ok) {
      let message = `Ошибка запроса (${response.status})`;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch { /* non-JSON body */ }
      if (response.status === 401) showGate(message);
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const student = state.students.find((s) => String(s.id) === $("reportStudent").value);
    link.href = url;
    link.download = `Отчёт — ${student?.fullName ?? "студент"}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    note($("reportResult"), "Отчёт сформирован.");
  } catch (err) {
    note($("reportResult"), err.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Скачать PDF";
  }
});

/* ---------- bootstrap ---------- */

async function bootstrap() {
  await Promise.all([loadStudents(), loadEvents()]);
  await loadParticipations();
}

(async function init() {
  try {
    const session = await fetch("/api/auth/session").then((r) => r.json());
    if (session.authenticated && session.isAdmin) {
      showShell(session.email);
      navigate(location.hash.slice(1) || "upload");
      await bootstrap();
      return;
    }
    showGate(session.authenticated && !session.isAdmin
      ? "У этой учётной записи нет роли admin."
      : undefined);
  } catch {
    showGate("Не удалось связаться с сервером.");
  }
})();
