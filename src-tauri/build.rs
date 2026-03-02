use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    #[cfg(target_os = "macos")]
    compile_macos_license_bridge();

    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn compile_macos_license_bridge() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR not set"));
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set"));
    let swift_source = manifest_dir.join("native/macos/LicenseBridge.swift");
    let output_library = out_dir.join("libglance_license_bridge.a");
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_else(|_| String::from("arm64"));
    let target_arch = match target_arch.as_str() {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        other => other,
    };
    let deployment_target = format!("{target_arch}-apple-macos12.0");
    let module_cache = out_dir.join("swift-module-cache");
    let _ = std::fs::create_dir_all(&module_cache);

    println!("cargo:rerun-if-changed={}", swift_source.display());

    let sdk_path_output = Command::new("xcrun")
        .arg("--sdk")
        .arg("macosx")
        .arg("--show-sdk-path")
        .output()
        .expect("failed to query macOS SDK path");
    if !sdk_path_output.status.success() {
        panic!("failed to resolve macOS SDK path for swiftc");
    }
    let sdk_path = String::from_utf8_lossy(&sdk_path_output.stdout)
        .trim()
        .to_string();

    let status = Command::new("xcrun")
        .arg("--sdk")
        .arg("macosx")
        .arg("swiftc")
        .arg("-parse-as-library")
        .arg("-emit-library")
        .arg("-static")
        .arg("-sdk")
        .arg(sdk_path)
        .arg("-module-cache-path")
        .arg(module_cache)
        .arg("-target")
        .arg(deployment_target)
        .arg(swift_source)
        .arg("-o")
        .arg(&output_library)
        .status()
        .expect("failed to spawn swiftc for macOS license bridge");

    if !status.success() {
        panic!("swiftc failed while compiling native macOS license bridge");
    }

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=glance_license_bridge");
    println!("cargo:rustc-link-lib=framework=StoreKit");
    println!("cargo:rustc-link-lib=framework=Security");
    println!("cargo:rustc-link-lib=framework=Foundation");
}
