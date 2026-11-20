use serde::Serialize;
use std::{fs, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
pub struct Resource {
    pub folder: String, pub rtype: String, pub name: String, pub publisher: String,
    pub db: String, pub media_dir: String, pub icon: String, pub total: i64, pub done: i64,
}

pub fn e<E: std::fmt::Display>(x: E) -> String { x.to_string() }
pub fn now() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64 }
pub fn data_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(e)?.join("local-databases"))
}

fn pick_db(dir: &Path, man: &serde_json::Value) -> Result<PathBuf, String> {
    if let Some(p) = man["primaryDb"].as_str() {
        let f = dir.join(p);
        if f.is_file() { return Ok(f); }
        return Err(format!("manifest primaryDb not found: {p}"));
    }
    fs::read_dir(dir).map_err(e)?.filter_map(|x| x.ok().map(|x| x.path()))
        .filter(|p| p.is_file()).filter(|p| {
            let n = p.file_name().unwrap().to_string_lossy().to_lowercase();
            !n.ends_with("-wal") && !n.ends_with("-shm")
                && !n.contains("search") && !n.contains("fts") && !n.contains("index")
                && ["db", "sqlite", "sqlite3", "bin"].iter().any(|x| n.ends_with(x))
        }).next().ok_or_else(|| "no primary database found in folder".into())
}

fn sniff(db: &Path) -> String {
    let Ok(c) = rusqlite::Connection::open(db) else { return "qbank".into() };
    let names: Vec<String> = c.prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .and_then(|mut s| s.query_map([], |r| r.get::<_, String>(0))
            .map(|it| it.filter_map(|x| x.ok()).collect())).unwrap_or_default();
    let has = |n: &str| names.iter().any(|t| t.eq_ignore_ascii_case(n));
    if has("Docs") && has("TOC") { return "library".into(); }
    if has("Answers") && c.query_row("SELECT COUNT(*) FROM Answers", [], |r| r.get::<_, i64>(0)).unwrap_or(0) > 0 {
        return "qbank".into();
    }
    "flashcard".into()
}

pub fn describe(dir: &Path) -> Result<Resource, String> {
    let folder = dir.file_name().unwrap().to_string_lossy().to_string();
    let man: serde_json::Value = fs::read(dir.join("manifest.json")).ok()
        .and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    let adapter = man["adapter"].as_str().unwrap_or("");
    if ["lexi-drugs", "visualdx", "access-medicine"].contains(&adapter) {
        return Err(format!("{folder}: adapter '{adapter}' is not supported yet"));
    }
    let db = pick_db(dir, &man)?;
    let rtype = match man["type"].as_str() {
        Some(t @ ("qbank" | "flashcard" | "library")) => t.to_string(),
        _ => sniff(&db),
    };
    let media_dir = man["reader"]["assets"]["mediaDir"].as_str().map(|m| dir.join(m))
        .filter(|p| p.is_dir())
        .or_else(|| fs::read_dir(dir).ok()?.filter_map(|x| x.ok().map(|x| x.path()))
            .find(|p| p.is_dir() && {
                let n = p.file_name().unwrap().to_string_lossy().to_lowercase();
                n.starts_with("media") || n == "images"
            }));
    let icon = dir.join("icon.png");
    let c = rusqlite::Connection::open(&db).map_err(e)?;
    if let Some(app_data) = dir.parent().and_then(|r| r.parent()) {
        let pp = app_data.join("progress.sqlite");
        if pp.is_file() {
            let _ = c.execute("ATTACH DATABASE ? AS progress", [pp.to_string_lossy().as_ref()]);
        }
    }
    let total = match rtype.as_str() {
        "library" => c.query_row("SELECT COUNT(*) FROM Docs", [], |r| r.get(0)).unwrap_or(0),
        _ => c.query_row("SELECT COUNT(*) FROM Questions", [], |r| r.get(0)).unwrap_or(0),
    };
    let done = crate::bank::done_count(&c, &folder, &rtype).unwrap_or(0);
    Ok(Resource {
        folder, rtype,
        name: man["displayName"].as_str().unwrap_or(dir.file_name().unwrap().to_string_lossy().as_ref()).to_string(),
        publisher: man["publisher"].as_str().unwrap_or("").to_string(),
        db: db.to_string_lossy().into(),
        media_dir: media_dir.map(|p| p.to_string_lossy().into()).unwrap_or_default(),
        icon: if icon.is_file() { icon.to_string_lossy().into() } else { String::new() },
        total, done,
    })
}

#[tauri::command]
pub fn app_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(app.path().app_data_dir().map_err(e)?.to_string_lossy().into())
}

#[tauri::command]
pub async fn import_zip(app: AppHandle, zip_name: String) -> Result<Resource, String> {
    let zip_path = app.path().app_data_dir().map_err(e)?.join(&zip_name);
    let mut zip = zip::ZipArchive::new(fs::File::open(&zip_path).map_err(e)?).map_err(e)?;
    let mut top: Option<String> = None;
    for name in zip.file_names() {
        if name.starts_with("__MACOSX") { continue; }
        let Some(first) = name.split('/').next().filter(|s| !s.is_empty()) else { continue };
        match &top {
            None => top = Some(first.to_string()),
            Some(t) if t == first => {}
            _ => return Err("ZIP must contain exactly one top-level folder (loose files at the root are not allowed)".into()),
        }
    }
    let folder = top.ok_or("empty ZIP")?;
    let root = data_root(&app)?;
    fs::create_dir_all(&root).map_err(e)?;
    let dest = root.join(&folder);
    if dest.exists() { fs::remove_dir_all(&dest).map_err(e)?; }
    let len = zip.len();
    for i in 0..len {
        let mut f = zip.by_index(i).map_err(e)?;
        let Some(rel) = f.enclosed_name() else { continue };
        if rel.components().any(|c| c.as_os_str() == "__MACOSX") { continue; }
        let out = root.join(&rel);
        if f.is_dir() { fs::create_dir_all(&out).map_err(e)?; continue; }
        fs::create_dir_all(out.parent().unwrap()).map_err(e)?;
        std::io::copy(&mut f, &mut fs::File::create(&out).map_err(e)?).map_err(e)?;
        if i % 48 == 0 { let _ = app.emit("import-progress", serde_json::json!({"stage":"extract","pct": i as f64 / len as f64})); }
    }
    let _ = fs::remove_file(&zip_path);
    let _ = app.emit("import-progress", serde_json::json!({"stage":"validate","pct":1.0}));
    let res = describe(&dest)?;
    let _ = app.emit("import-progress", serde_json::json!({"stage":"done","pct":1.0}));
    Ok(res)
}

#[tauri::command]
pub fn list_resources(app: AppHandle) -> Result<Vec<Resource>, String> {
    let root = data_root(&app)?;
    let mut v: Vec<Resource> = fs::read_dir(&root).into_iter().flatten()
        .filter_map(|x| x.ok()).map(|x| x.path()).filter(|p| p.is_dir())
        .filter(|p| !p.file_name().unwrap().to_string_lossy().starts_with('.'))
        .filter_map(|p| describe(&p).ok()).collect();
    v.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(v)
}

#[tauri::command]
pub fn delete_resource(app: AppHandle, folder: String) -> Result<String, String> {
    if folder.contains('/') || folder.contains("..") { return Err("bad folder".into()); }
    let root = data_root(&app)?;
    let dir = root.join(&folder);
    if !dir.is_dir() { return Err("pack not found".into()); }
    let trash_dir = root.join(".trash");
    fs::create_dir_all(&trash_dir).map_err(e)?;
    let name = format!("{folder}__{}", now());
    fs::rename(&dir, trash_dir.join(&name)).map_err(e)?;
    Ok(name)
}

#[tauri::command]
pub fn restore_resource(app: AppHandle, trash: String) -> Result<String, String> {
    if trash.contains('/') || trash.contains("..") { return Err("bad name".into()); }
    let root = data_root(&app)?;
    let src = root.join(".trash").join(&trash);
    let folder = trash.rsplit_once("__").map(|(f, _)| f).unwrap_or(&trash).to_string();
    let dest = root.join(&folder);
    if dest.exists() { return Err("a pack with this folder already exists".into()); }
    fs::rename(&src, &dest).map_err(e)?;
    Ok(folder)
}

fn dir_size(p: &Path) -> u64 {
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(p) {
        for x in rd.flatten() {
            let path = x.path();
            if path.is_dir() { n += dir_size(&path); }
            else { n += x.metadata().map(|m| m.len()).unwrap_or(0); }
        }
    }
    n
}

#[tauri::command]
pub fn storage_usage(app: AppHandle) -> Result<u64, String> {
    let base = app.path().app_data_dir().map_err(e)?;
    Ok(dir_size(&base))
}
