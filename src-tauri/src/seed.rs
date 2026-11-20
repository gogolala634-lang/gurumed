use crate::import::{data_root, now};
use rusqlite::Connection;
use std::{fs, path::Path};
use tauri::AppHandle;

const SEED: &str = include_str!("../../src/seed.json");

fn write_manifest(dir: &Path, folder: &str, rtype: &str, adapter: &str, name: &str, desc: &str, db: &str) {
    let m = serde_json::json!({
        "manifestVersion": 1, "resourceId": folder, "displayName": name, "description": desc,
        "type": rtype, "adapter": adapter, "publisher": "Dr Sarwar Alam", "primaryDb": db, "tags": ["sample"]
    });
    let _ = fs::write(dir.join("manifest.json"), serde_json::to_vec_pretty(&m).unwrap());
}

pub fn ensure(app: &AppHandle) {
    let Ok(root) = data_root(app) else { return };
    let _ = fs::create_dir_all(&root);
    if let Ok(rd) = fs::read_dir(root.join(".trash")) {
        for x in rd.flatten() {
            let name = x.file_name().to_string_lossy().to_string();
            if let Some((_, ts)) = name.rsplit_once("__") {
                if let Ok(t) = ts.parse::<i64>() {
                    if now() - t > 7 * 86400 { let _ = fs::remove_dir_all(x.path()); }
                }
            }
        }
    }
    let marker = root.join(".seeded");
    if marker.exists() { return; }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(SEED) else { return };
    let s = |x: &serde_json::Value, k: &str| x[k].as_str().unwrap_or("").to_string();

    let qb = &v["qbank"];
    let dir = root.join(s(qb, "folder"));
    let _ = fs::create_dir_all(&dir);
    if let Ok(c) = Connection::open(dir.join("sample.db")) {
        let _ = c.execute_batch("
            CREATE TABLE Subjects(id INTEGER PRIMARY KEY, name TEXT, count INTEGER);
            CREATE TABLE Systems(id INTEGER PRIMARY KEY, name TEXT, count INTEGER);
            CREATE TABLE Questions(id INTEGER PRIMARY KEY, question TEXT, explanation TEXT, corrAns TEXT,
                subId TEXT, sysId TEXT, title TEXT, mediaName TEXT, otherMedias TEXT);
            CREATE TABLE Answers(id INTEGER PRIMARY KEY, qId INTEGER, answerId INTEGER, answerText TEXT, correctPercentage INTEGER);
            CREATE INDEX idx_answers_q ON Answers(qId);");
        for x in qb["subjects"].as_array().unwrap_or(&vec![]) {
            let _ = c.execute("INSERT INTO Subjects(id,name) VALUES(?1,?2)", rusqlite::params![x["id"].as_i64(), s(x, "name")]);
        }
        for x in qb["systems"].as_array().unwrap_or(&vec![]) {
            let _ = c.execute("INSERT INTO Systems(id,name) VALUES(?1,?2)", rusqlite::params![x["id"].as_i64(), s(x, "name")]);
        }
        for q in qb["questions"].as_array().unwrap_or(&vec![]) {
            let qid = q["id"].as_i64().unwrap_or(0);
            let _ = c.execute("INSERT INTO Questions(id,question,explanation,corrAns,subId,sysId,title) VALUES(?1,?2,?3,?4,?5,?6,?7)",
                rusqlite::params![qid, s(q, "question"), s(q, "explanation"), s(q, "corrAns"), s(q, "subId"), s(q, "sysId"), s(q, "title")]);
            for a in q["answers"].as_array().unwrap_or(&vec![]) {
                let _ = c.execute("INSERT INTO Answers(qId,answerId,answerText,correctPercentage) VALUES(?1,?2,?3,?4)",
                    rusqlite::params![qid, a["a"].as_i64(), s(a, "text"), a["pct"].as_i64()]);
            }
        }
        write_manifest(&dir, &s(qb, "folder"), "qbank", "qbank", &s(qb, "name"), &s(qb, "description"), "sample.db");
    }

    let fc = &v["cards"];
    let dir = root.join(s(fc, "folder"));
    let _ = fs::create_dir_all(&dir);
    if let Ok(c) = Connection::open(dir.join("sample.bin")) {
        let _ = c.execute_batch("
            CREATE TABLE Subjects(id INTEGER PRIMARY KEY, name TEXT, count INTEGER);
            CREATE TABLE Questions(id INTEGER PRIMARY KEY, subId INTEGER, title TEXT, question TEXT, explanation TEXT, mediaName TEXT, otherMedias TEXT);");
        for d in fc["decks"].as_array().unwrap_or(&vec![]) {
            let cards = d["cards"].as_array().unwrap_or(&vec![]);
            let _ = c.execute("INSERT INTO Subjects VALUES(?1,?2,?3)", rusqlite::params![d["id"].as_i64(), s(d, "name"), cards.len() as i64]);
            for x in cards {
                let _ = c.execute("INSERT INTO Questions(id,subId,title,question,explanation) VALUES(?1,?2,?3,?4,?5)",
                    rusqlite::params![x["id"].as_i64(), d["id"].as_i64(), s(x, "title"), s(x, "front"), s(x, "back")]);
            }
        }
        write_manifest(&dir, &s(fc, "folder"), "flashcard", "flashcard", &s(fc, "name"), &s(fc, "description"), "sample.bin");
    }

    let lb = &v["library"];
    let dir = root.join(s(lb, "folder"));
    let _ = fs::create_dir_all(&dir);
    if let Ok(c) = Connection::open(dir.join("sample.db")) {
        let _ = c.execute_batch("
            CREATE TABLE Docs(id INTEGER PRIMARY KEY, title TEXT, doc TEXT, path TEXT);
            CREATE TABLE TOC(id INTEGER PRIMARY KEY, name TEXT, docId INTEGER, parentId INTEGER, leaf INTEGER, section TEXT);");
        for d in lb["docs"].as_array().unwrap_or(&vec![]) {
            let _ = c.execute("INSERT INTO Docs(id,title,doc) VALUES(?1,?2,?3)", rusqlite::params![d["id"].as_i64(), s(d, "title"), s(d, "html")]);
        }
        for t in lb["toc"].as_array().unwrap_or(&vec![]) {
            let _ = c.execute("INSERT INTO TOC(id,name,docId,parentId,leaf) VALUES(?1,?2,?3,?4,?5)",
                rusqlite::params![t["id"].as_i64(), s(t, "name"), t["docId"].as_i64(), t["parentId"].as_i64(), t["leaf"].as_i64()]);
        }
        write_manifest(&dir, &s(lb, "folder"), "library", "article", &s(lb, "name"), &s(lb, "description"), "sample.db");
    }
    let _ = fs::write(&marker, b"1");
}
