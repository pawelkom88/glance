use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const ACCOUNT_NAME: &str = "license-key-v1";
const DEVICE_ID_FILE_NAME: &str = "device-id.txt";
const LICENSE_BYPASS_ENV: &str = "GLANCE_LICENSE_DEV_BYPASS";
const RECEIPT_DIR_NAME: &str = "license";
const RECEIPT_FILE_NAME: &str = "license-key.txt";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LicenseState {
    Unlicensed,
    Licensed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub state: LicenseState,
    pub license_id: Option<String>,
}

#[derive(Debug, Clone)]
struct LicenseConfig {
    bundle_id: String,
    dev_bypass_enabled: bool,
}

impl LicenseConfig {
    fn from_app(app: &AppHandle) -> Self {
        Self {
            bundle_id: app.config().identifier.clone(),
            dev_bypass_enabled: env_flag_enabled(LICENSE_BYPASS_ENV),
        }
    }

    fn service_name(&self) -> String {
        format!("{}.license", self.bundle_id)
    }
}

#[tauri::command]
pub fn check_status(app: AppHandle) -> Result<LicenseStatus, String> {
    let config = LicenseConfig::from_app(&app);
    if config.dev_bypass_enabled {
        return Ok(licensed_status(String::from("developer-bypass")));
    }

    let saved_key = load_saved_license_key(app)?;
    Ok(match saved_key {
        Some(key) => licensed_status(masked_license_id(&key)),
        None => unlicensed_status(),
    })
}

#[tauri::command]
pub fn activate_license_key(app: AppHandle, key: String) -> Result<LicenseStatus, String> {
    store_license_key(app, key.clone())?;
    Ok(licensed_status(masked_license_id(&key)))
}

#[tauri::command]
pub fn store_license_key(app: AppHandle, key: String) -> Result<(), String> {
    let config = LicenseConfig::from_app(&app);
    let receipt_path = license_key_path(&app)?;
    save_text_value(&receipt_path, &key, "Please paste your license key.")?;

    if let Err(error) = platform::persist_license_key(&config, key.trim()) {
        tracing::warn!("Failed to persist license key in secure storage: {error}");
    }

    Ok(())
}

#[tauri::command]
pub fn load_saved_license_key(app: AppHandle) -> Result<Option<String>, String> {
    let config = LicenseConfig::from_app(&app);
    let receipt_path = license_key_path(&app)?;
    if let Some(saved_key) = load_text_value(&receipt_path)? {
        return Ok(Some(saved_key));
    }

    if let Some(saved_key) = platform::load_license_key(&config)? {
        save_text_value(&receipt_path, &saved_key, "Please paste your license key.")?;
        return Ok(Some(saved_key));
    }

    Ok(None)
}

#[tauri::command]
pub fn get_or_create_device_id(app: AppHandle) -> Result<String, String> {
    let path = device_id_path(&app)?;
    if let Some(existing) = load_text_value(&path)? {
        return Ok(existing);
    }

    let device_id = Uuid::new_v4().to_string();
    save_text_value(&path, &device_id, "Could not create a device identifier.")?;
    Ok(device_id)
}

#[tauri::command]
pub fn clear_stored_license(app: AppHandle) -> Result<LicenseStatus, String> {
    let config = LicenseConfig::from_app(&app);
    let receipt_path = license_key_path(&app)?;
    clear_text_value(&receipt_path)?;

    if let Err(error) = platform::clear_license_key(&config) {
        tracing::warn!("Failed to clear secure license key storage: {error}");
    }

    Ok(unlicensed_status())
}

fn env_flag_enabled(name: &str) -> bool {
    match std::env::var(name) {
        Ok(value) => {
            let normalized = value.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        }
        Err(_) => false,
    }
}

fn license_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(license_dir(app)?.join(RECEIPT_FILE_NAME))
}

fn device_id_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(license_dir(app)?.join(DEVICE_ID_FILE_NAME))
}

fn license_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(app_data_dir.join(RECEIPT_DIR_NAME))
}

fn save_text_value(path: &Path, value: &str, empty_value_error: &str) -> Result<(), String> {
    let trimmed_value = value.trim();
    if trimmed_value.is_empty() {
        return Err(String::from(empty_value_error));
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(path, trimmed_value.as_bytes()).map_err(|error| error.to_string())
}

fn load_text_value(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(contents) => {
            let trimmed = contents.trim().to_string();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed))
            }
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn clear_text_value(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn masked_license_id(key: &str) -> String {
    let trimmed_key = key.trim();
    if trimmed_key.len() <= 4 {
        return trimmed_key.to_string();
    }

    trimmed_key[trimmed_key.len() - 4..].to_string()
}

fn licensed_status(license_id: String) -> LicenseStatus {
    LicenseStatus {
        state: LicenseState::Licensed,
        license_id: Some(license_id),
    }
}

fn unlicensed_status() -> LicenseStatus {
    LicenseStatus {
        state: LicenseState::Unlicensed,
        license_id: None,
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::LicenseConfig;
    use security_framework::passwords::{
        delete_generic_password, generic_password, set_generic_password, PasswordOptions,
    };

    use super::ACCOUNT_NAME;
    const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

    pub fn persist_license_key(config: &LicenseConfig, key: &str) -> Result<(), String> {
        set_generic_password(&config.service_name(), ACCOUNT_NAME, key.trim().as_bytes())
            .map_err(|error| format!("Keychain write failed ({}).", error.code()))
    }

    pub fn load_license_key(config: &LicenseConfig) -> Result<Option<String>, String> {
        let options = PasswordOptions::new_generic_password(&config.service_name(), ACCOUNT_NAME);
        match generic_password(options) {
            Ok(bytes) => String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| String::from("Saved Keychain value was not valid UTF-8.")),
            Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(None),
            Err(error) => Err(format!("Keychain read failed ({}).", error.code())),
        }
    }

    pub fn clear_license_key(config: &LicenseConfig) -> Result<(), String> {
        match delete_generic_password(&config.service_name(), ACCOUNT_NAME) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(()),
            Err(error) => Err(format!("Keychain delete failed ({}).", error.code())),
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::LicenseConfig;

    pub fn persist_license_key(_config: &LicenseConfig, _key: &str) -> Result<(), String> {
        Ok(())
    }

    pub fn load_license_key(_config: &LicenseConfig) -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn clear_license_key(_config: &LicenseConfig) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{clear_text_value, load_text_value, masked_license_id, save_text_value};
    use tempfile::tempdir;

    #[test]
    fn saved_license_keys_roundtrip_with_trimmed_whitespace() {
        let dir = tempdir().expect("temp dir");
        let receipt_path = dir.path().join("license").join("license-key.txt");

        save_text_value(&receipt_path, "  signed-license-key  ", "missing")
            .expect("save license key");
        let restored = load_text_value(&receipt_path).expect("load license key");

        assert_eq!(restored, Some(String::from("signed-license-key")));
    }

    #[test]
    fn clearing_a_missing_saved_license_is_a_noop() {
        let dir = tempdir().expect("temp dir");
        let receipt_path = dir.path().join("license").join("missing.txt");

        clear_text_value(&receipt_path).expect("clear missing file");
        let restored = load_text_value(&receipt_path).expect("load license key");

        assert_eq!(restored, None);
    }

    #[test]
    fn license_identifier_uses_last_four_characters() {
        assert_eq!(masked_license_id("GLANCE-ABCD-EFGH-IJKL-3C49"), "3C49");
    }
}
