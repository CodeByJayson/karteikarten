const SUBJECT_COLORS = ['#6366f1','#ec4899','#f59e0b','#06b6d4','#8b5cf6','#3b82f6','#f43f5e','#22c55e','#e879f9','#14b8a6'];
const BOX_INTERVALS = [1,2,4,8,16]; // Tage, Index 0 = Box1
const BOX_COLORS = ['var(--box1)','var(--box2)','var(--box3)','var(--box4)','var(--box5)'];
const LS_SUBJECTS = 'kk_subjects';
const LS_CARDS = 'kk_cards';
const LS_STREAK = 'kk_streak';

let subjects = JSON.parse(localStorage.getItem(LS_SUBJECTS) || 'null') || [
  { id: 'id1', name: 'Mathe' },
  { id: 'id2', name: 'WR' }
];
let cards = JSON.parse(localStorage.getItem(LS_CARDS) || '[]');
cards.forEach(c => { if (c.partialCount === undefined) c.partialCount = 0; });
let streak = JSON.parse(localStorage.getItem(LS_STREAK) || 'null') || { count: 0, lastDate: null };
const LS_DAILY = 'kk_daily';
let daily = JSON.parse(localStorage.getItem(LS_DAILY) || 'null') || { date: null, correct: 0, partial: 0, wrong: 0 };
if (daily.partial === undefined) daily.partial = 0;

let activeSubjectFilter = 'all'; // 'all' or subject id
let listFilter = 'all'; // all | due | box1..5
let reviewQueue = [];
let reviewIndex = 0;
let reviewSubjectFilter = 'all';

// Natürliche Sortierung: erkennt Zahlen im Namen und sortiert sie numerisch
// aufsteigend (z.B. "Karte 2" vor "Karte 10"), statt rein alphabetisch.
const naturalCollator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
function compareByName(a, b){
  // Erst nach Fach gruppieren (in der Reihenfolge, wie die Fächer angelegt wurden),
  // danach innerhalb des Fachs numerisch/alphabetisch nach Titel sortieren.
  const subjectIndexA = subjects.findIndex(s => s.id === a.subject);
  const subjectIndexB = subjects.findIndex(s => s.id === b.subject);
  if (subjectIndexA !== subjectIndexB) return subjectIndexA - subjectIndexB;
  return naturalCollator.compare(a.name, b.name);
}

function todayStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function addDays(dateStr, days){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function uid(){ return 'c' + Date.now() + Math.random().toString(36).slice(2,7); }
function saveAll(){
  localStorage.setItem(LS_SUBJECTS, JSON.stringify(subjects));
  localStorage.setItem(LS_CARDS, JSON.stringify(cards));
  localStorage.setItem(LS_STREAK, JSON.stringify(streak));
  localStorage.setItem(LS_DAILY, JSON.stringify(daily));
}
function ensureDailyIsToday(){
  const t = todayStr();
  if (daily.date !== t) {
    daily = { date: t, correct: 0, partial: 0, wrong: 0 };
  }
}
function subjectColor(subjectId){
  const idx = subjects.findIndex(s => s.id === subjectId);
  return SUBJECT_COLORS[idx >= 0 ? idx % SUBJECT_COLORS.length : 0];
}
function subjectName(subjectId){
  const s = subjects.find(s => s.id === subjectId);
  return s ? s.name : '—';
}

function renderDate(){
  const d = new Date();
  document.getElementById('current-date').textContent = d.toLocaleDateString('de-DE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function renderStreakBadge(){
  const badge = document.getElementById('streak-badge');
  badge.textContent = `🔥 ${streak.count} Tag${streak.count === 1 ? '' : 'e'} Streak`;
}

function bumpStreak(){
  const t = todayStr();
  if (streak.lastDate === t) return;
  const y = addDays(t, -1);
  if (streak.lastDate === y) streak.count += 1;
  else streak.count = 1;
  streak.lastDate = t;
  saveAll();
  renderStreakBadge();
}

/* ---------- Fächer ---------- */
function renderSubjectBar(){
  const bar = document.getElementById('subject-bar');
  bar.innerHTML = '';

  const allChip = document.createElement('div');
  allChip.className = 'subject-chip' + (activeSubjectFilter === 'all' ? ' active' : '');
  allChip.innerHTML = `<span class="dot" style="background:#64748b"></span>Alle <span class="count">${cards.length}</span>`;
  allChip.onclick = () => { activeSubjectFilter = 'all'; renderAll(); };
  bar.appendChild(allChip);

  subjects.forEach(s => {
    const count = cards.filter(c => c.subject === s.id).length;
    const chip = document.createElement('div');
    chip.className = 'subject-chip' + (activeSubjectFilter === s.id ? ' active' : '');
    chip.innerHTML = `<span class="dot" style="background:${subjectColor(s.id)}"></span>${escapeHtml(s.name)} <span class="count">${count}</span><span class="del-x" title="Fach löschen">✕</span>`;
    chip.querySelector('.dot').parentElement; // noop
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('del-x')) {
        e.stopPropagation();
        if (confirm(`Fach "${s.name}" und alle ${count} zugehörigen Karten löschen?`)) {
          cards = cards.filter(c => c.subject !== s.id);
          subjects = subjects.filter(x => x.id !== s.id);
          if (activeSubjectFilter === s.id) activeSubjectFilter = 'all';
          saveAll();
          renderAll();
        }
        return;
      }
      activeSubjectFilter = s.id;
      renderAll();
    });
    bar.appendChild(chip);
  });

  const addChip = document.createElement('div');
  addChip.className = 'subject-chip add-chip';
  addChip.textContent = '+ Fach';
  addChip.onclick = () => {
    document.getElementById('add-subject-form').style.display = 'flex';
    document.getElementById('new-subject-input').focus();
  };
  bar.appendChild(addChip);
}

document.getElementById('save-subject-btn').onclick = () => {
  const input = document.getElementById('new-subject-input');
  const name = input.value.trim();
  if (!name) return;
  subjects.push({ id: uid(), name });
  input.value = '';
  document.getElementById('add-subject-form').style.display = 'none';
  saveAll();
  renderAll();
};
document.getElementById('cancel-subject-btn').onclick = () => {
  document.getElementById('new-subject-input').value = '';
  document.getElementById('add-subject-form').style.display = 'none';
};
document.getElementById('new-subject-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('save-subject-btn').click();
});

/* ---------- Karte hinzufügen ---------- */
function renderSubjectSelect(selectEl, selectedId){
  selectEl.innerHTML = '';
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    if (s.id === selectedId) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

document.getElementById('add-card-btn').onclick = () => {
  const input = document.getElementById('new-card-input');
  const name = input.value.trim();
  const subjectSelect = document.getElementById('new-card-subject');
  const subjectId = subjectSelect.value;
  if (!name) return;
  if (!subjectId) { alert('Bitte zuerst ein Fach anlegen.'); return; }
  cards.push({
    id: uid(),
    name,
    subject: subjectId,
    box: 1,
    nextReview: todayStr(),
    created: todayStr(),
    correctCount: 0,
    partialCount: 0,
    wrongCount: 0
  });
  input.value = '';
  input.focus();
  saveAll();
  renderAll();
};
document.getElementById('new-card-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-card-btn').click();
});

/* ---------- Review ---------- */
function buildReviewQueue(){
  const t = todayStr();
  reviewQueue = cards.filter(c => c.nextReview <= t && (reviewSubjectFilter === 'all' || c.subject === reviewSubjectFilter));
  reviewQueue.sort(compareByName);
  reviewIndex = 0;
}

function renderReviewArea(){
  const area = document.getElementById('review-area');
  const dueLabel = document.getElementById('due-count-label');
  const tallyLabel = document.getElementById('today-tally-label');
  ensureDailyIsToday();
  buildReviewQueue();

  const tallyText = (daily.correct > 0 || daily.partial > 0 || daily.wrong > 0)
    ? `✓ ${daily.correct} · ◐ ${daily.partial} · ✗ ${daily.wrong} heute`
    : '';
  tallyLabel.textContent = tallyText;

  if (cards.length === 0) {
    dueLabel.textContent = '';
    area.innerHTML = `<div class="empty-state">Noch keine Karten angelegt. Leg oben deine erste Karte an.</div>`;
    return;
  }

  if (reviewQueue.length === 0) {
    dueLabel.textContent = '· alles erledigt';
    area.innerHTML = `<div class="celebration">✅ Für heute nichts mehr fällig. Gut gemacht!</div>`;
    return;
  }

  dueLabel.textContent = `· ${reviewQueue.length} fällig`;
  const c = reviewQueue[reviewIndex];
  const boxIdx = c.box - 1;
  area.innerHTML = `
    <div class="review-card">
      <div class="review-progress">KARTE ${reviewIndex + 1} / ${reviewQueue.length}</div>
      <div class="review-subject" style="background:${subjectColor(c.subject)}22; color:${subjectColor(c.subject)};">${escapeHtml(subjectName(c.subject))}</div>
      <div class="review-name">${escapeHtml(c.name)}</div>
      <div class="review-box-badge" style="color:${BOX_COLORS[boxIdx]};">Box ${c.box} · bisher ${c.correctCount}× gewusst, ${c.partialCount || 0}× teilweise, ${c.wrongCount}× nicht gewusst</div>
      <div class="review-actions">
        <button class="flashcard-wrong-btn" id="review-wrong-btn">✗ Nicht gewusst</button>
        <button class="flashcard-partial-btn" id="review-partial-btn">◐ Teilweise</button>
        <button class="flashcard-correct-btn" id="review-correct-btn">✓ Gewusst</button>
      </div>
    </div>
  `;

  document.getElementById('review-wrong-btn').onclick = () => answerCard(c, 'wrong');
  document.getElementById('review-partial-btn').onclick = () => answerCard(c, 'partial');
  document.getElementById('review-correct-btn').onclick = () => answerCard(c, 'correct');
}

function answerCard(card, result){
  const t = todayStr();
  ensureDailyIsToday();
  if (result === 'correct') {
    card.box = Math.min(card.box + 1, BOX_INTERVALS.length);
    card.correctCount = (card.correctCount || 0) + 1;
    daily.correct += 1;
    card.nextReview = addDays(t, BOX_INTERVALS[card.box - 1]);
  } else if (result === 'partial') {
    // Box bleibt gleich, aber kürzeres Intervall bis zur nächsten Wiederholung
    card.partialCount = (card.partialCount || 0) + 1;
    daily.partial += 1;
    const halfInterval = Math.max(1, Math.round(BOX_INTERVALS[card.box - 1] / 2));
    card.nextReview = addDays(t, halfInterval);
  } else {
    card.box = 1;
    card.wrongCount = (card.wrongCount || 0) + 1;
    daily.wrong += 1;
    card.nextReview = addDays(t, BOX_INTERVALS[card.box - 1]);
  }
  card.lastReviewed = t;
  bumpStreak();
  saveAll();
  renderReviewArea();
  renderStatsRow();
  renderBoxDistribution();
  renderCardList();
  renderSubjectBar();
}

/* ---------- Stats ---------- */
function renderStatsRow(){
  const row = document.getElementById('stats-row');
  const t = todayStr();
  const relevant = cards.filter(c => activeSubjectFilter === 'all' || c.subject === activeSubjectFilter);
  const due = relevant.filter(c => c.nextReview <= t).length;
  const mastered = relevant.filter(c => c.box === BOX_INTERVALS.length).length;
  const totalAnswers = relevant.reduce((s,c) => s + c.correctCount + (c.partialCount || 0) + c.wrongCount, 0);
  const totalCorrect = relevant.reduce((s,c) => s + c.correctCount + 0.5 * (c.partialCount || 0), 0);
  const acc = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;

  row.innerHTML = `
    <div class="stat-box"><div class="num">${relevant.length}</div><div class="label">Karten gesamt</div></div>
    <div class="stat-box"><div class="num">${due}</div><div class="label">heute fällig</div></div>
    <div class="stat-box"><div class="num">${mastered}</div><div class="label">gemeistert (Box 5)</div></div>
    <div class="stat-box"><div class="num">${acc}%</div><div class="label">Trefferquote</div></div>
  `;
}

function renderBoxDistribution(){
  const container = document.getElementById('box-dist');
  const relevant = cards.filter(c => activeSubjectFilter === 'all' || c.subject === activeSubjectFilter);
  const boxLabels = ['Box 1 (1 Tag)', 'Box 2 (2 Tage)', 'Box 3 (4 Tage)', 'Box 4 (8 Tage)', 'Box 5 (16 Tage)'];
  const counts = [1,2,3,4,5].map(n => relevant.filter(c => c.box === n).length);
  const maxCount = Math.max(1, ...counts);

  if (relevant.length === 0) {
    container.innerHTML = `<div class="empty-state" style="margin:8px 0;">Noch keine Karten für diese Ansicht.</div>`;
    return;
  }

  container.innerHTML = counts.map((count, i) => {
    const pct = Math.round((count / maxCount) * 100);
    return `
      <div class="box-dist-row">
        <div class="box-dist-label" style="color:${BOX_COLORS[i]};">${boxLabels[i]}</div>
        <div class="box-dist-track">
          <div class="box-dist-fill" style="width:${count > 0 ? pct : 0}%; background:${BOX_COLORS[i]};"></div>
        </div>
        <div class="box-dist-count">${count}</div>
      </div>
    `;
  }).join('');
}

/* ---------- Kartenliste ---------- */
function renderFilterRow(){
  const row = document.getElementById('filter-row');
  const filters = [
    { key: 'all', label: 'Alle' },
    { key: 'due', label: 'Fällig' },
    { key: 'box1', label: 'Box 1' },
    { key: 'box2', label: 'Box 2' },
    { key: 'box3', label: 'Box 3' },
    { key: 'box4', label: 'Box 4' },
    { key: 'box5', label: 'Box 5' }
  ];
  row.innerHTML = '';
  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (listFilter === f.key ? ' active' : '');
    btn.textContent = f.label;
    btn.onclick = () => { listFilter = f.key; renderCardList(); };
    row.appendChild(btn);
  });
}

function renderCardList(){
  const list = document.getElementById('card-list');
  const t = todayStr();
  let filtered = cards.filter(c => activeSubjectFilter === 'all' || c.subject === activeSubjectFilter);

  if (listFilter === 'due') filtered = filtered.filter(c => c.nextReview <= t);
  else if (listFilter.startsWith('box')) {
    const n = parseInt(listFilter.replace('box',''), 10);
    filtered = filtered.filter(c => c.box === n);
  }

  filtered.sort(compareByName);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">Keine Karten in dieser Ansicht.</div>`;
    return;
  }

  list.innerHTML = '';
  filtered.forEach(c => {
    const boxIdx = c.box - 1;
    const isDue = c.nextReview <= t;
    const div = document.createElement('div');
    div.className = 'flashcard-item';
    div.innerHTML = `
      <span class="flashcard-title">${escapeHtml(c.name)}</span>
      <span class="flashcard-meta" style="color:${subjectColor(c.subject)}">${escapeHtml(subjectName(c.subject))}</span>
      <span class="flashcard-box-badge" style="color:${BOX_COLORS[boxIdx]}; background:${BOX_COLORS[boxIdx]}22;">Box ${c.box}</span>
      <span class="flashcard-due-badge ${isDue ? 'due-today' : ''}">${isDue ? 'heute fällig' : 'ab ' + formatDate(c.nextReview)}</span>
      <span class="flashcard-meta">${c.correctCount}✓ / ${c.partialCount || 0}◐ / ${c.wrongCount}✗</span>
      <button class="ghost edit-x-btn" style="padding:6px 12px; font-size:13px;">✎</button>
      <button class="delete-btn del-x-btn">Löschen</button>
    `;
    div.querySelector('.edit-x-btn').onclick = () => openEditModal(c);
    div.querySelector('.del-x-btn').onclick = () => {
      if (confirm(`Karte "${c.name}" löschen?`)) {
        cards = cards.filter(x => x.id !== c.id);
        saveAll();
        renderAll();
      }
    };
    list.appendChild(div);
  });
}

function formatDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
}

/* ---------- Edit Modal ---------- */
let editingCardId = null;
function openEditModal(card){
  editingCardId = card.id;
  document.getElementById('edit-card-input').value = card.name;
  renderSubjectSelect(document.getElementById('edit-card-subject'), card.subject);
  document.getElementById('edit-modal').classList.add('open');
}
document.getElementById('edit-cancel-btn').onclick = () => {
  document.getElementById('edit-modal').classList.remove('open');
  editingCardId = null;
};
document.getElementById('edit-save-btn').onclick = () => {
  const card = cards.find(c => c.id === editingCardId);
  if (!card) return;
  const name = document.getElementById('edit-card-input').value.trim();
  const subj = document.getElementById('edit-card-subject').value;
  if (name) card.name = name;
  if (subj) card.subject = subj;
  saveAll();
  document.getElementById('edit-modal').classList.remove('open');
  editingCardId = null;
  renderAll();
};

/* ---------- Backup ---------- */
document.getElementById('export-btn').onclick = () => {
  const data = { subjects, cards, streak, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `karteikarten-backup-${todayStr()}.json`;
  a.click();
  showStatus('Backup heruntergeladen.', true);
};
document.getElementById('import-btn').onclick = () => document.getElementById('import-file').click();
document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.subjects || !data.cards) throw new Error('Ungültiges Format');
      subjects = data.subjects;
      cards = data.cards;
      cards.forEach(c => { if (c.partialCount === undefined) c.partialCount = 0; });
      streak = data.streak || { count: 0, lastDate: null };
      saveAll();
      renderAll();
      showStatus('Import erfolgreich.', true);
    } catch (err) {
      showStatus('Import fehlgeschlagen: Datei ungültig.', false);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});
function showStatus(msg, ok){
  const el = document.getElementById('backup-status');
  el.textContent = msg;
  el.className = ok ? 'success' : 'error';
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 3500);
}

/* ---------- Helpers ---------- */
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- Render All ---------- */
function renderAll(){
  renderSubjectBar();
  renderSubjectSelect(document.getElementById('new-card-subject'), null);
  reviewSubjectFilter = activeSubjectFilter;
  renderReviewArea();
  renderStatsRow();
  renderBoxDistribution();
  renderFilterRow();
  renderCardList();
}

renderDate();
renderStreakBadge();
renderAll();
