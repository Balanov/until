# UNTIL intrinsic benchmarks

Generated: 2026-11-14T16:52:20.997Z

Environment: v24.21.0 / win32 / x64

| Measurement | Median | p95 | Samples |
|---|---:|---:|---:|
| Enqueue 1000 durable tasks | 197.961 ms | 318.596 ms | 15 |
| Lease + complete 1000 tasks | 573.477 ms | 676.963 ms | 15 |
| CLI `--version` launch | 107.902 ms | 129.074 ms | 30 |

Local observations on one machine. Startup includes process initialization. Queue measurements are not end-to-end agent throughput or business outcomes.

Raw samples are in `app/public/benchmarks.json`. Reproduce with `npm run bench`.
