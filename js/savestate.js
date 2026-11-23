// Kaydedilmemiş çalışmayı izler. Güncelleme yalnızca burası temizken otomatik uygulanır.
const dirty = new Map(); // key -> flush()
let inflight = 0;
let busy = 0;
const listeners = new Set();

function emit() { for (const l of listeners) l(hasUnsavedWork()); }

export function onSaveStateChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function hasUnsavedWork() {
  return dirty.size > 0 || inflight > 0 || busy > 0;
}

/** Çizim sürerken veya düzenleme penceresi açıkken "meşgul" işaretler. */
export function setBusy(on) {
  busy = Math.max(0, busy + (on ? 1 : -1));
  emit();
}

export async function flushAll() {
  const fns = [...dirty.values()];
  await Promise.all(fns.map((f) => f()));
}

let errorHandler = (err) => console.error(err);
export function setSaveErrorHandler(fn) { errorHandler = fn; }

/**
 * Gecikmeli otomatik kayıt. schedule() her çağrıldığında süre yeniden başlar.
 * flush() bekleyen kaydı hemen yazar.
 */
export function debouncedSaver(key, saveFn, delay = 600) {
  let timer = null;
  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty.has(key)) return;
    dirty.delete(key);
    inflight++;
    emit();
    try {
      await saveFn();
    } catch (err) {
      errorHandler(err);
    } finally {
      inflight--;
      emit();
    }
  };
  const schedule = () => {
    dirty.set(key, flush);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
    emit();
  };
  return { schedule, flush };
}

// Uygulama arka plana geçerken bekleyen kayıtları yaz.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAll();
});
window.addEventListener('pagehide', () => { flushAll(); });
