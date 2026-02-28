#[derive(Debug, Clone, PartialEq, Eq)]
struct MonitorSelection {
    name: String,
    width: u32,
    height: u32,
    position_x: Option<i32>,
    position_y: Option<i32>,
}

fn parse_monitor_key(key: &str) -> Option<MonitorSelection> {
    let parts: Vec<&str> = key.split('|').collect();

    if parts.len() >= 3 {
        let name = parts[..parts.len() - 2].join("|");
        let size = parts[parts.len() - 2];
        let position = parts[parts.len() - 1];

        let (width_raw, height_raw) = size.split_once('x')?;
        let (x_raw, y_raw) = position.split_once(',')?;

        let width = width_raw.parse().ok()?;
        let height = height_raw.parse().ok()?;
        let position_x = x_raw.parse().ok()?;
        let position_y = y_raw.parse().ok()?;

        return Some(MonitorSelection {
            name,
            width,
            height,
            position_x: Some(position_x),
            position_y: Some(position_y),
        });
    }

    if parts.len() >= 2 {
        let name = parts[..parts.len() - 1].join("|");
        let size = parts[parts.len() - 1];
        let (width_raw, height_raw) = size.split_once('x')?;

        let width = width_raw.parse().ok()?;
        let height = height_raw.parse().ok()?;

        return Some(MonitorSelection {
            name,
            width,
            height,
            position_x: None,
            position_y: None,
        });
    }

    None
}

fn fallback_monitor_key(saved: &str, available: &[&str]) -> String {
    if available.iter().any(|candidate| *candidate == saved) {
        return saved.to_string();
    }

    let parsed_saved = parse_monitor_key(saved);
    if let Some(saved_geometry) = parsed_saved {
        if let Some(found) = available.iter().find(|candidate| {
            parse_monitor_key(candidate)
                .map(|parsed| parsed.name == saved_geometry.name && parsed.width == saved_geometry.width && parsed.height == saved_geometry.height)
                .unwrap_or(false)
        }) {
            return (*found).to_string();
        }
    }

    available.first().copied().unwrap_or(saved).to_string()
}

#[test]
fn runtime_monitor_fallback_prefers_exact_match_then_geometry_then_first_available() {
    let available = [
        "Built-in Retina Display|3024x1964|0,0",
        "DELL U2722D|1920x1080|1512,0",
    ];

    let exact = fallback_monitor_key("DELL U2722D|1920x1080|1512,0", &available);
    assert_eq!(exact, "DELL U2722D|1920x1080|1512,0");

    let by_geometry = fallback_monitor_key("DELL U2722D|1920x1080|9999,9999", &available);
    assert_eq!(by_geometry, "DELL U2722D|1920x1080|1512,0");

    let fallback = fallback_monitor_key("Missing Display|111x222|0,0", &available);
    assert_eq!(fallback, "Built-in Retina Display|3024x1964|0,0");
}

#[test]
fn runtime_monitor_fallback_parses_legacy_name_and_size_format() {
    let parsed = parse_monitor_key("Built-in Retina Display|3024x1964").expect("parsed monitor");

    assert_eq!(parsed.name, "Built-in Retina Display");
    assert_eq!(parsed.width, 3024);
    assert_eq!(parsed.height, 1964);
    assert_eq!(parsed.position_x, None);
    assert_eq!(parsed.position_y, None);
}
