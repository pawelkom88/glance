use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const ACCOUNT_NAME: &str = "license-key-v1";
const DEVICE_ID_FILE_NAME: &str = "device-id.txt";
const ACTIVATION_FILE_NAME: &str = "activation.json";
const TRIAL_FILE_NAME: &str = "trial.json";
const LICENSE_BYPASS_ENV: &str = "GLANCE_LICENSE_DEV_BYPASS";
const LICENSE_DEV_STATE_ENV: &str = "GLANCE_LICENSE_DEV_STATE";
const LICENSE_PUBLIC_KEY_ENV: &str = "GLANCE_LICENSE_PUBLIC_KEY";
const PRODUCT_HUNT_CHANNEL: &str = "product_hunt";
const TRIAL_DAYS_ENV: &str = "GLANCE_TRIAL_DAYS";
const RECEIPT_DIR_NAME: &str = "license";
const RECEIPT_FILE_NAME: &str = "license-key.txt";
const ACTIVATION_TOKEN_VERSION: u8 = 1;
const DEFAULT_TRIAL_DAYS: i64 = 7;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LicenseState {
    Unlicensed,
    Licensed,
    TrialActive,
    TrialExpired,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub state: LicenseState,
    pub license_id: Option<String>,
    #[serde(default)]
    pub trial_started_at: Option<String>,
    #[serde(default)]
    pub trial_expires_at: Option<String>,
    #[serde(default)]
    pub trial_days_remaining: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActivationRecord {
    pub license_id: String,
    pub device_id: String,
    pub platform: String,
    pub activated_at: String,
    #[serde(default)]
    pub activation_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ActivationTokenClaims {
    pub version: u8,
    pub license_id: String,
    pub device_id: String,
    pub platform: String,
    pub issued_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TrialSource {
    ProductHunt,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TrialRecord {
    pub started_at: String,
    pub expires_at: String,
    pub source: TrialSource,
    #[serde(default)]
    pub activated_license_id: Option<String>,
}

#[derive(Debug, Clone)]
struct LicenseConfig {
    bundle_id: String,
    dev_bypass_enabled: bool,
    trial_enabled: bool,
}

impl LicenseConfig {
    fn from_app(app: &AppHandle) -> Self {
        Self {
            bundle_id: app.config().identifier.clone(),
            dev_bypass_enabled: env_flag_enabled(LICENSE_BYPASS_ENV),
            trial_enabled: build_channel() == PRODUCT_HUNT_CHANNEL,
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

    let saved_key = load_saved_license_key(app.clone())?;
    Ok(match saved_key {
        Some(key) => licensed_status(masked_license_id(&key)),
        None => load_trial_status_with_config(&app, &config)?.unwrap_or_else(unlicensed_status),
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

    if let Err(error) = mark_trial_record_as_activated(&trial_record_path(&app)?, masked_license_id(&key)) {
        tracing::warn!("Failed to update trial conversion state: {error}");
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
pub fn store_activation_record(app: AppHandle, record: ActivationRecord) -> Result<(), String> {
    let path = activation_record_path(&app)?;
    save_json_value(&path, &record)
}

#[tauri::command]
pub fn load_activation_record(app: AppHandle) -> Result<Option<ActivationRecord>, String> {
    let path = activation_record_path(&app)?;
    load_json_value(&path)
}

#[tauri::command]
pub fn clear_activation_record(app: AppHandle) -> Result<(), String> {
    clear_text_value(&activation_record_path(&app)?)
}

#[tauri::command]
pub fn load_trial_status(app: AppHandle) -> Result<Option<LicenseStatus>, String> {
    let config = LicenseConfig::from_app(&app);
    load_trial_status_with_config(&app, &config)
}

#[tauri::command]
pub fn start_trial(app: AppHandle) -> Result<LicenseStatus, String> {
    let config = LicenseConfig::from_app(&app);
    if !config.trial_enabled {
        return Err(String::from("Free trial is not available in this build."));
    }

    let status = start_trial_at_path(
        &trial_record_path(&app)?,
        configured_trial_days(),
        Utc::now(),
    )?;
    Ok(status)
}

#[tauri::command]
pub fn clear_trial_state(app: AppHandle) -> Result<(), String> {
    clear_text_value(&trial_record_path(&app)?)
}

#[tauri::command]
pub fn validate_activation_record(
    app: AppHandle,
    record: ActivationRecord,
) -> Result<Option<LicenseStatus>, String> {
    let config = LicenseConfig::from_app(&app);
    if config.dev_bypass_enabled {
        return Ok(Some(licensed_status(String::from("developer-bypass"))));
    }

    if record.license_id.trim().is_empty() {
        return Ok(None);
    }

    let Some(token) = record.activation_token.as_deref() else {
        return Ok(None);
    };

    let trimmed_token = token.trim();
    if trimmed_token.is_empty() {
        return Ok(None);
    }

    let current_device_id = get_or_create_device_id(app)?;
    let current_platform = current_platform();

    if record.device_id != current_device_id || record.platform != current_platform {
        return Ok(None);
    }

    let claims = verify_activation_token(trimmed_token)?;
    if claims.license_id != record.license_id
        || claims.device_id != current_device_id
        || claims.platform != current_platform
        || claims.version != ACTIVATION_TOKEN_VERSION
    {
        return Ok(None);
    }

    Ok(Some(licensed_status(claims.license_id)))
}

#[tauri::command]
pub fn clear_stored_license(app: AppHandle) -> Result<LicenseStatus, String> {
    let config = LicenseConfig::from_app(&app);
    let receipt_path = license_key_path(&app)?;
    clear_text_value(&receipt_path)?;
    clear_text_value(&activation_record_path(&app)?)?;

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

fn activation_record_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(license_dir(app)?.join(ACTIVATION_FILE_NAME))
}

fn trial_record_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(license_dir(app)?.join(TRIAL_FILE_NAME))
}

fn current_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "windows"
    }

    #[cfg(not(target_os = "windows"))]
    {
        "macos"
    }
}

fn license_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(app_data_dir.join(RECEIPT_DIR_NAME))
}

fn build_channel() -> &'static str {
    option_env!("GLANCE_BUILD_CHANNEL").unwrap_or("paid")
}

fn configured_trial_days() -> i64 {
    std::env::var(TRIAL_DAYS_ENV)
        .ok()
        .and_then(|value| value.trim().parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_TRIAL_DAYS)
}

fn load_trial_status_with_config(
    app: &AppHandle,
    config: &LicenseConfig,
) -> Result<Option<LicenseStatus>, String> {
    if let Some(override_status) = dev_trial_status_override() {
        return Ok(Some(override_status));
    }

    if !config.trial_enabled {
        return Ok(None);
    }

    load_trial_status_at_path(&trial_record_path(app)?, Utc::now())
}

fn load_trial_status_at_path(
    trial_path: &Path,
    now: DateTime<Utc>,
) -> Result<Option<LicenseStatus>, String> {
    let Some(record) = load_json_value::<TrialRecord>(trial_path)? else {
        return Ok(None);
    };

    Ok(Some(trial_status_from_record(&record, now)?))
}

fn start_trial_at_path(
    trial_path: &Path,
    trial_days: i64,
    now: DateTime<Utc>,
) -> Result<LicenseStatus, String> {
    if let Some(existing) = load_json_value::<TrialRecord>(trial_path)? {
        return trial_status_from_record(&existing, now);
    }

    let record = create_trial_record(now, trial_days);
    save_json_value(trial_path, &record)?;
    trial_status_from_record(&record, now)
}

fn create_trial_record(now: DateTime<Utc>, trial_days: i64) -> TrialRecord {
    TrialRecord {
        started_at: now.to_rfc3339(),
        expires_at: (now + Duration::days(trial_days)).to_rfc3339(),
        source: TrialSource::ProductHunt,
        activated_license_id: None,
    }
}

fn trial_status_from_record(
    record: &TrialRecord,
    now: DateTime<Utc>,
) -> Result<LicenseStatus, String> {
    let started_at = parse_timestamp(&record.started_at)?;
    let expires_at = parse_timestamp(&record.expires_at)?;

    if expires_at > now {
        let remaining = expires_at.signed_duration_since(now).num_seconds();
        let day_seconds = 24 * 60 * 60;
        let days_remaining = ((remaining + day_seconds - 1) / day_seconds).max(1) as u64;
        return Ok(trial_status(
            LicenseState::TrialActive,
            started_at,
            expires_at,
            days_remaining,
        ));
    }

    Ok(trial_status(
        LicenseState::TrialExpired,
        started_at,
        expires_at,
        0,
    ))
}

fn trial_status(
    state: LicenseState,
    started_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    days_remaining: u64,
) -> LicenseStatus {
    LicenseStatus {
        state,
        license_id: None,
        trial_started_at: Some(started_at.to_rfc3339()),
        trial_expires_at: Some(expires_at.to_rfc3339()),
        trial_days_remaining: Some(days_remaining),
    }
}

fn parse_timestamp(value: &str) -> Result<DateTime<Utc>, String> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .map_err(|_| String::from("Trial state is invalid."))
}

fn mark_trial_record_as_activated(trial_path: &Path, license_id: String) -> Result<(), String> {
    let Some(mut record) = load_json_value::<TrialRecord>(trial_path)? else {
        return Ok(());
    };

    record.activated_license_id = Some(license_id);
    save_json_value(trial_path, &record)
}

fn dev_trial_status_override() -> Option<LicenseStatus> {
    let raw_state = std::env::var(LICENSE_DEV_STATE_ENV).ok()?;
    let normalized = raw_state.trim().to_ascii_lowercase();
    let now = Utc::now();
    let days = configured_trial_days();

    match normalized.as_str() {
        "trial" => Some(trial_status(
            LicenseState::TrialActive,
            now,
            now + Duration::days(days),
            days as u64,
        )),
        "expired" => Some(trial_status(
            LicenseState::TrialExpired,
            now - Duration::days(days),
            now - Duration::seconds(1),
            0,
        )),
        _ => None,
    }
}

fn verify_activation_token(token: &str) -> Result<ActivationTokenClaims, String> {
    let verifying_key = activation_verifying_key()?;
    verify_activation_token_with_key(token, &verifying_key)
}

fn verify_activation_token_with_key(
    token: &str,
    verifying_key: &VerifyingKey,
) -> Result<ActivationTokenClaims, String> {
    let (payload_bytes, signature_bytes) = decode_activation_token(token)?;
    let signature =
        Signature::from_slice(&signature_bytes).map_err(|_| String::from("Invalid token signature."))?;

    verifying_key
        .verify(&payload_bytes, &signature)
        .map_err(|_| String::from("Activation token verification failed."))?;

    let claims: ActivationTokenClaims =
        serde_json::from_slice(&payload_bytes).map_err(|_| String::from("Invalid token payload."))?;

    if claims.version != ACTIVATION_TOKEN_VERSION {
        return Err(String::from("Unsupported activation token version."));
    }

    if claims.license_id.trim().is_empty()
        || claims.device_id.trim().is_empty()
        || claims.platform.trim().is_empty()
        || claims.issued_at.trim().is_empty()
    {
        return Err(String::from("Activation token payload is incomplete."));
    }

    Ok(claims)
}

fn decode_activation_token(token: &str) -> Result<(Vec<u8>, Vec<u8>), String> {
    let mut parts = token.trim().split('.');
    let payload = parts
        .next()
        .ok_or_else(|| String::from("Activation token is malformed."))?;
    let signature = parts
        .next()
        .ok_or_else(|| String::from("Activation token is malformed."))?;

    if parts.next().is_some() {
        return Err(String::from("Activation token is malformed."));
    }

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| String::from("Activation token payload is invalid."))?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(signature)
        .map_err(|_| String::from("Activation token signature is invalid."))?;

    Ok((payload_bytes, signature_bytes))
}

fn activation_verifying_key() -> Result<VerifyingKey, String> {
    let raw_key = option_env!("GLANCE_LICENSE_PUBLIC_KEY").ok_or_else(|| {
        format!(
            "{LICENSE_PUBLIC_KEY_ENV} was not provided at build time. Offline license verification is unavailable."
        )
    })?;

    let decoded_key = hex::decode(raw_key.trim())
        .map_err(|_| format!("{LICENSE_PUBLIC_KEY_ENV} was not valid hexadecimal."))?;

    let key_bytes: [u8; 32] = decoded_key.try_into().map_err(|_| {
        format!("{LICENSE_PUBLIC_KEY_ENV} must decode to a 32-byte Ed25519 public key.")
    })?;

    VerifyingKey::from_bytes(&key_bytes)
        .map_err(|_| format!("{LICENSE_PUBLIC_KEY_ENV} was not a valid Ed25519 public key."))
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

fn save_json_value<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let serialized = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn load_json_value<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>, String> {
    match fs::read(path) {
        Ok(contents) => serde_json::from_slice(&contents)
            .map(Some)
            .map_err(|error| error.to_string()),
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
        trial_started_at: None,
        trial_expires_at: None,
        trial_days_remaining: None,
    }
}

fn unlicensed_status() -> LicenseStatus {
    LicenseStatus {
        state: LicenseState::Unlicensed,
        license_id: None,
        trial_started_at: None,
        trial_expires_at: None,
        trial_days_remaining: None,
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
    use super::{
        clear_text_value, create_trial_record, load_json_value, load_text_value, masked_license_id,
        mark_trial_record_as_activated, save_json_value, save_text_value, start_trial_at_path,
        trial_status_from_record, verify_activation_token_with_key, ActivationRecord,
        ActivationTokenClaims, TrialRecord, TrialSource, ACTIVATION_TOKEN_VERSION,
    };
    use chrono::{Duration, TimeZone, Utc};
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use ed25519_dalek::{Signer, SigningKey};
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

    #[test]
    fn activation_record_roundtrips_as_json() {
        let dir = tempdir().expect("temp dir");
        let record_path = dir.path().join("license").join("activation.json");
        let record = ActivationRecord {
            license_id: String::from("3C49"),
            device_id: String::from("device-1"),
            platform: String::from("macos"),
            activated_at: String::from("2026-03-10T12:00:00Z"),
            activation_token: Some(String::from("payload.signature")),
        };

        save_json_value(&record_path, &record).expect("save activation record");
        let restored: Option<ActivationRecord> =
            load_json_value(&record_path).expect("load activation record");

        assert_eq!(restored, Some(record));
    }

    #[test]
    fn starting_trial_once_persists_original_record() {
        let dir = tempdir().expect("temp dir");
        let trial_path = dir.path().join("license").join("trial.json");
        let first_now = Utc.with_ymd_and_hms(2026, 3, 10, 12, 0, 0).unwrap();
        let later_now = first_now + Duration::days(2);

        let first_status = start_trial_at_path(&trial_path, 7, first_now).expect("start trial");
        let second_status = start_trial_at_path(&trial_path, 7, later_now).expect("load existing trial");
        let stored: Option<TrialRecord> = load_json_value(&trial_path).expect("load trial");

        assert_eq!(first_status.state, super::LicenseState::TrialActive);
        assert_eq!(stored, Some(create_trial_record(first_now, 7)));
        assert_eq!(second_status.trial_started_at, Some(first_now.to_rfc3339()));
        assert_eq!(
            second_status.trial_days_remaining,
            Some(5)
        );
    }

    #[test]
    fn expired_trial_reports_expired_status() {
        let now = Utc.with_ymd_and_hms(2026, 3, 17, 12, 0, 1).unwrap();
        let record = create_trial_record(Utc.with_ymd_and_hms(2026, 3, 10, 12, 0, 0).unwrap(), 7);

        let status = trial_status_from_record(&record, now).expect("trial status");

        assert_eq!(status.state, super::LicenseState::TrialExpired);
        assert_eq!(status.trial_days_remaining, Some(0));
    }

    #[test]
    fn trial_records_track_conversion_license_id() {
        let dir = tempdir().expect("temp dir");
        let trial_path = dir.path().join("license").join("trial.json");
        let record = TrialRecord {
            started_at: String::from("2026-03-10T12:00:00+00:00"),
            expires_at: String::from("2026-03-17T12:00:00+00:00"),
            source: TrialSource::ProductHunt,
            activated_license_id: None,
        };
        save_json_value(&trial_path, &record).expect("save trial");

        mark_trial_record_as_activated(&trial_path, String::from("3C49")).expect("mark activated");

        let restored: Option<TrialRecord> = load_json_value(&trial_path).expect("load trial");
        assert_eq!(
            restored,
            Some(TrialRecord {
                activated_license_id: Some(String::from("3C49")),
                ..record
            })
        );
    }

    #[test]
    fn signed_activation_tokens_roundtrip_when_signature_matches() {
        let signing_key = SigningKey::from_bytes(&[7; 32]);
        let verifying_key = signing_key.verifying_key();
        let claims = ActivationTokenClaims {
            version: ACTIVATION_TOKEN_VERSION,
            license_id: String::from("3C49"),
            device_id: String::from("device-123"),
            platform: String::from("macos"),
            issued_at: String::from("2026-03-10T12:00:00Z"),
        };
        let token = encode_activation_token_for_test(&signing_key, &claims);

        let restored =
            verify_activation_token_with_key(&token, &verifying_key).expect("verify signed token");

        assert_eq!(restored, claims);
    }

    #[test]
    fn signed_activation_tokens_reject_tampered_payloads() {
        let signing_key = SigningKey::from_bytes(&[11; 32]);
        let verifying_key = signing_key.verifying_key();
        let claims = ActivationTokenClaims {
            version: ACTIVATION_TOKEN_VERSION,
            license_id: String::from("3C49"),
            device_id: String::from("device-123"),
            platform: String::from("macos"),
            issued_at: String::from("2026-03-10T12:00:00Z"),
        };
        let token = encode_activation_token_for_test(&signing_key, &claims);
        let (payload, signature) = token.split_once('.').expect("split token");

        let payload_bytes = URL_SAFE_NO_PAD.decode(payload).expect("decode payload");
        let mut tampered_claims: ActivationTokenClaims =
            serde_json::from_slice(&payload_bytes).expect("parse claims");
        tampered_claims.device_id = String::from("device-999");
        let tampered_payload =
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&tampered_claims).expect("serialize claims"));
        let tampered_token = format!("{tampered_payload}.{signature}");

        let error = verify_activation_token_with_key(&tampered_token, &verifying_key)
            .expect_err("tampered token should fail");

        assert_eq!(error, "Activation token verification failed.");
    }

    fn encode_activation_token_for_test(
        signing_key: &SigningKey,
        claims: &ActivationTokenClaims,
    ) -> String {
        let payload_bytes = serde_json::to_vec(claims).expect("serialize claims");
        let signature = signing_key.sign(&payload_bytes);
        format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(payload_bytes),
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        )
    }
}
