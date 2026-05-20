import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCVpNsLGXG3jiXA-qJOA7srTwyvsvJAA7s",
  authDomain: "apo-dashboard.firebaseapp.com",
  databaseURL: "https://apo-dashboard-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "apo-dashboard",
  storageBucket: "apo-dashboard.firebasestorage.app",
  messagingSenderId: "609387249406",
  appId: "1:609387249406:web:d196a510ebec4868256faf"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

const PLANNERS = ['井戸', '関根', '柴', '片桐', '渡辺', '入江', '金', '新田', '玉井', '菊池'];

const CATEGORY_COLOR = {
  '会場':  { bg: '#DBEAFE', fg: '#1D4ED8' },
  '資料':  { bg: '#EDE9FE', fg: '#6D28D9' },
  '集客':  { bg: '#D1FAE5', fg: '#065F46' },
  '準備物': { bg: '#FFEDD5', fg: '#C2410C' },
  'その他': { bg: '#F1F5F9', fg: '#475569' },
};

const STATUS_LIST = ['未着手', '進行中', '完了'];

/* ─── Helpers ─── */
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDaysUntil(dateStr) {
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function eventDayInfo(ev) {
  const startDate   = ev.startDate || ev.date || '';
  const endDate     = ev.endDate   || startDate;
  const dateDisplay = (endDate && endDate !== startDate) ? `${startDate} 〜 ${endDate}` : startDate;
  const daysToStart = startDate ? getDaysUntil(startDate) : null;
  const daysToEnd   = endDate   ? getDaysUntil(endDate)   : daysToStart;
  let dayLabel, dayClass;
  if (daysToStart === null) {
    dayLabel = ''; dayClass = '';
  } else if (daysToEnd < 0) {
    dayLabel = `開催済み（${-daysToEnd}日前）`; dayClass = 'days--past';
  } else if (daysToStart <= 0) {
    dayLabel = '開催中'; dayClass = 'days--today';
  } else if (daysToStart <= 7) {
    dayLabel = `あと${daysToStart}日`; dayClass = 'days--soon';
  } else {
    dayLabel = `あと${daysToStart}日`; dayClass = '';
  }
  return { startDate, endDate, dateDisplay, dayLabel, dayClass };
}

function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function initHamburger() {
  const btn = document.querySelector('.hamburger');
  const nav = document.querySelector('.header__nav');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.classList.toggle('open');
    nav?.classList.toggle('open');
  });
}

/* ════════════════════════════════════
   ダッシュボード (index.html)
════════════════════════════════════ */
let cachedEvents = {};
let cachedTasks  = {};

function initDashboard() {
  if (!document.getElementById('event-grid')) return;

  onValue(ref(db, 'event_data/events'), snap => {
    cachedEvents = snap.val() || {};
    renderDashboard();
  });

  onValue(ref(db, 'event_data/tasks'), snap => {
    cachedTasks = snap.val() || {};
    renderDashboard();
  });

  document.getElementById('fab-new-event')?.addEventListener('click', () => openEventModal());
  document.getElementById('event-modal-close')?.addEventListener('click', closeEventModal);
  document.getElementById('event-modal-cancel')?.addEventListener('click', closeEventModal);
  document.getElementById('event-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('event-modal')) closeEventModal();
  });

  document.getElementById('event-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id   = document.getElementById('event-edit-id').value;
    const name      = document.getElementById('event-name').value.trim();
    const startDate = document.getElementById('event-start-date').value;
    const endDate   = document.getElementById('event-end-date').value;
    if (!name || !startDate) return;
    if (endDate && endDate < startDate) { showToast('⚠️ 終了日は開始日以降を選択してください'); return; }

    const data = {
      name, startDate, endDate,
      location: document.getElementById('event-location').value.trim(),
      notes:    document.getElementById('event-notes').value.trim(),
    };
    try {
      if (id) {
        await update(ref(db, `event_data/events/${id}`), data);
        showToast('✅ 更新しました');
      } else {
        data.createdAt = Date.now();
        await push(ref(db, 'event_data/events'), data);
        showToast('✅ イベントを追加しました');
      }
      closeEventModal();
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  });
}

function renderDashboard() {
  const grid = document.getElementById('event-grid');
  if (!grid) return;

  const today  = toISO(new Date());
  const events = Object.entries(cachedEvents)
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => (a.startDate || a.date || '').localeCompare(b.startDate || b.date || ''));

  const allTasks  = Object.values(cachedTasks);
  const overdue   = allTasks.filter(t => t.status !== '完了' && t.dueDate && t.dueDate < today).length;
  const done      = allTasks.filter(t => t.status === '完了').length;
  document.getElementById('stat-events').textContent    = events.length;
  document.getElementById('stat-tasks').textContent     = allTasks.length;
  document.getElementById('stat-overdue').textContent   = overdue;
  document.getElementById('stat-completed').textContent = done;

  if (!events.length) {
    grid.innerHTML = '<p class="no-data">イベントがありません。「+ 新規イベント」から追加してください。</p>';
    return;
  }

  grid.innerHTML = events.map(ev => {
    const tasks     = allTasks.filter(t => t.eventId === ev.id);
    const total     = tasks.length;
    const todoN     = tasks.filter(t => t.status === '未着手').length;
    const wipN      = tasks.filter(t => t.status === '進行中').length;
    const completed = tasks.filter(t => t.status === '完了').length;
    const pct       = total > 0 ? Math.round(completed / total * 100) : 0;
    const todoPct   = total > 0 ? todoN     / total * 100 : 0;
    const wipPct    = total > 0 ? wipN      / total * 100 : 0;
    const donePct   = total > 0 ? completed / total * 100 : 0;
    const overdueN  = tasks.filter(t => t.status !== '完了' && t.dueDate && t.dueDate < today).length;
    const { dateDisplay, dayLabel, dayClass } = eventDayInfo(ev);

    return `
      <div class="event-card" data-id="${ev.id}">
        <div class="event-card__top">
          <div>
            <div class="event-card__name">${ev.name}</div>
            <div class="event-card__meta">${dateDisplay}${ev.location ? '　' + ev.location : ''}</div>
          </div>
          <div class="event-card__actions">
            <button class="btn-icon" data-action="edit"   data-id="${ev.id}" title="編集">✎</button>
            <button class="btn-icon btn-icon--danger" data-action="delete" data-id="${ev.id}" title="削除">×</button>
          </div>
        </div>
        <div class="event-card__progress">
          <div class="progress-bar progress-bar--stacked">
            <div class="pfill pfill--todo" style="width:${todoPct}%"></div>
            <div class="pfill pfill--wip"  style="width:${wipPct}%"></div>
            <div class="pfill pfill--done" style="width:${donePct}%"></div>
          </div>
          <span class="progress-text">${pct}%</span>
        </div>
        <div class="event-card__pchips">
          <span class="pchip pchip--todo">${todoN} 未着手</span>
          <span class="pchip pchip--wip">${wipN} 進行中</span>
          <span class="pchip pchip--done">${completed} 完了</span>
        </div>
        <div class="event-card__footer">
          <span class="day-badge ${dayClass}">${dayLabel}</span>
          ${overdueN > 0 ? `<span class="overdue-badge">⚠ 期限超過 ${overdueN}件</span>` : ''}
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.action === 'edit')   openEventModal(btn.dataset.id, cachedEvents[btn.dataset.id]);
      if (btn.dataset.action === 'delete') deleteEvent(btn.dataset.id);
    });
  });

  grid.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.href = `pages/event.html?id=${card.dataset.id}`;
    });
  });
}

function openEventModal(id = '', data = {}) {
  document.getElementById('event-edit-id').value       = id;
  document.getElementById('event-name').value          = data.name      || '';
  document.getElementById('event-start-date').value    = data.startDate || data.date || '';
  document.getElementById('event-end-date').value      = data.endDate   || '';
  document.getElementById('event-location').value      = data.location  || '';
  document.getElementById('event-notes').value         = data.notes     || '';
  document.getElementById('event-modal-title').textContent = id ? 'イベント編集' : '新規イベント';
  document.getElementById('event-modal').classList.add('open');
}

function closeEventModal() {
  document.getElementById('event-modal')?.classList.remove('open');
}

async function deleteEvent(id) {
  if (!confirm('このイベントを削除しますか？\n関連するタスクもすべて削除されます。')) return;
  try {
    await remove(ref(db, `event_data/events/${id}`));
    const related = Object.entries(cachedTasks).filter(([, t]) => t.eventId === id);
    await Promise.all(related.map(([tid]) => remove(ref(db, `event_data/tasks/${tid}`))));
    showToast('✅ 削除しました');
  } catch (err) {
    showToast('⚠️ ' + err.message);
  }
}

/* ════════════════════════════════════
   イベント詳細 (event.html)
════════════════════════════════════ */
let currentEventId   = '';
let currentEventData = {};
let cachedEventTasks = {};

function initEventDetail() {
  if (!document.getElementById('task-tree')) return;

  const params = new URLSearchParams(window.location.search);
  currentEventId = params.get('id');
  if (!currentEventId) { window.location.href = '../index.html'; return; }

  onValue(ref(db, `event_data/events/${currentEventId}`), snap => {
    currentEventData = snap.val() || {};
    renderEventInfo();
  });

  onValue(ref(db, 'event_data/tasks'), snap => {
    const all = snap.val() || {};
    cachedEventTasks = Object.fromEntries(
      Object.entries(all).filter(([, t]) => t.eventId === currentEventId)
    );
    renderTasks();
  });

  const filterAssignee = document.getElementById('filter-assignee');
  if (filterAssignee) {
    PLANNERS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = p;
      filterAssignee.appendChild(opt);
    });
  }
  const picker = document.getElementById('task-assignees-picker');
  if (picker) {
    PLANNERS.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'assignee-btn';
      btn.dataset.name = p;
      btn.textContent = p;
      btn.addEventListener('click', () => btn.classList.toggle('selected'));
      picker.appendChild(btn);
    });
  }

  ['filter-status', 'filter-category', 'filter-assignee'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderTasks);
  });
  document.getElementById('btn-filter-reset')?.addEventListener('click', () => {
    document.getElementById('filter-status').value   = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-assignee').value = '';
    renderTasks();
  });

  document.getElementById('fab-new-task')?.addEventListener('click', () => openTaskModal('', {}, 'large', ''));
  document.getElementById('task-modal-close')?.addEventListener('click', closeTaskModal);
  document.getElementById('task-modal-cancel')?.addEventListener('click', closeTaskModal);
  document.getElementById('task-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('task-modal')) closeTaskModal();
  });

  document.getElementById('task-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const editId   = document.getElementById('task-edit-id').value;
    const title    = document.getElementById('task-title').value.trim();
    const level    = document.getElementById('task-level').value    || 'large';
    const parentId = document.getElementById('task-parent-id').value || '';
    if (!title) return;

    const data = {
      eventId: currentEventId, level, parentId,
      title,
      category:  document.getElementById('task-category').value,
      assignees: Array.from(document.querySelectorAll('#task-assignees-picker .assignee-btn.selected')).map(b => b.dataset.name),
      dueDate:   document.getElementById('task-due').value,
      status:   document.getElementById('task-status').value,
      notes:    document.getElementById('task-notes').value.trim(),
    };
    try {
      if (editId) {
        await update(ref(db, `event_data/tasks/${editId}`), data);
        showToast('✅ 更新しました');
      } else {
        data.createdAt = Date.now();
        await push(ref(db, 'event_data/tasks'), data);
        showToast('✅ タスクを追加しました');
      }
      closeTaskModal();
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  });

  document.getElementById('btn-edit-event')?.addEventListener('click', openEditEventModal);
  document.getElementById('btn-delete-event')?.addEventListener('click', deleteCurrentEvent);
  document.getElementById('edit-event-modal-close')?.addEventListener('click', closeEditEventModal);
  document.getElementById('edit-event-modal-cancel')?.addEventListener('click', closeEditEventModal);
  document.getElementById('edit-event-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('edit-event-modal')) closeEditEventModal();
  });

  document.getElementById('edit-event-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name      = document.getElementById('edit-event-name').value.trim();
    const startDate = document.getElementById('edit-event-start-date').value;
    const endDate   = document.getElementById('edit-event-end-date').value;
    if (!name || !startDate) return;
    if (endDate && endDate < startDate) { showToast('⚠️ 終了日は開始日以降を選択してください'); return; }
    try {
      await update(ref(db, `event_data/events/${currentEventId}`), {
        name, startDate, endDate,
        location: document.getElementById('edit-event-location').value.trim(),
        notes:    document.getElementById('edit-event-notes').value.trim(),
      });
      showToast('✅ 更新しました');
      closeEditEventModal();
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  });
}

function renderEventInfo() {
  const ev = currentEventData;
  document.title = `${ev.name || 'イベント詳細'} | イベント管理`;
  document.getElementById('event-title-display').textContent = ev.name || '-';
  const { dateDisplay, dayLabel } = eventDayInfo(ev);
  const dayStr = dayLabel ? `（${dayLabel}）` : '';
  document.getElementById('event-meta-display').textContent =
    `${dateDisplay}${ev.location ? '　' + ev.location : ''}${dayStr}`;
}

/* ─── Task tree rendering ─── */
function buildTree(tasks) {
  const byId = {};
  tasks.forEach(t => { byId[t.id] = { ...t, children: [] }; });
  const roots = [];
  tasks.forEach(t => {
    if (!t.parentId) roots.push(byId[t.id]);
    else if (byId[t.parentId]) byId[t.parentId].children.push(byId[t.id]);
  });
  const sortByDate = arr => arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  sortByDate(roots);
  roots.forEach(r => { sortByDate(r.children); r.children.forEach(c => sortByDate(c.children)); });
  return roots;
}

function getAssignees(task) {
  if (Array.isArray(task.assignees) && task.assignees.length) return task.assignees;
  if (task.assignee) return [task.assignee];
  return [];
}

function matchesFilter(task, statusF, categoryF, assigneeF) {
  const self = (!statusF || task.status === statusF) &&
               (!categoryF || task.category === categoryF) &&
               (!assigneeF || getAssignees(task).includes(assigneeF));
  return self || (task.children || []).some(c => matchesFilter(c, statusF, categoryF, assigneeF));
}

function countAll(task)  { return (task.children || []).reduce((s, c) => s + 1 + countAll(c), 0); }
function countDone(task) { return (task.children || []).reduce((s, c) => s + (c.status === '完了' ? 1 : 0) + countDone(c), 0); }

const LEVEL_LABEL = { large: '親', medium: '小', small: '孫' };
const NEXT_LEVEL  = { large: 'medium', medium: 'small' };
const ADD_LABEL   = { medium: '+小タスク', small: '+孫タスク' };

function renderTaskBlock(task, level, today) {
  const wrap = document.createElement('div');
  wrap.className = `task-block task-block--${level}`;

  const overdue  = task.status !== '完了' && task.dueDate && task.dueDate < today;
  const isDone   = task.status === '完了';
  const dotClass = isDone ? 'done' : task.status === '進行中' ? 'wip' : 'todo';
  const catStyle = CATEGORY_COLOR[task.category];
  const childTotal = countAll(task);
  const childDone  = countDone(task);
  const nextLevel  = NEXT_LEVEL[level];

  const row = document.createElement('div');
  row.className = `task-row${isDone ? ' task-row--done' : ''}`;
  row.innerHTML = `
    <span class="level-tag level-tag--${level}">${LEVEL_LABEL[level]}</span>
    <button class="status-cycle" data-id="${task.id}" data-status="${task.status}" title="クリックでステータス変更">
      <span class="status-dot status-dot--${dotClass}"></span>
      <span class="status-text">${task.status}</span>
    </button>
    <span class="task-title-text${overdue ? ' overdue-text' : ''}">${task.title}${overdue ? '　⚠' : ''}</span>
    <span class="task-row-meta">
      ${catStyle ? `<span class="cat-badge" style="background:${catStyle.bg};color:${catStyle.fg}">${task.category}</span>` : ''}
      ${getAssignees(task).map(a => `<span class="task-meta-item">${a}</span>`).join('')}
      ${task.dueDate  ? `<span class="task-meta-item${overdue ? ' overdue-text' : ''}">${task.dueDate}</span>` : ''}
      ${childTotal > 0 ? `<span class="child-count">${childDone}/${childTotal}</span>` : ''}
    </span>
    <div class="task-actions">
      ${nextLevel ? `<button class="btn-add-child" data-level="${nextLevel}" data-parent-id="${task.id}">${ADD_LABEL[nextLevel]}</button>` : ''}
      <button class="btn-icon" data-action="edit"   data-id="${task.id}" title="編集">✎</button>
      <button class="btn-icon btn-icon--danger" data-action="delete" data-id="${task.id}" title="削除">×</button>
    </div>`;
  wrap.appendChild(row);

  if (task.children?.length) {
    const childLevel   = nextLevel || 'small';
    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'task-children';
    task.children.forEach(c => childrenWrap.appendChild(renderTaskBlock(c, childLevel, today)));
    wrap.appendChild(childrenWrap);
  }
  return wrap;
}

function renderTasks() {
  const treeEl = document.getElementById('task-tree');
  if (!treeEl) return;

  const today     = toISO(new Date());
  const statusF   = document.getElementById('filter-status')?.value   || '';
  const categoryF = document.getElementById('filter-category')?.value || '';
  const assigneeF = document.getElementById('filter-assignee')?.value || '';

  const allList = Object.entries(cachedEventTasks).map(([id, t]) => ({ id, ...t }));
  const total   = allList.length;
  const todo    = allList.filter(t => t.status === '未着手').length;
  const wip     = allList.filter(t => t.status === '進行中').length;
  const done    = allList.filter(t => t.status === '完了').length;
  const pct     = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('pstat-todo').textContent     = todo;
  document.getElementById('pstat-wip').textContent      = wip;
  document.getElementById('pstat-done').textContent     = done;
  document.getElementById('pfill-todo').style.width     = (total > 0 ? todo / total * 100 : 0) + '%';
  document.getElementById('pfill-wip').style.width      = (total > 0 ? wip  / total * 100 : 0) + '%';
  document.getElementById('pfill-done').style.width     = (total > 0 ? done / total * 100 : 0) + '%';
  document.getElementById('progress-label').textContent = `${done}/${total} 完了（${pct}%）`;

  treeEl.innerHTML = '';

  const roots = buildTree(allList);
  const filtered = statusF || categoryF || assigneeF
    ? roots.filter(r => matchesFilter(r, statusF, categoryF, assigneeF))
    : roots;

  if (!filtered.length) {
    treeEl.innerHTML = '<p class="no-data" style="padding:24px 0">タスクがありません。「+ 大タスク追加」から追加してください。</p>';
  } else {
    filtered.forEach(r => treeEl.appendChild(renderTaskBlock(r, 'large', today)));
  }

  treeEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, id } = btn.dataset;
      if (action === 'edit')   openTaskModal(id, cachedEventTasks[id], cachedEventTasks[id]?.level || 'large', cachedEventTasks[id]?.parentId || '');
      if (action === 'delete') deleteTask(id);
    });
  });

  treeEl.querySelectorAll('.btn-add-child').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal('', {}, btn.dataset.level, btn.dataset.parentId));
  });

  treeEl.querySelectorAll('.status-cycle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const next = STATUS_LIST[(STATUS_LIST.indexOf(btn.dataset.status) + 1) % STATUS_LIST.length];
      try {
        await update(ref(db, `event_data/tasks/${btn.dataset.id}`), { status: next });
      } catch (err) { showToast('⚠️ ' + err.message); }
    });
  });
}

function openTaskModal(id = '', data = {}, level = 'large', parentId = '') {
  const levelName = { large: '親タスク', medium: '小タスク', small: '孫タスク' }[level];
  document.getElementById('task-edit-id').value    = id;
  document.getElementById('task-level').value      = level;
  document.getElementById('task-parent-id').value  = parentId;
  document.getElementById('task-title').value      = data.title    || '';
  document.getElementById('task-category').value   = data.category || '';
  const selectedAssignees = getAssignees(data);
  document.querySelectorAll('#task-assignees-picker .assignee-btn').forEach(btn => {
    btn.classList.toggle('selected', selectedAssignees.includes(btn.dataset.name));
  });
  document.getElementById('task-due').value        = data.dueDate  || '';
  document.getElementById('task-status').value     = data.status   || '未着手';
  document.getElementById('task-notes').value      = data.notes    || '';
  document.getElementById('task-modal-title').textContent = id ? `${levelName}編集` : `${levelName}追加`;

  const parentLabel = document.getElementById('task-parent-label');
  const parentTask  = parentId ? cachedEventTasks[parentId] : null;
  parentLabel.textContent = parentTask ? `上位タスク：${parentTask.title}` : '';

  document.getElementById('task-modal').classList.add('open');
}

function closeTaskModal() {
  document.getElementById('task-modal')?.classList.remove('open');
}

async function deleteTask(id) {
  const task = cachedEventTasks[id];
  const hasChildren = Object.values(cachedEventTasks).some(t => t.parentId === id);
  const msg = hasChildren ? 'このタスクを削除しますか？\n配下の中・小タスクもすべて削除されます。' : 'このタスクを削除しますか？';
  if (!confirm(msg)) return;

  const toDelete = [id];
  const collect  = pid => {
    Object.entries(cachedEventTasks).forEach(([tid, t]) => {
      if (t.parentId === pid) { toDelete.push(tid); collect(tid); }
    });
  };
  collect(id);
  try {
    await Promise.all(toDelete.map(tid => remove(ref(db, `event_data/tasks/${tid}`))));
    showToast('✅ 削除しました');
  } catch (err) { showToast('⚠️ ' + err.message); }
}

function openEditEventModal() {
  document.getElementById('edit-event-name').value          = currentEventData.name      || '';
  document.getElementById('edit-event-start-date').value    = currentEventData.startDate || currentEventData.date || '';
  document.getElementById('edit-event-end-date').value      = currentEventData.endDate   || '';
  document.getElementById('edit-event-location').value      = currentEventData.location  || '';
  document.getElementById('edit-event-notes').value         = currentEventData.notes     || '';
  document.getElementById('edit-event-modal').classList.add('open');
}

function closeEditEventModal() {
  document.getElementById('edit-event-modal')?.classList.remove('open');
}

async function deleteCurrentEvent() {
  if (!confirm('このイベントを削除しますか？\n関連するタスクもすべて削除されます。')) return;
  try {
    await remove(ref(db, `event_data/events/${currentEventId}`));
    await Promise.all(Object.keys(cachedEventTasks).map(tid =>
      remove(ref(db, `event_data/tasks/${tid}`))
    ));
    showToast('✅ 削除しました');
    window.location.href = '../index.html';
  } catch (err) {
    showToast('⚠️ ' + err.message);
  }
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', () => {
  initHamburger();
  initDashboard();
  initEventDetail();
});
