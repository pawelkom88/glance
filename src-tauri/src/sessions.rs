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
  let markdown = fs::read_to_string(session_dir.join(CONTENT_FILE)).map_err(|error| error.to_string())?;
  let meta: SessionMeta = read_json(session_dir.join(META_FILE))?;

  Ok(SessionData { id, markdown, meta })
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

fn create_session_files(session_root: &Path, title: &str, markdown: String) -> Result<SessionSummary, String> {
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
