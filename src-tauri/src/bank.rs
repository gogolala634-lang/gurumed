use crate::import::{data_root, describe, e, now};
use rusqlite::Connection;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

fn qj(c: &Connection, sql: &str, p: &[&dyn rusqlite::ToSql],
      f: impl Fn(&rusqlite::Row) -> rusqlite::Result<Value>) -> Vec<Value> {
    c.prepare(sql).and_then(|mut s| s.query_map(p, |r| f(r))
        .map(|it| it.filter_map(|x| x.ok()).collect())).unwrap_or_default()
}

pub fn progress_path(app: &AppHandle) -> Result<String, String> {
    let p = app.path().app_data_dir().map_err(e)?.join("progress.sqlite");
    let c = Connection::open(&p).map_err(e)?;
    c.execute_batch("
        CREATE TABLE IF NOT EXISTS answers(folder TEXT, qid INTEGER, chosen TEXT, correct INTEGER, ts INTEGER, PRIMARY KEY(folder,qid));
        CREATE TABLE IF NOT EXISTS marks(folder TEXT, qid INTEGER, PRIMARY KEY(folder,qid));
        CREATE TABLE IF NOT EXISTS card_known(folder TEXT, card_id INTEGER, known INTEGER, PRIMARY KEY(folder,card_id));
        CREATE TABLE IF NOT EXISTS bookmarks(folder TEXT, doc_id INTEGER, title TEXT, ts INTEGER, PRIMARY KEY(folder,doc_id));
        CREATE TABLE IF NOT EXISTS reads(folder TEXT, doc_id INTEGER, ts INTEGER, PRIMARY KEY(folder,doc_id));
    ").map_err(e)?;
    Ok(p.to_string_lossy().into())
}

fn bank(app: &AppHandle, folder: &str) -> Result<Connection, String> {
    if folder.contains('/') || folder.contains("..") { return Err("bad folder".into()); }
    let res = describe(&data_root(app)?.join(folder))?;
    Connection::open(&res.db).map_err(e)
}

// --- THE FIX: Use rusqlite::params! to handle the borrowing safely ---
fn attached(app: &AppHandle, folder: &str) -> Result<Connection, String> {
    let c = bank(app, folder)?;
    let progress = progress_path(app)?; 
    c.execute("ATTACH DATABASE ? AS progress", rusqlite::params![progress]).map_err(e)?;
    Ok(c)
}

pub fn done_count(c: &Connection, folder: &str, rtype: &str) -> Result<i64, String> {
    let attached: bool = c.query_row(
        "SELECT COUNT(*) FROM pragma_database_list WHERE name='progress'", [], |r| r.get::<_, i64>(0)
    ).unwrap_or(0) > 0;
    if !attached { return Ok(0); }
    let sql = match rtype {
        "qbank" => "SELECT COUNT(*) FROM progress.answers WHERE folder=?1",
        "flashcard" => "SELECT COUNT(*) FROM progress.card_known WHERE folder=?1 AND known=1",
        _ => "SELECT COUNT(*) FROM progress.reads WHERE folder=?1",
    };
    c.query_row(sql, rusqlite::params![folder], |r| r.get(0)).map_err(e)
}

fn has_col(c: &Connection, t: &str, col: &str) -> bool {
    c.prepare(&format!("PRAGMA table_info({t})")).and_then(|mut s|
        s.query_map([], |r| r.get::<_, String>(1))
            .map(|it| it.filter_map(|x| x.ok()).any(|n| n.eq_ignore_ascii_case(col)))).unwrap_or(false)
}

fn item_index(html: &str) -> i64 {
    let text = regex::Regex::new(r"<[^>]+>").unwrap().replace_all(html, " ");
    regex::Regex::new(r"(?i)(?:Item|Question)\s+(\d+)\s+of\s+(\d+)").unwrap()
        .captures(&text).and_then(|c| c.get(1)).and_then(|m| m.as_str().parse().ok())
        .unwrap_or(i64::MAX)
}

fn pool_where(subject: Option<i64>, system: Option<i64>, status: &str) -> (String, bool) {
    let mut w = String::from(" WHERE 1=1");
    if let Some(s) = subject { w += &format!(" AND (','||REPLACE(q.subId,' ','')||',') LIKE '%,{s},%'"); }
    if let Some(s) = system { w += &format!(" AND (','||REPLACE(q.sysId,' ','')||',') LIKE '%,{s},%'"); }
    let mut uses_folder = false;
    match status {
        "unseen" => { w += " AND NOT EXISTS (SELECT 1 FROM progress.answers a WHERE a.folder=?1 AND a.qid=q.id)"; uses_folder = true; }
        "incorrect" => { w += " AND EXISTS (SELECT 1 FROM progress.answers a WHERE a.folder=?1 AND a.qid=q.id AND a.correct=0)"; uses_folder = true; }
        "marked" => { w += " AND EXISTS (SELECT 1 FROM progress.marks m WHERE m.folder=?1 AND m.qid=q.id)"; uses_folder = true; }
        _ => {}
    }
    (w, uses_folder)
}

#[tauri::command]
pub fn qbank_meta(app: AppHandle, folder: String) -> Result<Value, String> {
    let c = bank(&app, &folder)?;
    let list = |t: &str| qj(&c, &format!("SELECT id, name FROM {t} ORDER BY name"), &[],
        |r| Ok(json!({"id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?})));
    Ok(json!({"subjects": list("Subjects"), "systems": list("Systems"),
              "total": c.query_row("SELECT COUNT(*) FROM Questions", [], |r| r.get::<_, i64>(0)).unwrap_or(0)}))
}

#[tauri::command]
pub fn pool_count(app: AppHandle, folder: String, subject: Option<i64>, system: Option<i64>, status: String) -> Result<i64, String> {
    let c = attached(&app, &folder)?;
    let (w, uf) = pool_where(subject, system, &status);
    let sql = format!("SELECT COUNT(*) FROM Questions q{w}");
    let n = if uf { c.query_row(&sql, rusqlite::params![folder], |r| r.get(0)) } else { c.query_row(&sql, [], |r| r.get(0)) };
    n.map_err(e)
}

#[tauri::command]
pub fn build_session(app: AppHandle, folder: String, subject: Option<i64>, system: Option<i64>,
                     count: i64, status: String, order: String) -> Result<Vec<i64>, String> {
    let c = attached(&app, &folder)?;
    let count = count.clamp(1, 200) as usize;
    let (w, uf) = pool_where(subject, system, &status);
    let ord = if order == "qid" { "q.id" } else { "RANDOM()" };
    let sql = format!("SELECT q.id FROM Questions q{w} ORDER BY {ord}");
    let params: Vec<&dyn rusqlite::ToSql> = if uf { vec![&folder] } else { vec![] };
    let pool: Vec<i64> = qj(&c, &sql, &params, |r| Ok(json!(r.get::<_, i64>(0)?)))
        .iter().map(|v| v.as_i64().unwrap()).collect();
    let mut out: Vec<i64> = pool.into_iter().take(count).collect();
    if has_col(&c, "Questions", "parentQId") {
        let members = |p: i64| -> Vec<(i64, String)> {
            c.prepare("SELECT id, question FROM Questions WHERE parentQId=?").ok()
                .and_then(|mut s| s.query_map(rusqlite::params![p], |r| Ok((r.get(0)?, r.get(1)?)))
                    .map(|it| it.filter_map(|x| x.ok()).collect()).ok()).unwrap_or_default()
        };
        let parent_of = |id: i64| -> i64 {
            c.query_row("SELECT COALESCE(parentQId,0) FROM Questions WHERE id=?", rusqlite::params![id], |r| r.get(0)).unwrap_or(0)
        };
        let mut expanded = Vec::new();
        let mut done = std::collections::HashSet::new();
        for id in out {
            if done.contains(&id) { continue; }
            let p = parent_of(id);
            let mut ms = if p != 0 { members(p) } else { vec![] };
            if ms.len() >= 2 {
                ms.sort_by_key(|(_, h)| item_index(h));
                for (mid, _) in ms { if done.insert(mid) { expanded.push(mid); } }
            } else if done.insert(id) { expanded.push(id); }
        }
        while expanded.len() > count {
            match expanded.iter().rposition(|&id| { let p = parent_of(id); p == 0 || members(p).len() < 2 }) {
                Some(pos) => { expanded.remove(pos); }
                None => break,
            }
        }
        out = expanded;
    }
    Ok(out)
}

#[tauri::command]
pub fn get_question(app: AppHandle, folder: String, id: i64) -> Result<Value, String> {
    let c = attached(&app, &folder)?;
    let (question, explanation, corr, mn, om): (String, String, String, String, String) = c.query_row(
        "SELECT question, COALESCE(explanation,''), COALESCE(corrAns,''), COALESCE(mediaName,''), COALESCE(otherMedias,'')
         FROM Questions WHERE id=?", rusqlite::params![id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))).map_err(e)?;
    let answers = qj(&c, "SELECT answerId, answerText, COALESCE(correctPercentage,0) FROM Answers WHERE qId=? ORDER BY answerId",
        rusqlite::params![id], |r| {
            let n: i64 = r.get(0)?;
            let letter = if n >= 1 && n <= 26 { char::from(b'A' + (n - 1) as u8).to_string() } else { n.to_string() };
            Ok(json!({"letter": letter, "text": r.get::<_, String>(1)?, "pct": r.get::<_, i64>(2)?})) });
    let refs = qj(&c, "SELECT refTitle, COALESCE(refLink,'') FROM Refs WHERE qId=? ORDER BY id",
        rusqlite::params![id], |r| Ok(json!({"title": r.get::<_, String>(0)?, "link": r.get::<_, String>(1)?})));
    let marked: bool = c.query_row("SELECT EXISTS(SELECT 1 FROM progress.marks WHERE folder=?1 AND qid=?2)",
        rusqlite::params![folder, id], |r| r.get::<_, i64>(0)).unwrap_or(0) == 1;
    let your: Option<Value> = c.query_row("SELECT chosen, correct FROM progress.answers WHERE folder=?1 AND qid=?2",
        rusqlite::params![folder, id], |r| Ok(json!({"chosen": r.get::<_, String>(0)?, "correct": r.get::<_, i64>(1)? == 1}))).ok();
    let media: Vec<String> = std::iter::once(mn).chain(om.split(',').map(String::from))
        .map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    Ok(json!({"id": id, "question": question, "explanation": explanation, "corr_ans": corr,
              "media": media, "answers": answers, "refs": refs, "marked": marked, "your_answer": your}))
}

#[tauri::command]
pub fn save_answer(app: AppHandle, folder: String, qid: i64, chosen: String, correct: bool) -> Result<(), String> {
    let c = Connection::open(progress_path(&app)?).map_err(e)?;
    c.execute("INSERT OR REPLACE INTO answers VALUES(?1,?2,?3,?4,?5)",
        rusqlite::params![folder, qid, chosen, correct as i64, now()]).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn toggle_mark(app: AppHandle, folder: String, qid: i64) -> Result<bool, String> {
    let c = Connection::open(progress_path(&app)?).map_err(e)?;
    let exists: bool = c.query_row("SELECT EXISTS(SELECT 1 FROM marks WHERE folder=?1 AND qid=?2)",
        rusqlite::params![folder, qid], |r| r.get::<_, i64>(0)).map_err(e)? == 1;
    if exists { c.execute("DELETE FROM marks WHERE folder=?1 AND qid=?2", rusqlite::params![folder, qid]).map_err(e)?; }
    else { c.execute("INSERT OR REPLACE INTO marks VALUES(?1,?2)", rusqlite::params![folder, qid]).map_err(e)?; }
    Ok(!exists)
}

#[tauri::command]
pub fn flash_decks(app: AppHandle, folder: String) -> Result<Vec<Value>, String> {
    let c = attached(&app, &folder)?;
    Ok(qj(&c, "SELECT s.id, s.name, COALESCE(s.count,0),
        (SELECT COUNT(*) FROM progress.card_known k WHERE k.folder=?1 AND k.known=1
           AND k.card_id IN (SELECT id FROM Questions WHERE subId=s.id))
        FROM Subjects s ORDER BY s.name", rusqlite::params![folder],
        |r| Ok(json!({"id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?,
                      "count": r.get::<_, i64>(2)?, "known": r.get::<_, i64>(3)?}))))
}

#[tauri::command]
pub fn flash_cards(app: AppHandle, folder: String, deck: i64) -> Result<Vec<Value>, String> {
    let c = attached(&app, &folder)?;
    Ok(qj(&c, "SELECT q.id, COALESCE(q.title,''), q.question, COALESCE(q.explanation,''),
        COALESCE(q.mediaName,''), COALESCE(q.otherMedias,''),
        COALESCE((SELECT k.known FROM progress.card_known k WHERE k.folder=?1 AND k.card_id=q.id),0)
        FROM Questions q WHERE q.subId=?2 ORDER BY q.id",
        rusqlite::params![folder, deck], |r| {
            let media: Vec<String> = std::iter::once(r.get::<_, String>(4)?)
                .chain(r.get::<_, String>(5)?.split(',').map(String::from))
                .map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            Ok(json!({"id": r.get::<_, i64>(0)?, "title": r.get::<_, String>(1)?,
                      "front": r.get::<_, String>(2)?, "back": r.get::<_, String>(3)?,
                      "media": media, "known": r.get::<_, i64>(6)? == 1})) }))
}

#[tauri::command]
pub fn set_card_known(app: AppHandle, folder: String, card_id: i64, known: bool) -> Result<bool, String> {
    let c = Connection::open(progress_path(&app)?).map_err(e)?;
    c.execute("INSERT OR REPLACE INTO card_known VALUES(?1,?2,?3)",
        rusqlite::params![folder, card_id, known as i64]).map_err(e)?;
    Ok(known)
}

#[tauri::command]
pub fn lib_toc(app: AppHandle, folder: String, parent: i64, cursor: i64) -> Result<Vec<Value>, String> {
    let c = bank(&app, &folder)?;
    Ok(qj(&c, "SELECT id, name, COALESCE(docId,0) FROM TOC WHERE parentId=?1 AND id>?2 ORDER BY id LIMIT 300",
        rusqlite::params![parent, cursor], |r| {
            let doc: i64 = r.get(2)?;
            Ok(json!({"id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?, "doc_id": doc, "is_cat": doc == 0})) }))
}

#[tauri::command]
pub fn lib_doc(app: AppHandle, folder: String, id: i64) -> Result<Value, String> {
    let c = attached(&app, &folder)?;
    let doc = c.query_row("SELECT title, doc FROM Docs WHERE id=?", rusqlite::params![id],
        |r| Ok(json!({"title": r.get::<_, String>(0)?, "html": r.get::<_, String>(1)?}))).map_err(e)?;
    let _ = c.execute("INSERT OR REPLACE INTO progress.reads VALUES(?1,?2,?3)", rusqlite::params![folder, id, now()]);
    Ok(doc)
}

#[tauri::command]
pub fn lib_search(app: AppHandle, folder: String, query: String) -> Result<Vec<Value>, String> {
    let c = bank(&app, &folder)?;
    let has_search: bool = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Search'",
        [], |r| r.get::<_, i64>(0)).unwrap_or(0) > 0;
    let map = |r: &rusqlite::Row| Ok(json!({"doc_id": r.get::<_, i64>(0)?, "title": r.get::<_, String>(1)?, "snippet": r.get::<_, String>(2)?}));
    if has_search {
        let ddl: String = c.query_row("SELECT COALESCE(sql,'') FROM sqlite_master WHERE name='Search'", [], |r| r.get(0)).unwrap_or_default();
        if ddl.to_lowercase().contains("virtual") {
            let q = format!("\"{}\"", query.replace('"', " "));
            Ok(qj(&c, "SELECT s.contentId, d.title, substr(COALESCE(s.content,''),1,160) FROM Search s
                JOIN Docs d ON d.id=s.contentId WHERE Search MATCH ?1 GROUP BY s.contentId LIMIT 50",
                rusqlite::params![q], map))
        } else {
            let like = format!("%{query}%");
            Ok(qj(&c, "SELECT s.contentId, d.title, substr(COALESCE(s.content,''),1,160) FROM Search s
                JOIN Docs d ON d.id=s.contentId WHERE s.content LIKE ?1 GROUP BY s.contentId LIMIT 50",
                rusqlite::params![like], map))
        }
    } else {
        let like = format!("%{query}%");
        Ok(qj(&c, "SELECT id, title, substr(doc,1,160) FROM Docs WHERE title LIKE ?1 OR doc LIKE ?1 LIMIT 50",
            rusqlite::params![like], map))
    }
}

#[tauri::command]
pub fn lib_siblings(app: AppHandle, folder: String, doc_id: i64) -> Result<Value, String> {
    let c = bank(&app, &folder)?;
    let parent: i64 = c.query_row("SELECT parentId FROM TOC WHERE docId=?1 LIMIT 1", rusqlite::params![doc_id], |r| r.get(0)).unwrap_or(0);
    let sibs = qj(&c, "SELECT docId, name FROM TOC WHERE parentId=?1 AND COALESCE(docId,0)>0 ORDER BY id",
        rusqlite::params![parent], |r| Ok(json!({"doc_id": r.get::<_, i64>(0)?, "title": r.get::<_, String>(1)?})));
    let pos = sibs.iter().position(|s| s["doc_id"].as_i64() == Some(doc_id));
    let at = |i: Option<usize>| i.and_then(|i| sibs.get(i).cloned()).unwrap_or(Value::Null);
    Ok(json!({"prev": at(pos.and_then(|p| p.checked_sub(1))), "next": at(pos.map(|p| p + 1))}))
}

#[tauri::command]
pub fn toggle_bookmark(app: AppHandle, folder: String, doc_id: i64, title: String) -> Result<bool, String> {
    let c = Connection::open(progress_path(&app)?).map_err(e)?;
    let exists: bool = c.query_row("SELECT EXISTS(SELECT 1 FROM bookmarks WHERE folder=?1 AND doc_id=?2)",
        rusqlite::params![folder, doc_id], |r| r.get::<_, i64>(0)).map_err(e)? == 1;
    if exists { c.execute("DELETE FROM bookmarks WHERE folder=?1 AND doc_id=?2", rusqlite::params![folder, doc_id]).map_err(e)?; }
    else { c.execute("INSERT OR REPLACE INTO bookmarks VALUES(?1,?2,?3,?4)", rusqlite::params![folder, doc_id, title, now()]).map_err(e)?; }
    Ok(!exists)
}

#[tauri::command]
pub fn list_bookmarks(app: AppHandle, folder: String) -> Result<Vec<Value>, String> {
    let c = Connection::open(progress_path(&app)?).map_err(e)?;
    Ok(qj(&c, "SELECT doc_id, title, ts FROM bookmarks WHERE folder=?1 ORDER BY ts DESC",
        rusqlite::params![folder],
        |r| Ok(json!({"doc_id": r.get::<_, i64>(0)?, "title": r.get::<_, String>(1)?, "ts": r.get::<_, i64>(2)?}))))
}

#[tauri::command]
pub fn stats(app: AppHandle, tz_offset: i64) -> Result<Value, String> {
    let c = Connection::open(progress_path(&app)?).map_err(e)?;
    let (answered, correct): (i64, i64) = c.query_row("SELECT COUNT(*), COALESCE(SUM(correct),0) FROM answers", [],
        |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?;
    let off = tz_offset * 60;
    let day_start = ((now() - off) / 86400) * 86400 + off;
    let mut week = Vec::new();
    for i in 0..7i64 {
        let s = day_start - (6 - i) * 86400;
        let n: i64 = c.query_row("SELECT COUNT(*) FROM answers WHERE ts>=?1 AND ts<?2", rusqlite::params![s, s + 86400], |r| r.get(0)).unwrap_or(0);
        week.push(n);
    }
    let cards_known: i64 = c.query_row("SELECT COUNT(*) FROM card_known WHERE known=1", [], |r| r.get(0)).unwrap_or(0);
    let articles_read: i64 = c.query_row("SELECT COUNT(*) FROM reads", [], |r| r.get(0)).unwrap_or(0);
    Ok(json!({"answered": answered, "correct": correct, "today": week[6], "week": week,
              "cards_known": cards_known, "articles_read": articles_read}))
}

#[tauri::command]
pub fn reset_progress(app: AppHandle, folder: Option<String>) -> Result<(), String> {
    let c = Connection::open(progress_path(&app)?).map_err(e)?;
    for t in ["answers", "marks", "card_known", "bookmarks", "reads"] {
        match &folder {
            Some(f) => { c.execute(&format!("DELETE FROM {t} WHERE folder=?1"), rusqlite::params![f]).map_err(e)?; }
            None => { c.execute(&format!("DELETE FROM {t}"), []).map_err(e)?; }
        }
    }
    Ok(())
}
