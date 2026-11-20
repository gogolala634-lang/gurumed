mod import;
mod bank;
mod seed;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            seed::ensure(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import::app_data_dir, import::import_zip, import::list_resources,
            import::delete_resource, import::restore_resource, import::storage_usage,
            bank::qbank_meta, bank::pool_count, bank::build_session, bank::get_question,
            bank::save_answer, bank::toggle_mark,
            bank::flash_decks, bank::flash_cards, bank::set_card_known,
            bank::lib_toc, bank::lib_doc, bank::lib_search, bank::lib_siblings,
            bank::toggle_bookmark, bank::list_bookmarks,
            bank::stats, bank::reset_progress
        ])
        .run(tauri::generate_context!())
        .expect("error while running MedGURU");
}
