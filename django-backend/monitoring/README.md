# CLAP Monitoring Assets

This folder contains production-oriented monitoring artifacts aligned with the CLAP enterprise architecture.

## Grafana Dashboards
- `grafana/dashboards/pipeline-overview.json`
- `grafana/dashboards/llm-health.json`
- `grafana/dashboards/infrastructure.json`

Import these JSON files into Grafana (Dashboards → New → Import).

## Prometheus Alerts
- `prometheus/alert-rules.yml`

Load this file using your Prometheus `rule_files` configuration.

## Notes
- These dashboards and alerts assume the metrics listed in architecture section 12.2 are available.
- If a metric is not exported yet in the environment, the corresponding panel/alert will show no data until instrumented.
