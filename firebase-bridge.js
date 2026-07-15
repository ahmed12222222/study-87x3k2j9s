/* ============================================================
   إنجاز — جسر Firebase
   وحدة ES module صغيرة تهيّئ Firebase وتعرض دوال بسيطة (init/write/readOnce/listen)
   على window.FirebaseSync عشان بقية الأكواد العادية (غير module) تستخدمها بسهولة.
   ============================================================ */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getDatabase, ref, set, get, onValue, off } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';

let db = null;
let auth = null;
let activeListener = null;
let activeListenerRef = null;

function fbInit(config){
  try{
    const existing = getApps();
    if(existing.length > 0){
      // مهيأ مسبقاً — نعيد استخدام نفس التطبيق بدل حذفه وإعادة إنشائه (يمنع تعارض مع عملية كتابة شغالة بنفس اللحظة)
      db = getDatabase(existing[0]);
      auth = getAuth(existing[0]);
      return true;
    }
    const app = initializeApp(config);
    db = getDatabase(app);
    auth = getAuth(app);
    return true;
  }catch(e){
    console.error('Firebase init error:', e);
    db = null; auth = null;
    return false;
  }
}

// تسجيل دخول مجهول — تستخدمه لوحة التحكم فقط (عشان تكدر تكتب)، لوحة المشاهدة أبداً ما تناديها فتضل قراءة عامة بلا أي هوية
async function fbSignInAnon(){
  if(!auth) throw new Error('NOT_INITIALIZED');
  await signInAnonymously(auth);
}

async function fbWrite(path, value){
  if(!db) throw new Error('NOT_INITIALIZED');
  await set(ref(db, path), value);
}

async function fbReadOnce(path){
  if(!db) throw new Error('NOT_INITIALIZED');
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
}

function fbListen(path, onData, onError){
  if(!db){ if(onError) onError(new Error('NOT_INITIALIZED')); return; }
  if(activeListener && activeListenerRef) off(activeListenerRef, 'value', activeListener);
  const r = ref(db, path);
  activeListenerRef = r;
  activeListener = (snapshot) => onData(snapshot.exists() ? snapshot.val() : null);
  onValue(r, activeListener, (err) => { console.error('Firebase listen error:', err); if(onError) onError(err); });
}

function fbStop(){
  if(activeListener && activeListenerRef) off(activeListenerRef, 'value', activeListener);
  activeListener = null; activeListenerRef = null;
}

window.FirebaseSync = { init: fbInit, write: fbWrite, readOnce: fbReadOnce, listen: fbListen, stop: fbStop, signInAnon: fbSignInAnon };
window.dispatchEvent(new Event('firebase-bridge-ready'));
