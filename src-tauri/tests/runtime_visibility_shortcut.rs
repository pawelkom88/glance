#[path = "../src/sessions.rs"]
mod sessions;

use tempfile::tempdir;

#[test]
fn runtime_visibility_shortcut_preserves_running_flag_roundtrip() {
    let dir = tempdir().expect("temp dir");
    let root = dir.path();

    let created = sessions::create_session(root, "Visibility Session".to_string()).expect("create");
    let mut loaded = sessions::load_session(root, created.id.clone()).expect("load");

    loaded.meta.scroll.running = true;
    loaded.meta.scroll.position = 120.0;

    sessions::save_session(
        root,
        loaded.id.clone(),
        loaded.markdown.clone(),
        loaded.meta.clone(),
    )
    .expect("save running");

    let running_loaded = sessions::load_session(root, created.id.clone()).expect("reload running");
    assert!(running_loaded.meta.scroll.running);
    assert_eq!(running_loaded.meta.scroll.position, 120.0);

    let mut paused_meta = running_loaded.meta.clone();
    paused_meta.scroll.running = false;

    sessions::save_session(
        root,
        created.id.clone(),
        running_loaded.markdown,
        paused_meta,
    )
    .expect("save paused");

    let paused_loaded = sessions::load_session(root, created.id).expect("reload paused");
    assert!(!paused_loaded.meta.scroll.running);

    let folders = sessions::list_folders(root).expect("list folders");
    assert!(folders.is_empty());
}
