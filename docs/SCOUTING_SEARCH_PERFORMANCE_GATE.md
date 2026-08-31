# Scouting search performance gate

## Scope and root cause

This correction is a bounded prerequisite for the desktop offline branch. It does not change Scouting search behavior, the 1,000 ms strict budget, the dataset, assertions, retries, indexes, or any remote database.

The Scouting worker implementation and performance test are byte-identical between exact baseline `64042c7b840de0ba81371d2ea321454afbad266b` and the desktop branch before this correction. The failure therefore existed on the baseline and was not introduced by desktop work.

The search itself was not the failing component. The 16 MiB bundled worker dataset returned real filtered results, and the worker refresh commonly completed in 8–118 ms during diagnosis. Browser-side observation showed the result revision, DOM render, `aria-busy` completion, and two animation frames completing below the strict budget. The old benchmark nevertheless kept its clock running until Playwright's control-plane wait returned to Node. Under local process contention that return was delayed by more than a second after the browser had already completed the operation.

Root-cause classification:

1. Inefficient query or algorithm: not supported by the measurements.
2. Missing local/test index: not supported; the test uses the bundled worker, not SQL, and normalized name signatures are already cached.
3. Fixture/setup in the timed interval: full dataset activation was complete in the diagnostic series; it was not the observed failure source.
4. Cold start/JIT: measurable, but remained below 1,000 ms.
5. Contention/machine variance: amplified the Playwright-to-Node return delay.
6. Nondeterministic benchmark design: confirmed root cause. The stop timestamp was sampled after external test-driver waits rather than when the browser completed the visible search.

## Controlled measurements

Environment and dataset were held constant: the same macOS host, headless Chromium, one Playwright worker, `CI=1`, the same 16 MiB bundled database, and the same real worker search path. A cold search is the first measured full-dataset query in a fresh page/worker after dataset activation. Each run then issued five distinct, uncached warm search terms. Percentile is nearest-rank p95.

| Revision | Behavior | Runs | Minimum | Median | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `64042c7…` | Cold browser completion | 10 | 348.8 ms | 594.7 ms | 677.9 ms | 677.9 ms |
| `64042c7…` | Warm browser completion | 50 | 269.5 ms | 464.4 ms | 532.2 ms | 577.2 ms |
| Desktop branch | Cold browser completion | 10 | 532.6 ms | 540.4 ms | 556.4 ms | 556.4 ms |
| Desktop branch | Warm browser completion | 50 | 172.1 ms | 380.7 ms | 431.2 ms | 437.6 ms |
| Corrected strict gate | Full first-search-to-paint check | 10 | 529 ms | 538 ms | 556 ms | 556 ms |

The legacy driver-clock measurement over the same warm operations demonstrates the noise: baseline median 1,593.0 ms, p95 2,469.0 ms, maximum 2,520.2 ms; desktop-branch median 1,268.4 ms, p95 1,851.8 ms, maximum 1,872.2 ms. Earlier uninstrumented strict runs likewise failed on both revisions: baseline 1,015–1,579 ms and desktop branch 979–1,424 ms.

## Correction and preserved guarantee

The test now arms a browser-internal observer immediately before Enter is pressed. Completion is timestamped only after all of the following occur:

1. the Scouting refresh revision advances,
2. the real worker query returns,
3. the returned database page is applied,
4. the result markup is rendered,
5. `aria-busy` clears, and
6. two animation frames complete.

Playwright still performs the correctness assertions and verifies real result rows. Its harness timeout is separate from the performance clock so a delayed driver response cannot be reported as application latency. The strict performance assertion remains 1,000 ms and therefore continues to catch worker, render, or paint regressions.

Remaining sensitivity is intentional: browser CPU/render contention still affects the browser-internal timestamp. The measured baseline p95 retains about 32% headroom and the desktop-branch p95 about 44% headroom. No Supabase schema, migration, staging data, or production data was read or changed for this fix.
