#[path = "../src/sessions.rs"]
mod sessions;

use std::fs;
use tempfile::tempdir;

#[test]
fn runtime_session_restore_restores_backup_content_and_keeps_safety_snapshot() {
    let dir = tempdir().expect("temp dir");
    let root = dir.path();

    let created = sessions::create_session(root, "Restore Session".to_string()).expect("create");
    let session_dir = root.join(&created.id);

    sessions::save_session(
        root,
        created.id.clone(),
        "Current content".to_string(),
        sessions::SessionMeta {
            id: created.id.clone(),
            title: created.title.clone(),
            created_at: created.created_at.clone(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            last_opened_at: "2026-01-01T00:00:00Z".to_string(),
            scroll: sessions::ScrollState {
                position: 40.0,
                speed: 1.2,
                running: true,
            },
            overlay: sessions::OverlayPreferences {
                font_scale: 1.2,
                show_reading_ruler: Some(false),
            },
            folder_id: None,
            word_count: 0,
        },
    )
    .expect("save current content");

    let backup_path = session_dir.join("content.md.bak.1");
    fs::write(&backup_path, "Recovered backup content").expect("write backup");

    sessions::restore_from_backup(&backup_path).expect("restore");

    let content = fs::read_to_string(session_dir.join("content.md")).expect("read content");
    assert_eq!(content, "Recovered backup content");

    let safety_backup_exists = fs::read_dir(&session_dir)
        .expect("read dir")
        .filter_map(Result::ok)
        .any(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|name| name.starts_with("content.md.restored_at_"))
                .unwrap_or(false)
        });

    assert!(safety_backup_exists);
}

#[test]
fn runtime_session_restore_returns_error_for_missing_backup_file() {
    let dir = tempdir().expect("temp dir");
    let root = dir.path();
    let missing = root.join("missing.bak");

    let result = sessions::restore_from_backup(&missing);

    assert!(result.is_err());

    let folders = sessions::list_folders(root).expect("list folders");
    assert!(folders.is_empty());
}
