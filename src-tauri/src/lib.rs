mod ai;
mod agent;

use std::path::PathBuf;
use tauri::Manager;
use ai::AiConfig;
use ai::Message;

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
    names.sort_by(|a, b| b.cmp(a));
    Ok(names)
}

#[tauri::command]
async fn chat_complete_stream(
    app: tauri::AppHandle,
    messages: Vec<Message>,
    notes_context: String,
    known_note_ids: Vec<String>,
    suggest_title: bool,
) -> Result<agent::AgentResponse, String> {
    let config = app.state::<AiConfig>().inner().clone();

    let mut prompt = agent::system_prompt(&notes_context);
    if suggest_title {
        prompt.push_str("\n\n**Important:** Since this is a new conversation, suggest a short title (max 5 words). Output [TITLE: your title here] at the start of your response.");
    }

    let system_msg = Message {
        role: "system".into(),
        content: prompt,
    };

    let mut all_messages = vec![system_msg];
    all_messages.extend(messages);

    let tools = Some(agent::tool_definitions());
    let ai_response = ai::stream_chat(app, &config, all_messages, tools).await?;

    let mut parsed = agent::parse_response(&ai_response, &known_note_ids);
    parsed.read_note_ids = known_note_ids;
    parsed.chat_html = strip_incomplete_tags(&parsed.chat_html);

    if parsed.chat_html.trim().is_empty() && !parsed.actions.is_empty() {
        let descs: Vec<String> = parsed
            .actions
            .iter()
            .map(|a| match a {
                agent::AgentAction::CreateNote { title, .. } => format!("created \"{}\"", title),
                agent::AgentAction::UpdateNote { note_id, .. } => {
                    format!("updated \"{}\"", note_id)
                }
                agent::AgentAction::ArchiveNote { note_id } => {
                    format!("archived \"{}\"", note_id)
                }
                agent::AgentAction::TagNote { note_id, .. } => {
                    format!("tagged \"{}\"", note_id)
                }
            })
            .collect();
        parsed.chat_html = format!("Done — {}.", descs.join(", "));
    }

    Ok(parsed)
}

fn strip_incomplete_tags(s: &str) -> String {
    let mut result = s.to_string();
    loop {
        let before = result.len();
        if let Some(start) = result.find("[TITLE:") {
            if let Some(end) = result[start..].find(']') {
                result.replace_range(start..start + end + 1, "");
                continue;
            }
        }
        if let Some(start) = result.find("[CREATE:") {
            if let Some(end) = result[start..].find("[/CREATE]") {
                result.replace_range(start..start + end + 9, "");
                continue;
            }
        }
        if let Some(start) = result.find("[UPDATE:") {
            if let Some(end) = result[start..].find("[/UPDATE]") {
                result.replace_range(start..start + end + 9, "");
                continue;
            }
        }
        if let Some(start) = result.find("[ARCHIVE:") {
            if let Some(end) = result[start..].find(']') {
                result.replace_range(start..start + end + 1, "");
                continue;
            }
        }
        if let Some(start) = result.find("[TAG:") {
            if let Some(end) = result[start..].find("[/TAG]") {
                result.replace_range(start..start + end + 6, "");
                continue;
            }
        }
        if result.len() == before {
            break;
        }
    }
    result.trim().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AiConfig::default())
        .invoke_handler(tauri::generate_handler![
            save_stream,
            load_stream,
            list_streams,
            chat_complete_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
