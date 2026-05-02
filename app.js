/* ============================================================
 * Gestionnaire d'événements avec rappels relatifs
 * Stockage : localStorage
 * Structure de données :
 *   categories : [{ id, name, color, delays:[h,h,...] }]
 *   dates      : [{ id, catId, datetime (ISO) }]
 *   checks     : { taskKey: true/false }
 * ============================================================ */

const LS_KEY = 'evt-manager-v1';

// État global
let state = {
  categories: [],
  dates: [],
  checks: {},
  filterCats: null,    // null = toutes
  hideDone: false,
  viewDate: new Date() // mois affiché
};

/* -------- Persistance -------- */
function save() {
  const { categories, dates, checks } = state;
  localStorage.setItem(LS_KEY, JSON.stringify({ categories, dates, checks }));
}
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_KEY));
    if (data) Object.assign(state, data);
  } catch (e) { console.warn('Load error', e); }
}

/* -------- Helpers -------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const fmtDateTime = d => new Date(d).toLocaleString('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
});
const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/* -------- Génération des tâches -------- *
 * Pour chaque date : 1 tâche "événement" + 1 tâche par délai (J-Xh)
 */
function buildTasks() {
  const tasks = [];
  state.dates.forEach(d => {
    const cat = state.categories.find(c => c.id === d.catId);
    if (!cat) return;
    const eventDate = new Date(d.datetime);

    // Événement principal
    tasks.push({
      key: `${d.id}__event`,
      catId: cat.id, catName: cat.name, color: cat.color,
      label: `${cat.name} — Événement`,
      when: eventDate,
      isReminder: false
    });

    // Rappels (J-Xh)
    (cat.delays || []).forEach(h => {
      const reminderDate = new Date(eventDate.getTime() - h * 3600 * 1000);
      tasks.push({
        key: `${d.id}__r${h}`,
        catId: cat.id, catName: cat.name, color: cat.color,
        label: `${cat.name} — J-${h}h`,
        when: reminderDate,
        isReminder: true
      });
    });
  });
  return tasks.sort((a, b) => a.when - b.when);
}

/* ============================================================
 * RENDU : CATEGORIES
 * ============================================================ */
function renderCategories() {
  const ul = document.getElementById('catList');
  const sel = document.getElementById('dateCatSelect');
  ul.innerHTML = '';
  sel.innerHTML = '';

  state.categories.forEach(cat => {
    // Liste
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="badge" style="background:${cat.color}">${cat.name}</span>
      <span class="info">Délais : ${cat.delays.length ? cat.delays.map(h=>'J-'+h+'h').join(', ') : 'aucun'}</span>
      <input type="text" value="${cat.delays.join(',')}" data-id="${cat.id}" class="edit-delays" placeholder="ex: 96,48,24" style="flex:0 1 180px"/>
      <button data-id="${cat.id}" class="del-cat">×</button>
    `;
    ul.appendChild(li);

    // Select
    const opt = document.createElement('option');
    opt.value = cat.id; opt.textContent = cat.name;
    sel.appendChild(opt);
  });

  // Édition des délais
  ul.querySelectorAll('.edit-delays').forEach(input => {
    input.addEventListener('change', e => {
      const id = e.target.dataset.id;
      const cat = state.categories.find(c => c.id === id);
      cat.delays = parseDelays(e.target.value);
      save(); renderAll();
    });
  });

  // Suppression
  ul.querySelectorAll('.del-cat').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.dataset.id;
      if (!confirm('Supprimer cette catégorie et ses dates ?')) return;
      state.categories = state.categories.filter(c => c.id !== id);
      state.dates = state.dates.filter(d => d.catId !== id);
      save(); renderAll();
    });
  });
}

function parseDelays(str) {
  return (str || '').split(/[,;\s]+/)
    .map(s => parseInt(s, 10))
    .filter(n => !isNaN(n) && n > 0);
}

/* ============================================================
 * RENDU : DATES
 * ============================================================ */
function renderDates() {
  const ul = document.getElementById('dateList');
  ul.innerHTML = '';

  state.dates
    .slice()
    .sort((a,b) => new Date(a.datetime) - new Date(b.datetime))
    .forEach(d => {
      const cat = state.categories.find(c => c.id === d.catId);
      if (!cat) return;
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="badge" style="background:${cat.color}">${cat.name}</span>
        <input type="datetime-local" value="${d.datetime.slice(0,16)}" data-id="${d.id}" class="edit-date"/>
        <button data-id="${d.id}" class="del-date">×</button>
      `;
      ul.appendChild(li);
    });

  ul.querySelectorAll('.edit-date').forEach(inp => {
    inp.addEventListener('change', e => {
      const d = state.dates.find(x => x.id === e.target.dataset.id);
      if (d) { d.datetime = new Date(e.target.value).toISOString(); save(); renderAll(); }
    });
  });
  ul.querySelectorAll('.del-date').forEach(btn => {
    btn.addEventListener('click', e => {
      state.dates = state.dates.filter(d => d.id !== e.target.dataset.id);
      save(); renderAll();
    });
  });
}

/* ============================================================
 * RENDU : CALENDRIER
 * ============================================================ */
function renderCalendar() {
  // Filtres par catégorie
  const fdiv = document.getElementById('calFilters');
  fdiv.innerHTML = '<strong style="font-size:.85rem">Filtres :</strong>';
  state.categories.forEach(cat => {
    const chip = document.createElement('span');
    const active = !state.filterCats || state.filterCats.has(cat.id);
    chip.className = 'filter-chip' + (active ? '' : ' off');
    chip.style.background = cat.color;
    chip.textContent = cat.name;
    chip.onclick = () => {
      if (!state.filterCats) state.filterCats = new Set(state.categories.map(c=>c.id));
      if (state.filterCats.has(cat.id)) state.filterCats.delete(cat.id);
      else state.filterCats.add(cat.id);
      renderCalendar(); renderTasks();
    };
    fdiv.appendChild(chip);
  });

  const cal = document.getElementById('calendar');
  cal.innerHTML = '';
  const view = state.viewDate;
  const year = view.getFullYear(), month = view.getMonth();
  document.getElementById('monthLabel').textContent =
    view.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  // Entêtes jours
  ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].forEach(j => {
    const h = document.createElement('div');
    h.className = 'cal-head'; h.textContent = j;
    cal.appendChild(h);
  });

  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Cases vides avant
  for (let i = 0; i < startOffset; i++) {
    const c = document.createElement('div');
    c.className = 'cal-cell empty'; cal.appendChild(c);
  }

  const tasks = buildTasks().filter(t =>
    !state.filterCats || state.filterCats.has(t.catId)
  );

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    const date = new Date(year, month, day);
    if (sameDay(date, today)) cell.classList.add('today');

    const num = document.createElement('div');
    num.className = 'cal-day-num'; num.textContent = day;
    cell.appendChild(num);

    tasks.filter(t => sameDay(t.when, date)).forEach(t => {
      const e = document.createElement('div');
      e.className = 'cal-event' + (t.isReminder ? ' reminder' : '')
                  + (state.checks[t.key] ? ' done' : '');
      e.style.background = t.color;
      e.title = `${t.label} — ${fmtDateTime(t.when)}`;
      e.textContent = (t.isReminder ? '⏰ ' : '★ ') +
        t.when.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) +
        ' ' + t.catName + (t.isReminder ? ' J-'+Math.round((new Date(state.dates.find(d=>t.key.startsWith(d.id)).datetime)-t.when)/3600000)+'h' : '');
      cell.appendChild(e);
    });

    cal.appendChild(cell);
  }
}

/* ============================================================
 * RENDU : CHECKLIST
 * ============================================================ */
function renderTasks() {
  const ul = document.getElementById('taskList');
  ul.innerHTML = '';

  let tasks = buildTasks();
  if (state.filterCats) tasks = tasks.filter(t => state.filterCats.has(t.catId));
  if (state.hideDone) tasks = tasks.filter(t => !state.checks[t.key]);

  if (tasks.length === 0) {
    ul.innerHTML = '<li style="color:#9ca3af;justify-content:center">Aucune tâche</li>';
    return;
  }

  tasks.forEach(t => {
    const li = document.createElement('li');
    if (state.checks[t.key]) li.classList.add('done');
    li.innerHTML = `
      <input type="checkbox" ${state.checks[t.key] ? 'checked' : ''} data-key="${t.key}"/>
      <span class="badge" style="background:${t.color}">${t.catName}</span>
      <span class="label">${t.label}</span>
      <span class="when">${fmtDateTime(t.when)}</span>
    `;
    li.querySelector('input').addEventListener('change', e => {
      state.checks[t.key] = e.target.checked;
      save(); renderTasks(); renderCalendar();
    });
    ul.appendChild(li);
  });
}

/* ============================================================
 * RENDU GLOBAL
 * ============================================================ */
function renderAll() {
  renderCategories();
  renderDates();
  renderCalendar();
  renderTasks();
}

/* ============================================================
 * EVENTS
 * ============================================================ */
function bindEvents() {
  // Ajout catégorie
  document.getElementById('addCatBtn').onclick = () => {
    const name = document.getElementById('catName').value.trim();
    const color = document.getElementById('catColor').value;
    const delaysNum = document.getElementById('catDelays').value;
    const delaysTxt = document.getElementById('catDelaysText').value;
    if (!name) return alert('Nom requis');
    if (state.categories.some(c => c.name === name)) return alert('Nom déjà utilisé');

    const delays = parseDelays(delaysTxt || delaysNum);
    state.categories.push({ id: uid(), name, color, delays });
    document.getElementById('catName').value = '';
    document.getElementById('catDelays').value = '';
    document.getElementById('catDelaysText').value = '';
    save(); renderAll();
  };

  // Ajout date
  document.getElementById('addDateBtn').onclick = () => {
    const catId = document.getElementById('dateCatSelect').value;
    const dt = document.getElementById('dateInput').value;
    if (!catId) return alert('Créez d\'abord une catégorie');
    if (!dt) return alert('Date requise');

    const count = state.dates.filter(d => d.catId === catId).length;
    if (count >= 50) return alert('Maximum 50 dates par catégorie');

    state.dates.push({ id: uid(), catId, datetime: new Date(dt).toISOString() });
    document.getElementById('dateInput').value = '';
    save(); renderAll();
  };

  // Calendrier nav
  document.getElementById('prevMonth').onclick = () => {
    state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth()-1, 1);
    renderCalendar();
  };
  document.getElementById('nextMonth').onclick = () => {
    state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth()+1, 1);
    renderCalendar();
  };
  document.getElementById('todayBtn').onclick = () => {
    state.viewDate = new Date(); renderCalendar();
  };

  // Hide done
  document.getElementById('hideDone').onchange = e => {
    state.hideDone = e.target.checked; renderTasks();
  };

  // Export
  document.getElementById('exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify({
      categories: state.categories,
      dates: state.dates,
      checks: state.checks
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'evenements.json';
    a.click();
  };

  // Import
  document.getElementById('importBtn').onclick = () =>
    document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.categories) state.categories = data.categories;
        if (data.dates) state.dates = data.dates;
        if (data.checks) state.checks = data.checks;
        save(); renderAll();
        alert('Import réussi !');
      } catch { alert('Fichier invalide'); }
    };
    reader.readAsText(file);
  };

  // Reset
  document.getElementById('resetBtn').onclick = () => {
    if (!confirm('Tout effacer ?')) return;
    localStorage.removeItem(LS_KEY);
    state = { categories: [], dates: [], checks: {}, filterCats: null, hideDone: false, viewDate: new Date() };
    renderAll();
  };
}

/* ============ Démarrage ============ */
load();
bindEvents();
renderAll();
