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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_stream, load_stream])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
