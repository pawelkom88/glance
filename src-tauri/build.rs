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
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set"));
    let swift_source = manifest_dir.join("native/macos/LicenseBridge.swift");
    let output_library = out_dir.join("libglance_license_bridge.a");
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_else(|_| String::from("arm64"));
    let deployment_target = format!("{}-apple-macos12.0", target_arch);

    println!("cargo:rerun-if-changed={}", swift_source.display());

    let status = Command::new("xcrun")
        .arg("swiftc")
        .arg("-parse-as-library")
        .arg("-emit-library")
        .arg("-static")
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
