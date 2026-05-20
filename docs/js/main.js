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
    const name = document.getElementById('event-name').value.trim();
    const date = document.getElementById('event-date').value;
    if (!name || !date) return;

    const data = {
      name, date,
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
    .sort((a, b) => a.date.localeCompare(b.date));

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
    const completed = tasks.filter(t => t.status === '完了').length;
    const pct       = total > 0 ? Math.round(completed / total * 100) : 0;
    const overdueN  = tasks.filter(t => t.status !== '完了' && t.dueDate && t.dueDate < today).length;
    const days      = getDaysUntil(ev.date);
    const dayLabel  = days < 0 ? `開催済み（${-days}日前）` : days === 0 ? '本日開催' : `あと${days}日`;
    const dayClass  = days < 0 ? 'days--past' : days === 0 ? 'days--today' : days <= 7 ? 'days--soon' : '';

    return `
      <div class="event-card" data-id="${ev.id}">
        <div class="event-card__top">
          <div>
            <div class="event-card__name">${ev.name}</div>
            <div class="event-card__meta">${ev.date}${ev.location ? '　' + ev.location : ''}</div>
          </div>
          <div class="event-card__actions">
            <button class="btn-icon" data-action="edit"   data-id="${ev.id}" title="編集">✎</button>
            <button class="btn-icon btn-icon--danger" data-action="delete" data-id="${ev.id}" title="削除">×</button>
          </div>
        </div>
        <div class="event-card__progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span class="progress-text">${completed}/${total} 完了</span>
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
  document.getElementById('event-edit-id').value    = id;
  document.getElementById('event-name').value       = data.name     || '';
  document.getElementById('event-date').value       = data.date     || '';
  document.getElementById('event-location').value   = data.location || '';
  document.getElementById('event-notes').value      = data.notes    || '';
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
  if (!document.getElementById('task-body')) return;

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

  // 担当者プルダウン
  ['filter-assignee', 'task-assignee'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    PLANNERS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = p;
      sel.appendChild(opt);
    });
  });

  // フィルター
  ['filter-status', 'filter-category', 'filter-assignee'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderTasks);
  });
  document.getElementById('btn-filter-reset')?.addEventListener('click', () => {
    document.getElementById('filter-status').value   = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-assignee').value = '';
    renderTasks();
  });

  // タスク追加FAB
  document.getElementById('fab-new-task')?.addEventListener('click', () => openTaskModal());
  document.getElementById('task-modal-close')?.addEventListener('click', closeTaskModal);
  document.getElementById('task-modal-cancel')?.addEventListener('click', closeTaskModal);
  document.getElementById('task-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('task-modal')) closeTaskModal();
  });

  document.getElementById('task-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const editId = document.getElementById('task-edit-id').value;
    const title  = document.getElementById('task-title').value.trim();
    if (!title) return;

    const data = {
      eventId:  currentEventId,
      title,
      category: document.getElementById('task-category').value,
      assignee: document.getElementById('task-assignee').value,
      dueDate:  document.getElementById('task-due').value,
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

  // イベント編集・削除
  document.getElementById('btn-edit-event')?.addEventListener('click', openEditEventModal);
  document.getElementById('btn-delete-event')?.addEventListener('click', deleteCurrentEvent);
  document.getElementById('edit-event-modal-close')?.addEventListener('click', closeEditEventModal);
  document.getElementById('edit-event-modal-cancel')?.addEventListener('click', closeEditEventModal);
  document.getElementById('edit-event-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('edit-event-modal')) closeEditEventModal();
  });

  document.getElementById('edit-event-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('edit-event-name').value.trim();
    const date = document.getElementById('edit-event-date').value;
    if (!name || !date) return;
    try {
      await update(ref(db, `event_data/events/${currentEventId}`), {
        name, date,
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
  const days = ev.date ? getDaysUntil(ev.date) : null;
  const dayStr = days === null ? '' :
    days < 0  ? `（開催済み・${-days}日前）` :
    days === 0 ? '（本日開催）' :
                 `（あと${days}日）`;
  document.getElementById('event-meta-display').textContent =
    `${ev.date || ''}${ev.location ? '　' + ev.location : ''}${dayStr}`;
}

function renderTasks() {
  const tbody     = document.getElementById('task-body');
  if (!tbody) return;
  const today     = toISO(new Date());
  const statusF   = document.getElementById('filter-status')?.value   || '';
  const categoryF = document.getElementById('filter-category')?.value || '';
  const assigneeF = document.getElementById('filter-assignee')?.value || '';

  const tasks = Object.entries(cachedEventTasks)
    .map(([id, t]) => ({ id, ...t }))
    .filter(t => !statusF   || t.status   === statusF)
    .filter(t => !categoryF || t.category === categoryF)
    .filter(t => !assigneeF || t.assignee === assigneeF)
    .sort((a, b) => {
      const ao = a.status === '完了' ? 1 : 0;
      const bo = b.status === '完了' ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });

  // プログレス更新
  const all   = Object.values(cachedEventTasks);
  const total = all.length;
  const done  = all.filter(t => t.status === '完了').length;
  const pct   = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = `${done}/${total} 完了（${pct}%）`;

  tbody.innerHTML = '';
  if (!tasks.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9CA3AF;padding:24px">タスクがありません</td></tr>';
    return;
  }

  tasks.forEach(t => {
    const overdue  = t.status !== '完了' && t.dueDate && t.dueDate < today;
    const catStyle = CATEGORY_COLOR[t.category];
    const dotClass = t.status === '完了' ? 'done' : t.status === '進行中' ? 'wip' : 'todo';
    const tr = document.createElement('tr');
    if (t.status === '完了') tr.classList.add('row--done');

    tr.innerHTML = `
      <td>
        <button class="status-cycle" data-id="${t.id}" data-status="${t.status}" title="クリックでステータス変更">
          <span class="status-dot status-dot--${dotClass}"></span>
          <span>${t.status}</span>
        </button>
      </td>
      <td class="${overdue ? 'overdue-text' : ''}">${t.title}${overdue ? '　⚠' : ''}</td>
      <td>${catStyle ? `<span class="cat-badge" style="background:${catStyle.bg};color:${catStyle.fg}">${t.category}</span>` : '-'}</td>
      <td>${t.assignee || '-'}</td>
      <td class="${overdue ? 'overdue-text' : ''}">${t.dueDate || '-'}</td>
      <td class="notes-cell" title="${t.notes || ''}">${t.notes || '-'}</td>
      <td>
        <div class="action-btns">
          <button class="btn-sm btn-sm--edit"   data-action="edit"   data-id="${t.id}">編集</button>
          <button class="btn-sm btn-sm--delete" data-action="delete" data-id="${t.id}">削除</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action]').forEach(btn => {
    const { action, id } = btn.dataset;
    btn.addEventListener('click', () => {
      if (action === 'edit')   openTaskModal(id, cachedEventTasks[id]);
      if (action === 'delete') deleteTask(id);
    });
  });

  tbody.querySelectorAll('.status-cycle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const next = STATUS_LIST[(STATUS_LIST.indexOf(btn.dataset.status) + 1) % STATUS_LIST.length];
      try {
        await update(ref(db, `event_data/tasks/${btn.dataset.id}`), { status: next });
      } catch (err) {
        showToast('⚠️ ' + err.message);
      }
    });
  });
}

function openTaskModal(id = '', data = {}) {
  document.getElementById('task-edit-id').value  = id;
  document.getElementById('task-title').value    = data.title    || '';
  document.getElementById('task-category').value = data.category || '';
  document.getElementById('task-assignee').value = data.assignee || '';
  document.getElementById('task-due').value      = data.dueDate  || '';
  document.getElementById('task-status').value   = data.status   || '未着手';
  document.getElementById('task-notes').value    = data.notes    || '';
  document.getElementById('task-modal-title').textContent = id ? 'タスク編集' : 'タスク追加';
  document.getElementById('task-modal').classList.add('open');
}

function closeTaskModal() {
  document.getElementById('task-modal')?.classList.remove('open');
}

async function deleteTask(id) {
  if (!confirm('このタスクを削除しますか？')) return;
  try {
    await remove(ref(db, `event_data/tasks/${id}`));
    showToast('✅ 削除しました');
  } catch (err) {
    showToast('⚠️ ' + err.message);
  }
}

function openEditEventModal() {
  document.getElementById('edit-event-name').value     = currentEventData.name     || '';
  document.getElementById('edit-event-date').value     = currentEventData.date     || '';
  document.getElementById('edit-event-location').value = currentEventData.location || '';
  document.getElementById('edit-event-notes').value    = currentEventData.notes    || '';
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
