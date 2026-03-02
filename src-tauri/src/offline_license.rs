use ed25519_dalek::{Signature, VerifyingKey, Verifier};
use serde::{Deserialize, Serialize};
use base64::Engine;

#[allow(dead_code)]
#[derive(Serialize, Deserialize)]
pub struct LicensePayload {
    pub id: String,
    pub product: String,
    pub signature: String,
}

#[allow(dead_code)]
const PUBLIC_KEY_HEX: &str = "7ab5a3751fa1e2bcc7ff4438b25994ae1f76baf8eaeea82516d35e77e742899b";

#[allow(dead_code)]
pub fn verify_license_key(b64_key: &str) -> std::result::Result<(), String> {
    // 1. Decode Base64 string
    let json_bytes = base64::engine::general_purpose::STANDARD_NO_PAD
        .decode(b64_key.trim())
        .map_err(|_| "Invalid license key format (Base64 decode failed).")?;
        
    let json_str = String::from_utf8(json_bytes)
        .map_err(|_| "Invalid license key format (UTF8 decode failed).")?;
        
    // 2. Parse JSON payload
    let payload: LicensePayload = serde_json::from_str(&json_str)
        .map_err(|_| "Invalid license key data (JSON decode failed).")?;
        
    // 3. Verify Product ID
    if payload.product != "glance-pro" {
        return Err("License key is for a different product.".into());
    }
    
    // 4. Decode Signature from Hex
    let sig_bytes = hex::decode(&payload.signature)
        .map_err(|_| "Invalid signature encoding.")?;
    if sig_bytes.len() != 64 {
        return Err("Invalid signature length.".into());
    }
    
    // 5. Decode Public Key from Hex
    let pk_bytes = hex::decode(PUBLIC_KEY_HEX)
        .map_err(|_| "Internal error: Invalid public key encoding.")?;
    if pk_bytes.len() != 32 {
        return Err("Internal error: Invalid public key length.".into());
    }
    
    // 6. Verify Mathematical Signature
    let verifying_key = VerifyingKey::from_bytes(pk_bytes.as_slice().try_into().unwrap())
        .map_err(|_| "Internal error: Failed to parse public key.")?;
        
    let signature = Signature::from_slice(&sig_bytes)
        .map_err(|_| "Failed to parse signature.")?;
        
    // The message that was signed is "PRODUCT:UUID"
    let message = format!("{}:{}", payload.product, payload.id);
    
    verifying_key.verify(message.as_bytes(), &signature)
        .map_err(|_| "Cryptographic signature verification failed! The key is invalid or tampered with.")?;
        
    Ok(())
}
