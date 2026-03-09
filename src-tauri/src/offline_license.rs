use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

const PUBLIC_KEY_HEX: &str = "7ab5a3751fa1e2bcc7ff4438b25994ae1f76baf8eaeea82516d35e77e742899b";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePayload {
    pub id: String,
    pub product: String,
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedLicense {
    pub id: String,
    pub product: String,
}

pub fn verify_license_key_for_product(
    license_key: &str,
    product_id: &str,
) -> Result<VerifiedLicense, String> {
    verify_license_key_with_public_key(license_key, product_id, PUBLIC_KEY_HEX)
}

fn verify_license_key_with_public_key(
    license_key: &str,
    product_id: &str,
    public_key_hex: &str,
) -> Result<VerifiedLicense, String> {
    let payload = decode_license_payload(license_key)?;
    if payload.product != product_id {
        return Err(String::from("This license key is for a different product."));
    }

    let public_key = decode_public_key(public_key_hex)?;
    let signature = decode_signature(&payload.signature)?;
    let message = signed_message(&payload.product, &payload.id);
    public_key
        .verify(message.as_bytes(), &signature)
        .map_err(|_| String::from("This license key is invalid or has been modified."))?;

    Ok(VerifiedLicense {
        id: payload.id,
        product: payload.product,
    })
}

fn decode_license_payload(license_key: &str) -> Result<LicensePayload, String> {
    let json_bytes = base64::engine::general_purpose::STANDARD_NO_PAD
        .decode(license_key.trim())
        .map_err(|_| String::from("Invalid license key format."))?;
    let json_text =
        String::from_utf8(json_bytes).map_err(|_| String::from("Invalid license key format."))?;

    serde_json::from_str(&json_text).map_err(|_| String::from("Invalid license key format."))
}

fn decode_signature(signature_hex: &str) -> Result<Signature, String> {
    let signature_bytes =
        hex::decode(signature_hex).map_err(|_| String::from("Invalid license key signature."))?;
    let signature_array: [u8; 64] = signature_bytes
        .as_slice()
        .try_into()
        .map_err(|_| String::from("Invalid license key signature."))?;

    Ok(Signature::from_bytes(&signature_array))
}

fn decode_public_key(public_key_hex: &str) -> Result<VerifyingKey, String> {
    let public_key_bytes =
        hex::decode(public_key_hex).map_err(|_| String::from("Invalid embedded public key."))?;
    let public_key_array: [u8; 32] = public_key_bytes
        .as_slice()
        .try_into()
        .map_err(|_| String::from("Invalid embedded public key."))?;

    VerifyingKey::from_bytes(&public_key_array)
        .map_err(|_| String::from("Invalid embedded public key."))
}

fn signed_message(product: &str, id: &str) -> String {
    format!("{product}:{id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn build_license_key(product: &str, id: &str) -> String {
        let signing_key = SigningKey::from_bytes(&[7; 32]);
        let message = signed_message(product, id);
        let signature = signing_key.sign(message.as_bytes());
        let payload = LicensePayload {
            id: String::from(id),
            product: String::from(product),
            signature: hex::encode(signature.to_bytes()),
        };

        base64::engine::general_purpose::STANDARD_NO_PAD
            .encode(serde_json::to_string(&payload).expect("serialize payload"))
    }

    fn public_key_hex() -> String {
        let signing_key = SigningKey::from_bytes(&[7; 32]);
        hex::encode(signing_key.verifying_key().to_bytes())
    }

    #[test]
    fn verifies_a_valid_signed_license_key() {
        let product_id = "glance-pro";
        let license_id = "license-123";
        let license_key = build_license_key(product_id, license_id);

        let verified =
            verify_license_key_with_public_key(&license_key, product_id, &public_key_hex())
                .expect("valid license");

        assert_eq!(
            verified,
            VerifiedLicense {
                id: String::from(license_id),
                product: String::from(product_id),
            }
        );
    }

    #[test]
    fn rejects_a_key_for_a_different_product() {
        let license_key = build_license_key("glance-pro", "license-123");

        let error =
            verify_license_key_with_public_key(&license_key, "other-product", &public_key_hex())
                .expect_err("different product should fail");

        assert_eq!(error, "This license key is for a different product.");
    }

    #[test]
    fn rejects_a_tampered_license_key() {
        let license_key = build_license_key("glance-pro", "license-123");
        let payload = decode_license_payload(&license_key).expect("decode payload");
        let tampered_payload = LicensePayload {
            id: String::from("license-999"),
            ..payload
        };
        let tampered_key = base64::engine::general_purpose::STANDARD_NO_PAD
            .encode(serde_json::to_string(&tampered_payload).expect("serialize tampered payload"));

        let error =
            verify_license_key_with_public_key(&tampered_key, "glance-pro", &public_key_hex())
                .expect_err("tampered key should fail");

        assert_eq!(error, "This license key is invalid or has been modified.");
    }
}
