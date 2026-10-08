use crate::commands::settings::get_all_settings;
use serde_json::{json, Value};
use tauri::AppHandle;

#[derive(Clone, Copy, PartialEq)]
pub enum WebhookLevel { Success, Failure, Warning }

pub struct WebhookEvent {
    pub operation: String,
    pub routine: String,
    pub level: WebhookLevel,
    pub origin: String,
    pub destination: String,
    pub duration: Option<String>,
    pub details: Vec<(String, String)>,
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max { s.to_string() } else { format!("{}…", s.chars().take(max).collect::<String>()) }
}

fn flag(settings: &std::collections::HashMap<String, String>, key: &str, default: bool) -> bool {
    settings.get(key).map(|v| v == "true").unwrap_or(default)
}

fn level_label(l: WebhookLevel) -> &'static str {
    match l { WebhookLevel::Success => "Sucesso", WebhookLevel::Failure => "Falha", WebhookLevel::Warning => "Aviso" }
}

fn facts(ev: &WebhookEvent) -> Vec<(String, String)> {
    let mut f = vec![
        ("Rotina".to_string(), truncate(&ev.routine, 200)),
        ("Status".to_string(), level_label(ev.level).to_string()),
        ("Origem".to_string(), truncate(&ev.origin, 300)),
        ("Destino".to_string(), truncate(&ev.destination, 300)),
    ];
    if let Some(d) = &ev.duration { f.push(("Duração".to_string(), d.clone())); }
    for (k, v) in &ev.details { f.push((k.clone(), truncate(v, 500))); }
    f
}

pub fn build_event_payload(url: &str, ev: &WebhookEvent) -> Value {
    let title = format!("Kopher Shield: {} - {}", ev.operation, level_label(ev.level));
    let facts = facts(ev);

    if url.contains("discord.com") || url.contains("discordapp.com") {
        let color = match ev.level { WebhookLevel::Success => 0x27AE60, WebhookLevel::Failure => 0xEF4444, WebhookLevel::Warning => 0xF59E0B };
        let fields: Vec<Value> = facts.iter().map(|(k, v)| json!({ "name": k, "value": truncate(v, 1000), "inline": v.chars().count() < 40 })).collect();
        json!({ "username": "Kopher Shield", "embeds": [{ "title": title, "color": color, "fields": fields }] })
    } else if url.contains("hooks.slack.com") {
        let icon = match ev.level { WebhookLevel::Success => ":white_check_mark:", WebhookLevel::Failure => ":x:", WebhookLevel::Warning => ":warning:" };
        let fields: Vec<Value> = facts.iter().map(|(k, v)| json!({ "type": "mrkdwn", "text": format!("*{}*\n{}", k, v) })).collect();
        json!({
            "text": title,
            "blocks": [
                { "type": "header", "text": { "type": "plain_text", "text": format!("{} {}", icon, title) } },
                { "type": "section", "fields": fields }
            ]
        })
    } else {
        let color = match ev.level { WebhookLevel::Success => "Good", WebhookLevel::Failure => "Attention", WebhookLevel::Warning => "Warning" };
        let fact_set: Vec<Value> = facts.iter().map(|(k, v)| json!({ "title": k, "value": v })).collect();
        json!({
            "type": "message",
            "attachments": [{
                "contentType": "application/vnd.microsoft.card.adaptive",
                "contentUrl": null,
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        { "type": "TextBlock", "size": "Medium", "weight": "Bolder", "color": color, "text": title, "wrap": true },
                        { "type": "FactSet", "facts": fact_set }
                    ]
                }
            }]
        })
    }
}

/// Lê as preferências e dispara o webhook em segundo plano (não bloqueia o chamador).
pub fn dispatch(app: &AppHandle, ev: WebhookEvent) {
    let settings = match get_all_settings(app.clone()) { Ok(s) => s, Err(_) => return };
    let url = settings.get("teams_webhook").map(|u| u.trim().to_string()).unwrap_or_default();
    if url.is_empty() { return; }

    let enabled = match ev.level {
        WebhookLevel::Success => flag(&settings, "webhook_on_success", true),
        WebhookLevel::Failure => flag(&settings, "webhook_on_failure", true),
        WebhookLevel::Warning => flag(&settings, "webhook_on_warning", false),
    };
    if !enabled { return; }

    let parsed = match reqwest::Url::parse(&url) { Ok(u) if u.scheme() == "https" || u.scheme() == "http" => u, _ => return };
    let payload = build_event_payload(&url, &ev);
    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(15)).build() { Ok(c) => c, Err(_) => return };
        let result = client.post(parsed).json(&payload).send().await;
        let err = match result {
            Ok(r) if r.status().is_success() => return,
            Ok(r) => format!("HTTP {}", r.status().as_u16()),
            Err(e) => e.to_string(),
        };
        crate::commands::system::write_audit_log(&app, "WARNING", &format!("Falha ao enviar webhook ITSM: {}", err));
    });
}

pub fn notify_failure(app: &AppHandle, operation: &str, routine: &str, origin: &str, destination: &str, reason: &str) {
    dispatch(app, WebhookEvent {
        operation: operation.to_string(),
        routine: routine.to_string(),
        level: WebhookLevel::Failure,
        origin: origin.to_string(),
        destination: destination.to_string(),
        duration: None,
        details: vec![("Motivo".to_string(), reason.to_string())],
    });
}
#[cfg(test)]
mod tests {
    use super::*;

    fn ev(level: WebhookLevel) -> WebhookEvent {
        WebhookEvent { operation: "Backup".into(), routine: "Financeiro".into(), level, origin: "C:\\Dados".into(), destination: "Nuvem".into(), duration: Some("00h 01m 02s".into()), details: vec![("Arquivos processados".into(), "10".into())] }
    }

    #[test]
    fn payload_per_platform() {
        let e = ev(WebhookLevel::Failure);
        assert!(build_event_payload("https://discord.com/api/webhooks/1/x", &e)["embeds"].is_array());
        assert!(build_event_payload("https://hooks.slack.com/services/a", &e)["blocks"].is_array());
        let teams = build_event_payload("https://x.webhook.office.com/y", &e);
        assert_eq!(teams["attachments"][0]["content"]["type"], "AdaptiveCard");
        assert!(teams.to_string().contains("Financeiro"));
    }
}