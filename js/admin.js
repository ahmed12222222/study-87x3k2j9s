/* ============================================================
   إنجاز — لوحة التحكم
   ============================================================ */

let DATA = loadData();
let tickInterval = null;
let syncState = 'off'; // off | pending | ok | err
let lastSyncError = '';
let currentModalSession = null;
let currentPeriod = 'day'; // 'day' | 'week' | 'month'
let currentDayModalKey = null;

const CATS = {
  study: {
    key: 'study', label: 'دراستي', arrayKey: 'study', icon: 'book',
    startLabel: 'ابدأ القراءة', endLabel: 'إنهاء الجلسة',
    emptyLabel: 'لسه ما بديت القراءة اليوم — اضغط «ابدأ القراءة» لأول جلسة',
    addedToast: 'تم حفظ جلسة القراءة ✓',
  },
  break: {
    key: 'break', label: 'استراحاتي', arrayKey: 'breaks', icon: 'coffee',
    startLabel: 'ابدأ الاستراحة', endLabel: 'إنهاء الاستراحة',
    emptyLabel: 'ما اكو استراحات مسجلة اليوم بعد',
    addedToast: 'تم حفظ الاستراحة ✓',
  },
  sleep: {
    key: 'sleep', label: 'نومي', arrayKey: 'sleep', icon: 'bed',
    startLabel: 'ابدأ النوم', endLabel: 'صحيت 🌅',
    emptyLabel: 'ما اكو ساعات نوم مسجلة اليوم بعد',
    addedToast: 'تم تسجيل نومك ✓',
  },
};
const CAT_ORDER = ['study', 'break', 'sleep'];

/* -------------------- الحفظ والمزامنة -------------------- */
function persist(){
  saveData(DATA);
  scheduleSyncPush();
}

// نفس الحفظ، بس بدون فترة انتظار — نستخدمها لحظة بدء/إيقاف العداد تحديداً حتى تنعرض عند العائلة فوراً وهي تعد
async function persistImmediate(){
  saveData(DATA);
  const cfg = getEffectiveFirebaseConfig();
  if(!cfg) return;
  syncState = 'pending';
  renderSyncStatusUI();
  try{
    await pushRemoteData(cfg, DATA);
    syncState = 'ok';
    lastSyncError = '';
  }catch(e){
    console.error('sync error:', e);
    syncState = 'err';
    lastSyncError = e.message || String(e);
  }
  renderSyncStatusUI();
}

const scheduleSyncPush = debounce(async function(){
  const cfg = getEffectiveFirebaseConfig();
  if(!cfg) return;
  syncState = 'pending';
  renderSyncStatusUI();
  try{
    await pushRemoteData(cfg, DATA);
    syncState = 'ok';
    lastSyncError = '';
  }catch(e){
    console.error('sync error:', e);
    syncState = 'err';
    lastSyncError = e.message || String(e);
  }
  renderSyncStatusUI();
}, 3500);

async function syncNow(){
  const cfg = getEffectiveFirebaseConfig();
  if(!cfg){ toast('ما لكينا إعدادات Firebase بالملف — شوف خطوات الإعداد بالـ README', 'error'); return; }
  syncState = 'pending';
  renderSyncStatusUI();
  try{
    await pushRemoteData(cfg, DATA);
    syncState = 'ok';
    lastSyncError = '';
    toast('تم النشر لأهلك بنجاح ✓', 'success');
  }catch(e){
    console.error(e);
    syncState = 'err';
    lastSyncError = e.message || String(e);
    toast('فشلت المزامنة — افتح تبويب «المشاركة» وشوف تفاصيل الخطأ تحت', 'error');
  }
  renderSyncStatusUI();
}

async function testFirebaseConnection(){
  const cfg = getEffectiveFirebaseConfig();
  const resultEl = document.getElementById('gh-test-result');
  resultEl.style.display = 'flex';
  resultEl.className = 'form-hint gh-test-box';
  resultEl.innerHTML = `${ICONS.refresh}<span>جاري الفحص...</span>`;
  const result = await checkRepoAccess(cfg);
  resultEl.className = `form-hint gh-test-box ${result.ok ? (result.warn ? 'warn' : 'ok') : 'bad'}`;
  resultEl.innerHTML = `${ICONS[result.ok ? (result.warn ? 'alertCircle' : 'checkCircle') : 'alertCircle']}<span>${escapeHtml(result.message)}</span>`;
}

function showUpdateAvailableBanner(remoteData){
  const existing = document.getElementById('remote-update-banner');
  if(existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'remote-update-banner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <span class="update-banner-icon">${ICONS.info}</span>
    <span class="update-banner-text">لكيت نسخة أحدث من بياناتك محفوظة (غالباً من جهاز ثاني)</span>
    <button type="button" class="btn btn-primary btn-sm" id="update-banner-load">تحميلها</button>
    <button type="button" class="btn btn-ghost btn-sm" id="update-banner-dismiss">تجاهل</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('update-banner-load').onclick = () => {
    DATA = mergeWithDefaults(remoteData);
    saveData(DATA);
    applyTheme(DATA.settings);
    renderAll();
    renderBrandName();
    toast('تم تحميل أحدث نسخة ✓', 'success');
    banner.remove();
  };
  document.getElementById('update-banner-dismiss').onclick = () => banner.remove();
}

async function checkRemoteOnLoad(){
  const cfg = getEffectiveFirebaseConfig();
  if(!cfg){ renderSyncStatusUI(); return; }
  try{
    const remote = await fetchRemoteDataFresh(cfg);
    if(remote && remote.updatedAt && (!DATA.updatedAt || new Date(remote.updatedAt) > new Date(DATA.updatedAt))){
      showUpdateAvailableBanner(remote);
    }
    syncState = 'ok';
    lastSyncError = '';
  }catch(e){
    console.log('checkRemoteOnLoad:', e.message);
    if(e.message !== 'NOT_FOUND'){
      syncState = 'err';
      lastSyncError = e.message || String(e);
    }
  }
  renderSyncStatusUI();
}

function mergeWithDefaults(obj){
  const base = defaultData();
  const days = obj.days || {};
  Object.keys(days).forEach(k => {
    const d = days[k];
    if(!d.study) d.study = [];
    if(!d.breaks) d.breaks = [];
    if(!d.sleep) d.sleep = [];
    if(!d.achievements) d.achievements = [];
    if(!d.familyFeedback) d.familyFeedback = [];
  });
  return {
    ...base, ...obj,
    settings: { ...base.settings, ...(obj.settings||{}), customTheme: { ...base.settings.customTheme, ...((obj.settings||{}).customTheme||{}) } },
    days,
  };
}

function renderSyncStatusUI(){
  const cfg = getEffectiveFirebaseConfig();
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  const mini = document.getElementById('sync-dot-mini');
  const errDetail = document.getElementById('sync-error-detail');
  let cls = 'off', text = 'المزامنة غير مفعّلة — البيانات بجهازك بس';
  if(cfg){
    if(syncState === 'pending'){ cls='pending'; text='جاري الحفظ على Firebase...'; }
    else if(syncState === 'ok'){ cls='ok'; text = `متزامن مع أهلك ✓ — آخر تحديث ${formatRelativeTime(DATA.updatedAt)}`; }
    else if(syncState === 'err'){ cls='err'; text='صار خطأ بالمزامنة — التفاصيل تحت 👇'; }
    else { cls='off'; text='لسه ما انحفظ على Firebase'; }
  }
  if(dot){ dot.className = `sync-dot ${cls}`; }
  if(label){ label.textContent = text; }
  if(mini){ mini.className = `sync-dot-mini ${cls}`; mini.title = text; }
  if(errDetail){
    if(cls === 'err' && lastSyncError){
      errDetail.style.display = 'flex';
      errDetail.innerHTML = `${ICONS.alertCircle}<span>تفاصيل الخطأ: ${escapeHtml(lastSyncError)}</span>`;
    } else {
      errDetail.style.display = 'none';
    }
  }
}

/* -------------------- الساعة والتاريخ -------------------- */
function renderHeaderClock(){
  const now = new Date();
  const clockEl = document.getElementById('live-clock');
  if(clockEl) clockEl.textContent = formatTime(now);
  const dateEl = document.getElementById('today-date');
  if(dateEl) dateEl.textContent = formatDateArabic(now);
}

function renderBrandName(){
  const el = document.getElementById('brand-role-name');
  if(el) el.textContent = DATA.settings.studentName || 'المذاكِر المجتهد';
}

/* -------------------- التبديل بين اليوم والأسبوع والشهر -------------------- */
function getScopedView(){
  if(currentPeriod === 'week') return buildWeekView(DATA.days, DATA.settings);
  if(currentPeriod === 'month') return buildMonthView(DATA.days, DATA.settings);
  const day = ensureDay(DATA);
  return { study: day.study, breaks: day.breaks, sleep: day.sleep, achievements: day.achievements, stats: computeStats(day, DATA.settings) };
}

function setPeriod(period){
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  const isDay = period === 'day';
  document.querySelectorAll('.timer-box, .manual-toggle, .manual-form').forEach(el => { el.style.display = isDay ? '' : 'none'; });
  const achieveForm = document.getElementById('achieve-form');
  if(achieveForm) achieveForm.style.display = isDay ? '' : 'none';

  const dayTrack = document.getElementById('timeline-track');
  const weekBars = document.getElementById('week-bars');
  const monthGrid = document.getElementById('month-grid-wrap');
  if(dayTrack) dayTrack.style.display = period === 'day' ? '' : 'none';
  if(weekBars) weekBars.style.display = period === 'week' ? '' : 'none';
  if(monthGrid) monthGrid.style.display = period === 'month' ? '' : 'none';

  const timelineSub = document.getElementById('timeline-sub');
  if(timelineSub){
    const subs = { day: 'شكل يومك بلمحة وحدة — من 12 بالليل ل12 بالليل', week: 'مجموع أيام هالأسبوع (الأحد للسبت) بلمحة وحدة', month: 'خريطة حرارية لهالشهر — كل مربع يوم، وكل ما غمق اللون قريت أكثر' };
    timelineSub.textContent = subs[period];
  }
  renderAll();
}

/* -------------------- الإحصائيات وشريط اليوم -------------------- */
function renderStats(){
  const stats = getScopedView().stats;
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

function renderTimeline(){
  if(currentPeriod === 'week'){
    const el = document.getElementById('week-bars');
    if(el) el.innerHTML = renderWeekBarsHTML(getScopedView());
  } else if(currentPeriod === 'month'){
    const el = document.getElementById('month-grid-wrap');
    if(el) el.innerHTML = renderMonthGridHTML(getScopedView());
  } else {
    const el = document.getElementById('timeline-track');
    if(el) el.innerHTML = renderTimelineHTML(ensureDay(DATA));
  }
}

/* -------------------- المؤقّت (طريقة الزر) -------------------- */
function startTickInterval(){
  if(tickInterval) return;
  tickInterval = setInterval(updateRunningTimerDisplay, 1000);
  updateRunningTimerDisplay();
}
function stopTickInterval(){
  if(tickInterval){ clearInterval(tickInterval); tickInterval = null; }
}
function updateRunningTimerDisplay(){
  if(!DATA.activeTimer) return;
  const el = document.getElementById(`timerdisplay-${DATA.activeTimer.category}`);
  if(el) el.textContent = formatStopwatch(getActiveElapsedSeconds(DATA.activeTimer));
}

function startTimer(catKey){
  if(DATA.activeTimer){ toast('فيه عداد شغال حالياً، خلّص منه أول', 'error'); return; }
  DATA.activeTimer = { category: catKey, start: new Date().toISOString() };
  persistImmediate();
  renderAll();
  startTickInterval();
}

function stopTimer(catKey){
  if(!DATA.activeTimer || DATA.activeTimer.category !== catKey) return;
  const cat = CATS[catKey];
  const day = ensureDay(DATA);
  const prevMinutes = day[cat.arrayKey].reduce((s,x)=>s+x.minutes, 0);
  const start = DATA.activeTimer.start;
  const end = new Date().toISOString();
  const minutes = Math.max(1, Math.round((new Date(end) - new Date(start)) / 60000));
  const session = { id: uid(), start, end, minutes, details: '', source: 'timer' };
  day[cat.arrayKey].push(session);
  DATA.activeTimer = null;
  persistImmediate();
  stopTickInterval();
  renderAll();
  toast(cat.addedToast, 'success');
  if(catKey === 'study') checkGoalCelebration(prevMinutes, prevMinutes + minutes);
  openDetailsModal(catKey, session.id);
}

function cancelTimer(catKey){
  if(!DATA.activeTimer || DATA.activeTimer.category !== catKey) return;
  if(!confirm('تريد تلغي هذا العداد بدون ما تحفظ الجلسة؟')) return;
  DATA.activeTimer = null;
  persistImmediate();
  stopTickInterval();
  renderAll();
  toast('تم الإلغاء بدون حفظ', 'info');
}

function checkGoalCelebration(prevMinutes, newMinutes){
  const goal = DATA.settings.dailyGoalMinutes || 360;
  if(prevMinutes < goal && newMinutes >= goal){
    confettiBurst();
    toast('عاشت الإيد! وصلت هدفك اليومي بالقراءة 🎉', 'success');
  }
}

/* -------------------- الإضافة اليدوية -------------------- */
function toggleManualForm(catKey){
  const form = document.getElementById(`manualform-${catKey}`);
  const btn = document.getElementById(`manualtoggle-${catKey}`);
  const willOpen = !form.classList.contains('open');
  form.classList.toggle('open', willOpen);
  btn.classList.toggle('open', willOpen);
}

function submitManualEntry(catKey){
  const cat = CATS[catKey];
  const startInput = document.getElementById(`manualstart-${catKey}`);
  const endInput = document.getElementById(`manualend-${catKey}`);
  if(!startInput.value || !endInput.value){ toast('حدد وقت البداية والنهاية', 'error'); return; }
  const today = new Date();
  const [sh, sm] = startInput.value.split(':').map(Number);
  const [eh, em] = endInput.value.split(':').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm, 0);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em, 0);
  if(end <= start){ toast('وقت الانتهاء لازم يكون بعد وقت البداية', 'error'); return; }

  const day = ensureDay(DATA);
  const prevMinutes = day[cat.arrayKey].reduce((s,x)=>s+x.minutes, 0);
  const minutes = Math.round((end - start) / 60000);
  const session = { id: uid(), start: start.toISOString(), end: end.toISOString(), minutes, details: '', source: 'manual' };
  day[cat.arrayKey].push(session);
  persist();
  renderAll();
  startInput.value = ''; endInput.value = '';
  toggleManualForm(catKey);
  toast(cat.addedToast, 'success');
  if(catKey === 'study') checkGoalCelebration(prevMinutes, prevMinutes + minutes);
}

/* -------------------- قوائم الجلسات -------------------- */
function renderTrackerSection(catKey){
  const cat = CATS[catKey];
  const isDay = currentPeriod === 'day';
  const periodWord = { day: 'اليوم', week: 'هالأسبوع', month: 'هالشهر' }[currentPeriod];
  const sessions = getScopedView()[cat.arrayKey] || [];
  const totalMin = sessions.reduce((s,x)=>s+x.minutes, 0);

  const totalEl = document.getElementById(`total-${catKey}`);
  if(totalEl) totalEl.innerHTML = `<b class="num">${formatDuration(totalMin)}</b> ${periodWord}`;

  if(isDay){
    const isRunning = DATA.activeTimer && DATA.activeTimer.category === catKey;
    const timerBox = document.getElementById(`timerbox-${catKey}`);
    const timerDisplay = document.getElementById(`timerdisplay-${catKey}`);
    const timerCaption = document.getElementById(`timercaption-${catKey}`);
    const controlsEl = document.getElementById(`timercontrols-${catKey}`);

    if(timerBox) timerBox.classList.toggle('running', !!isRunning);
    if(timerDisplay) timerDisplay.classList.toggle('running', !!isRunning);

    if(isRunning){
      if(timerDisplay) timerDisplay.textContent = formatStopwatch(getActiveElapsedSeconds(DATA.activeTimer));
      if(timerCaption) timerCaption.textContent = `بدأت الساعة ${formatTime(DATA.activeTimer.start)} — حسب ساعة جهازك`;
      if(controlsEl) controlsEl.innerHTML = `
        <button class="btn btn-danger timer-btn" onclick="stopTimer('${catKey}')">${ICONS.stop}<span>${cat.endLabel}</span></button>
        <button class="btn btn-ghost btn-sm" onclick="cancelTimer('${catKey}')">إلغاء بدون حفظ</button>
      `;
    } else {
      if(timerDisplay) timerDisplay.textContent = '00:00:00';
      if(timerCaption) timerCaption.textContent = DATA.activeTimer ? 'يوجد عداد آخر شغال حالياً' : 'اضغط ابدأ وراح يحسب الوقت أوتوماتيكياً';
      if(controlsEl) controlsEl.innerHTML = `
        <button class="btn btn-primary timer-btn" onclick="startTimer('${catKey}')" ${DATA.activeTimer ? 'disabled' : ''}>${ICONS.play}<span>${cat.startLabel}</span></button>
      `;
    }
  }

  const listEl = document.getElementById(`sessionlist-${catKey}`);
  if(!listEl) return;
  if(sessions.length === 0){
    listEl.innerHTML = `<div class="empty-state">${ICONS[cat.icon]}<div>${isDay ? cat.emptyLabel : `ما اكو جلسات مسجلة ${periodWord}`}</div></div>`;
  } else {
    const ordered = isDay ? sessions.slice().reverse() : sessions.slice().sort((a,b)=> new Date(b.start) - new Date(a.start));
    listEl.innerHTML = ordered.map(s => `
      <li class="session-item" data-cat="${catKey}">
        <span class="session-dot"></span>
        ${!isDay ? `<span class="day-tag">${formatDayLabel(s.dayKey)}</span>` : ''}
        <span class="session-time num">${formatTime(s.start)} – ${formatTime(s.end)}</span>
        <span class="session-dur num">${formatDuration(s.minutes)}</span>
        ${s.details ? `<span class="session-note-flag" title="فيها ملاحظة"></span>` : ''}
        <span class="session-spacer"></span>
        <span class="session-actions">
          <button class="icon-btn" title="التفاصيل" onclick="openDetailsModal('${catKey}','${s.id}','${s.dayKey || todayKey()}')">${ICONS.edit}</button>
          <button class="icon-btn danger" title="حذف" onclick="deleteSession('${catKey}','${s.id}','${s.dayKey || todayKey()}')">${ICONS.trash}</button>
        </span>
      </li>
    `).join('');
  }
}

function deleteSession(catKey, sessionId, dayKey){
  if(!confirm('تحذف هذي الجلسة؟')) return;
  const cat = CATS[catKey];
  const day = DATA.days[dayKey || todayKey()];
  if(!day) return;
  day[cat.arrayKey] = day[cat.arrayKey].filter(s => s.id !== sessionId);
  persist();
  renderAll();
  toast('تم الحذف', 'info');
}

/* -------------------- لوحة تفاصيل الجلسة -------------------- */
function toTimeInputValue(dateLike){
  const d = new Date(dateLike);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function openDetailsModal(catKey, sessionId, dayKey){
  dayKey = dayKey || todayKey();
  const cat = CATS[catKey];
  const day = DATA.days[dayKey];
  if(!day) return;
  const session = day[cat.arrayKey].find(s => s.id === sessionId);
  if(!session) return;
  currentModalSession = { catKey, sessionId, dayKey };
  document.getElementById('modal-details-title').textContent = `تفاصيل ${cat.label}`;
  document.getElementById('modal-details-start').value = toTimeInputValue(session.start);
  document.getElementById('modal-details-end').value = toTimeInputValue(session.end);
  document.getElementById('modal-details-notes').value = session.details || '';
  document.getElementById('modal-details-duration').textContent = formatDuration(session.minutes);
  showModal('modal-details');
  setTimeout(() => document.getElementById('modal-details-notes').focus(), 250);
}

function saveDetailsModal(){
  if(!currentModalSession) return;
  const { catKey, sessionId, dayKey } = currentModalSession;
  const cat = CATS[catKey];
  const day = DATA.days[dayKey || todayKey()];
  if(!day) return;
  const session = day[cat.arrayKey].find(s => s.id === sessionId);
  if(!session) return;

  const startVal = document.getElementById('modal-details-start').value;
  const endVal = document.getElementById('modal-details-end').value;
  const notes = document.getElementById('modal-details-notes').value;

  if(startVal && endVal){
    const base = new Date(session.start);
    const [sh, sm] = startVal.split(':').map(Number);
    const [eh, em] = endVal.split(':').map(Number);
    const newStart = new Date(base.getFullYear(), base.getMonth(), base.getDate(), sh, sm, 0);
    const newEnd = new Date(base.getFullYear(), base.getMonth(), base.getDate(), eh, em, 0);
    if(newEnd > newStart){
      session.start = newStart.toISOString();
      session.end = newEnd.toISOString();
      session.minutes = Math.round((newEnd - newStart) / 60000);
    } else {
      toast('وقت الانتهاء لازم يكون بعد البداية — ما انحفظ تعديل الوقت', 'error');
    }
  }
  session.details = notes.trim();
  persist();
  renderAll();
  closeModal('modal-details');
  toast('تم الحفظ ✓', 'success');
}

function deleteSessionFromModal(){
  if(!currentModalSession) return;
  const { catKey, sessionId, dayKey } = currentModalSession;
  closeModal('modal-details');
  deleteSession(catKey, sessionId, dayKey);
}

/* -------------------- لوحة تفاصيل اليوم الكاملة (من الأسبوع/الشهر) -------------------- */
function openDayDetailModal(dayKey){
  currentDayModalKey = dayKey;
  const day = DATA.days[dayKey] || { study: [], breaks: [], sleep: [], achievements: [] };
  const stats = computeStats(day, DATA.settings);

  document.getElementById('modal-day-title').textContent = formatDayLabel(dayKey);

  const statsHtml = `
    <div class="day-modal-stats">
      <div class="day-modal-stat"><span class="num">${formatDuration(stats.studyMinutes)}</span><span>قراءة</span></div>
      <div class="day-modal-stat"><span class="num">${formatDuration(stats.breakMinutes)}</span><span>استراحة</span></div>
      <div class="day-modal-stat"><span class="num">${formatDuration(stats.sleepMinutes)}</span><span>نوم</span></div>
      <div class="day-modal-stat"><span class="num">${stats.percentage}%</span><span>إنجاز</span></div>
      <div class="day-modal-stat"><span class="num">${stats.points}</span><span>نقطة</span></div>
    </div>`;

  const sectionsHtml = CAT_ORDER.map(catKey => {
    const cat = CATS[catKey];
    const sessions = (day[cat.arrayKey] || []).slice().sort((a,b) => new Date(a.start) - new Date(b.start));
    return `
      <div class="day-modal-section">
        <div class="day-modal-section-title">${ICONS[cat.icon]}<span>${cat.label}</span></div>
        ${sessions.length === 0 ? `<div class="empty-state-mini">ما اكو</div>` : `<ul class="session-list">${sessions.map(s => `
          <li class="session-item" data-cat="${catKey}">
            <span class="session-dot"></span>
            <span class="session-time num">${formatTime(s.start)} – ${formatTime(s.end)}</span>
            <span class="session-dur num">${formatDuration(s.minutes)}</span>
            ${s.details ? `<span class="session-note-flag"></span>` : ''}
            <span class="session-spacer"></span>
            <span class="session-actions">
              <button class="icon-btn" title="التفاصيل" onclick="openDetailsModal('${catKey}','${s.id}','${dayKey}')">${ICONS.edit}</button>
              <button class="icon-btn danger" title="حذف" onclick="deleteSession('${catKey}','${s.id}','${dayKey}')">${ICONS.trash}</button>
            </span>
          </li>`).join('')}</ul>`}
      </div>`;
  }).join('');

  const achievements = day.achievements || [];
  const achieveHtml = `
    <div class="day-modal-section">
      <div class="day-modal-section-title">${ICONS.trophy}<span>الإنجازات</span></div>
      ${achievements.length === 0 ? `<div class="empty-state-mini">ما اكو</div>` : `<ul class="achieve-list">${achievements.map(a => `
        <li class="achieve-item ${a.done ? 'done' : ''}">
          <button class="achieve-check ${a.done ? 'done' : ''}" onclick="toggleAchievement('${a.id}','${dayKey}')">${ICONS.check}</button>
          <span class="achieve-text">${escapeHtml(a.text)}</span>
          <button class="icon-btn danger" onclick="deleteAchievement('${a.id}','${dayKey}')">${ICONS.trash}</button>
        </li>`).join('')}</ul>`}
    </div>`;

  document.getElementById('modal-day-body').innerHTML = statsHtml + sectionsHtml + achieveHtml;
  showModal('modal-day');
}

function closeDayModal(){
  currentDayModalKey = null;
  closeModal('modal-day');
}

/* -------------------- الإنجازات -------------------- */
function addAchievement(){
  const input = document.getElementById('achieve-input');
  const text = input.value.trim();
  if(!text) return;
  const day = ensureDay(DATA);
  day.achievements.push({ id: uid(), text, done: false, createdAt: new Date().toISOString() });
  persist();
  renderAchievements();
  renderStats();
  input.value = '';
  input.focus();
}

function toggleAchievement(id, dayKey){
  dayKey = dayKey || todayKey();
  const day = DATA.days[dayKey];
  if(!day) return;
  const a = day.achievements.find(x => x.id === id);
  if(!a) return;
  a.done = !a.done;
  persist();
  renderAchievements();
  renderStats();
  const stats = computeStats(day, DATA.settings);
  if(a.done && stats.totalCount > 0 && stats.doneCount === stats.totalCount){
    confettiBurst();
    toast('ما شاء الله! خلّصت كل إنجازات اليوم 🎉', 'success');
  }
}

function deleteAchievement(id, dayKey){
  dayKey = dayKey || todayKey();
  const day = DATA.days[dayKey];
  if(!day) return;
  day.achievements = day.achievements.filter(x => x.id !== id);
  persist();
  renderAchievements();
  renderStats();
}

function renderAchievements(){
  const isDay = currentPeriod === 'day';
  const periodWord = { day: 'اليوم', week: 'هالأسبوع', month: 'هالشهر' }[currentPeriod];
  const view = getScopedView();
  const achievements = view.achievements;
  const listEl = document.getElementById('achieve-list');

  if(achievements.length === 0){
    listEl.innerHTML = `<div class="empty-state">${ICONS.trophy}<div>${isDay ? 'شنو تريد تنجز اليوم؟ ضيف أول هدف وابدأ 💪' : `ما اكو أهداف مسجلة ${periodWord}`}</div></div>`;
  } else {
    listEl.innerHTML = achievements.map(a => `
      <li class="achieve-item ${a.done ? 'done' : ''}">
        <button class="achieve-check ${a.done ? 'done' : ''}" onclick="toggleAchievement('${a.id}','${a.dayKey || todayKey()}')" title="تم الإنجاز؟">${ICONS.check}</button>
        ${!isDay ? `<span class="day-tag">${formatDayLabel(a.dayKey)}</span>` : ''}
        <span class="achieve-text">${escapeHtml(a.text)}</span>
        <button class="icon-btn danger" title="حذف" onclick="deleteAchievement('${a.id}','${a.dayKey || todayKey()}')">${ICONS.trash}</button>
      </li>
    `).join('');
  }
  const stats = view.stats;
  const fillEl = document.getElementById('progress-fill');
  if(fillEl) fillEl.style.width = stats.percentage + '%';
  animateCountUp(document.getElementById('progress-percent-num'), stats.percentage, { suffix: '%' });
  const hintEl = document.getElementById('progress-hint');
  if(hintEl) hintEl.textContent = stats.totalCount > 0 ? `أنجزت ${stats.doneCount} من ${stats.totalCount}` : (isDay ? 'ضيف أهدافك اليوم عشان نحسب النسبة' : `ما اكو أهداف ${periodWord}`);
  animateCountUp(document.getElementById('points-value'), stats.points);
}

/* -------------------- الإعدادات: المظهر -------------------- */
function selectTheme(themeName){
  DATA.settings.theme = themeName;
  applyTheme(DATA.settings);
  persist();
  renderSettingsAppearance();
}

function renderSettingsAppearance(){
  document.querySelectorAll('.theme-swatch').forEach(el => {
    el.classList.toggle('selected', el.dataset.theme === DATA.settings.theme);
  });
  const customBox = document.getElementById('custom-theme-box');
  if(customBox) customBox.style.display = DATA.settings.theme === 'custom' ? 'flex' : 'none';
  const primaryInput = document.getElementById('custom-primary');
  const secondaryInput = document.getElementById('custom-secondary');
  if(primaryInput) primaryInput.value = DATA.settings.customTheme.primary;
  if(secondaryInput) secondaryInput.value = DATA.settings.customTheme.secondary;
  document.querySelectorAll('.mode-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === DATA.settings.customTheme.mode);
  });
}

function updateCustomColor(field, value){
  DATA.settings.customTheme[field] = value;
  if(DATA.settings.theme === 'custom') applyTheme(DATA.settings);
  persist();
}

function setCustomMode(mode){
  DATA.settings.customTheme.mode = mode;
  if(DATA.settings.theme === 'custom') applyTheme(DATA.settings);
  persist();
  renderSettingsAppearance();
}

/* -------------------- الإعدادات: الأهداف والنقاط -------------------- */
function saveGoalsSettings(){
  const goalHours = parseFloat(document.getElementById('input-goal-hours').value);
  const ppm = parseFloat(document.getElementById('input-points-min').value);
  const ppa = parseFloat(document.getElementById('input-points-achieve').value);
  const name = document.getElementById('input-student-name').value.trim();
  DATA.settings.dailyGoalMinutes = Math.max(15, Math.round((isNaN(goalHours) ? 6 : goalHours) * 60));
  DATA.settings.pointsPerMinute = isNaN(ppm) ? 1 : ppm;
  DATA.settings.pointsPerAchievement = isNaN(ppa) ? 20 : ppa;
  if(name) DATA.settings.studentName = name;
  persist();
  renderAll();
  renderBrandName();
  toast('تم حفظ الإعدادات ✓', 'success');
}

/* -------------------- الإعدادات: المشاركة عبر Firebase -------------------- */
function renderSyncSettingsUI(){
  const cfg = getEffectiveFirebaseConfig();
  const noticeEl = document.getElementById('gh-detect-notice');
  if(noticeEl) noticeEl.style.display = cfg ? 'none' : 'flex';
  const linkEl = document.getElementById('viewer-link-text');
  if(linkEl) linkEl.textContent = getViewerUrl();
}

async function loadFromCloudNow(){
  const cfg = getEffectiveFirebaseConfig();
  if(!cfg){ toast('ما لكينا إعدادات Firebase بالملف — شوف تبويب المشاركة', 'error'); return; }
  try{
    const remote = await fetchRemoteDataFresh(cfg);
    if(!remote){ toast('ما اكو بيانات محفوظة على السحابة بعد', 'info'); return; }
    if(!confirm('تحميل آخر نسخة محفوظة بالسحابة؟ راح تستبدل بيانات هذا الجهاز الحالية.')) return;
    DATA = mergeWithDefaults(remote);
    saveData(DATA);
    applyTheme(DATA.settings);
    renderAll();
    renderBrandName();
    renderSettingsAppearance();
    toast('تم تحميل البيانات من السحابة ✓', 'success');
  }catch(e){
    console.error(e);
    const msg = String(e && e.message || e);
    if(msg === 'NOT_FOUND'){ toast('ما اكو بيانات محفوظة على السحابة بعد', 'info'); }
    else if(msg === 'BRIDGE_NOT_READY'){ toast('مكتبة Firebase ما حمّلت بعد — انتظر ثانيتين وحاول مرة ثانية', 'error'); }
    else if(msg === 'INIT_FAILED'){ toast('إعدادات Firebase بالملف غير صحيحة الصيغة', 'error'); }
    else { toast(`فشل التحميل: ${msg}`, 'error'); }
  }
}

async function copyViewerLink(){
  const url = getViewerUrl();
  const ok = await copyToClipboard(url);
  toast(ok ? 'تم نسخ رابط المشاهدة ✓' : url, ok ? 'success' : 'info');
}

/* -------------------- الإعدادات: متقدم (قفل + بيانات) -------------------- */
function saveAdminPin(){
  const val = document.getElementById('input-admin-pin').value.trim();
  const local = loadLocalConfig();
  local.adminPin = val || null;
  saveLocalConfig(local);
  toast(val ? 'تم تفعيل قفل الدخول ✓' : 'تم إلغاء قفل الدخول', 'success');
}

function exportData(){
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `injaz-backup-${todayKey()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('تم تحميل نسخة احتياطية', 'success');
}

function importDataFile(fileInput){
  const file = fileInput.files && fileInput.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try{
      const parsed = JSON.parse(e.target.result);
      if(!parsed || typeof parsed !== 'object') throw new Error('bad format');
      DATA = mergeWithDefaults(parsed);
      saveData(DATA);
      applyTheme(DATA.settings);
      renderAll();
      renderBrandName();
      renderSettingsAppearance();
      toast('تم استيراد البيانات بنجاح ✓', 'success');
    }catch(err){
      toast('الملف غير صالح، تأكد إنه نسخة احتياطية صحيحة', 'error');
    }
  };
  reader.readAsText(file);
  fileInput.value = '';
}

function resetAllData(){
  if(!confirm('متأكد تريد تصفير كل البيانات؟ هذا الإجراء ما ينرجع.')) return;
  DATA = defaultData();
  saveData(DATA);
  applyTheme(DATA.settings);
  renderAll();
  renderBrandName();
  closeModal('modal-settings');
  toast('تم تصفير البيانات', 'info');
}

/* -------------------- قفل الدخول (PIN) -------------------- */
function checkPinLock(){
  const local = loadLocalConfig();
  const overlay = document.getElementById('lock-overlay');
  if(!local.adminPin){ overlay.style.display = 'none'; return; }
  if(sessionStorage.getItem('injaz_unlocked') === '1'){ overlay.style.display = 'none'; return; }
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('lock-pin-input').focus(), 200);
}

function submitPinUnlock(){
  const local = loadLocalConfig();
  const val = document.getElementById('lock-pin-input').value;
  if(val && val === local.adminPin){
    sessionStorage.setItem('injaz_unlocked', '1');
    document.getElementById('lock-overlay').style.display = 'none';
  } else {
    toast('الرمز غير صحيح', 'error');
    document.getElementById('lock-pin-input').value = '';
  }
}

/* -------------------- اللوحات المنبثقة -------------------- */
function showModal(id){
  document.getElementById(id).classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModal(id){
  document.getElementById(id).classList.remove('show');
  document.body.style.overflow = '';
}

function openSettings(tab){
  renderSettingsAppearance();
  renderSyncSettingsUI();
  document.getElementById('input-goal-hours').value = +( (DATA.settings.dailyGoalMinutes/60).toFixed(2) );
  document.getElementById('input-points-min').value = DATA.settings.pointsPerMinute;
  document.getElementById('input-points-achieve').value = DATA.settings.pointsPerAchievement;
  document.getElementById('input-student-name').value = DATA.settings.studentName;
  const local = loadLocalConfig();
  document.getElementById('input-admin-pin').value = local.adminPin || '';
  switchSettingsTab(tab || 'appearance');
  showModal('modal-settings');
}

function switchSettingsTab(tab){
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.toggle('active', p.id === `pane-${tab}`));
}

/* -------------------- الرسم الشامل -------------------- */
function renderAll(){
  renderStats();
  renderTimeline();
  renderTrackerSection('study');
  renderTrackerSection('break');
  renderTrackerSection('sleep');
  renderAchievements();
  renderSyncStatusUI();
  if(currentDayModalKey) openDayDetailModal(currentDayModalKey);
}

/* -------------------- الإقلاع -------------------- */
function init(){
  hydrateIcons();
  applyTheme(DATA.settings);
  renderBrandName();
  checkPinLock();
  renderAll();
  renderHeaderClock();
  setInterval(renderHeaderClock, 1000);
  setInterval(renderTimeline, 60000);
  if(DATA.activeTimer) startTickInterval();
  checkRemoteOnLoad();

  document.getElementById('achieve-form').addEventListener('submit', (e) => { e.preventDefault(); addAchievement(); });
  document.getElementById('manualform-study').addEventListener('submit', (e) => { e.preventDefault(); submitManualEntry('study'); });
  document.getElementById('manualform-break').addEventListener('submit', (e) => { e.preventDefault(); submitManualEntry('break'); });
  document.getElementById('manualform-sleep').addEventListener('submit', (e) => { e.preventDefault(); submitManualEntry('sleep'); });

  function closeAnyModal(id){ if(id === 'modal-day') closeDayModal(); else closeModal(id); }
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', (e) => { if(e.target === ov) closeAnyModal(ov.id); });
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape'){ document.querySelectorAll('.modal-overlay.show').forEach(ov => closeAnyModal(ov.id)); }
  });

  // متصفحات الموبايل أحياناً تجمّد الصفحة بالخلفية لفترة (توفير بطارية) — لما ترجع نشطة، نحدّث كل شي ونتأكد العداد
  // مزبوط ومضبوط، حتى لو انعطلت المؤقّتات لفترة وإحنا بعيدين عن الصفحة
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible'){
      renderAll();
      renderHeaderClock();
      if(DATA.activeTimer) startTickInterval();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
