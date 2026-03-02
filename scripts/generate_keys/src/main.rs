use std::fs::File;
use std::io::Write;
use ed25519_dalek::{SigningKey, Signer};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use base64::Engine;

#[derive(Serialize, Deserialize)]
struct LicensePayload {
    id: String,
    product: String,
    signature: String,
}

fn main() {
    let mut csprng = OsRng;
    let signing_key = SigningKey::generate(&mut csprng);
    
    let public_key_bytes = signing_key.verifying_key().to_bytes();
    let public_key_hex = hex::encode(public_key_bytes);
    
    println!("--- IMPORTANT: SAVE THIS ---");
    println!("Public Key (Embed in App): {}", public_key_hex);
    println!("Private Key (Keep Secret): {}", hex::encode(signing_key.to_bytes()));
    println!("----------------------------");
    
    let mut file = File::create("paddle_licenses.txt").unwrap();
    let product_id = "glance-pro".to_string(); // Matches config
    
    for _ in 0..10000 {
        let uuid = uuid::Uuid::new_v4().to_string();
        
        let message = format!("{}:{}", product_id, uuid);
        
        let signature = signing_key.sign(message.as_bytes());
        let signature_hex = hex::encode(signature.to_bytes());
        
        let payload = LicensePayload {
            id: uuid,
            product: product_id.clone(),
            signature: signature_hex,
        };
        
        let json = serde_json::to_string(&payload).unwrap();
        let encoded = base64::engine::general_purpose::STANDARD_NO_PAD.encode(json);
        
        writeln!(file, "{}", encoded).unwrap();
    }
    
    println!("Generated 10,000 licenses to paddle_licenses.txt!");
}
