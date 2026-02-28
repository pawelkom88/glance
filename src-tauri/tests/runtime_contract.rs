#[path = "../src/sessions.rs"]
mod sessions;

use tempfile::tempdir;

#[test]
fn runtime_contract_session_roundtrip_includes_scroll_and_overlay_defaults() {
    let dir = tempdir().expect("temp dir");
    let root = dir.path();

    let created = sessions::create_session_from_markdown(
        root,
        "Runtime Contract".to_string(),
        "# Runtime Contract\n\nBody text".to_string(),
    )
    .expect("create session");

    let loaded = sessions::load_session(root, created.id).expect("load session");

    assert_eq!(loaded.meta.scroll.speed, 42.0);
    assert_eq!(loaded.meta.scroll.position, 0.0);
    assert!(!loaded.meta.scroll.running);
    assert_eq!(loaded.meta.overlay.font_scale, 1.0);
    assert_eq!(loaded.meta.word_count, 5);

    let folders = sessions::list_folders(root).expect("list folders");
    assert!(folders.is_empty());
}

#[test]
fn runtime_contract_session_index_remains_usable_after_save_update() {
    let dir = tempdir().expect("temp dir");
    let root = dir.path();

    let created = sessions::create_session(root, "Contract Session".to_string()).expect("create");
    let mut loaded = sessions::load_session(root, created.id.clone()).expect("load");

    loaded.meta.title = "Contract Session Updated".to_string();
    loaded.meta.updated_at = "2026-01-01T00:00:00Z".to_string();

    sessions::save_session(
        root,
        loaded.id.clone(),
        "# Contract Session Updated\n\nUpdated body".to_string(),
        loaded.meta.clone(),
    )
    .expect("save");

    let listed = sessions::list_sessions(root).expect("list");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].title, "Contract Session Updated");
    assert_eq!(listed[0].word_count, 6);
}
