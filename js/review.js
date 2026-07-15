/* ============================================================
   إنجاز — صفحة المراجعات والامتحانات
   ============================================================ */

let DATA = loadData();

function persist(){
  saveData(DATA);
  scheduleSyncPush();
}

const scheduleSyncPush = debounce(async function(){
  const cfg = getEffectiveFirebaseConfig();
  if(!cfg) return;
  try{ await pushRemoteData(cfg, DATA); }
  catch(e){ console.error('sync error:', e); }
}, 3500);

function renderBrandName(){
  const el = document.getElementById('brand-role-name');
  if(el) el.textContent = DATA.settings.studentName || 'المذاكِر المجتهد';
}

function renderHeaderClock(){
  const now = new Date();
  const clockEl = document.getElementById('live-clock');
  if(clockEl) clockEl.textContent = formatTime(now);
  const dateEl = document.getElementById('today-date');
  if(dateEl) dateEl.textContent = formatDateArabic(now);
}

/* -------------------- المواد الدراسية -------------------- */
function getSubjectById(id){
  return ensureReview(DATA).subjects.find(s => s.id === id);
}

function addSubject(){
  const input = document.getElementById('subject-name-input');
  const name = input.value.trim();
  if(!name) return;
  const review = ensureReview(DATA);
  if(review.subjects.some(s => s.name === name)){ toast('هذي المادة مضافة أصلاً', 'error'); return; }
  review.subjects.push({ id: uid(), name, color: getNextPaletteColor(review.subjects) });
  persist();
  renderSubjects();
  renderSubjectPicker();
  input.value = '';
  input.focus();
}

function deleteSubject(id){
  if(!confirm('حذف هذي المادة؟ المواضيع المرتبطة بيها تضل موجودة بس بدون هذا التصنيف.')) return;
  const review = ensureReview(DATA);
  review.subjects = review.subjects.filter(s => s.id !== id);
  review.items.forEach(item => { item.subjectIds = (item.subjectIds || []).filter(sid => sid !== id); });
  persist();
  renderAll();
}

function renderSubjects(){
  const review = ensureReview(DATA);
  const listEl = document.getElementById('subjects-list');
  if(!listEl) return;
  if(review.subjects.length === 0){
    listEl.innerHTML = `<div class="empty-state-mini">ضيف أول مادة عشان تكدر تربط المواضيع بيها</div>`;
  } else {
    listEl.innerHTML = review.subjects.map(s => `
      <span class="subject-chip" style="--chip-color:${s.color}">
        <span class="subject-chip-dot"></span>${escapeHtml(s.name)}
        <button type="button" class="subject-chip-x" onclick="deleteSubject('${s.id}')" aria-label="حذف">${ICONS.x}</button>
      </span>
    `).join('');
  }
}

function renderSubjectPicker(){
  const review = ensureReview(DATA);
  const wrap = document.getElementById('review-subjects-picker');
  if(!wrap) return;
  if(review.subjects.length === 0){
    wrap.innerHTML = `<span class="form-hint">ضيف مادة أول من فوق عشان تربط بيها المواضيع</span>`;
  } else {
    wrap.innerHTML = review.subjects.map(s => `
      <label class="subject-pick-item" style="--chip-color:${s.color}">
        <input type="checkbox" value="${s.id}" class="subject-pick-checkbox">
        <span class="subject-chip-dot"></span>${escapeHtml(s.name)}
      </label>
    `).join('');
  }
}

function renderSubjectTagsHtml(subjectIds){
  return (subjectIds || []).map(sid => {
    const s = getSubjectById(sid);
    if(!s) return '';
    return `<span class="subject-tag" style="--chip-color:${s.color}">${escapeHtml(s.name)}</span>`;
  }).join('');
}

/* -------------------- نموذج إضافة موضوع مراجعة -------------------- */
function setScheduleType(type){
  document.querySelectorAll('.schedule-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  document.querySelectorAll('.schedule-sub').forEach(el => { el.style.display = 'none'; });
  const target = document.getElementById(`schedule-sub-${type}`);
  if(target) target.style.display = '';
  document.getElementById('review-form').dataset.scheduleType = type;
}

function toggleDayChip(el){
  el.classList.toggle('active');
}

function addReviewItem(){
  const titleInput = document.getElementById('review-title-input');
  const title = titleInput.value.trim();
  if(!title){ toast('اكتب اسم الموضوع أو المادة أول', 'error'); return; }

  const subjectIds = Array.from(document.querySelectorAll('.subject-pick-checkbox:checked')).map(cb => cb.value);
  const scheduleType = document.getElementById('review-form').dataset.scheduleType || 'daily';
  const schedule = { type: scheduleType };

  if(scheduleType === 'daily'){
    schedule.timesPerDay = Math.max(1, parseInt(document.getElementById('review-times-per-day').value) || 1);
  } else if(scheduleType === 'week'){
    schedule.daysOfWeek = Array.from(document.querySelectorAll('.day-chip.active')).map(el => parseInt(el.dataset.day));
    if(schedule.daysOfWeek.length === 0){ toast('اختار يوم وحد على الأقل بالأسبوع', 'error'); return; }
  } else if(scheduleType === 'every'){
    schedule.everyN = Math.max(1, parseInt(document.getElementById('review-every-n').value) || 1);
  }

  const startDate = document.getElementById('review-start-date').value || todayKey();
  const examDate = document.getElementById('review-exam-date').value || null;
  const examTime = document.getElementById('review-exam-time').value || null;

  const review = ensureReview(DATA);
  review.items.push({
    id: uid(), title, subjectIds, schedule, startDate, examDate, examTime,
    completedDates: [], createdAt: new Date().toISOString(),
  });
  persist();
  renderAll();

  titleInput.value = '';
  document.querySelectorAll('.subject-pick-checkbox').forEach(cb => { cb.checked = false; });
  document.getElementById('review-exam-date').value = '';
  document.getElementById('review-exam-time').value = '';
  document.querySelectorAll('.day-chip.active').forEach(el => el.classList.remove('active'));
  toast('تم إضافة الموضوع للخطة ✓', 'success');
}

function deleteReviewItem(id){
  if(!confirm('حذف هذا الموضوع نهائياً من خطة المراجعة؟')) return;
  const review = ensureReview(DATA);
  review.items = review.items.filter(i => i.id !== id);
  persist();
  renderAll();
}

function toggleTodayDone(id){
  const review = ensureReview(DATA);
  const item = review.items.find(i => i.id === id);
  if(!item) return;
  const key = todayKey();
  if(!item.completedDates) item.completedDates = [];
  const idx = item.completedDates.indexOf(key);
  if(idx === -1){ item.completedDates.push(key); }
  else { item.completedDates.splice(idx, 1); }
  persist();
  renderTodayLists();

  const allDone = getDueTodayItems().every(it => (it.completedDates || []).includes(key));
  if(idx === -1 && allDone && getDueTodayItems().length > 0){
    confettiBurst();
    toast('خلّصت كل مراجعات اليوم! 🎉', 'success');
  }
}

/* -------------------- عرض «اليوم» -------------------- */
function getDueTodayItems(){
  const review = ensureReview(DATA);
  const now = new Date();
  return review.items.filter(item => isReviewDueOn(item, now));
}

function renderTodayLists(){
  const review = ensureReview(DATA);
  const todayKeyStr = todayKey();
  const dueToday = getDueTodayItems();

  const listEl = document.getElementById('today-reviews-list');
  if(dueToday.length === 0){
    listEl.innerHTML = `<div class="empty-state">${ICONS.info}<div>ما اكو مراجعات مجدولة اليوم</div></div>`;
  } else {
    const sorted = dueToday.slice().sort((a, b) => {
      const da = daysUntil(a.examDate), db = daysUntil(b.examDate);
      if(da == null && db == null) return 0;
      if(da == null) return 1;
      if(db == null) return -1;
      return da - db;
    });
    listEl.innerHTML = sorted.map(item => {
      const done = (item.completedDates || []).includes(todayKeyStr);
      const dLeft = daysUntil(item.examDate);
      const countdown = (dLeft != null && dLeft >= 0)
        ? `<span class="exam-countdown">${dLeft === 0 ? 'الامتحان اليوم! 🔥' : `باقي ${arCount(dLeft,'يوم','أيام')} للامتحان`}</span>` : '';
      return `
        <li class="achieve-item ${done ? 'done' : ''}">
          <button class="achieve-check ${done ? 'done' : ''}" onclick="toggleTodayDone('${item.id}')" title="راجعتها اليوم؟">${ICONS.check}</button>
          <span class="achieve-text">${escapeHtml(item.title)}${countdown}</span>
          <span class="review-subject-tags">${renderSubjectTagsHtml(item.subjectIds)}</span>
        </li>`;
    }).join('');
  }

  const examsToday = review.items.filter(item => item.examDate === todayKeyStr);
  const examEl = document.getElementById('today-exams-list');
  if(examsToday.length === 0){
    examEl.innerHTML = `<div class="empty-state">${ICONS.trophy}<div>ما اكو امتحانات اليوم</div></div>`;
  } else {
    examEl.innerHTML = examsToday.map(item => `
      <li class="achieve-item">
        <span class="achieve-check done" style="cursor:default">${ICONS.target}</span>
        <span class="achieve-text">${escapeHtml(item.title)} ${item.examTime ? `<span class="num">— ${item.examTime}</span>` : ''}</span>
        <span class="review-subject-tags">${renderSubjectTagsHtml(item.subjectIds)}</span>
      </li>`).join('');
  }

  renderUpcomingExams();
}

function renderUpcomingExams(){
  const review = ensureReview(DATA);
  const el = document.getElementById('upcoming-exams-list');
  if(!el) return;
  const upcoming = review.items
    .filter(item => { const d = daysUntil(item.examDate); return d != null && d > 0 && d <= 14; })
    .sort((a, b) => daysUntil(a.examDate) - daysUntil(b.examDate));
  if(upcoming.length === 0){
    el.innerHTML = `<div class="empty-state-mini">ما اكو امتحانات قريبة (خلال 14 يوم)</div>`;
  } else {
    el.innerHTML = upcoming.map(item => `
      <div class="upcoming-exam-row">
        <span class="review-subject-tags">${renderSubjectTagsHtml(item.subjectIds)}</span>
        <span>${escapeHtml(item.title)}</span>
        <span class="exam-countdown">باقي ${arCount(daysUntil(item.examDate), 'يوم', 'أيام')}</span>
      </div>`).join('');
  }
}

/* -------------------- كل المواضيع -------------------- */
function renderAllTopics(){
  const review = ensureReview(DATA);
  const listEl = document.getElementById('all-topics-list');
  if(!listEl) return;
  if(review.items.length === 0){
    listEl.innerHTML = `<div class="empty-state">${ICONS.book}<div>لسه ما ضفت أي موضوع مراجعة</div></div>`;
    return;
  }
  const sorted = review.items.slice().sort((a, b) => {
    const an = (a.subjectIds[0] && getSubjectById(a.subjectIds[0]) && getSubjectById(a.subjectIds[0]).name) || 'ي';
    const bn = (b.subjectIds[0] && getSubjectById(b.subjectIds[0]) && getSubjectById(b.subjectIds[0]).name) || 'ي';
    return an.localeCompare(bn, 'ar');
  });
  listEl.innerHTML = sorted.map(item => `
    <li class="session-item">
      <span class="session-dot"></span>
      <span class="session-time">${escapeHtml(item.title)}</span>
      <span class="session-dur">${formatScheduleSummary(item.schedule)}</span>
      ${item.examDate ? `<span class="day-tag">امتحان: ${formatDayLabel(item.examDate)}</span>` : ''}
      <span class="session-spacer"></span>
      <span class="review-subject-tags">${renderSubjectTagsHtml(item.subjectIds)}</span>
      <span class="session-actions">
        <button class="icon-btn danger" title="حذف" onclick="deleteReviewItem('${item.id}')">${ICONS.trash}</button>
      </span>
    </li>`).join('');
}

/* -------------------- الرسم الشامل والإقلاع -------------------- */
function renderAll(){
  renderSubjects();
  renderSubjectPicker();
  renderTodayLists();
  renderAllTopics();
}

function init(){
  hydrateIcons();
  applyTheme(DATA.settings);
  renderBrandName();
  renderHeaderClock();
  setInterval(renderHeaderClock, 1000);
  renderAll();
  setScheduleType('daily');

  const startDateInput = document.getElementById('review-start-date');
  if(startDateInput) startDateInput.value = todayKey();

  document.getElementById('subject-form').addEventListener('submit', (e) => { e.preventDefault(); addSubject(); });
  document.getElementById('review-form').addEventListener('submit', (e) => { e.preventDefault(); addReviewItem(); });

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') renderAll();
  });
}

document.addEventListener('DOMContentLoaded', init);
