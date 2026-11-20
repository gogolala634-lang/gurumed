/* Browser preview backend — same command surface as the Rust app, over seed.json. */
export async function create() {
  const seed = await (await fetch("seed.json")).json();
  const PK = "mg-demo-progress";
  let P = JSON.parse(localStorage.getItem(PK) || "null");
  const save = () => localStorage.setItem(PK, JSON.stringify(P));
  if (!P) {
    P = { answers: {}, marks: {}, known: {}, bookmarks: {}, reads: {} };
    const now = Date.now();
    seed.qbank.questions.slice(0, 7).forEach((q, i) => {
      const ok = i % 3 !== 1;
      P.answers[seed.qbank.folder + ":" + q.id] = { chosen: ok ? q.corrAns : "A", correct: ok, ts: now - (6 - Math.floor(i * 6 / 7)) * 864e5 - i * 36e5 };
    });
    seed.cards.decks[0].cards.slice(0, 4).forEach(c => P.known[seed.cards.folder + ":" + c.id] = true);
    P.bookmarks[seed.library.folder + ":2"] = { title: seed.library.docs[1].title, ts: now - 864e5 };
    P.reads[seed.library.folder + ":1"] = now - 2 * 864e5; P.reads[seed.library.folder + ":2"] = now - 864e5;
    save();
  }
  let trash = [];
  const doneCount = p => p.rtype === "qbank" ? Object.keys(P.answers).filter(k => k.startsWith(p.folder + ":")).length
    : p.rtype === "flashcard" ? Object.keys(P.known).filter(k => k.startsWith(p.folder + ":") && P.known[k]).length
    : Object.keys(P.reads).filter(k => k.startsWith(p.folder + ":")).length;
  const packs = () => [
    { folder: seed.qbank.folder, rtype: "qbank", name: seed.qbank.name, publisher: "Dr Sarwar Alam", total: seed.qbank.questions.length, media_dir: "", icon: "" },
    { folder: seed.cards.folder, rtype: "flashcard", name: seed.cards.name, publisher: "Dr Sarwar Alam", total: seed.cards.decks.reduce((n, d) => n + d.cards.length, 0), media_dir: "", icon: "" },
    { folder: seed.library.folder, rtype: "library", name: seed.library.name, publisher: "Dr Sarwar Alam", total: seed.library.docs.length, media_dir: "", icon: "" }
  ].filter(p => !trash.some(t => t.folder === p.folder)).map(p => ({ ...p, done: doneCount(p) }));
  const pool = (subject, system, status) => seed.qbank.questions.filter(q => {
    if (subject && !("," + q.subId.replace(/ /g, "") + ",").includes("," + subject + ",")) return false;
    if (system && !("," + q.sysId.replace(/ /g, "") + ",").includes("," + system + ",")) return false;
    const a = P.answers[seed.qbank.folder + ":" + q.id];
    if (status === "unseen" && a) return false;
    if (status === "incorrect" && (!a || a.correct)) return false;
    if (status === "marked" && !P.marks[seed.qbank.folder + ":" + q.id]) return false;
    return true;
  });
  const api = {
    isDemo: true, fileSrc: () => null, onImport: async () => () => {},
    async cmd(name, a = {}) {
      switch (name) {
        case "list_resources": return packs();
        case "app_data_dir": return "/demo";
        case "import_zip": throw new Error("Preview mode — install the APK to import packs.");
        case "delete_resource": { trash.push({ folder: a.folder, name: a.folder + "__" + Date.now() }); return trash[trash.length - 1].name; }
        case "restore_resource": { trash = trash.filter(t => t.name !== a.trash); return a.trash.split("__")[0]; }
        case "qbank_meta": return { subjects: seed.qbank.subjects, systems: seed.qbank.systems, total: seed.qbank.questions.length };
        case "pool_count": return pool(a.subject, a.system, a.status).length;
        case "build_session": {
          let ids = pool(a.subject, a.system, a.status).map(q => q.id);
          if (a.order !== "qid") ids.sort(() => Math.random() - .5);
          return ids.slice(0, a.count);
        }
        case "get_question": {
          const q = seed.qbank.questions.find(x => x.id === a.id);
          return { id: q.id, question: q.question, explanation: q.explanation, corr_ans: q.corrAns, media: [],
            answers: q.answers.map(x => ({ letter: String.fromCharCode(64 + x.a), text: x.text, pct: x.pct })),
            refs: [], marked: !!P.marks[a.folder + ":" + q.id], your_answer: P.answers[a.folder + ":" + q.id] || null };
        }
        case "save_answer": P.answers[a.folder + ":" + a.qid] = { chosen: a.chosen, correct: a.correct, ts: Date.now() }; save(); return null;
        case "toggle_mark": { const k = a.folder + ":" + a.qid; P.marks[k] = !P.marks[k]; save(); return P.marks[k]; }
        case "flash_decks": return seed.cards.decks.map(d => ({ id: d.id, name: d.name, count: d.cards.length, known: d.cards.filter(c => P.known[a.folder + ":" + c.id]).length }));
        case "flash_cards": { const d = seed.cards.decks.find(x => x.id === a.deck); return d.cards.map(c => ({ id: c.id, title: c.title, front: c.front, back: c.back, media: [], known: !!P.known[a.folder + ":" + c.id] })); }
        case "set_card_known": P.known[a.folder + ":" + a.cardId] = a.known; save(); return a.known;
        case "lib_toc": return seed.library.toc.filter(t => t.parentId === a.parent && t.id > a.cursor).slice(0, 300).map(t => ({ id: t.id, name: t.name, doc_id: t.docId, is_cat: !t.docId }));
        case "lib_doc": { const d = seed.library.docs.find(x => x.id === a.id); P.reads[a.folder + ":" + a.id] = Date.now(); save(); return { title: d.title, html: d.html }; }
        case "lib_search": {
          const q = a.query.toLowerCase();
          return seed.library.docs.filter(d => (d.title + " " + d.html).toLowerCase().includes(q)).slice(0, 50)
            .map(d => { const plain = d.html.replace(/<[^>]+>/g, " "); const i = plain.toLowerCase().indexOf(q); return { doc_id: d.id, title: d.title, snippet: i >= 0 ? plain.slice(Math.max(0, i - 40), i + 120) : plain.slice(0, 120) }; });
        }
        case "lib_siblings": {
          const row = seed.library.toc.find(t => t.docId === a.docId);
          const sibs = seed.library.toc.filter(t => t.parentId === (row ? row.parentId : 0) && t.docId > 0);
          const i = sibs.findIndex(t => t.docId === a.docId);
          const at = j => sibs[j] ? { doc_id: sibs[j].docId, title: sibs[j].name } : null;
          return { prev: at(i - 1), next: at(i + 1) };
        }
        case "toggle_bookmark": { const k = a.folder + ":" + a.docId; if (P.bookmarks[k]) { delete P.bookmarks[k]; save(); return false; } P.bookmarks[k] = { title: a.title, ts: Date.now() }; save(); return true; }
        case "list_bookmarks": return Object.entries(P.bookmarks).filter(([k]) => k.startsWith(a.folder + ":")).map(([k, b]) => ({ doc_id: +k.split(":")[1], title: b.title, ts: b.ts })).sort((x, y) => y.ts - x.ts);
        case "stats": {
          const ans = Object.values(P.answers);
          const week = [...Array(7)].map((_, i) => { const d0 = new Date(); d0.setHours(0, 0, 0, 0); const s = d0.getTime() - (6 - i) * 864e5; return ans.filter(x => x.ts >= s && x.ts < s + 864e5).length; });
          return { answered: ans.length, correct: ans.filter(x => x.correct).length, today: week[6], week, cards_known: Object.values(P.known).filter(Boolean).length, articles_read: Object.keys(P.reads).length };
        }
        case "reset_progress": {
          const pre = a.folder ? a.folder + ":" : "";
          for (const t of ["answers", "marks", "known", "bookmarks", "reads"]) for (const k of Object.keys(P[t])) if (k.startsWith(pre)) delete P[t][k];
          save(); return null;
        }
        case "storage_usage": return 4200000;
        default: throw new Error("Unknown command: " + name);
      }
    }
  };
  return api;
}
