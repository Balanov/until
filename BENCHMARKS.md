# UNTIL intrinsic benchmarks

Generated: 2026-11-14T16:59:28.425Z

Environment: v24.21.0 / win32 / x64

| Measurement | Median | p95 | Samples |
|---|---:|---:|---:|
| Enqueue 1000 durable tasks | 132.425 ms | 155.500 ms | 15 |
| Lease + complete 1000 tasks | 352.903 ms | 368.532 ms | 15 |
| CLI `--version` launch | 59.135 ms | 61.485 ms | 30 |

Local observations on one machine. Startup includes process initialization. Queue measurements are not end-to-end agent throughput or business outcomes.

Raw samples are in `app/public/benchmarks.json`. Reproduce with `npm run bench`.
