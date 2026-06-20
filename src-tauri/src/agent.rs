use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::ai::{AiResponse, ToolDefinition};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentAction {
    CreateNote {
        note_id: String,
        title: String,
        content: String,
        tags: Vec<String>,
    },
    UpdateNote {
        note_id: String,
        content: String,
    },
    ArchiveNote {
        note_id: String,
    },
    TagNote {
        note_id: String,
        tags: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponse {
    pub chat_html: String,
    pub actions: Vec<AgentAction>,
    pub read_note_ids: Vec<String>,
    pub suggested_title: Option<String>,
}

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            tool_type: "function".into(),
            function: crate::ai::ToolFunction {
                name: "create_note".into(),
                description: "Create a new note on the spatial canvas. A new node will appear on the graph.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "note_id": {
                            "type": "string",
                            "description": "Unique kebab-case identifier (e.g. 'project-plan')"
                        },
                        "title": {
                            "type": "string",
                            "description": "Display title for the note"
                        },
                        "content": {
                            "type": "string",
                            "description": "Markdown content for the note body"
                        },
                        "tags": {
                            "type": "array",
                            "items": { "type": "string" },
                            "maxItems": 5,
                            "description": "Tags for categorization (max 5). Use for people, projects, contexts."
                        }
                    },
                    "required": ["note_id", "title"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".into(),
            function: crate::ai::ToolFunction {
                name: "update_note".into(),
                description: "Update the content of an existing note. Overwrites the current content.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "note_id": {
                            "type": "string",
                            "description": "The ID of the note to update"
                        },
                        "content": {
                            "type": "string",
                            "description": "New markdown content for the note"
                        }
                    },
                    "required": ["note_id", "content"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".into(),
            function: crate::ai::ToolFunction {
                name: "archive_note".into(),
                description: "Archive a note so it is hidden from the canvas and excluded from future AI context.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "note_id": {
                            "type": "string",
                            "description": "The ID of the note to archive"
                        }
                    },
                    "required": ["note_id"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".into(),
            function: crate::ai::ToolFunction {
                name: "tag_note".into(),
                description: "Add or replace tags on an existing note. Tags help organize and filter notes.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "note_id": {
                            "type": "string",
                            "description": "The ID of the note to tag"
                        },
                        "tags": {
                            "type": "array",
                            "items": { "type": "string" },
                            "maxItems": 5,
                            "description": "Tags (max 5). Use for people, projects, contexts."
                        }
                    },
                    "required": ["note_id", "tags"]
                }),
            },
        },
    ]
}

pub fn system_prompt(notes_context: &str) -> String {
    format!(
        r#"You are Dialoq AI, an AI assistant for dialogue-based note-taking.

You help the user think, organize, and connect ideas on a spatial canvas of notes.

## Current notes on the canvas
These are the notes that exist. Each has an ID and preview of content:
{}

## Your tools
You have access to these tools:
- `create_note`: Creates a new note on the canvas.
  Parameters: note_id (kebab-case), title, content (markdown), tags (optional array, max 5)
- `update_note`: Updates the content of an existing note.
  Parameters: note_id, content (new markdown body)
- `archive_note`: Archives a note — hides it from the canvas and future AI context.
  Parameters: note_id
- `tag_note`: Adds or replaces tags on an existing note.
  Parameters: note_id, tags (array of strings, max 5)

## Rules
1. Always use the tools for creating, updating, archiving, or tagging notes — never just say you'll do it.
2. After calling a tool, **always confirm what you did** in your chat response.
3. Link related notes using [[note-id|Title]] wikilink syntax in note content.
4. Keep responses concise and useful.
5. Generate 1–5 relevant tags per new note (people, projects, topics).
6. If the user asks you to suggest a title for this conversation, output [TITLE: short title here] at the start of your response.
7. Use the current note context to inform your responses. Reference existing notes when relevant."#,
        notes_context
    )
}

pub fn parse_response(ai: &AiResponse, known_note_ids: &[String]) -> AgentResponse {
    let mut actions = Vec::new();
    let mut suggested_title = None;

    // Phase 1: Try structured tool calls
    if !ai.tool_calls.is_empty() {
        for call in &ai.tool_calls {
            match call.name.as_str() {
                "create_note" => {
                    let note_id = call.arguments["note_id"].as_str().unwrap_or("").to_string();
                    let title = call.arguments["title"].as_str().unwrap_or(&note_id).to_string();
                    let content = call.arguments["content"].as_str().unwrap_or("").to_string();
                    let tags: Vec<String> = call.arguments["tags"]
                        .as_array()
                        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                        .unwrap_or_default();
                    if !note_id.is_empty() {
                        actions.push(AgentAction::CreateNote { note_id, title, content, tags });
                    }
                }
                "update_note" => {
                    let note_id = call.arguments["note_id"].as_str().unwrap_or("").to_string();
                    let content = call.arguments["content"].as_str().unwrap_or("").to_string();
                    if !note_id.is_empty() {
                        actions.push(AgentAction::UpdateNote { note_id, content });
                    }
                }
                "archive_note" => {
                    let note_id = call.arguments["note_id"].as_str().unwrap_or("").to_string();
                    if !note_id.is_empty() {
                        actions.push(AgentAction::ArchiveNote { note_id });
                    }
                }
                "tag_note" => {
                    let note_id = call.arguments["note_id"].as_str().unwrap_or("").to_string();
                    let tags: Vec<String> = call.arguments["tags"]
                        .as_array()
                        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                        .unwrap_or_default();
                    if !note_id.is_empty() {
                        actions.push(AgentAction::TagNote { note_id, tags });
                    }
                }
                _ => {}
            }
        }
    }

    // Phase 2: Fallback — parse text-based commands
    if actions.is_empty() {
        actions = parse_text_commands(&ai.content, known_note_ids);
    }

    // Extract title from content
    let content = &ai.content;
    if let Some(start) = content.find("[TITLE:") {
        let after = &content[start + 7..];
        if let Some(end) = after.find(']') {
            let raw = after[..end].trim();
            if !raw.is_empty() {
                suggested_title = Some(raw.to_string());
            }
        }
    }

    // Clean the chat_html: strip command tags
    let chat_html = strip_commands(&ai.content);

    AgentResponse {
        chat_html,
        actions,
        read_note_ids: Vec::new(),
        suggested_title,
    }
}

fn parse_text_commands(text: &str, known_note_ids: &[String]) -> Vec<AgentAction> {
    let mut actions = Vec::new();

    // Parse [CREATE: note-id]Title|Content[/CREATE]
    let mut rest = text;
    while let Some(start) = rest.find("[CREATE:") {
        let after_start = &rest[start + 8..];
        let colon_end = after_start.find(']').unwrap_or(0);
        let note_id = after_start[..colon_end].trim().to_string();

        let body_start = start + 8 + colon_end + 1;
        let body = &rest[body_start..];
        if let Some(end_tag) = body.find("[/CREATE]") {
            let inner = &body[..end_tag];
            let (title, content) = inner.split_once('\n').unwrap_or((inner, ""));
            actions.push(AgentAction::CreateNote {
                note_id,
                title: title.trim().to_string(),
                content: content.trim().to_string(),
                tags: Vec::new(),
            });
            rest = &body[end_tag + 9..];
        } else {
            break;
        }
    }

    // Parse [UPDATE: note-id]Content[/UPDATE]
    let mut rest = text;
    while let Some(start) = rest.find("[UPDATE:") {
        let after_start = &rest[start + 8..];
        let colon_end = after_start.find(']').unwrap_or(0);
        let note_id = after_start[..colon_end].trim().to_string();
        let body_start = start + 8 + colon_end + 1;
        let body = &rest[body_start..];
        if let Some(end_tag) = body.find("[/UPDATE]") {
            let content = &body[..end_tag];
            if !note_id.is_empty() {
                actions.push(AgentAction::UpdateNote {
                    note_id,
                    content: content.trim().to_string(),
                });
            }
            rest = &body[end_tag + 9..];
        } else {
            break;
        }
    }

    // Parse [ARCHIVE: note-id]
    let mut rest = text;
    while let Some(start) = rest.find("[ARCHIVE:") {
        let after = &rest[start + 9..];
        if let Some(end) = after.find(']') {
            let note_id = after[..end].trim().to_string();
            if !note_id.is_empty() {
                actions.push(AgentAction::ArchiveNote { note_id });
            }
            rest = &after[end + 1..];
        } else {
            break;
        }
    }

    // Parse [TAG: note-id]tag1, tag2[/TAG]
    let mut rest = text;
    while let Some(start) = rest.find("[TAG:") {
        let after_start = &rest[start + 5..];
        let colon_end = after_start.find(']').unwrap_or(0);
        let note_id = after_start[..colon_end].trim().to_string();
        let body_start = start + 5 + colon_end + 1;
        let body = &rest[body_start..];
        if let Some(end_tag) = body.find("[/TAG]") {
            let raw = &body[..end_tag];
            let tags: Vec<String> = raw.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            if !note_id.is_empty() && !tags.is_empty() {
                actions.push(AgentAction::TagNote { note_id, tags });
            }
            rest = &body[end_tag + 6..];
        } else {
            break;
        }
    }

    actions
}

fn strip_commands(text: &str) -> String {
    let mut result = text.to_string();
    // Remove [TITLE: ...]
    if let Some(start) = result.find("[TITLE:") {
        if let Some(end) = result[start..].find(']') {
            result.replace_range(start..start + end + 1, "");
        }
    }
    // Remove [CREATE: ...[/CREATE] blocks
    loop {
        if let Some(start) = result.find("[CREATE:") {
            if let Some(end) = result[start..].find("[/CREATE]") {
                result.replace_range(start..start + end + 9, "");
                continue;
            }
        }
        break;
    }
    // Remove [UPDATE: ...[/UPDATE] blocks
    loop {
        if let Some(start) = result.find("[UPDATE:") {
            if let Some(end) = result[start..].find("[/UPDATE]") {
                result.replace_range(start..start + end + 9, "");
                continue;
            }
        }
        break;
    }
    // Remove [ARCHIVE: ...]
    loop {
        if let Some(start) = result.find("[ARCHIVE:") {
            if let Some(end) = result[start..].find(']') {
                result.replace_range(start..start + end + 1, "");
                continue;
            }
        }
        break;
    }
    // Remove [TAG: ...[/TAG] blocks
    loop {
        if let Some(start) = result.find("[TAG:") {
            if let Some(end) = result[start..].find("[/TAG]") {
                result.replace_range(start..start + end + 6, "");
                continue;
            }
        }
        break;
    }
    result.trim().to_string()
}
