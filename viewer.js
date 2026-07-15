/* ============================================================
   إنجاز — لوحة المشاهدين (قراءة فقط)
   ============================================================ */

let VDATA = null;
let currentPeriod = 'day'; // 'day' | 'week' | 'month'
let currentDayModalKey = null;
const VIEWER_THEME_KEY = 'injaz_viewer_theme_v1';

const VIEWER_CATS = {
  study: { key: 'study', label: 'دراستي', arrayKey: 'study', icon: 'book', emptyLabel: 'ما اكو جلسات قراءة مسجلة اليوم بعد' },
  break: { key: 'break', label: 'استراحاتي', arrayKey: 'breaks', icon: 'coffee', emptyLabel: 'ما اكو استراحات مسجلة اليوم بعد' },
  sleep: { key: 'sleep', label: 'نومي', arrayKey: 'sleep', icon: 'bed', emptyLabel: 'ما اكو ساعات نوم مسجلة اليوم بعد' },
};
const VIEWER_CAT_ORDER = ['study', 'break', 'sleep'];

/* -------------------- التخزين المؤقت المحلي -------------------- */
function loadViewerCache(){
  try{ const raw = localStorage.getItem(VIEWER_CACHE_KEY); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}
function saveViewerCache(data){
  try{ localStorage.setItem(VIEWER_CACHE_KEY, JSON.stringify(data)); }catch(e){}
}

function mergeWithDefaultsViewer(obj){
  const base = defaultData();
  return {
    ...base, ...obj,
    settings: { ...base.settings, ...(obj.settings||{}), customTheme: { ...base.settings.customTheme, ...((obj.settings||{}).customTheme||{}) } },
    days: obj.days || {},
  };
}

function currentDay(){
  if(!VDATA) return { study: [], breaks: [], achievements: [] };
  return VDATA.days[todayKey()] || { study: [], breaks: [], achievements: [] };
}

/* -------------------- جلب البيانات -------------------- */
async function startFirebaseListener(){
  const cfg = getEffectiveFirebaseConfig();
  if(!cfg){ showViewerState('not-deployed'); return; }
  await listenRemoteData(cfg, (val) => {
    if(val == null){
      const cached = loadViewerCache();
      if(cached){ VDATA = cached; showViewerState('stale', true); applyViewerTheme(); renderViewerAll(); }
      else showViewerState('no-data-yet');
    } else {
      VDATA = mergeWithDefaultsViewer(val);
      saveViewerCache(VDATA);
      showViewerState('ok');
      applyViewerTheme();
      renderViewerAll();
    }
    renderLastUpdated();
  }, (err) => {
    console.log('Firebase listen error:', err && err.message);
    const cached = loadViewerCache();
    if(cached){ VDATA = cached; showViewerState('stale', true); applyViewerTheme(); renderViewerAll(); }
    else showViewerState('error');
    renderLastUpdated();
  });
}

function manualRefresh(){
  // مع الاستماع الحي، أي تحديث يوصل أوتوماتيكياً ولحظياً بدون ما تحتاج تضغط شي — هذا الزر مفيد بس لإعادة الاتصال لو صار انقطاع
  const btn = document.getElementById('refresh-btn');
  if(btn) btn.classList.add('spinning');
  startFirebaseListener();
  setTimeout(() => { if(btn) btn.classList.remove('spinning'); }, 700);
}

function showViewerState(state, isStale){
  const mainEl = document.getElementById('viewer-main');
  const stateEl = document.getElementById('viewer-state');
  const messages = {
    'not-deployed': 'هذا الموقع يشتغل بشكل كامل بعد رفعه على GitHub Pages. إذا تشوف هذا الكلام، يعني الصفحة لسه ما انرفعت.',
    'no-data-yet': 'صاحب اللوحة لسه ما نشر أي بيانات لليوم. جرّب ترجع لهذي الصفحة بعدين.',
    'error': 'ما كدرنا نجيب البيانات حالياً. تأكد من اتصال الإنترنت وحاول مرة ثانية.',
  };
  if(state === 'ok' || state === 'stale'){
    if(mainEl) mainEl.style.display = '';
    if(stateEl) stateEl.style.display = 'none';
  } else {
    if(mainEl) mainEl.style.display = 'none';
    if(stateEl) stateEl.style.display = 'flex';
    const textEl = document.getElementById('viewer-state-text');
    if(textEl) textEl.textContent = messages[state] || messages.error;
  }
  const staleNote = document.getElementById('stale-note');
  if(staleNote) staleNote.style.display = isStale ? 'flex' : 'none';
}

function renderLastUpdated(){
  const el = document.getElementById('last-updated');
  if(el && VDATA) el.textContent = `آخر تحديث: ${formatRelativeTime(VDATA.updatedAt)}`;
}

/* -------------------- الرسم -------------------- */
function renderHeaderClock(){
  const now = new Date();
  const clockEl = document.getElementById('live-clock');
  if(clockEl) clockEl.textContent = formatTime(now);
  const dateEl = document.getElementById('today-date');
  if(dateEl) dateEl.textContent = formatDateArabic(now);
}

function renderViewerHeader(){
  const settings = VDATA ? VDATA.settings : defaultData().settings;
  const el = document.getElementById('brand-role-name');
  if(el) el.textContent = settings.studentName || 'المذاكِر المجتهد';
}

function getViewerScopedView(){
  const settings = VDATA ? VDATA.settings : defaultData().settings;
  const daysObj = VDATA ? VDATA.days : {};
  if(currentPeriod === 'week') return buildWeekView(daysObj, settings);
  if(currentPeriod === 'month') return buildMonthView(daysObj, settings);
  const day = currentDay();
  return { study: day.study || [], breaks: day.breaks || [], sleep: day.sleep || [], achievements: day.achievements || [], stats: computeStats(day, settings) };
}

function setPeriod(period){
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  const dayTrack = document.getElementById('timeline-track');
  const weekBars = document.getElementById('week-bars');
  const monthGrid = document.getElementById('month-grid-wrap');
  if(dayTrack) dayTrack.style.display = period === 'day' ? '' : 'none';
  if(weekBars) weekBars.style.display = period === 'week' ? '' : 'none';
  if(monthGrid) monthGrid.style.display = period === 'month' ? '' : 'none';
  const timelineSub = document.getElementById('timeline-sub');
  if(timelineSub){
    const subs = { day: 'شكل اليوم بلمحة وحدة — من 12 بالليل ل12 بالليل', week: 'مجموع أيام هالأسبوع (الأحد للسبت) بلمحة وحدة', month: 'خريطة حرارية لهالشهر — كل مربع يوم، وكل ما غمق اللون قريت أكثر' };
    timelineSub.textContent = subs[period];
  }
  renderViewerAll();
}

function renderViewerStats(){
  const stats = getViewerScopedView().stats;
  animateCountUp(document.getElementById('stat-study'), stats.studyMinutes, { formatter: formatDuration });
  animateCountUp(document.getElementById('stat-break'), stats.breakMinutes, { formatter: formatDuration });
  animateCountUp(document.getElementById('stat-sleep'), stats.sleepMinutes, { formatter: formatDuration });
  animateCountUp(document.getElementById('stat-percent'), stats.percentage, { suffix: '%' });
  animateCountUp(document.getElementById('stat-points'), stats.points);
  const goalFill = document.getElementById('goal-fill');
  const goalLabel = document.getElementById('goal-label');
  if(goalFill) goalFill.style.width = stats.goalPercentage + '%';
  if(goalLabel){
    const periodWord = { day: 'اليوم', week: 'هالأسبوع', month: 'هالشهر' }[currentPeriod];
    goalLabel.textContent = `${formatDuration(stats.studyMinutes)} من هدف ${formatDuration(stats.goalMinutes)} ${periodWord}`;
  }
}

function renderViewerTimeline(){
  if(currentPeriod === 'week'){
    const el = document.getElementById('week-bars');
    if(el) el.innerHTML = renderWeekBarsHTML(getViewerScopedView());
  } else if(currentPeriod === 'month'){
    const el = document.getElementById('month-grid-wrap');
    if(el) el.innerHTML = renderMonthGridHTML(getViewerScopedView());
  } else {
    const el = document.getElementById('timeline-track');
    if(el) el.innerHTML = renderTimelineHTML(currentDay());
  }
}

function renderViewerSessions(catKey){
  const cat = VIEWER_CATS[catKey];
  const isDay = currentPeriod === 'day';
  const periodWord = { day: 'اليوم', week: 'هالأسبوع', month: 'هالشهر' }[currentPeriod];
  const sessions = getViewerScopedView()[cat.arrayKey];
  const totalEl = document.getElementById(`total-${catKey}`);
  if(totalEl) totalEl.innerHTML = `<b class="num">${formatDuration(sessions.reduce((s,x)=>s+x.minutes,0))}</b> ${periodWord}`;
  const listEl = document.getElementById(`sessionlist-${catKey}`);
  if(!listEl) return;
  if(sessions.length === 0){
    listEl.innerHTML = `<div class="empty-state">${ICONS[cat.icon]}<div>${isDay ? cat.emptyLabel : `ما اكو جلسات مسجلة ${periodWord}`}</div></div>`;
    return;
  }
  const ordered = isDay ? sessions.slice().reverse() : sessions.slice().sort((a,b) => new Date(b.start) - new Date(a.start));
  listEl.innerHTML = ordered.map(s => `
    <li class="session-item" data-cat="${catKey}" ${s.details ? `onclick="showNoteModal('${catKey}','${s.id}','${s.dayKey || todayKey()}')" style="cursor:pointer"` : ''}>
      <span class="session-dot"></span>
      ${!isDay ? `<span class="day-tag">${formatDayLabel(s.dayKey)}</span>` : ''}
      <span class="session-time num">${formatTime(s.start)} – ${formatTime(s.end)}</span>
      <span class="session-dur num">${formatDuration(s.minutes)}</span>
      ${s.details ? `<span class="session-note-flag" title="فيها ملاحظة — اضغط لعرضها"></span>` : ''}
    </li>
  `).join('');
}

function renderViewerAchievements(){
  const isDay = currentPeriod === 'day';
  const periodWord = { day: 'اليوم', week: 'هالأسبوع', month: 'هالشهر' }[currentPeriod];
  const achievements = getViewerScopedView().achievements;
  const listEl = document.getElementById('achieve-list');
  if(!listEl) return;
  if(achievements.length === 0){
    listEl.innerHTML = `<div class="empty-state">${ICONS.trophy}<div>${isDay ? 'ما اكو أهداف مسجلة اليوم بعد' : `ما اكو أهداف مسجلة ${periodWord}`}</div></div>`;
  } else {
    listEl.innerHTML = achievements.map(a => `
      <li class="achieve-item ${a.done ? 'done' : ''}">
        <span class="achieve-check ${a.done ? 'done' : ''}" style="cursor:default">${ICONS.check}</span>
        ${!isDay ? `<span class="day-tag">${formatDayLabel(a.dayKey)}</span>` : ''}
        <span class="achieve-text">${escapeHtml(a.text)}</span>
      </li>
    `).join('');
  }
}

function setStatsLoading(isLoading){
  ['stat-study','stat-break','stat-sleep','stat-percent','stat-points'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.toggle('skeleton', isLoading);
  });
}

let viewerTickInterval = null;

function renderViewerAll(){
  setStatsLoading(false);
  renderViewerHeader();
  renderViewerStats();
  renderViewerTimeline();
  renderViewerSessions('study');
  renderViewerSessions('break');
  renderViewerSessions('sleep');
  renderViewerAchievements();
  updateLiveTimerDisplay();
  if(currentDayModalKey) openViewerDayModal(currentDayModalKey);
}

function updateLiveTimerDisplay(){
  const active = VDATA && VDATA.activeTimer;
  ['study', 'break', 'sleep'].forEach(catKey => {
    const box = document.getElementById(`livetimer-${catKey}`);
    if(box) box.style.display = (active && active.category === catKey) ? 'flex' : 'none';
  });
  if(active){
    if(!viewerTickInterval) viewerTickInterval = setInterval(tickLiveTimerDisplay, 1000);
    tickLiveTimerDisplay();
  } else if(viewerTickInterval){
    clearInterval(viewerTickInterval);
    viewerTickInterval = null;
  }
}

function tickLiveTimerDisplay(){
  const active = VDATA && VDATA.activeTimer;
  if(!active) return;
  const el = document.getElementById(`livetimer-${active.category}-clock`);
  if(el) el.textContent = formatStopwatch(getActiveElapsedSeconds(active));
}

/* -------------------- لوحة عرض الملاحظة -------------------- */
function showNoteModal(catKey, sessionId, dayKey){
  const cat = VIEWER_CATS[catKey];
  dayKey = dayKey || todayKey();
  const dayObj = (VDATA && VDATA.days[dayKey]) || { study: [], breaks: [], sleep: [] };
  const session = (dayObj[cat.arrayKey] || []).find(s => s.id === sessionId);
  if(!session) return;
  document.getElementById('modal-note-title').textContent = cat.label;
  document.getElementById('modal-note-meta').textContent = `${formatTime(session.start)} – ${formatTime(session.end)} · ${formatDuration(session.minutes)}`;
  document.getElementById('modal-note-text').textContent = session.details || '';
  showModal('modal-note');
}

function openDayDetailModal(dayKey){ openViewerDayModal(dayKey); }

function openViewerDayModal(dayKey){
  currentDayModalKey = dayKey;
  const settings = VDATA ? VDATA.settings : defaultData().settings;
  const day = (VDATA && VDATA.days[dayKey]) || { study: [], breaks: [], sleep: [], achievements: [] };
  const stats = computeStats(day, settings);

  document.getElementById('modal-day-title').textContent = formatDayLabel(dayKey);

  const statsHtml = `
    <div class="day-modal-stats">
      <div class="day-modal-stat"><span class="num">${formatDuration(stats.studyMinutes)}</span><span>قراءة</span></div>
      <div class="day-modal-stat"><span class="num">${formatDuration(stats.breakMinutes)}</span><span>استراحة</span></div>
      <div class="day-modal-stat"><span class="num">${formatDuration(stats.sleepMinutes)}</span><span>نوم</span></div>
      <div class="day-modal-stat"><span class="num">${stats.percentage}%</span><span>إنجاز</span></div>
      <div class="day-modal-stat"><span class="num">${stats.points}</span><span>نقطة</span></div>
    </div>`;

  const sectionsHtml = VIEWER_CAT_ORDER.map(catKey => {
    const cat = VIEWER_CATS[catKey];
    const sessions = (day[cat.arrayKey] || []).slice().sort((a,b) => new Date(a.start) - new Date(b.start));
    return `
      <div class="day-modal-section">
        <div class="day-modal-section-title">${ICONS[cat.icon]}<span>${cat.label}</span></div>
        ${sessions.length === 0 ? `<div class="empty-state-mini">ما اكو</div>` : `<ul class="session-list">${sessions.map(s => `
          <li class="session-item" data-cat="${catKey}" ${s.details ? `onclick="showNoteModal('${catKey}','${s.id}','${dayKey}')" style="cursor:pointer"` : ''}>
            <span class="session-dot"></span>
            <span class="session-time num">${formatTime(s.start)} – ${formatTime(s.end)}</span>
            <span class="session-dur num">${formatDuration(s.minutes)}</span>
            ${s.details ? `<span class="session-note-flag"></span>` : ''}
          </li>`).join('')}</ul>`}
      </div>`;
  }).join('');

  const achievements = day.achievements || [];
  const achieveHtml = `
    <div class="day-modal-section">
      <div class="day-modal-section-title">${ICONS.trophy}<span>الإنجازات</span></div>
      ${achievements.length === 0 ? `<div class="empty-state-mini">ما اكو</div>` : `<ul class="achieve-list">${achievements.map(a => `
        <li class="achieve-item ${a.done ? 'done' : ''}">
          <span class="achieve-check ${a.done ? 'done' : ''}" style="cursor:default">${ICONS.check}</span>
          <span class="achieve-text">${escapeHtml(a.text)}</span>
        </li>`).join('')}</ul>`}
    </div>`;

  document.getElementById('modal-day-body').innerHTML = statsHtml + sectionsHtml + achieveHtml;
  showModal('modal-day');
}

function closeDayModal(){
  currentDayModalKey = null;
  closeModal('modal-day');
}

function showModal(id){ document.getElementById(id).classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeModal(id){ document.getElementById(id).classList.remove('show'); document.body.style.overflow = ''; }

/* -------------------- تقييم العائلة (اختياري تماماً) -------------------- */
let selectedRating = 0;
let previewRating = 0;

function renderRatingStars(){
  const container = document.getElementById('rating-stars');
  if(!container) return;
  const activeRating = previewRating || selectedRating;
  container.innerHTML = '';
  for(let i = 1; i <= 5; i++){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star-btn' + (i <= activeRating ? ' filled' : '');
    btn.setAttribute('aria-label', `${i} من 5 نجوم`);
    btn.innerHTML = ICONS.star;
    btn.onmouseenter = () => { previewRating = i; renderRatingStars(); };
    btn.onmouseleave = () => { previewRating = 0; renderRatingStars(); };
    btn.onclick = () => { selectedRating = (selectedRating === i ? 0 : i); renderRatingStars(); };
    container.appendChild(btn);
  }
}

function hasFeedbackContent(){
  const commentEl = document.getElementById('rating-comment');
  return selectedRating > 0 || (commentEl && commentEl.value.trim().length > 0);
}

function buildFeedbackMessage(){
  const nameEl = document.getElementById('rating-name');
  const commentEl = document.getElementById('rating-comment');
  const name = nameEl ? nameEl.value.trim() : '';
  const comment = commentEl ? commentEl.value.trim() : '';
  const studentName = (VDATA && VDATA.settings.studentName) || '';
  const lines = [];
  lines.push(`📋 تقييم يوم${studentName ? ' — ' + studentName : ''}`);
  if(selectedRating > 0) lines.push('⭐'.repeat(selectedRating) + '☆'.repeat(5 - selectedRating) + ` (${selectedRating}/5)`);
  if(comment) lines.push(`"${comment}"`);
  lines.push(`— ${name || 'أحد أفراد العائلة'} · ${formatDateArabic(new Date())}`);
  return lines.join('\n');
}

function shareViaWhatsapp(){
  if(!hasFeedbackContent()){ toast('اختار تقييم أو اكتب كلمة أول', 'error'); return; }
  const msg = buildFeedbackMessage();
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  toast('اختار الشخص اللي تريد ترسله له بواتساب 💛', 'success');
}

async function copyFeedback(){
  if(!hasFeedbackContent()){ toast('اختار تقييم أو اكتب كلمة أول', 'error'); return; }
  const msg = buildFeedbackMessage();
  const done = await copyToClipboard(msg);
  toast(done ? 'تم نسخ رسالة التقييم ✓ الصقها بأي تطبيق' : msg, done ? 'success' : 'info');
}

/* -------------------- اختيار مظهر خاص بالمشاهد -------------------- */
function getViewerThemeOverride(){ try{ return localStorage.getItem(VIEWER_THEME_KEY); }catch(e){ return null; } }
function setViewerThemeOverride(themeName){
  try{ localStorage.setItem(VIEWER_THEME_KEY, themeName); }catch(e){}
  applyViewerTheme();
  toggleThemePopover(false);
}
function clearViewerThemeOverride(){
  try{ localStorage.removeItem(VIEWER_THEME_KEY); }catch(e){}
  applyViewerTheme();
  toggleThemePopover(false);
}
function applyViewerTheme(){
  const settings = VDATA ? VDATA.settings : defaultData().settings;
  const override = getViewerThemeOverride();
  applyTheme(override ? { ...settings, theme: override } : settings);
}
function toggleThemePopover(force){
  const pop = document.getElementById('theme-popover');
  if(!pop) return;
  const willShow = force != null ? force : !pop.classList.contains('show');
  pop.classList.toggle('show', willShow);
}

/* -------------------- الإقلاع -------------------- */
function init(){
  hydrateIcons();
  renderRatingStars();
  const cached = loadViewerCache();
  if(cached){ VDATA = cached; applyViewerTheme(); renderViewerAll(); }
  else{ applyViewerTheme(); setStatsLoading(true); }

  renderHeaderClock();
  setInterval(renderHeaderClock, 1000);
  setInterval(renderLastUpdated, 30000);
  setInterval(renderViewerTimeline, 60000);

  startFirebaseListener();
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') startFirebaseListener();
  });

  function closeAnyModal(id){ if(id === 'modal-day') closeDayModal(); else closeModal(id); }
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', (e) => { if(e.target === ov) closeAnyModal(ov.id); });
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') document.querySelectorAll('.modal-overlay.show').forEach(ov => closeAnyModal(ov.id));
  });
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('theme-popover');
    const btn = document.getElementById('theme-popover-btn');
    if(pop && btn && !pop.contains(e.target) && !btn.contains(e.target)) pop.classList.remove('show');
  });
}

document.addEventListener('DOMContentLoaded', init);
