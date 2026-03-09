use crate::offline_license;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const ACCOUNT_NAME: &str = "license-key-v1";
const DEFAULT_PRODUCT_ID: &str = "glance-pro";
const LICENSE_BYPASS_ENV: &str = "GLANCE_LICENSE_DEV_BYPASS";
const PRODUCT_ID_ENV: &str = "GLANCE_LICENSE_PRODUCT_ID";
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
    product_id: String,
    dev_bypass_enabled: bool,
}

impl LicenseConfig {
    fn from_app(app: &AppHandle) -> Self {
        let product_id = std::env::var(PRODUCT_ID_ENV)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| String::from(DEFAULT_PRODUCT_ID));

        Self {
            bundle_id: app.config().identifier.clone(),
            product_id,
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
        return Ok(LicenseStatus {
            state: LicenseState::Licensed,
            license_id: Some(String::from("developer-bypass")),
        });
    }

    let receipt_path = receipt_path(&app)?;
    let saved_key = load_saved_license_key(&receipt_path)?;
    let Some(saved_key) = saved_key else {
        return Ok(unlicensed_status());
    };

    match offline_license::verify_license_key_for_product(&saved_key, &config.product_id) {
        Ok(verified) => Ok(LicenseStatus {
            state: LicenseState::Licensed,
            license_id: Some(verified.id),
        }),
        Err(_) => {
            clear_saved_license_key(&receipt_path)?;
            Ok(unlicensed_status())
        }
    }
}

#[tauri::command]
pub fn activate_license_key(app: AppHandle, key: String) -> Result<LicenseStatus, String> {
    let config = LicenseConfig::from_app(&app);
    let verified = offline_license::verify_license_key_for_product(&key, &config.product_id)?;
    let receipt_path = receipt_path(&app)?;
    save_license_key(&receipt_path, &key)?;

    if let Err(error) = platform::persist_license_key(&config, &key) {
        tracing::warn!("Failed to persist license key in secure storage: {error}");
    }

    Ok(LicenseStatus {
        state: LicenseState::Licensed,
        license_id: Some(verified.id),
    })
}

#[tauri::command]
pub fn clear_stored_license(app: AppHandle) -> Result<LicenseStatus, String> {
    let config = LicenseConfig::from_app(&app);
    let receipt_path = receipt_path(&app)?;
    clear_saved_license_key(&receipt_path)?;

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

fn receipt_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(app_data_dir.join(RECEIPT_DIR_NAME).join(RECEIPT_FILE_NAME))
}

fn save_license_key(path: &Path, key: &str) -> Result<(), String> {
    let trimmed_key = key.trim();
    if trimmed_key.is_empty() {
        return Err(String::from("Please paste your license key."));
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(path, trimmed_key.as_bytes()).map_err(|error| error.to_string())
}

fn load_saved_license_key(path: &Path) -> Result<Option<String>, String> {
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

fn clear_saved_license_key(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
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

    #[allow(dead_code)]
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

    pub fn clear_license_key(_config: &LicenseConfig) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{clear_saved_license_key, load_saved_license_key, save_license_key};
    use tempfile::tempdir;

    #[test]
    fn saved_license_keys_roundtrip_with_trimmed_whitespace() {
        let dir = tempdir().expect("temp dir");
        let receipt_path = dir.path().join("license").join("license-key.txt");

        save_license_key(&receipt_path, "  signed-license-key  ").expect("save license key");
        let restored = load_saved_license_key(&receipt_path).expect("load license key");

        assert_eq!(restored, Some(String::from("signed-license-key")));
    }

    #[test]
    fn clearing_a_missing_saved_license_is_a_noop() {
        let dir = tempdir().expect("temp dir");
        let receipt_path = dir.path().join("license").join("missing.txt");

        clear_saved_license_key(&receipt_path).expect("clear missing file");
        let restored = load_saved_license_key(&receipt_path).expect("load license key");

        assert_eq!(restored, None);
    }
}
