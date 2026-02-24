use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const INDEX_FILE: &str = "index.json";
const CONTENT_FILE: &str = "content.md";
const META_FILE: &str = "meta.json";

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
}

impl Default for OverlayPreferences {
    fn default() -> Self {
        Self { font_scale: 1.0 }
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionData {
    pub id: String,
    pub markdown: String,
    pub meta: SessionMeta,
}

pub fn ensure_storage(session_root: &Path) -> Result<(), String> {
    fs::create_dir_all(session_root).map_err(|error| error.to_string())?;

    let index_path = session_root.join(INDEX_FILE);
    if !index_path.exists() {
        write_index(session_root, &[])?;
    }

    Ok(())
}

pub fn list_sessions(session_root: &Path) -> Result<Vec<SessionSummary>, String> {
    ensure_storage(session_root)?;
    let mut index = read_index(session_root)?;
    index.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(index)
}

pub fn create_session(session_root: &Path, name: String) -> Result<SessionSummary, String> {
    ensure_storage(session_root)?;
    let mut index = read_index(session_root)?;
    let title = next_available_title(&name, &index);

    let summary = create_session_files(session_root, &title, default_markdown(&title))?;
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

    let summary = create_session_files(session_root, &title, markdown)?;
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

    let summary = create_session_files(session_root, &copy_title, source_data.markdown)?;
    index.push(summary.clone());
    write_index(session_root, &index)?;

    Ok(summary)
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
    let meta: SessionMeta = read_json(session_dir.join(META_FILE))?;

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

    fs::write(session_dir.join(CONTENT_FILE), markdown).map_err(|error| error.to_string())?;
    write_json(session_dir.join(META_FILE), &meta)?;

    let mut index = read_index(session_root)?;
    if let Some(found) = index.iter_mut().find(|session| session.id == id) {
        found.title = meta.title;
        found.updated_at = meta.updated_at;
        found.last_opened_at = meta.last_opened_at;
    } else {
        index.push(SessionSummary {
            id,
            title: meta.title,
            created_at: meta.created_at,
            updated_at: meta.updated_at,
            last_opened_at: meta.last_opened_at,
        });
    }

    write_index(session_root, &index)
}

fn create_session_files(
    session_root: &Path,
    title: &str,
    markdown: String,
) -> Result<SessionSummary, String> {
    let now = Utc::now().to_rfc3339();
    let id = format!("{}-{}", Utc::now().timestamp_millis(), slugify(title));
    let summary = SessionSummary {
        id: id.clone(),
        title: title.to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
        last_opened_at: now,
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_persistence_non_ascii() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        
        let markdown = "# Hello 🌍\n\n- Zażółć gęślą jaźń\n- 漢字";
        let summary = create_session_from_markdown(root, "Intl Session".to_string(), markdown.to_string()).unwrap();
        
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
        
        save_session(root, summary.id.clone(), data.markdown.clone(), data.meta.clone()).unwrap();
        
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
            save_session(root, summary.id.clone(), data.markdown.clone(), data.meta.clone()).unwrap();
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
}
