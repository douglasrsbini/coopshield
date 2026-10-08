// Ainda não consumido pelo motor de upload (S3/R2); preparado para integração.
#![allow(dead_code)]

use chrono::NaiveTime;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

const BYTES_PER_MB: f64 = 1024.0 * 1024.0;
const DEFAULT_START: (u32, u32) = (8, 0);
const DEFAULT_END: (u32, u32) = (18, 0);

/// Política de limite de banda lida da tabela `system_settings`
/// (chaves `bw_limit_enabled`, `bw_limit_mbps`, `bw_business_start`, `bw_business_end`).
/// O limite só é aplicado dentro da janela de horário comercial.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BandwidthPolicy {
    pub enabled: bool,
    pub max_mbps: f64,
    pub business_start: NaiveTime,
    pub business_end: NaiveTime,
}

impl Default for BandwidthPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            max_mbps: 10.0,
            business_start: NaiveTime::from_hms_opt(DEFAULT_START.0, DEFAULT_START.1, 0).unwrap(),
            business_end: NaiveTime::from_hms_opt(DEFAULT_END.0, DEFAULT_END.1, 0).unwrap(),
        }
    }
}

fn parse_hhmm(value: Option<&String>) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(value?.trim(), "%H:%M").ok()
}

impl BandwidthPolicy {
    pub fn from_settings(settings: &HashMap<String, String>) -> Self {
        let defaults = Self::default();
        Self {
            enabled: settings.get("bw_limit_enabled").map(|v| v == "true").unwrap_or(false),
            max_mbps: settings
                .get("bw_limit_mbps")
                .and_then(|v| v.trim().replace(',', ".").parse::<f64>().ok())
                .filter(|v| v.is_finite() && *v > 0.0)
                .unwrap_or(defaults.max_mbps),
            business_start: parse_hhmm(settings.get("bw_business_start")).unwrap_or(defaults.business_start),
            business_end: parse_hhmm(settings.get("bw_business_end")).unwrap_or(defaults.business_end),
        }
    }

    /// Janelas que cruzam a meia-noite (ex.: 22:00 -> 06:00) são suportadas.
    pub fn is_business_hours(&self, now: NaiveTime) -> bool {
        if self.business_start == self.business_end {
            return false;
        }
        if self.business_start < self.business_end {
            now >= self.business_start && now < self.business_end
        } else {
            now >= self.business_start || now < self.business_end
        }
    }

    /// Limite efetivo em bytes/s para o horário informado; `None` = sem limite.
    pub fn effective_limit_bytes_per_sec(&self, now: NaiveTime) -> Option<u64> {
        if self.enabled && self.is_business_hours(now) {
            Some((self.max_mbps * BYTES_PER_MB) as u64)
        } else {
            None
        }
    }
}

/// Pacer para o motor de upload: após enviar cada bloco, `delay_for` informa
/// quanto tempo aguardar para manter a média abaixo do limite.
#[derive(Debug, Clone, Copy)]
pub struct Throttle {
    bytes_per_sec: Option<u64>,
}

impl Throttle {
    pub fn new(policy: &BandwidthPolicy, now: NaiveTime) -> Self {
        Self { bytes_per_sec: policy.effective_limit_bytes_per_sec(now) }
    }

    pub fn unlimited() -> Self {
        Self { bytes_per_sec: None }
    }

    pub fn delay_for(&self, bytes_sent: usize) -> Duration {
        match self.bytes_per_sec {
            Some(limit) if limit > 0 => Duration::from_secs_f64(bytes_sent as f64 / limit as f64),
            _ => Duration::ZERO,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(h: u32, m: u32) -> NaiveTime {
        NaiveTime::from_hms_opt(h, m, 0).unwrap()
    }

    #[test]
    fn disabled_policy_never_limits() {
        assert_eq!(BandwidthPolicy::default().effective_limit_bytes_per_sec(t(10, 0)), None);
    }

    #[test]
    fn limits_only_inside_business_window() {
        let policy = BandwidthPolicy { enabled: true, ..Default::default() };
        assert_eq!(policy.effective_limit_bytes_per_sec(t(9, 0)), Some(10 * 1024 * 1024));
        assert_eq!(policy.effective_limit_bytes_per_sec(t(18, 0)), None);
        assert_eq!(policy.effective_limit_bytes_per_sec(t(2, 0)), None);
    }

    #[test]
    fn window_crossing_midnight() {
        let policy = BandwidthPolicy { enabled: true, business_start: t(22, 0), business_end: t(6, 0), ..Default::default() };
        assert!(policy.is_business_hours(t(23, 0)));
        assert!(policy.is_business_hours(t(5, 0)));
        assert!(!policy.is_business_hours(t(12, 0)));
    }

    #[test]
    fn parses_settings_with_fallbacks() {
        let mut m = HashMap::new();
        m.insert("bw_limit_enabled".to_string(), "true".to_string());
        m.insert("bw_limit_mbps".to_string(), "2,5".to_string());
        m.insert("bw_business_start".to_string(), "invalido".to_string());
        let p = BandwidthPolicy::from_settings(&m);
        assert!(p.enabled);
        assert_eq!(p.max_mbps, 2.5);
        assert_eq!(p.business_start, t(8, 0));
    }

    #[test]
    fn throttle_delay_matches_limit() {
        let policy = BandwidthPolicy { enabled: true, max_mbps: 1.0, ..Default::default() };
        let throttle = Throttle::new(&policy, t(9, 0));
        assert_eq!(throttle.delay_for(1024 * 1024), Duration::from_secs(1));
        assert_eq!(Throttle::unlimited().delay_for(1024 * 1024), Duration::ZERO);
    }
}