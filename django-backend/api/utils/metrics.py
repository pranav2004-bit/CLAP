from importlib.util import find_spec

if find_spec('prometheus_client') is not None:
    from prometheus_client import Counter, Histogram, Gauge

    submissions_total = Counter('clap_submissions_total', 'Total submissions', ['status'])
    llm_validation_failures_total = Counter('clap_llm_validation_failures_total', 'LLM validation failures', ['domain', 'failure_type'])
    report_generation_duration = Histogram('clap_report_generation_duration_seconds', 'Report generation duration seconds')
    dlq_unresolved_count = Gauge('clap_dlq_unresolved_count', 'Unresolved DLQ count')
else:
    class _Noop:
        def labels(self, *args, **kwargs):
            return self

        def inc(self, *args, **kwargs):
            return None

        def observe(self, *args, **kwargs):
            return None

        def set(self, *args, **kwargs):
            return None

    submissions_total = _Noop()
    llm_validation_failures_total = _Noop()
    report_generation_duration = _Noop()
    dlq_unresolved_count = _Noop()
