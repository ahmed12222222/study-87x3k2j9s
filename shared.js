/* ============================================================
   إنجاز — الطبقة المشتركة (تُستخدم من لوحة التحكم ولوحة المشاهدين)
   تخزين محلي + مزامنة Firebase اختيارية + أدوات تنسيق وحركة
   ============================================================ */

const STORAGE_KEY = 'injaz_data_v1';           // البيانات القابلة للمزامنة (تُنشر على data.json)
const LOCAL_CONFIG_KEY = 'injaz_local_config_v1'; // أسرار هذا الجهاز فقط: مفتاح حفظ Firebase وقفل الدخول — لا تُنشر أبداً
const VIEWER_CACHE_KEY = 'injaz_viewer_cache_v1'; // آخر نسخة نجحت لوحة المشاهدين بجلبها، لعرضها عند انقطاع الشبكة

const AR_WEEKDAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const TIMELINE_START_HOUR = 0;
const TIMELINE_END_HOUR = 24;

/* -------------------- أدوات عامة -------------------- */
function pad2(n){ return String(n).padStart(2,'0'); }

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function todayKey(d){
  d = d || new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function arCount(n, singular, plural){ return `${n} ${n === 1 ? singular : plural}`; }

function formatTime(dateLike){
  const d = new Date(dateLike);
  let h = d.getHours();
  const m = d.getMinutes();
  const suffix = h < 12 ? 'ص' : 'م';
  h = h % 12; if(h === 0) h = 12;
  return `${h}:${pad2(m)} ${suffix}`;
}

function formatStopwatch(totalSeconds){
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds/3600);
  const m = Math.floor((totalSeconds%3600)/60);
  const s = totalSeconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatDuration(totalMinutes){
  totalMinutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(totalMinutes/60);
  const m = totalMinutes % 60;
  if(h === 0) return `${m} د`;
  if(m === 0) return `${h} س`;
  return `${h} س ${m} د`;
}

function formatDateArabic(d){
  d = new Date(d);
  return `${AR_WEEKDAYS[d.getDay()]}، ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatRelativeTime(isoString){
  if(!isoString) return '—';
  const diff = Math.max(0, Date.now() - new Date(isoString).getTime());
  const sec = Math.floor(diff/1000);
  if(sec < 45) return 'الآن';
  const min = Math.floor(sec/60);
  if(min < 60) return `قبل ${arCount(min,'دقيقة','دقائق')}`;
  const hr = Math.floor(min/60);
  if(hr < 24) return `قبل ${arCount(hr,'ساعة','ساعات')}`;
  const day = Math.floor(hr/24);
  return `قبل ${arCount(day,'يوم','أيام')}`;
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function debounce(fn, wait){
  let t;
  return function(...args){
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

async function copyToClipboard(text){
  try{ await navigator.clipboard.writeText(text); return true; }
  catch(e){
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(e2){ ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

/* -------------------- نموذج البيانات -------------------- */
function defaultData(){
  return {
    version: 1,
    settings: {
      studentName: 'المذاكِر المجتهد',
      theme: 'night',
      customTheme: { primary: '#7c3aed', secondary: '#ff8a4c', mode: 'light' },
      dailyGoalMinutes: 360,
      pointsPerMinute: 1,
      pointsPerAchievement: 20,
    },
    activeTimer: null,
    days: {},
    review: { subjects: [], items: [] },
    updatedAt: null, // null = بيانات افتراضية لسه ما انحفظت — يخلي فحص "نسخة أحدث بالسحابة" يشتغل صح بأول فتح لجهاز جديد
  };
}

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultData();
    const parsed = JSON.parse(raw);
    const base = defaultData();
    return {
      ...base, ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}), customTheme: { ...base.settings.customTheme, ...((parsed.settings||{}).customTheme || {}) } },
      days: parsed.days || {},
      review: { subjects: (parsed.review && parsed.review.subjects) || [], items: (parsed.review && parsed.review.items) || [] },
    };
  }catch(e){ console.error('loadData:', e); return defaultData(); }
}

function saveData(data){
  data.updatedAt = new Date().toISOString();
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch(e){ console.error('saveData:', e); }
  return data;
}

function ensureDay(data, key){
  key = key || todayKey();
  if(!data.days[key]) data.days[key] = { study: [], breaks: [], sleep: [], achievements: [] };
  else if(!data.days[key].sleep) data.days[key].sleep = []; // ترقية تلقائية لأيام قديمة قبل إضافة تتبع النوم
  return data.days[key];
}

function computeStats(dayObj, settings){
  const study = (dayObj && dayObj.study) || [];
  const breaks = (dayObj && dayObj.breaks) || [];
  const sleep = (dayObj && dayObj.sleep) || [];
  const achievements = (dayObj && dayObj.achievements) || [];
  const studyMinutes = study.reduce((s,x)=>s+(x.minutes||0), 0);
  const breakMinutes = breaks.reduce((s,x)=>s+(x.minutes||0), 0);
  const sleepMinutes = sleep.reduce((s,x)=>s+(x.minutes||0), 0);
  const doneCount = achievements.filter(a=>a.done).length;
  const totalCount = achievements.length;
  const percentage = totalCount > 0 ? Math.round((doneCount/totalCount)*100) : 0;
  const points = Math.round(studyMinutes * (settings.pointsPerMinute ?? 1)) + doneCount * (settings.pointsPerAchievement ?? 20);
  const goalMinutes = settings.dailyGoalMinutes || 360;
  const goalPercentage = Math.min(100, Math.round((studyMinutes/goalMinutes)*100));
  return { studyMinutes, breakMinutes, sleepMinutes, doneCount, totalCount, percentage, points, goalMinutes, goalPercentage };
}

function getActiveElapsedSeconds(activeTimer){
  if(!activeTimer) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(activeTimer.start).getTime())/1000));
}

/* -------------------- تجميع بيانات الأسبوع -------------------- */
function getWeekDateKeys(anchorDate){
  const d = new Date(anchorDate || new Date());
  d.setHours(0,0,0,0);
  const dow = d.getDay(); // 0 = الأحد
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dow);
  const keys = [];
  for(let i = 0; i < 7; i++){
    const dt = new Date(sunday);
    dt.setDate(sunday.getDate() + i);
    keys.push(todayKey(dt));
  }
  return keys;
}

function formatDayLabel(dayKey){
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${AR_WEEKDAYS[dt.getDay()]} ${dt.getDate()} ${AR_MONTHS[dt.getMonth()]}`;
}

function buildWeekView(daysObj, settings){
  const weekKeys = getWeekDateKeys();
  const perDay = [];
  let study = [], breaks = [], sleep = [], achievements = [];
  weekKeys.forEach(key => {
    const day = daysObj[key] || { study: [], breaks: [], sleep: [], achievements: [] };
    const dayStats = computeStats(day, settings);
    perDay.push({ key, stats: dayStats });
    study = study.concat((day.study || []).map(s => ({ ...s, dayKey: key })));
    breaks = breaks.concat((day.breaks || []).map(s => ({ ...s, dayKey: key })));
    sleep = sleep.concat((day.sleep || []).map(s => ({ ...s, dayKey: key })));
    achievements = achievements.concat((day.achievements || []).map(a => ({ ...a, dayKey: key })));
  });
  const studyMinutes = perDay.reduce((s, d) => s + d.stats.studyMinutes, 0);
  const breakMinutes = perDay.reduce((s, d) => s + d.stats.breakMinutes, 0);
  const sleepMinutes = perDay.reduce((s, d) => s + d.stats.sleepMinutes, 0);
  const doneCount = achievements.filter(a => a.done).length;
  const totalCount = achievements.length;
  const percentage = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const points = perDay.reduce((s, d) => s + d.stats.points, 0);
  const goalMinutes = (settings.dailyGoalMinutes || 360) * 7;
  const goalPercentage = Math.min(100, Math.round((studyMinutes / goalMinutes) * 100));
  return {
    weekKeys, perDay, study, breaks, sleep, achievements,
    stats: { studyMinutes, breakMinutes, sleepMinutes, doneCount, totalCount, percentage, points, goalMinutes, goalPercentage },
  };
}

function renderWeekBarsHTML(weekView){
  const dayShort = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  const maxMinutes = Math.max(1, ...weekView.perDay.map(d => d.stats.studyMinutes + d.stats.breakMinutes + d.stats.sleepMinutes));
  const today = todayKey();
  return weekView.perDay.map((d, i) => {
    const total = d.stats.studyMinutes + d.stats.breakMinutes + d.stats.sleepMinutes;
    const studyPct = (d.stats.studyMinutes / maxMinutes) * 100;
    const breakPct = (d.stats.breakMinutes / maxMinutes) * 100;
    const sleepPct = (d.stats.sleepMinutes / maxMinutes) * 100;
    return `
      <div class="week-row ${d.key === today ? 'today' : ''}" onclick="openDayDetailModal('${d.key}')" tabindex="0">
        <span class="week-day-label">${dayShort[i]}</span>
        <div class="week-bar-track">
          <div class="week-bar-seg study" style="width:${studyPct}%"></div>
          <div class="week-bar-seg brk" style="width:${breakPct}%"></div>
          <div class="week-bar-seg sleep" style="width:${sleepPct}%"></div>
        </div>
        <span class="week-day-total num">${total > 0 ? formatDuration(total) : '—'}</span>
      </div>
    `;
  }).join('');
}

/* -------------------- تجميع بيانات الشهر (خريطة حرارية) -------------------- */
function getMonthDateKeys(anchorDate){
  const d = new Date(anchorDate || new Date());
  const year = d.getFullYear(), month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const keys = [];
  for(let day = 1; day <= daysInMonth; day++) keys.push(todayKey(new Date(year, month, day)));
  return keys;
}

function buildMonthView(daysObj, settings){
  const monthKeys = getMonthDateKeys();
  const perDay = [];
  let study = [], breaks = [], sleep = [], achievements = [];
  monthKeys.forEach(key => {
    const day = daysObj[key] || { study: [], breaks: [], sleep: [], achievements: [] };
    const dayStats = computeStats(day, settings);
    perDay.push({ key, stats: dayStats });
    study = study.concat((day.study || []).map(s => ({ ...s, dayKey: key })));
    breaks = breaks.concat((day.breaks || []).map(s => ({ ...s, dayKey: key })));
    sleep = sleep.concat((day.sleep || []).map(s => ({ ...s, dayKey: key })));
    achievements = achievements.concat((day.achievements || []).map(a => ({ ...a, dayKey: key })));
  });
  const studyMinutes = perDay.reduce((s, d) => s + d.stats.studyMinutes, 0);
  const breakMinutes = perDay.reduce((s, d) => s + d.stats.breakMinutes, 0);
  const sleepMinutes = perDay.reduce((s, d) => s + d.stats.sleepMinutes, 0);
  const doneCount = achievements.filter(a => a.done).length;
  const totalCount = achievements.length;
  const percentage = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const points = perDay.reduce((s, d) => s + d.stats.points, 0);
  const goalMinutes = (settings.dailyGoalMinutes || 360) * monthKeys.length;
  const goalPercentage = Math.min(100, Math.round((studyMinutes / goalMinutes) * 100));
  return {
    monthKeys, perDay, study, breaks, sleep, achievements,
    stats: { studyMinutes, breakMinutes, sleepMinutes, doneCount, totalCount, percentage, points, goalMinutes, goalPercentage },
  };
}

function renderMonthGridHTML(monthView){
  const now = new Date();
  const startOffset = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const maxMinutes = Math.max(1, ...monthView.perDay.map(d => d.stats.studyMinutes));
  const todayStr = todayKey();
  const dayInitials = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  let cells = '';
  for(let i = 0; i < startOffset; i++) cells += `<div class="month-cell empty"></div>`;
  monthView.perDay.forEach((d, idx) => {
    const dayNum = idx + 1;
    const level = d.stats.studyMinutes <= 0 ? 0 : Math.min(4, Math.ceil((d.stats.studyMinutes / maxMinutes) * 4));
    const isToday = d.key === todayStr;
    const title = `${formatDayLabelShort(d.key)} — ${d.stats.studyMinutes > 0 ? formatDuration(d.stats.studyMinutes) + ' قراءة' : 'بلا قراءة'}`;
    cells += `<div class="month-cell level-${level} ${isToday ? 'today' : ''}" title="${title}"><span>${dayNum}</span></div>`;
  });

  return `
    <div class="month-weekday-row">${dayInitials.map(n => `<span>${n[0]}</span>`).join('')}</div>
    <div class="month-grid">${cells}</div>
    <div class="month-legend">
      <span>أقل</span>
      <span class="month-cell level-0 mini"></span><span class="month-cell level-1 mini"></span><span class="month-cell level-2 mini"></span><span class="month-cell level-3 mini"></span><span class="month-cell level-4 mini"></span>
      <span>أكثر</span>
    </div>
  `;
}

function formatDayLabelShort(dayKey){
  const [y, m, d] = dayKey.split('-').map(Number);
  return `${d} ${AR_MONTHS[m - 1]}`;
}

/* -------------------- نموذج بيانات المراجعات والامتحانات -------------------- */
const REVIEW_PALETTE = ['#3d5af1','#e8927a','#4f7a5c','#f0b860','#6f90f7','#e14c5f','#1f9d63','#b6803f','#7c3aed','#0aa4c0'];

function ensureReview(data){
  if(!data.review) data.review = { subjects: [], items: [] };
  if(!data.review.subjects) data.review.subjects = [];
  if(!data.review.items) data.review.items = [];
  return data.review;
}

function getNextPaletteColor(subjects){
  return REVIEW_PALETTE[(subjects || []).length % REVIEW_PALETTE.length];
}

function isReviewDueOn(item, dateObj){
  const compareDate = new Date(dateObj); compareDate.setHours(0,0,0,0);
  if(item.startDate){
    const start = new Date(item.startDate + 'T00:00:00');
    if(compareDate < start) return false;
  }
  const sched = item.schedule || { type: 'daily' };
  if(sched.type === 'week') return (sched.daysOfWeek || []).includes(dateObj.getDay());
  if(sched.type === 'every'){
    if(!item.startDate) return true;
    const start = new Date(item.startDate + 'T00:00:00');
    const diffDays = Math.round((compareDate - start) / 86400000);
    const n = sched.everyN || 1;
    return diffDays >= 0 && diffDays % n === 0;
  }
  return true; // 'daily'
}

function daysUntil(dateStr){
  if(!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

function formatScheduleSummary(schedule){
  const dayNames = ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
  const sched = schedule || { type: 'daily' };
  if(sched.type === 'week'){
    const days = (sched.daysOfWeek || []).slice().sort().map(d => dayNames[d]);
    return days.length ? days.join('، ') : 'ما اكو أيام محددة';
  }
  if(sched.type === 'every') return `كل ${sched.everyN || 1} ${(sched.everyN||1) === 1 ? 'يوم' : 'أيام'}`;
  const times = sched.timesPerDay || 1;
  return times > 1 ? `يومياً (${times} مرات)` : 'يومياً';
}

/* -------------------- إعدادات الجهاز المحلية (لا تُنشر) -------------------- */
const FIREBASE_DATA_PATH = 'injaz'; // المسار داخل قاعدة بيانات Firebase الخاصة بيك

function loadLocalConfig(){
  try{
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    if(!raw) return { adminPin: null };
    return { adminPin: null, ...JSON.parse(raw) };
  }catch(e){ return { adminPin: null }; }
}
function saveLocalConfig(cfg){
  try{ localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(cfg)); }catch(e){}
  return cfg;
}

function getEffectiveFirebaseConfig(){
  // إعدادات Firebase تُقرأ من متغيّر مضمّن بنفس ملف HTML (يشتغل تلقائياً للوحة التحكم ولوحة المتابعة معاً،
  // لأن كلا الملفين يحتاجان نفس الإعداد بالضبط حتى يوصلون لنفس قاعدة البيانات)
  if(window.INJAZ_FIREBASE_CONFIG && window.INJAZ_FIREBASE_CONFIG.databaseURL) return window.INJAZ_FIREBASE_CONFIG;
  return null;
}

function getViewerUrl(){
  return window.location.href.replace(/admin\.html.*$/, 'index.html');
}

/* -------------------- مزامنة Firebase (قراءة عامة للجميع، كتابة بتسجيل دخول مجهول للوحة التحكم فقط) -------------------- */

// ننتظر جاهزية جسر Firebase (وحدة ES module منفصلة) قبل أي استخدام — عادة جاهز فوراً، بس هذا يحمي من أي تأخير بالتحميل
function waitForFirebaseBridge(timeoutMs){
  timeoutMs = timeoutMs || 4000;
  if(window.FirebaseSync) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onReady = () => { clearTimeout(timer); resolve(true); };
    window.addEventListener('firebase-bridge-ready', onReady, { once: true });
    const timer = setTimeout(() => { window.removeEventListener('firebase-bridge-ready', onReady); resolve(!!window.FirebaseSync); }, timeoutMs);
  });
}

// تهيئة بسيطة — تكفي لأي عملية قراءة (لوحة المتابعة تستخدم هذي بس، بلا أي تسجيل دخول)
async function ensureFirebaseInitialized(cfg){
  const ready = await waitForFirebaseBridge();
  if(!ready || !window.FirebaseSync) throw new Error('BRIDGE_NOT_READY');
  const ok = window.FirebaseSync.init(cfg);
  if(!ok) throw new Error('INIT_FAILED');
}

// تهيئة + تسجيل دخول مجهول — تستخدمها لوحة التحكم فقط قبل أي عملية كتابة، حتى تحقق قواعد الأمان شرط auth != null
async function ensureFirebaseAdminReady(cfg){
  await ensureFirebaseInitialized(cfg);
  await window.FirebaseSync.signInAnon();
}

async function fetchRemoteDataFresh(cfg){
  await ensureFirebaseInitialized(cfg);
  const val = await window.FirebaseSync.readOnce(FIREBASE_DATA_PATH);
  if(val == null) throw new Error('NOT_FOUND');
  return val;
}

// نفس القراءة الفورية — Firebase ما عنده تأخير تخزين مؤقت زي CDN، فتصلح للاستطلاع الدوري وللتحديث اليدوي بلا فرق
async function fetchRemoteDataCdn(cfg){ return fetchRemoteDataFresh(cfg); }

async function pushRemoteData(cfg, dataObj){
  if(!cfg || !cfg.databaseURL) throw new Error('NO_CONFIG');
  await ensureFirebaseAdminReady(cfg);
  await window.FirebaseSync.write(FIREBASE_DATA_PATH, dataObj);
}

// استماع حي فوري لأي تحديث (تُستخدم بلوحة المتابعة بدل الاستطلاع الدوري — تحديث لحظي حقيقي عبر Firebase، بلا تسجيل دخول)
async function listenRemoteData(cfg, onData, onError){
  try{
    await ensureFirebaseInitialized(cfg);
    window.FirebaseSync.listen(FIREBASE_DATA_PATH, (val) => onData(val), onError);
  }catch(e){ if(onError) onError(e); }
}

/* -------------------- فحص الاتصال بـ Firebase (للتشخيص) -------------------- */
async function checkRepoAccess(cfg){
  if(!cfg || !cfg.databaseURL || !cfg.apiKey){
    return { ok: false, message: 'ما لكينا إعدادات Firebase بملف الصفحة — تأكد إنك عدّلت سطر INJAZ_FIREBASE_CONFIG بآخر admin.html و index.html ورفعتهم على GitHub.' };
  }
  try{
    await ensureFirebaseAdminReady(cfg);
    await window.FirebaseSync.readOnce(FIREBASE_DATA_PATH);
    return { ok: true, message: 'الاتصال ناجح بقاعدة بياناتك على Firebase، وتسجيل الدخول والكتابة يشتغلون ✓' };
  }catch(e){
    const msg = String(e && (e.code || e.message) || e);
    if(msg.includes('PERMISSION_DENIED') || msg.includes('permission_denied') || msg.includes('permission-denied')){
      return { ok: false, message: 'الاتصال نجح بس القراءة أو الكتابة مرفوضة — تأكد من قواعد الأمان (Rules) وإن تسجيل الدخول المجهول (Anonymous) مفعّل بمشروعك. راجع خطوات الـ README.' };
    }
    if(msg.includes('auth/configuration-not-found') || msg.includes('admin-restricted-operation')){
      return { ok: false, message: 'تسجيل الدخول المجهول (Anonymous) مو مفعّل بمشروعك بـ Firebase — فعّله من Authentication → Sign-in method → Anonymous.' };
    }
    if(msg === 'INIT_FAILED'){
      return { ok: false, message: 'إعدادات Firebase الملصقة بالملف غير صحيحة — تأكد إنك نسخت الكود كامل من صفحة إعدادات مشروعك بـ Firebase بدون نقصان.' };
    }
    if(msg === 'BRIDGE_NOT_READY'){
      return { ok: false, message: 'تعذر تحميل مكتبة Firebase — تأكد من اتصال الإنترنت وحاول تحدّث الصفحة.' };
    }
    return { ok: false, message: 'تعذر الاتصال — تأكد من رابط قاعدة البيانات (databaseURL) وباقي الإعدادات، ومن اتصال الإنترنت.' };
  }
}

/* -------------------- حقن الأيقونات بالعناصر الثابتة -------------------- */
function hydrateIcons(scope){
  (scope || document).querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = ICONS[el.dataset.icon] || '';
  });
}

/* -------------------- تطبيق النمط البصري -------------------- */
function applyTheme(settings){
  const root = document.documentElement;
  const theme = settings.theme || 'night';
  root.setAttribute('data-theme', theme);
  if(theme === 'custom' && settings.customTheme){
    root.style.setProperty('--primary', settings.customTheme.primary || '#7c3aed');
    root.style.setProperty('--secondary', settings.customTheme.secondary || '#ff8a4c');
    root.setAttribute('data-custom-mode', settings.customTheme.mode || 'light');
  }else{
    root.style.removeProperty('--primary');
    root.style.removeProperty('--secondary');
    root.removeAttribute('data-custom-mode');
  }
}

/* -------------------- تنبيهات Toast -------------------- */
function ensureToastContainer(){
  let c = document.querySelector('.toast-container');
  if(!c){ c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  return c;
}
function toast(message, type){
  type = type || 'info';
  const c = ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const iconName = type === 'success' ? 'checkCircle' : type === 'error' ? 'alertCircle' : 'info';
  el.innerHTML = `${ICONS[iconName]}<span>${escapeHtml(message)}</span>`;
  c.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 240);
  }, 3200);
}

/* -------------------- احتفال الإنجاز -------------------- */
function confettiBurst(){
  const vars = ['--primary','--secondary','--success','--warning'];
  const colors = vars.map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim()).filter(Boolean);
  const count = 70;
  for(let i=0;i<count;i++){
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.background = colors[Math.floor(Math.random()*colors.length)] || '#f0b860';
    el.style.left = (Math.random()*100) + 'vw';
    el.style.animationDuration = (2.3 + Math.random()*1.7) + 's';
    el.style.transform = `rotate(${Math.random()*360}deg)`;
    el.style.borderRadius = Math.random() > .5 ? '50%' : '2px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
}

/* -------------------- عدّاد أرقام متحرك -------------------- */
function animateCountUp(el, toValue, opts){
  if(!el) return;
  opts = opts || {};
  const duration = opts.duration || 900;
  const suffix = opts.suffix || '';
  const formatter = opts.formatter || ((v) => v + suffix);
  const fromValue = opts.from != null ? opts.from : 0;
  const start = performance.now();
  function tick(now){
    const p = Math.min(1, (now-start)/duration);
    const eased = 1 - Math.pow(1-p, 3);
    const val = Math.round(fromValue + (toValue-fromValue)*eased);
    el.textContent = formatter(val);
    if(p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* -------------------- الخط الزمني (العنصر المميز) -------------------- */
function renderTimelineHTML(dayObj){
  const study = (dayObj && dayObj.study) || [];
  const breaks = (dayObj && dayObj.breaks) || [];
  const sleep = (dayObj && dayObj.sleep) || [];
  const totalSpan = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;

  function pct(dateLike){
    const d = new Date(dateLike);
    const minutesFromStart = (d.getHours()*60 + d.getMinutes()) - TIMELINE_START_HOUR*60;
    return Math.min(100, Math.max(0, (minutesFromStart/totalSpan)*100));
  }

  const hourMarks = [];
  for(let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h += 3){
    hourMarks.push(`<div class="timeline-hour"><span>${h === 24 ? '00' : pad2(h)}</span></div>`);
  }

  function segHtml(sessions, catClass){
    return sessions.map(s => {
      const left = pct(s.start);
      const right = pct(s.end);
      const width = Math.max(right-left, 0.6);
      const label = `${formatTime(s.start)} – ${formatTime(s.end)} · ${formatDuration(s.minutes)}`;
      return `<div class="timeline-segment ${catClass}" style="inset-inline-start:${left}%; width:${width}%;" tabindex="0">
        <div class="timeline-tooltip">${escapeHtml(label)}</div>
      </div>`;
    }).join('');
  }

  const now = new Date();
  const nowPct = pct(now);
  const isEmpty = study.length === 0 && breaks.length === 0 && sleep.length === 0;

  return `
    <div class="timeline-hours">${hourMarks.join('')}</div>
    ${segHtml(study, 'study')}
    ${segHtml(breaks, 'brk')}
    ${segHtml(sleep, 'sleep')}
    <div class="timeline-now" style="inset-inline-start:${nowPct}%"><div class="timeline-now-dot"></div></div>
    ${isEmpty ? `<div class="timeline-empty">لسه ما اكو نشاط مسجل اليوم</div>` : ''}
  `;
}
