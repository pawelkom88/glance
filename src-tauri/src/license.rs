use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const DEFAULT_PRODUCT_ID: &str = "com.yourapp.unlock";
const DEFAULT_TRIAL_DAYS: i64 = 7;
const LICENSE_BYPASS_ENV: &str = "GLANCE_LICENSE_DEV_BYPASS";
const PRODUCT_ID_ENV: &str = "GLANCE_IAP_PRODUCT_ID";
const WINDOWS_STORE_ADDON_ID_ENV: &str = "GLANCE_WINDOWS_STORE_ADDON_STORE_ID";
const TRIAL_DAYS_ENV: &str = "GLANCE_TRIAL_DAYS";
/// Tolerance (seconds) for backwards clock drift before we treat it as tampering.
#[allow(dead_code)]
const CLOCK_SKEW_TOLERANCE_SECS: i64 = 300;


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LicenseState {
    Trial,
    Expired,
    Purchased,
}

/// Typed store error surfaced through the Tauri command layer so the
/// frontend can distinguish network unavailability from a true store fault.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "message", rename_all = "PascalCase")]
#[allow(dead_code)]
pub enum StoreError {

    /// No network connection available when attempting a store operation.
    Offline(String),
    /// The store API returned an application-level error.
    StoreFault(String),
    /// Catch-all for unexpected failures.
    Unknown(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub state: LicenseState,
    pub days_remaining: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreProductInfo {
    pub product_id: String,
    pub price_display: Option<String>,
}

#[derive(Debug, Clone)]
struct LicenseConfig {
    bundle_id: String,
    product_id: String,
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    windows_store_addon_id: String,
    trial_days: i64,
    dev_bypass_enabled: bool,
}

impl LicenseConfig {
    fn from_app(app: &AppHandle) -> Self {
        let bundle_id = app.config().identifier.clone();
        let product_id = std::env::var(PRODUCT_ID_ENV)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| String::from(DEFAULT_PRODUCT_ID));
        let windows_store_addon_id = std::env::var(WINDOWS_STORE_ADDON_ID_ENV)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| product_id.clone());
        let trial_days = std::env::var(TRIAL_DAYS_ENV)
            .ok()
            .and_then(|value| value.parse::<i64>().ok())
            .map(|value| value.max(1))
            .unwrap_or(DEFAULT_TRIAL_DAYS);

        Self {
            bundle_id,
            product_id,
            windows_store_addon_id,
            trial_days,
            dev_bypass_enabled: env_flag_enabled(LICENSE_BYPASS_ENV),
        }
    }

    fn with_product_price(&self, price_display: Option<String>) -> StoreProductInfo {
        StoreProductInfo {
            product_id: self.product_id.clone(),
            price_display,
        }
    }
}

#[tauri::command]
pub fn check_status(app: AppHandle) -> Result<LicenseStatus, String> {
    let config = LicenseConfig::from_app(&app);
    if config.dev_bypass_enabled {
        return Ok(LicenseStatus {
            state: LicenseState::Purchased,
            days_remaining: None,
        });
    }

    platform::check_status(&config)
}

#[tauri::command]
pub fn purchase_unlock(app: AppHandle) -> Result<bool, String> {
    let config = LicenseConfig::from_app(&app);
    if config.dev_bypass_enabled {
        return Ok(true);
    }

    platform::purchase_unlock(&app, &config)
}

#[tauri::command]
pub fn restore_purchases(app: AppHandle, key: Option<String>) -> Result<bool, String> {
    let config = LicenseConfig::from_app(&app);
    if config.dev_bypass_enabled {
        return Ok(true);
    }

    platform::restore_purchases(&config, key)
}

#[tauri::command]
pub fn get_unlock_product(app: AppHandle) -> Result<StoreProductInfo, String> {
    let config = LicenseConfig::from_app(&app);
    if config.dev_bypass_enabled {
        return Ok(config.with_product_price(Some(String::from("Developer bypass enabled"))));
    }

    let price_display = platform::get_price_display(&config)?;
    Ok(config.with_product_price(price_display))
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

#[cfg(target_os = "macos")]
mod platform {
    use super::{AppHandle, LicenseConfig, LicenseStatus};

    use serde::Serialize;
    use std::ffi::{c_char, CStr, CString};

    const ACCOUNT_NAME: &str = "license-state-v1";

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct MacBridgePayload<'a> {
        bundle_id: &'a str,
        product_id: &'a str,
        trial_days: i64,
        now_unix: i64,
        service_name: String,
        account_name: &'a str,
    }

    impl<'a> MacBridgePayload<'a> {
        fn from_config(config: &'a LicenseConfig) -> Self {
            Self {
                bundle_id: config.bundle_id.as_str(),
                product_id: config.product_id.as_str(),
                trial_days: config.trial_days,
                now_unix: chrono::Utc::now().timestamp(),
                service_name: format!("{}.license", config.bundle_id),
                account_name: ACCOUNT_NAME,
            }
        }
    }

    extern "C" {
        fn glance_macos_check_status(input_json: *const c_char) -> *mut c_char;
        fn glance_macos_purchase_unlock(input_json: *const c_char) -> *mut c_char;
        fn glance_macos_restore_purchases(input_json: *const c_char) -> *mut c_char;
        fn glance_macos_get_product(input_json: *const c_char) -> *mut c_char;
        fn glance_macos_free_string(value: *mut c_char);
    }

    pub fn check_status(config: &LicenseConfig) -> Result<LicenseStatus, String> {
        invoke_json(
            glance_macos_check_status,
            &MacBridgePayload::from_config(config),
        )
    }

    pub fn purchase_unlock(_app: &AppHandle, config: &LicenseConfig) -> Result<bool, String> {
        #[derive(Debug, serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct PurchaseResult {
            success: bool,
        }

        let response: PurchaseResult = invoke_json(
            glance_macos_purchase_unlock,
            &MacBridgePayload::from_config(config),
        )?;
        Ok(response.success)
    }

    pub fn restore_purchases(config: &LicenseConfig, _key: Option<String>) -> Result<bool, String> {
        #[derive(Debug, serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RestoreResult {
            success: bool,
        }

        let response: RestoreResult = invoke_json(
            glance_macos_restore_purchases,
            &MacBridgePayload::from_config(config),
        )?;
        Ok(response.success)
    }

    pub fn get_price_display(config: &LicenseConfig) -> Result<Option<String>, String> {
        #[derive(Debug, serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ProductResult {
            price_display: Option<String>,
        }

        let response: ProductResult = invoke_json(
            glance_macos_get_product,
            &MacBridgePayload::from_config(config),
        )?;
        Ok(response.price_display)
    }

    fn invoke_json<TResponse, TPayload>(
        bridge_fn: unsafe extern "C" fn(*const c_char) -> *mut c_char,
        payload: &TPayload,
    ) -> Result<TResponse, String>
    where
        TResponse: for<'de> serde::Deserialize<'de>,
        TPayload: Serialize,
    {
        let input = serde_json::to_string(payload).map_err(|error| error.to_string())?;
        let input_c = CString::new(input).map_err(|error| error.to_string())?;
        let output_ptr = unsafe { bridge_fn(input_c.as_ptr()) };
        if output_ptr.is_null() {
            return Err(String::from(
                "Native StoreKit bridge returned an empty response",
            ));
        }

        let output = unsafe {
            let c_string = CStr::from_ptr(output_ptr);
            let json = c_string.to_string_lossy().into_owned();
            glance_macos_free_string(output_ptr);
            json
        };

        if let Ok(error_payload) = serde_json::from_str::<serde_json::Value>(output.as_str()) {
            if let Some(message) = error_payload.get("error").and_then(|value| value.as_str()) {
                return Err(String::from(message));
            }
        }

        serde_json::from_str(output.as_str()).map_err(|error| {
            format!(
                "Failed to decode native StoreKit bridge response: {} ({})",
                error, output
            )
        })
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{LicenseConfig, LicenseState, LicenseStatus, CLOCK_SKEW_TOLERANCE_SECS};
    use base64::Engine;
    use serde::{Deserialize, Serialize};
    use sha2::{Digest, Sha256};
    use std::iter;
    use std::os::windows::ffi::OsStrExt;
    use tauri_plugin_shell::ShellExt;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, REG_BINARY, REG_OPTION_NON_VOLATILE,
        REG_SAM_FLAGS, REG_VALUE_TYPE,
    };



    const REGISTRY_VALUE_NAME: &str = "LicenseStateV1";

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RegistryRecord {
        trial_started_unix: i64,
        last_seen_unix: i64,
        purchased: bool,
        checksum: String,
    }

    #[derive(Debug, Clone)]
    struct RuntimeRecord {
        trial_started_unix: i64,
        last_seen_unix: i64,
        purchased: bool,
    }

    pub fn check_status(config: &LicenseConfig) -> Result<LicenseStatus, String> {
        let now = chrono::Utc::now().timestamp();
        let mut record = load_or_initialize_record(config, now)?;

        let is_clock_tampered = now < (record.last_seen_unix - CLOCK_SKEW_TOLERANCE_SECS);

        if now > record.last_seen_unix {
            record.last_seen_unix = now;
            save_record(config, &record)?;
        }

        if is_clock_tampered {
            return Ok(LicenseStatus {
                state: LicenseState::Expired,
                days_remaining: None,
            });
        }

        Ok(derive_status(config.trial_days, &record))
    }

    pub fn purchase_unlock(app: &tauri::AppHandle, _config: &LicenseConfig) -> Result<bool, String> {
        // Open the Paddle checkout URL. 
        // In a real app, this might come from config or env var.
        let checkout_url = "https://buy.paddle.com/product/12345";
        tauri_plugin_opener::OpenerExt::open_external(app, checkout_url, None).map_err(|error| error.to_string())?;

        
        // Return false to indicate that the purchase flow is manual (via browser).
        Ok(false)
    }

    pub fn restore_purchases(config: &LicenseConfig, key: Option<String>) -> Result<bool, String> {
        if let Some(license_key) = key {
            // Validate the key offline!
            crate::offline_license::verify_license_key(&license_key)?;
            
            // If valid, save the purchased state.
            let now = chrono::Utc::now().timestamp();
            let mut record = load_or_initialize_record(config, now)?;
            record.purchased = true;
            if now > record.last_seen_unix {
                record.last_seen_unix = now;
            }
            save_record(config, &record)?;
            return Ok(true);
        }

        // Check local record.
        match load_record(config)? {
            Some(record) => Ok(record.purchased),
            None => Ok(false),
        }
    }

    pub fn get_price_display(_config: &LicenseConfig) -> Result<Option<String>, String> {
        // Since we use an external checkout, we return a static price or placeholder.
        Ok(Some(String::from("$14.99")))
    }

    fn derive_status(trial_days: i64, record: &RuntimeRecord) -> LicenseStatus {
        if record.purchased {
            return LicenseStatus {
                state: LicenseState::Purchased,
                days_remaining: None,
            };
        }

        let elapsed_days = ((record.last_seen_unix - record.trial_started_unix).max(0)) / 86_400;
        if elapsed_days < trial_days {
            LicenseStatus {
                state: LicenseState::Trial,
                days_remaining: Some(trial_days - elapsed_days),
            }
        } else {
            LicenseStatus {
                state: LicenseState::Expired,
                days_remaining: None,
            }
        }
    }

    fn load_or_initialize_record(
        config: &LicenseConfig,
        now_unix: i64,
    ) -> Result<RuntimeRecord, String> {
        match load_record(config)? {
            Some(record) => Ok(record),
            None => Ok(RuntimeRecord {
                trial_started_unix: now_unix,
                last_seen_unix: now_unix,
                purchased: false,
            }),
        }
    }

    fn load_record(config: &LicenseConfig) -> Result<Option<RuntimeRecord>, String> {
        let path = registry_subkey_path(config);
        let key = open_registry_key(path.as_str(), KEY_READ)?;

        let value_name = to_wide(REGISTRY_VALUE_NAME);
        let mut value_type = REG_VALUE_TYPE::default();

        let mut data_len = 0u32;
        let status = unsafe {
            RegQueryValueExW(
                key,
                windows::core::PCWSTR(value_name.as_ptr()),
                None,
                Some(&mut value_type),
                None,
                Some(&mut data_len),


            )
        };

        if status.0 != 0 {
            unsafe {
                RegCloseKey(key);
            }
            return Ok(None);
        }

        if value_type != REG_BINARY {

            unsafe {
                RegCloseKey(key);
            }
            return Ok(None);
        }

        let mut buffer = vec![0u8; data_len as usize];
        let second_status = unsafe {
            RegQueryValueExW(
                key,
                windows::core::PCWSTR(value_name.as_ptr()),
                None,
                Some(&mut value_type),
                Some(buffer.as_mut_ptr()),
                Some(&mut data_len),


            )
        };

        unsafe {
            RegCloseKey(key);
        }

        if second_status.0 != 0 {
            return Ok(None);
        }

        let decoded = decode_registry_blob(config, &buffer)?;
        let record: RegistryRecord = serde_json::from_slice(decoded.as_slice())
            .map_err(|error| format!("Invalid registry payload: {}", error))?;

        if record.checksum != checksum_for(config, &record) {
            return Ok(None);
        }

        Ok(Some(RuntimeRecord {
            trial_started_unix: record.trial_started_unix,
            last_seen_unix: record.last_seen_unix,
            purchased: record.purchased,
        }))
    }

    fn save_record(config: &LicenseConfig, record: &RuntimeRecord) -> Result<(), String> {
        let path = registry_subkey_path(config);
        let key = open_registry_key(path.as_str(), KEY_SET_VALUE)?;

        let mut stored = RegistryRecord {
            trial_started_unix: record.trial_started_unix,
            last_seen_unix: record.last_seen_unix,
            purchased: record.purchased,
            checksum: String::new(),
        };
        stored.checksum = checksum_for(config, &stored);

        let payload = serde_json::to_vec(&stored).map_err(|error| error.to_string())?;
        let encoded = encode_registry_blob(config, payload.as_slice());

        let value_name = to_wide(REGISTRY_VALUE_NAME);
        let status = unsafe {
            RegSetValueExW(
                key,
                windows::core::PCWSTR(value_name.as_ptr()),
                0,
                REG_BINARY,
                Some(&encoded),
            )

        };

        unsafe {
            RegCloseKey(key);
        }

        if status.0 != 0 {
            return Err(format!(
                "Failed to write license registry value: {}",
                status.0
            ));
        }

        Ok(())
    }

    fn registry_subkey_path(config: &LicenseConfig) -> String {
        format!("Software\\{}\\License", config.bundle_id)
    }

    fn open_registry_key(path: &str, access: REG_SAM_FLAGS) -> Result<HKEY, String> {
        let mut key = HKEY::default();
        let path_wide = to_wide(path);
        let create_status = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                windows::core::PCWSTR(path_wide.as_ptr()),
                0,
                windows::core::PWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                access,
                None,
                &mut key,
                None,
            )
        };

        if create_status.0 != 0 {
            let mut opened = HKEY::default();
            let open_status = unsafe {
                RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    windows::core::PCWSTR(path_wide.as_ptr()),
                    0,
                    access,
                    &mut opened,
                )
            };

            if open_status.0 != 0 {
                return Err(format!(
                    "Unable to open registry key for licensing: {}",
                    open_status.0
                ));
            }

            return Ok(opened);
        }

        Ok(key)
    }

    fn encode_registry_blob(config: &LicenseConfig, input: &[u8]) -> Vec<u8> {
        let key = obfuscation_key(config);
        let encrypted = xor_with_key(input, key.as_slice());
        base64::engine::general_purpose::STANDARD_NO_PAD
            .encode(encrypted)
            .into_bytes()
    }

    fn decode_registry_blob(config: &LicenseConfig, input: &[u8]) -> Result<Vec<u8>, String> {
        let encoded = std::str::from_utf8(input).map_err(|error| error.to_string())?;
        let encrypted = base64::engine::general_purpose::STANDARD_NO_PAD
            .decode(encoded)
            .map_err(|error| error.to_string())?;
        let key = obfuscation_key(config);
        Ok(xor_with_key(encrypted.as_slice(), key.as_slice()))
    }

    fn xor_with_key(input: &[u8], key: &[u8]) -> Vec<u8> {
        input
            .iter()
            .enumerate()
            .map(|(index, value)| value ^ key[index % key.len()])
            .collect()
    }

    fn obfuscation_key(config: &LicenseConfig) -> Vec<u8> {
        let username = std::env::var("USERNAME").unwrap_or_else(|_| String::from("unknown"));
        let source = format!("{}:{}:glance-license-v1", config.bundle_id, username);
        Sha256::digest(source.as_bytes()).to_vec()
    }

    fn checksum_for(config: &LicenseConfig, record: &RegistryRecord) -> String {
        let material = format!(
            "{}:{}:{}:{}:checksum-v1",
            config.bundle_id, record.trial_started_unix, record.last_seen_unix, record.purchased
        );
        let digest = Sha256::digest(material.as_bytes());
        base64::engine::general_purpose::STANDARD_NO_PAD.encode(digest)
    }

    fn to_wide(value: &str) -> Vec<u16> {
        std::ffi::OsStr::new(value)
            .encode_wide()
            .chain(iter::once(0))
            .collect()
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::{LicenseConfig, LicenseState, LicenseStatus};

    pub fn check_status(_config: &LicenseConfig) -> Result<LicenseStatus, String> {
        Ok(LicenseStatus {
            state: LicenseState::Purchased,
            days_remaining: None,
        })
    }

    pub fn purchase_unlock(_app: &tauri::AppHandle, _config: &LicenseConfig) -> Result<bool, String> {
        Ok(true)
    }

    pub fn restore_purchases(_config: &LicenseConfig, _key: Option<String>) -> Result<bool, String> {
        Ok(true)
    }

    pub fn get_price_display(_config: &LicenseConfig) -> Result<Option<String>, String> {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::env_flag_enabled;

    #[test]
    fn parses_truthy_env_flags() {
        std::env::set_var("GLANCE_TEST_BOOL_FLAG", "TRUE");
        assert!(env_flag_enabled("GLANCE_TEST_BOOL_FLAG"));
        std::env::remove_var("GLANCE_TEST_BOOL_FLAG");
    }

    #[test]
    fn rejects_unknown_env_flags() {
        std::env::set_var("GLANCE_TEST_BOOL_FLAG", "0");
        assert!(!env_flag_enabled("GLANCE_TEST_BOOL_FLAG"));
        std::env::remove_var("GLANCE_TEST_BOOL_FLAG");
    }
}
