# UNTIL intrinsic benchmarks

Generated: 2026-11-05T19:30:01.681Z

Environment: v24.21.0 / win32 / x64

| Measurement | Median | p95 | Samples |
|---|---:|---:|---:|
| Enqueue 1000 durable tasks | 150.893 ms | 170.776 ms | 15 |
| Lease + complete 1000 tasks | 373.176 ms | 392.016 ms | 15 |
| CLI `--version` launch | 72.050 ms | 76.241 ms | 30 |

Local observations on one machine. Startup includes process initialization. Queue measurements are not end-to-end agent throughput or business outcomes.

Raw samples are in `app/public/benchmarks.json`. Reproduce with `npm run bench`.
