use std::path::PathBuf;
use tauri::Manager;

fn streams_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("streams");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn save_stream(app: tauri::AppHandle, name: String, data: Vec<u8>) -> Result<(), String> {
    let dir = streams_dir(&app)?;
    let path = dir.join(format!("{}.ydoc", name));
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_stream(app: tauri::AppHandle, name: String) -> Result<Vec<u8>, String> {
    let dir = streams_dir(&app)?;
    let path = dir.join(format!("{}.ydoc", name));
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_streams(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = streams_dir(&app)?;
    let mut names: Vec<String> = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "ydoc") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                names.push(stem.to_string());
            }
        }
    }
    names.sort_by(|a, b| b.cmp(a)); // newest first
    Ok(names)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_stream, load_stream, list_streams])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
