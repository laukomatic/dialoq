use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone)]
pub struct AiConfig {
    pub api_url: String,
    pub model: String,
    pub api_key: Option<String>,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            api_url: "http://localhost:1234/v1".into(),
            model: "google/gemma-4-e4b".into(),
            api_key: None,
        }
    }
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ToolDefinition>>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: ToolFunction,
}

#[derive(Debug, Serialize)]
pub struct ToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Deserialize)]
struct SseChunk {
    #[serde(default)]
    choices: Vec<SseChoice>,
}

#[derive(Debug, Deserialize)]
struct SseChoice {
    #[serde(default)]
    delta: SseDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct SseDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<SseToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
struct SseToolCallDelta {
    #[serde(default)]
    index: u32,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<SseToolCallFunctionDelta>,
}

#[derive(Debug, Deserialize)]
struct SseToolCallFunctionDelta {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
}

pub async fn stream_chat(
    app: AppHandle,
    config: &AiConfig,
    messages: Vec<Message>,
    tools: Option<Vec<ToolDefinition>>,
) -> Result<AiResponse, String> {
    let client = reqwest::Client::new();
    let mut req = client
        .post(format!("{}/chat/completions", config.api_url))
        .json(&ChatRequest {
            model: config.model.clone(),
            messages,
            tools,
            stream: true,
        });

    if let Some(key) = &config.api_key {
        req = req.header("Authorization", format!("Bearer {}", key));
    }

    let response = req.send().await.map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    let mut full_content = String::new();
    let mut tool_calls: Vec<ToolCall> = Vec::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                continue;
            }

            let parsed: SseChunk = match serde_json::from_str(data) {
                Ok(p) => p,
                Err(_) => continue,
            };

            for choice in &parsed.choices {
                // Emit content tokens
                if let Some(content) = &choice.delta.content {
                    full_content.push_str(content);
                    let _ = app.emit("ai:token", content.clone());
                }

                // Accumulate tool calls
                if let Some(deltas) = &choice.delta.tool_calls {
                    for delta in deltas {
                        let idx = delta.index as usize;
                        while tool_calls.len() <= idx {
                            tool_calls.push(ToolCall {
                                id: String::new(),
                                name: String::new(),
                                arguments: Value::Null,
                            });
                        }
                        if let Some(id) = &delta.id {
                            tool_calls[idx].id = id.clone();
                        }
                        if let Some(name) = &delta.function.as_ref().and_then(|f| f.name.as_ref()) {
                            tool_calls[idx].name = name.to_string();
                        }
                        if let Some(args) = delta.function.as_ref().and_then(|f| f.arguments.as_ref()) {
                            let current = tool_calls[idx].arguments.to_string();
                            let next = if current == "null" { args.clone() } else { current + args };
                            if let Ok(v) = serde_json::from_str(&next) {
                                tool_calls[idx].arguments = v;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(AiResponse {
        content: full_content,
        tool_calls,
    })
}

pub async fn chat_completion(
    config: &AiConfig,
    messages: Vec<Message>,
    tools: Option<Vec<ToolDefinition>>,
) -> Result<AiResponse, String> {
    let client = reqwest::Client::new();
    let mut req = client
        .post(format!("{}/chat/completions", config.api_url))
        .json(&ChatRequest {
            model: config.model.clone(),
            messages,
            tools,
            stream: false,
        });

    if let Some(key) = &config.api_key {
        req = req.header("Authorization", format!("Bearer {}", key));
    }

    let response = req.send().await.map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body));
    }

    let body: Value = response.json().await.map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let mut tool_calls = Vec::new();
    if let Some(calls) = body["choices"][0]["message"]["tool_calls"].as_array() {
        for call in calls {
            let id = call["id"].as_str().unwrap_or("").to_string();
            let name = call["function"]["name"].as_str().unwrap_or("").to_string();
            let raw_args = call["function"]["arguments"].as_str().unwrap_or("{}");
            let arguments: Value = serde_json::from_str(raw_args).unwrap_or(Value::Null);
            tool_calls.push(ToolCall { id, name, arguments });
        }
    }

    Ok(AiResponse { content, tool_calls })
}
