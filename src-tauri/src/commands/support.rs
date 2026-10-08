use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle};

use crate::commands::system::{get_os_hostname, write_audit_log};
use crate::database::sqlite::get_db_path;

const SUPPORT_RECIPIENT: &str = "support@binaver.com";
const MAX_FIELD_LEN: usize = 10_000;

/// Dados enviados pelo formulário React.
#[derive(Debug, Deserialize)]
pub struct TicketPayload {
    pub subject: String,
    pub category: String,
    pub priority: String,
    pub message: String,
    #[serde(default)]
    pub attachments: Vec<String>,
}

/// Dados vitais coletados no backend; o frontend não pode forjá-los.
#[derive(Debug, Serialize)]
struct SystemSnapshot {
    machine_name: String,
    os_name: String,
    os_arch: String,
    app_version: String,
    sqlite_status: String,
}

#[derive(Debug, Serialize)]
struct OutboundTicket<'a> {
    to: &'static str,
    subject: String,
    ticket: &'a TicketPayloadView<'a>,
    system: SystemSnapshot,
    sent_at: String,
}

#[derive(Debug, Serialize)]
struct TicketPayloadView<'a> {
    subject: &'a str,
    category: &'a str,
    priority: &'a str,
    message: &'a str,
    attachment_names: Vec<String>,
}

fn collect_sqlite_status(app: &AppHandle) -> String {
    let path = get_db_path(app);
    match Connection::open(&path) {
        Ok(conn) => match conn.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0)) {
            Ok(result) if result.eq_ignore_ascii_case("ok") => "Conectado / Íntegro".to_string(),
            Ok(result) => format!("Conectado / Inconsistente ({})", result),
            Err(e) => format!("Conectado / Falha na verificação ({})", e),
        },
        Err(e) => format!("Indisponível ({})", e),
    }
}

fn collect_system_snapshot(app: &AppHandle) -> SystemSnapshot {
    SystemSnapshot {
        machine_name: get_os_hostname().unwrap_or_else(|_| "Desconhecido".to_string()),
        os_name: std::env::consts::OS.to_string(),
        os_arch: std::env::consts::ARCH.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        sqlite_status: collect_sqlite_status(app),
    }
}

fn validate(payload: &TicketPayload) -> Result<(), String> {
    if payload.subject.trim().is_empty() || payload.message.trim().is_empty() {
        return Err("Assunto e descrição são obrigatórios.".to_string());
    }
    if payload.subject.len() > 300 || payload.message.len() > MAX_FIELD_LEN {
        return Err("O chamado excede o tamanho máximo permitido.".to_string());
    }
    Ok(())
}

/// Ponte de suporte: agrega os dados do formulário com a telemetria do sistema e
/// prepara o envio para a BINAVER. O transporte (SMTP/Webhook) é simulado; as
/// credenciais devem viver apenas no backend quando for integrado.
#[command]
pub async fn send_support_ticket(app: AppHandle, payload: TicketPayload) -> Result<(), String> {
    validate(&payload)?;

    let system = collect_system_snapshot(&app);
    let view = TicketPayloadView {
        subject: payload.subject.trim(),
        category: &payload.category,
        priority: &payload.priority,
        message: payload.message.trim(),
        attachment_names: payload
            .attachments
            .iter()
            .map(|p| {
                std::path::Path::new(p)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| p.clone())
            })
            .collect(),
    };

    let outbound = OutboundTicket {
        to: SUPPORT_RECIPIENT,
        subject: format!("[Kopher Shield][{}][{}] {}", view.priority, view.category, view.subject),
        ticket: &view,
        system,
        sent_at: chrono::Local::now().to_rfc3339(),
    };

    let body = serde_json::to_string_pretty(&outbound).map_err(|e| e.to_string())?;
    println!("[support-bridge] POST seguro simulado -> BINAVER API ({})\n{}", SUPPORT_RECIPIENT, body);

    write_audit_log(
        &app,
        "INFO",
        &format!("Chamado '{}' empacotado e encaminhado à ponte de suporte ({}).", view.subject, SUPPORT_RECIPIENT),
    );

    Ok(())
}
