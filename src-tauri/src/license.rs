use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
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
const LICENSE_BYPASS_ENV: &str = "GLANCE_LICENSE_DEV_BYPASS";
const LICENSE_PUBLIC_KEY_ENV: &str = "GLANCE_LICENSE_PUBLIC_KEY";
const RECEIPT_DIR_NAME: &str = "license";
const RECEIPT_FILE_NAME: &str = "license-key.txt";
const ACTIVATION_TOKEN_VERSION: u8 = 1;

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
    use super::{
        clear_text_value, load_json_value, load_text_value, masked_license_id, save_json_value,
        save_text_value, verify_activation_token_with_key, ActivationRecord, ActivationTokenClaims,
        ACTIVATION_TOKEN_VERSION,
    };
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
