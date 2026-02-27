use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const INDEX_FILE: &str = "index.json";
const CONTENT_FILE: &str = "content.md";
const META_FILE: &str = "meta.json";
const FOLDERS_FILE: &str = "folders.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollState {
    pub position: f64,
    pub speed: f64,
    pub running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayPreferences {
    pub font_scale: f64,
    #[serde(default)]
    pub show_reading_ruler: Option<bool>,
}

impl Default for OverlayPreferences {
    fn default() -> Self {
        Self {
            font_scale: 1.0,
            show_reading_ruler: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub word_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: String,
    pub scroll: ScrollState,
    #[serde(default)]
    pub overlay: OverlayPreferences,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub word_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionData {
    pub id: String,
    pub markdown: String,
    pub meta: SessionMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFolder {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn ensure_storage(session_root: &Path) -> Result<(), String> {
    fs::create_dir_all(session_root).map_err(|error| error.to_string())?;

    let index_path = session_root.join(INDEX_FILE);
    if !index_path.exists() {
        write_index(session_root, &[])?;
    }

    let readme_path = session_root.join("README_BACKUPS.txt");
    if !readme_path.exists() {
        let content = "Glance Backup & Storage Guide\n\
                       ============================\n\n\
                       This folder contains your Glance sessions and backups.\n\n\
                       - Each subfolder (e.g. '123456-My-Script') is a session.\n\
                       - 'content.md' is your current script.\n\
                       - '.bak.1' through '.bak.5' are automatic prior versions.\n\n\
                       TO RESTORE A BACKUP:\n\
                       1. Close Glance.\n\
                       2. In a session folder, rename 'content.md' to 'content-broken.md'.\n\
                       3. Rename your preferred backup file (e.g. 'content.md.bak.1') to 'content.md'.\n\
                       4. Re-open Glance.\n\n\
                       Note: Keep these files local. Do not move or rename the ID prefixes\n\
                       in folder names, as Glance uses them to track your library.";
        let _ = fs::write(readme_path, content);
    }
    let folders_path = session_root.join(FOLDERS_FILE);
    if !folders_path.exists() {
        write_folders(session_root, &[])?;
    }

    Ok(())
}

pub fn list_sessions(session_root: &Path) -> Result<Vec<SessionSummary>, String> {
    ensure_storage(session_root)?;
    let mut index = read_index(session_root)?;
    let mut has_index_updates = false;

    for summary in &mut index {
        if summary.word_count == 0 {
            let content_path = session_root.join(&summary.id).join(CONTENT_FILE);
            if let Ok(markdown) = fs::read_to_string(content_path) {
                summary.word_count = count_words(&markdown);
                has_index_updates = true;
            }
        }
    }

    if has_index_updates {
        write_index(session_root, &index)?;
    }

    index.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(index)
}

pub fn list_folders(session_root: &Path) -> Result<Vec<SessionFolder>, String> {
    ensure_storage(session_root)?;
    let mut folders = read_folders(session_root)?;
    folders.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(folders)
}

pub fn create_session(session_root: &Path, name: String) -> Result<SessionSummary, String> {
    ensure_storage(session_root)?;
    let mut index = read_index(session_root)?;
    let title = next_available_title(&name, &index);

    let summary = create_session_files(session_root, &title, default_markdown(&title), None)?;
    index.push(summary.clone());
    write_index(session_root, &index)?;

    Ok(summary)
}

pub fn create_session_from_markdown(
    session_root: &Path,
    name: String,
    markdown: String,
) -> Result<SessionSummary, String> {
    ensure_storage(session_root)?;
    let mut index = read_index(session_root)?;
    let title = next_available_title(&name, &index);

    let summary = create_session_files(session_root, &title, markdown, None)?;
    index.push(summary.clone());
    write_index(session_root, &index)?;

    Ok(summary)
}

pub fn duplicate_session(session_root: &Path, id: String) -> Result<SessionSummary, String> {
    ensure_storage(session_root)?;
    let mut index = read_index(session_root)?;
    let source = index
        .iter()
        .find(|session| session.id == id)
        .cloned()
        .ok_or_else(|| String::from("Session not found"))?;

    let source_data = load_session(session_root, source.id)?;
    let copy_title_seed = format!("{} Copy", source.title);
    let copy_title = next_available_title(&copy_title_seed, &index);

    let summary = create_session_files(
        session_root,
        &copy_title,
        source_data.markdown,
        source_data.meta.folder_id.or(source.folder_id),
    )?;
    index.push(summary.clone());
    write_index(session_root, &index)?;

    Ok(summary)
}

pub fn create_folder(session_root: &Path, name: String) -> Result<SessionFolder, String> {
    ensure_storage(session_root)?;

    let mut folders = read_folders(session_root)?;
    let folder_name = next_available_folder_name(name.as_str(), &folders, None)?;
    let now = Utc::now().to_rfc3339();
    let id = format!("folder-{}-{}", Utc::now().timestamp_millis(), slugify(&folder_name));
    let folder = SessionFolder {
        id,
        name: folder_name,
        created_at: now.clone(),
        updated_at: now,
    };

    folders.push(folder.clone());
    write_folders(session_root, &folders)?;

    Ok(folder)
}

pub fn rename_folder(session_root: &Path, id: String, name: String) -> Result<SessionFolder, String> {
    ensure_storage(session_root)?;

    let mut folders = read_folders(session_root)?;
    let next_name = next_available_folder_name(name.as_str(), &folders, Some(id.as_str()))?;
    let now = Utc::now().to_rfc3339();
    let folder = folders
        .iter_mut()
        .find(|folder| folder.id == id)
        .ok_or_else(|| String::from("Folder not found"))?;

    folder.name = next_name;
    folder.updated_at = now;
    let updated = folder.clone();

    write_folders(session_root, &folders)?;
    Ok(updated)
}

pub fn delete_folder(session_root: &Path, id: String) -> Result<(), String> {
    ensure_storage(session_root)?;

    let mut folders = read_folders(session_root)?;
    let previous_len = folders.len();
    folders.retain(|folder| folder.id != id);
    if previous_len == folders.len() {
        return Err(String::from("Folder not found"));
    }

    write_folders(session_root, &folders)?;

    let mut index = read_index(session_root)?;
    let mut index_updated = false;
    let mut affected_ids: Vec<String> = Vec::new();
    for session in &mut index {
        if session.folder_id.as_deref() == Some(id.as_str()) {
            session.folder_id = None;
            index_updated = true;
            affected_ids.push(session.id.clone());
        }
    }
    if index_updated {
        write_index(session_root, &index)?;
    }

    for affected_id in &affected_ids {
        let meta_path = session_root.join(affected_id).join(META_FILE);
        if !meta_path.exists() {
            continue;
        }

        let mut meta: SessionMeta = match read_json(meta_path.clone()) {
            Ok(existing) => existing,
            Err(_) => continue,
        };

        if meta.folder_id.is_some() {
            meta.folder_id = None;
            let _ = write_json(meta_path, &meta);
        }
    }

    Ok(())
}

pub fn move_sessions_to_folder(
    session_root: &Path,
    session_ids: Vec<String>,
    folder_id: Option<String>,
) -> Result<usize, String> {
    ensure_storage(session_root)?;

    if let Some(ref target_folder_id) = folder_id {
        let folders = read_folders(session_root)?;
        if !folders.iter().any(|folder| folder.id == *target_folder_id) {
            return Err(String::from("Folder not found"));
        }
    }

    if session_ids.is_empty() {
        return Ok(0);
    }

    let target_ids: HashSet<&str> = session_ids.iter().map(String::as_str).collect();

    let mut index = read_index(session_root)?;
    let mut affected_ids: Vec<String> = Vec::new();

    for summary in &mut index {
        if !target_ids.contains(summary.id.as_str()) {
            continue;
        }
        summary.folder_id = folder_id.clone();
        affected_ids.push(summary.id.clone());
    }

    if affected_ids.is_empty() {
        return Ok(0);
    }

    write_index(session_root, &index)?;

    for affected_id in &affected_ids {
        let meta_path = session_root.join(affected_id).join(META_FILE);
        if !meta_path.exists() {
            continue;
        }

        let mut meta: SessionMeta = match read_json(meta_path.clone()) {
            Ok(existing) => existing,
            Err(_) => continue,
        };
        meta.folder_id = folder_id.clone();
        let _ = write_json(meta_path, &meta);
    }

    Ok(affected_ids.len())
}

pub fn delete_session(session_root: &Path, id: String) -> Result<(), String> {
    ensure_storage(session_root)?;

    let session_dir = session_root.join(&id);
    if session_dir.exists() {
        fs::remove_dir_all(session_dir).map_err(|error| error.to_string())?;
    }

    let next_index = read_index(session_root)?
        .into_iter()
        .filter(|session| session.id != id)
        .collect::<Vec<_>>();

    write_index(session_root, &next_index)
}

pub fn export_session_markdown(session_root: &Path, id: String) -> Result<String, String> {
    ensure_storage(session_root)?;
    let session_dir = session_root.join(id);
    fs::read_to_string(session_dir.join(CONTENT_FILE)).map_err(|error| error.to_string())
}

pub fn load_session(session_root: &Path, id: String) -> Result<SessionData, String> {
    ensure_storage(session_root)?;

    let session_dir = session_root.join(&id);
    let markdown =
        fs::read_to_string(session_dir.join(CONTENT_FILE)).map_err(|error| error.to_string())?;
    let mut meta: SessionMeta = read_json(session_dir.join(META_FILE))?;
    if meta.word_count == 0 {
        meta.word_count = count_words(&markdown);
    }

    Ok(SessionData { id, markdown, meta })
}

fn rotate_backups(session_dir: &Path, base_name: &str) -> Result<(), String> {
    let max_backups = 5;

    // Shift existing backups: .5 -> deleted (implicitly by move), .4 -> .5, ..., .1 -> .2
    for i in (1..max_backups).rev() {
        let current_backup = session_dir.join(format!("{}.bak.{}", base_name, i));
        let next_backup = session_dir.join(format!("{}.bak.{}", base_name, i + 1));

        if current_backup.exists() {
            let _ = fs::rename(&current_backup, &next_backup);
        }
    }

    // Move current file to .1
    let current_file = session_dir.join(base_name);
    let first_backup = session_dir.join(format!("{}.bak.1", base_name));

    if current_file.exists() {
        let _ = fs::rename(&current_file, &first_backup);
    }

    Ok(())
}

pub fn restore_from_backup(backup_path: &Path) -> Result<(), String> {
    if !backup_path.exists() {
        return Err(String::from("Backup file does not exist"));
    }

    let session_dir = backup_path
        .parent()
        .ok_or_else(|| String::from("Invalid backup path"))?;
    let content_path = session_dir.join(CONTENT_FILE);

    // Create a safety backup of the current version if it exists
    if content_path.exists() {
        let safety_path = session_dir.join(format!("{}.restored_at_{}", CONTENT_FILE, Utc::now().timestamp()));
        fs::copy(&content_path, safety_path).map_err(|e| e.to_string())?;
    }

    // Copy the backup to the content file
    fs::copy(backup_path, content_path).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn save_session(
    session_root: &Path,
    id: String,
    markdown: String,
    meta: SessionMeta,
) -> Result<(), String> {
    ensure_storage(session_root)?;

    let session_dir = session_root.join(&id);
    fs::create_dir_all(&session_dir).map_err(|error| error.to_string())?;

    // Create backups before overwriting
    let _ = rotate_backups(&session_dir, CONTENT_FILE);
    let _ = rotate_backups(&session_dir, META_FILE);

    let mut next_meta = meta;
    next_meta.word_count = count_words(&markdown);

    fs::write(session_dir.join(CONTENT_FILE), markdown).map_err(|error| error.to_string())?;
    write_json(session_dir.join(META_FILE), &next_meta)?;

    let mut index = read_index(session_root)?;
    if let Some(found) = index.iter_mut().find(|session| session.id == id) {
        found.title = next_meta.title.clone();
        found.updated_at = next_meta.updated_at.clone();
        found.last_opened_at = next_meta.last_opened_at.clone();
        found.folder_id = next_meta.folder_id.clone();
        found.word_count = next_meta.word_count;
    } else {
        index.push(SessionSummary {
            id,
            title: next_meta.title.clone(),
            created_at: next_meta.created_at.clone(),
            updated_at: next_meta.updated_at.clone(),
            last_opened_at: next_meta.last_opened_at.clone(),
            folder_id: next_meta.folder_id.clone(),
            word_count: next_meta.word_count,
        });
    }

    write_index(session_root, &index)
}

fn create_session_files(
    session_root: &Path,
    title: &str,
    markdown: String,
    folder_id: Option<String>,
) -> Result<SessionSummary, String> {
    let now = Utc::now().to_rfc3339();
    let id = format!("{}-{}", Utc::now().timestamp_millis(), slugify(title));
    let word_count = count_words(&markdown);
    let summary = SessionSummary {
        id: id.clone(),
        title: title.to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
        last_opened_at: now,
        folder_id: folder_id.clone(),
        word_count,
    };

    let session_dir = session_root.join(&id);
    fs::create_dir_all(&session_dir).map_err(|error| error.to_string())?;
    fs::write(session_dir.join(CONTENT_FILE), markdown).map_err(|error| error.to_string())?;

    let meta = SessionMeta {
        id,
        title: title.to_string(),
        created_at: summary.created_at.clone(),
        updated_at: summary.updated_at.clone(),
        last_opened_at: summary.last_opened_at.clone(),
        scroll: ScrollState {
            position: 0.0,
            speed: 42.0,
            running: false,
        },
        overlay: OverlayPreferences::default(),
        folder_id,
        word_count,
    };

    write_json(session_dir.join(META_FILE), &meta)?;

    Ok(summary)
}

fn read_index(session_root: &Path) -> Result<Vec<SessionSummary>, String> {
    let index_path = session_root.join(INDEX_FILE);
    if !index_path.exists() {
        return Ok(vec![]);
    }

    read_json(index_path)
}

fn write_index(session_root: &Path, index: &[SessionSummary]) -> Result<(), String> {
    write_json(session_root.join(INDEX_FILE), index)
}

fn read_folders(session_root: &Path) -> Result<Vec<SessionFolder>, String> {
    let folder_path = session_root.join(FOLDERS_FILE);
    if !folder_path.exists() {
        return Ok(vec![]);
    }

    read_json(folder_path)
}

fn write_folders(session_root: &Path, folders: &[SessionFolder]) -> Result<(), String> {
    write_json(session_root.join(FOLDERS_FILE), folders)
}

fn next_available_title(seed: &str, index: &[SessionSummary]) -> String {
    let normalized_seed = seed.trim();
    if normalized_seed.is_empty() {
        return String::from("Untitled Session");
    }

    let title_exists = |title: &str| {
        index
            .iter()
            .any(|session| session.title.eq_ignore_ascii_case(title))
    };

    if !title_exists(normalized_seed) {
        return normalized_seed.to_string();
    }

    (2..1000)
        .map(|number| format!("{normalized_seed} ({number})"))
        .find(|candidate| !title_exists(candidate))
        .unwrap_or_else(|| format!("{normalized_seed} ({})", Utc::now().timestamp_millis()))
}

fn next_available_folder_name(
    seed: &str,
    folders: &[SessionFolder],
    current_id: Option<&str>,
) -> Result<String, String> {
    let normalized_seed = seed.trim();
    if normalized_seed.is_empty() {
        return Err(String::from("Folder name cannot be empty"));
    }

    let name_exists = |name: &str| {
        folders
            .iter()
            .filter(|folder| match current_id {
                Some(current) => folder.id != current,
                None => true,
            })
            .any(|folder| folder.name.eq_ignore_ascii_case(name))
    };

    if !name_exists(normalized_seed) {
        return Ok(normalized_seed.to_string());
    }

    Ok((2..1000)
        .map(|number| format!("{normalized_seed} ({number})"))
        .find(|candidate| !name_exists(candidate))
        .unwrap_or_else(|| format!("{normalized_seed} ({})", Utc::now().timestamp_millis())))
}

fn read_json<T: for<'de> Deserialize<'de>>(path: PathBuf) -> Result<T, String> {
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_json<T: Serialize + ?Sized>(path: PathBuf, value: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

fn slugify(value: &str) -> String {
    let normalized = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();

    normalized
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn default_markdown(title: &str) -> String {
    format!(
    "# {title}\n\n- Add your opening lines\n\n# Key Points\n\n- Add your strongest bullets\n\n# Closing\n\n- Add your close"
  )
}

fn count_words(markdown: &str) -> usize {
    markdown.split_whitespace().filter(|chunk| !chunk.is_empty()).count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tempfile::tempdir;

    #[test]
    fn test_persistence_non_ascii() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let markdown = "# Hello 🌍\n\n- Zażółć gęślą jaźń\n- 漢字";
        let summary =
            create_session_from_markdown(root, "Intl Session".to_string(), markdown.to_string())
                .unwrap();

        let loaded = load_session(root, summary.id).unwrap();
        assert_eq!(loaded.markdown, markdown);
        assert_eq!(loaded.meta.title, "Intl Session");
    }

    #[test]
    fn test_safe_delete_flow() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let s1 = create_session(root, "One".to_string()).unwrap();
        let s2 = create_session(root, "Two".to_string()).unwrap();

        assert_eq!(list_sessions(root).unwrap().len(), 2);

        delete_session(root, s1.id.clone()).unwrap();

        let remaining = list_sessions(root).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, s2.id);

        // Assert directory is gone
        assert!(!root.join(&s1.id).exists());
    }

    #[test]
    fn test_crash_recovery() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let summary = create_session(root, "Crash Test".to_string()).unwrap();
        let mut data = load_session(root, summary.id.clone()).unwrap();

        data.markdown = "New content".to_string();
        data.meta.scroll.position = 100.0;

        save_session(
            root,
            summary.id.clone(),
            data.markdown.clone(),
            data.meta.clone(),
        )
        .unwrap();

        // Simulate crash by creating a new reference to the same directory
        let recovered = load_session(root, summary.id).unwrap();
        assert_eq!(recovered.markdown, "New content");
        assert_eq!(recovered.meta.scroll.position, 100.0);
    }

    #[test]
    fn test_backup_rotation_policy() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let summary = create_session(root, "Backup Test".to_string()).unwrap();
        let mut data = load_session(root, summary.id.clone()).unwrap();

        for i in 1..=6 {
            data.markdown = format!("Content v{}", i);
            save_session(
                root,
                summary.id.clone(),
                data.markdown.clone(),
                data.meta.clone(),
            )
            .unwrap();
        }

        let session_dir = root.join(&summary.id);

        // After 6 saves, we should have the main file + 5 backups
        assert!(session_dir.join(CONTENT_FILE).exists());
        assert!(session_dir.join(format!("{}.bak.1", CONTENT_FILE)).exists());
        assert!(session_dir.join(format!("{}.bak.2", CONTENT_FILE)).exists());
        assert!(session_dir.join(format!("{}.bak.3", CONTENT_FILE)).exists());
        assert!(session_dir.join(format!("{}.bak.4", CONTENT_FILE)).exists());
        assert!(session_dir.join(format!("{}.bak.5", CONTENT_FILE)).exists());

        // .bak.6 should NOT exist
        assert!(!session_dir.join(format!("{}.bak.6", CONTENT_FILE)).exists());

        // Verify .bak.1 is Content v5 (since v6 is the main file)
        let bak1 = fs::read_to_string(session_dir.join(format!("{}.bak.1", CONTENT_FILE))).unwrap();
        assert_eq!(bak1, "Content v5");

        // Verify .bak.5 is Content v1
        let bak5 = fs::read_to_string(session_dir.join(format!("{}.bak.5", CONTENT_FILE))).unwrap();
        assert_eq!(bak5, "Content v1");
    }

    #[test]
    fn test_next_available_title_case_insensitive_and_blank_seed() {
        let existing = vec![SessionSummary {
            id: String::from("1"),
            title: String::from("Demo"),
            created_at: String::from("2024-01-01T00:00:00Z"),
            updated_at: String::from("2024-01-01T00:00:00Z"),
            last_opened_at: String::from("2024-01-01T00:00:00Z"),
            folder_id: None,
            word_count: 0,
        }];

        assert_eq!(next_available_title("demo", &existing), "demo (2)");
        assert_eq!(next_available_title("   ", &existing), "Untitled Session");
    }

    #[test]
    fn test_slugify_strips_non_alphanumeric_runs() {
        assert_eq!(slugify("  Hello, World! 2026  "), "hello-world-2026");
        assert_eq!(slugify("***"), "");
    }

    #[test]
    fn test_list_sessions_orders_by_updated_at_descending() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let older = create_session(root, "Older".to_string()).unwrap();
        let newer = create_session(root, "Newer".to_string()).unwrap();

        let mut older_data = load_session(root, older.id.clone()).unwrap();
        older_data.meta.updated_at = String::from("9999-01-01T00:00:00Z");
        save_session(
            root,
            older.id.clone(),
            older_data.markdown.clone(),
            older_data.meta.clone(),
        )
        .unwrap();

        let listed = list_sessions(root).unwrap();
        assert_eq!(listed.first().unwrap().id, older.id);
        assert_eq!(listed.get(1).unwrap().id, newer.id);
    }

    #[test]
    fn test_create_session_from_markdown_writes_exact_content_and_default_meta() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let markdown = "# Custom Session\n\n- Exact content";

        let summary =
            create_session_from_markdown(root, "Custom Session".to_string(), markdown.to_string())
                .unwrap();
        let loaded = load_session(root, summary.id.clone()).unwrap();

        assert_eq!(loaded.markdown, markdown);
        assert_eq!(loaded.meta.title, "Custom Session");
        assert_eq!(loaded.meta.scroll.position, 0.0);
        assert_eq!(loaded.meta.scroll.speed, 42.0);
        assert!(!loaded.meta.scroll.running);
        assert_eq!(loaded.meta.overlay.font_scale, 1.0);
        assert_eq!(loaded.meta.word_count, 6);
    }

    #[test]
    fn test_duplicate_session_handles_copy_name_collisions() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let original = create_session(root, "Pitch".to_string()).unwrap();
        std::thread::sleep(Duration::from_millis(2));
        let first_copy = duplicate_session(root, original.id.clone()).unwrap();
        std::thread::sleep(Duration::from_millis(2));
        let second_copy = duplicate_session(root, original.id.clone()).unwrap();

        assert_eq!(first_copy.title, "Pitch Copy");
        assert_eq!(second_copy.title, "Pitch Copy (2)");
    }

    #[test]
    fn test_delete_session_is_idempotent_for_missing_id() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        delete_session(root, "missing".to_string()).unwrap();
        assert_eq!(list_sessions(root).unwrap().len(), 0);

        let created = create_session(root, "Keep Me".to_string()).unwrap();
        delete_session(root, "missing-again".to_string()).unwrap();

        let listed = list_sessions(root).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, created.id);
    }

    #[test]
    fn test_save_session_updates_existing_index_and_appends_missing_entry() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let created = create_session(root, "Original".to_string()).unwrap();
        let mut loaded = load_session(root, created.id.clone()).unwrap();
        loaded.meta.title = "Renamed".to_string();
        loaded.meta.updated_at = "2026-01-01T00:00:00Z".to_string();
        loaded.meta.last_opened_at = "2026-01-01T00:00:00Z".to_string();

        save_session(
            root,
            created.id.clone(),
            loaded.markdown.clone(),
            loaded.meta.clone(),
        )
        .unwrap();

        let after_update = list_sessions(root).unwrap();
        assert_eq!(after_update.len(), 1);
        assert_eq!(after_update[0].id, created.id);
        assert_eq!(after_update[0].title, "Renamed");

        let appended_meta = SessionMeta {
            id: "manual-id".to_string(),
            title: "Manual Session".to_string(),
            created_at: "2026-02-01T00:00:00Z".to_string(),
            updated_at: "2026-02-01T00:00:00Z".to_string(),
            last_opened_at: "2026-02-01T00:00:00Z".to_string(),
            scroll: ScrollState {
                position: 0.0,
                speed: 42.0,
                running: false,
            },
            overlay: OverlayPreferences::default(),
            folder_id: None,
            word_count: 0,
        };

        save_session(
            root,
            "manual-id".to_string(),
            "# Manual Session".to_string(),
            appended_meta,
        )
        .unwrap();

        let after_append = list_sessions(root).unwrap();
        assert_eq!(after_append.len(), 2);
        assert!(after_append.iter().any(|item| item.id == "manual-id"));
    }

    #[test]
    fn test_folder_lifecycle_and_move_sessions() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let folder = create_folder(root, "Client Work".to_string()).unwrap();
        assert_eq!(folder.name, "Client Work");

        let renamed = rename_folder(root, folder.id.clone(), "Clients".to_string()).unwrap();
        assert_eq!(renamed.name, "Clients");

        let created = create_session(root, "Roadshow".to_string()).unwrap();
        let moved = move_sessions_to_folder(root, vec![created.id.clone()], Some(folder.id.clone())).unwrap();
        assert_eq!(moved, 1);

        let listed = list_sessions(root).unwrap();
        let moved_session = listed.iter().find(|session| session.id == created.id).unwrap();
        assert_eq!(moved_session.folder_id.as_deref(), Some(folder.id.as_str()));

        delete_folder(root, folder.id.clone()).unwrap();
        let after_delete = list_sessions(root).unwrap();
        let restored = after_delete.iter().find(|session| session.id == created.id).unwrap();
        assert_eq!(restored.folder_id, None);
    }

    #[test]
    fn test_export_and_load_return_errors_for_missing_or_corrupt_files() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        assert!(export_session_markdown(root, "missing".to_string()).is_err());
        assert!(load_session(root, "missing".to_string()).is_err());

        let created = create_session(root, "Corrupt".to_string()).unwrap();
        let session_dir = root.join(&created.id);
        fs::write(session_dir.join(META_FILE), "{bad-json").unwrap();
        assert!(load_session(root, created.id.clone()).is_err());

        fs::remove_file(session_dir.join(CONTENT_FILE)).unwrap();
        assert!(export_session_markdown(root, created.id).is_err());
    }

    #[test]
    fn test_restore_from_backup_logic() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // 1. Setup a session with some content
        let summary = create_session(root, "Restore Test".to_string()).unwrap();
        let session_dir = root.join(&summary.id);
        
        // 2. Create a manual backup file
        let backup_path = session_dir.join("content.md.bak.1");
        fs::write(&backup_path, "Backup Content").unwrap();
        
        // 3. Perform restoration
        restore_from_backup(&backup_path).unwrap();
        
        // 4. Verify content.md is now "Backup Content"
        let restored_content = fs::read_to_string(session_dir.join(CONTENT_FILE)).unwrap();
        assert_eq!(restored_content, "Backup Content");
        
        // 5. Verify a safety backup was created (look for any file starting with content.md.restored_at_)
        let entries = fs::read_dir(&session_dir).unwrap();
        let safety_backup_exists = entries
            .filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().starts_with("content.md.restored_at_"));
        
        assert!(safety_backup_exists, "Safety backup should have been created before destructive restore");
    }
}
