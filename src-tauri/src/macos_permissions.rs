#[cfg(target_os = "macos")]
use std::sync::mpsc;

#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2::{
    msg_send,
    runtime::{AnyClass, Bool},
};
#[cfg(target_os = "macos")]
use objc2_foundation::NSString;

const AUTHORIZED_STATUS: &str = "authorized";
const DENIED_STATUS: &str = "denied";
const NOT_DETERMINED_STATUS: &str = "notDetermined";
const RESTRICTED_STATUS: &str = "restricted";
const UNSUPPORTED_STATUS: &str = "unsupported";

#[cfg(target_os = "macos")]
#[link(name = "AVFoundation", kind = "framework")]
unsafe extern "C" {
    static AVMediaTypeAudio: &'static NSString;
}

#[cfg(target_os = "macos")]
fn status_label(status: isize) -> &'static str {
    match status {
        0 => NOT_DETERMINED_STATUS,
        1 => RESTRICTED_STATUS,
        2 => DENIED_STATUS,
        3 => AUTHORIZED_STATUS,
        _ => UNSUPPORTED_STATUS,
    }
}

#[cfg(target_os = "macos")]
fn capture_device_class() -> Result<&'static AnyClass, String> {
    AnyClass::get(c"AVCaptureDevice")
        .ok_or_else(|| String::from("AVCaptureDevice is unavailable on this macOS runtime."))
}

#[cfg(target_os = "macos")]
fn authorization_status_for_audio() -> Result<isize, String> {
    let capture_device_class = capture_device_class()?;
    let status = unsafe {
        msg_send![capture_device_class, authorizationStatusForMediaType: AVMediaTypeAudio]
    };
    Ok(status)
}

#[cfg(target_os = "macos")]
fn request_audio_access() -> Result<bool, String> {
    let capture_device_class = capture_device_class()?;
    let (sender, receiver) = mpsc::channel();
    let completion_handler = RcBlock::new(move |granted: Bool| {
        let _ = sender.send(granted.as_bool());
    });

    unsafe {
        let () = msg_send![
            capture_device_class,
            requestAccessForMediaType: AVMediaTypeAudio,
            completionHandler: &*completion_handler
        ];
    }

    receiver.recv().map_err(|_| {
        String::from("macOS did not return a microphone permission decision.")
    })
}

#[tauri::command]
pub fn request_microphone_permission() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let current_status = authorization_status_for_audio()?;

        if current_status == 0 {
            let granted = request_audio_access()?;
            return Ok(if granted {
                String::from(AUTHORIZED_STATUS)
            } else {
                String::from(DENIED_STATUS)
            });
        }

        return Ok(String::from(status_label(current_status)));
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(String::from(AUTHORIZED_STATUS))
    }
}
