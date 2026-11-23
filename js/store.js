// Uygulamanın veri işlemleri (dersler, kitaplar, defter, yanlış defteri, ayraçlar, rapor).
import * as db from './db.js';
import { dateKey } from './dates.js';

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16);

export const COURSE_COLORS = ['#c98b6b', '#d58ba0', '#7fa37b', '#7f9fcf', '#b49ad6', '#d9a95b', '#6fb3b0', '#a3a3a3'];

// ---------- Dersler ----------
export async function listCourses() {
  const list = await db.all('courses');
  return list.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
}
export const getCourse = (id) => db.get('courses', id);

export async function createCourse({ name, color }) {
  const course = { id: uid(), name: name.trim(), color: color || COURSE_COLORS[0], createdAt: Date.now(), order: Date.now() };
  return db.put('courses', course);
}
export async function updateCourse(course) { return db.put('courses', { ...course, name: course.name.trim() }); }

export async function deleteCourse(id) {
  const books = await listBooks(id);
  for (const b of books) await deleteBook(b.id);
  const pages = await listNotebookPages(id);
  const mistakes = await db.byIndex('mistakes', 'courseId', id);
  const ops = [
    ...pages.flatMap((p) => [{ store: 'notebookPages', del: p.id }, { store: 'ink', del: inkKey(p.id, 0) }]),
    ...mistakes.map((m) => ({ store: 'mistakes', del: m.id })),
    { store: 'courses', del: id },
  ];
  // Çözülen soru kayıtları geçmiş raporlar bozulmasın diye korunur (ders adı kayıtta saklıdır).
  await db.batch(ops);
}

// ---------- Kitaplar (PDF) ----------
export async function listBooks(courseId) {
  const list = await db.byIndex('books', 'courseId', courseId);
  return list.sort((a, b) => a.addedAt - b.addedAt);
}
export const getBook = (id) => db.get('books', id);
export async function getBookBlob(book) {
  const rec = await db.get('files', book.fileId);
  return rec?.blob || null;
}

export async function addBook({ courseId, title, blob, pageCount, cover }) {
  const fileId = uid();
  const book = { id: uid(), courseId, title, fileId, size: blob.size, pageCount, cover: cover || null, addedAt: Date.now(), lastOpenedAt: null };
  await db.batch([{ store: 'files', put: { id: fileId, blob } }, { store: 'books', put: book }]);
  return book;
}
export const updateBook = (book) => db.put('books', book);

export async function deleteBook(id) {
  const book = await getBook(id);
  if (!book) return;
  const inks = await db.byIndex('ink', 'ownerId', id);
  const marks = await db.byIndex('bookmarks', 'bookId', id);
  await db.batch([
    { store: 'books', del: id },
    { store: 'files', del: book.fileId },
    { store: 'progress', del: id },
    ...inks.map((i) => ({ store: 'ink', del: i.key })),
    ...marks.map((m) => ({ store: 'bookmarks', del: m.id })),
  ]);
  // Yanlış defteri kayıtları görüntüleriyle birlikte korunur; yalnızca kaynağa gitme bağlantısı çalışmaz.
}

// ---------- Çizimler ----------
export const inkKey = (ownerId, page) => `${ownerId}:${page}`;
export async function getInk(ownerId, page) {
  const rec = await db.get('ink', inkKey(ownerId, page));
  return rec?.strokes || [];
}
export async function saveInk(ownerId, page, strokes) {
  const key = inkKey(ownerId, page);
  if (!strokes.length) return db.del('ink', key);
  return db.put('ink', { key, ownerId, page, strokes, updatedAt: Date.now() });
}

// ---------- Kaldığın yer & ayraçlar ----------
export const getProgress = (bookId) => db.get('progress', bookId);
export const saveProgress = (bookId, page, offset) =>
  db.put('progress', { bookId, page, offset: Math.max(0, Math.min(1, offset)), updatedAt: Date.now() });

export async function listBookmarks(bookId) {
  const list = await db.byIndex('bookmarks', 'bookId', bookId);
  return list.sort((a, b) => a.page - b.page || a.offset - b.offset);
}
export const addBookmark = ({ bookId, page, offset, name }) =>
  db.put('bookmarks', { id: uid(), bookId, page, offset, name, createdAt: Date.now() });
export const updateBookmark = (bm) => db.put('bookmarks', bm);
export const deleteBookmark = (id) => db.del('bookmarks', id);

// ---------- Defter ----------
export async function listNotebookPages(courseId) {
  const list = await db.byIndex('notebookPages', 'courseId', courseId);
  return list.sort((a, b) => a.order - b.order);
}
export async function addNotebookPage(courseId, template) {
  const pages = await listNotebookPages(courseId);
  const order = pages.length ? pages[pages.length - 1].order + 1 : 1;
  return db.put('notebookPages', { id: uid(), courseId, order, template, createdAt: Date.now() });
}
export const updateNotebookPage = (p) => db.put('notebookPages', p);
export const deleteNotebookPage = (id) => db.batch([{ store: 'notebookPages', del: id }, { store: 'ink', del: inkKey(id, 0) }]);

// ---------- Yanlış defteri ----------
export async function listMistakes(courseId) {
  const list = await db.byIndex('mistakes', 'courseId', courseId);
  return list.sort((a, b) => b.createdAt - a.createdAt);
}
export const getMistake = (id) => db.get('mistakes', id);
export const updateMistake = (m) => db.put('mistakes', { ...m, updatedAt: Date.now() });
export const deleteMistake = (id) => db.del('mistakes', id);

export async function addMistake({ course, book, page, rect, image, note, countAsSolved }) {
  const m = {
    id: uid(), courseId: course.id, bookId: book.id, bookTitle: book.title, page, rect, image,
    note: note || '', status: 'tekrar', createdAt: Date.now(), updatedAt: Date.now(), solveId: null,
  };
  if (countAsSolved) {
    const s = await logSolve({ course, book, page, count: 1, source: 'yanlis', rect, mistakeId: m.id });
    m.solveId = s.id;
  }
  await db.put('mistakes', m);
  return m;
}

// ---------- Çözülen sorular (rapor) ----------
// source: 'isaret' (PDF'de soru işaretlendi), 'toplu' (sayfa için sayı girildi), 'yanlis' (yanlış defterine eklenirken)
export async function logSolve({ course, book, page, count, source, rect = null, mistakeId = null }) {
  const s = {
    id: uid(), date: dateKey(), ts: Date.now(), courseId: course.id, courseName: course.name, courseColor: course.color,
    bookId: book?.id || null, bookTitle: book?.title || null, page: page ?? null,
    count: Math.max(1, Math.round(count)), source, rect, mistakeId,
  };
  return db.put('solves', s);
}
export const deleteSolve = (id) => db.del('solves', id);
export const solvesForDate = (date) => db.byIndex('solves', 'date', date);
export const solvesForBook = (bookId) => db.byIndex('solves', 'bookId', bookId);
export const allSolves = () => db.all('solves');

/** { [date]: { total, byCourse: { [courseId]: {name,color,count} } } } */
export function summarize(solves, courses = []) {
  const names = new Map(courses.map((c) => [c.id, c]));
  const out = {};
  for (const s of solves) {
    const day = (out[s.date] ||= { total: 0, byCourse: {} });
    day.total += s.count;
    const c = names.get(s.courseId);
    const entry = (day.byCourse[s.courseId] ||= { name: c?.name || s.courseName, color: c?.color || s.courseColor, count: 0, deleted: !c });
    entry.count += s.count;
  }
  return out;
}
