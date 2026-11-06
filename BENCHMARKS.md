# UNTIL intrinsic benchmarks

Generated: 2026-11-06T17:58:49.360Z

Environment: v24.21.0 / win32 / x64

| Measurement | Median | p95 | Samples |
|---|---:|---:|---:|
| Enqueue 1000 durable tasks | 197.455 ms | 254.088 ms | 15 |
| Lease + complete 1000 tasks | 492.877 ms | 642.387 ms | 15 |
| CLI `--version` launch | 84.539 ms | 93.142 ms | 30 |

Local observations on one machine. Startup includes process initialization. Queue measurements are not end-to-end agent throughput or business outcomes.

Raw samples are in `app/public/benchmarks.json`. Reproduce with `npm run bench`.
