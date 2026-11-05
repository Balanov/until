# UNTIL intrinsic benchmarks

Generated: 2026-11-05T03:29:38.164Z

Environment: v24.21.0 / win32 / x64

| Measurement | Median | p95 | Samples |
|---|---:|---:|---:|
| Enqueue 1000 durable tasks | 150.689 ms | 169.033 ms | 15 |
| Lease + complete 1000 tasks | 376.690 ms | 399.506 ms | 15 |
| CLI `--version` launch | 69.453 ms | 78.754 ms | 30 |

Local observations on one machine. Startup includes process initialization. Queue measurements are not end-to-end agent throughput or business outcomes.

Raw samples are in `app/public/benchmarks.json`. Reproduce with `npm run bench`.
