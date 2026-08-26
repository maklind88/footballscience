import { localVideoBridgeBaseUrl, openLocalBridgeSession } from "./localPlaybackTranscodeService.js";

async function responseJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function wait(milliseconds, win = window) {
  return new Promise((resolve) => win.setTimeout(resolve, milliseconds));
}

function abortError() {
  if (typeof DOMException === "function") return new DOMException("Benchmark was cancelled.", "AbortError");
  return Object.assign(new Error("Benchmark was cancelled."), { name: "AbortError" });
}

async function cancelBenchmarkJob(job = {}, fetcher = fetch) {
  if (!job.statusUrl || !job.sessionToken) return false;
  const response = await fetcher(job.statusUrl, {
    method: "DELETE",
    headers: { "x-football-science-session": job.sessionToken },
  });
  return response.ok;
}

async function pollJob(statusUrl, sessionToken, options = {}) {
  const win = options.win || window;
  const fetcher = options.fetcher || win.fetch?.bind(win) || fetch;
  const deadline = Date.now() + Math.max(60_000, Number(options.timeoutMs) || 10 * 60 * 1000);
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw abortError();
    const response = await fetcher(statusUrl, {
      headers: { "x-football-science-session": sessionToken },
      signal: options.signal,
    });
    const payload = await responseJson(response);
    if (!response.ok) throw new Error(payload.error || "Could not read the local benchmark job.");
    const job = payload.job || {};
    options.onProgress?.({
      stage: job.stage || job.status || "evaluating benchmark",
      ratio: Math.max(0, Math.min(1, Number(job.progress?.ratio) || 0)),
    });
    if (job.status === "succeeded") {
      if (!job.result?.report) throw new Error("The local benchmark job returned no report.");
      return job.result.report;
    }
    if (["failed", "cancelled"].includes(job.status)) {
      throw new Error(job.error || "The local benchmark job did not complete.");
    }
    await wait(300, win);
  }
  throw new Error("The local benchmark timed out before evaluation completed.");
}

export async function evaluateLocalTrackingBenchmark(benchmark = {}, options = {}) {
  const win = options.win || window;
  const fetcher = options.fetcher || win.fetch?.bind(win) || fetch;
  const baseUrl = localVideoBridgeBaseUrl(win);
  const session = await openLocalBridgeSession(baseUrl, { fetcher });
  const capabilityResponse = await fetcher(`${baseUrl}/capabilities`, {
    headers: { "x-football-science-session": session.sessionToken },
    signal: options.signal,
  });
  const capabilities = await responseJson(capabilityResponse);
  if (!capabilityResponse.ok
    || !(capabilities.capabilities || []).includes("evaluate-tracking-benchmark")) {
    throw new Error(capabilities.error || "Update the local video app before running benchmarks.");
  }
  const multiObject = benchmark.cases?.[0]?.benchmarkType === "multi-object";
  if (multiObject && !(capabilities.capabilities || []).includes("tracking-reference:trackeval")) {
    throw new Error("Install the pinned TrackEval reference before evaluating a multi-object provider.");
  }
  const response = await fetcher(`${baseUrl}/jobs/evaluate-tracking-benchmark`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-football-science-session": session.sessionToken,
    },
    body: JSON.stringify(benchmark),
  });
  const queued = await responseJson(response);
  if (!response.ok || !queued.statusUrl) {
    throw new Error(queued.error || "The local benchmark job could not be started.");
  }
  const job = {
    jobId: queued.job?.id || "",
    statusUrl: queued.statusUrl,
    sessionToken: session.sessionToken,
  };
  if (options.signal?.aborted) {
    await cancelBenchmarkJob(job, fetcher).catch(() => false);
    throw abortError();
  }
  options.onQueued?.(job);
  try {
    return await pollJob(job.statusUrl, job.sessionToken, { ...options, fetcher, win });
  } catch (error) {
    await cancelBenchmarkJob(job, fetcher).catch(() => false);
    throw error;
  }
}

export async function cancelLocalTrackingBenchmark(job = {}, win = window) {
  const fetcher = win.fetch?.bind(win) || fetch;
  return cancelBenchmarkJob(job, fetcher);
}
