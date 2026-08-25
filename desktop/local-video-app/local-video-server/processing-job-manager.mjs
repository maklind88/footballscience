import { randomUUID } from "node:crypto";

function publicError(error) {
  if (error?.code === "ABORT_ERR") return "Job cancelled.";
  return String(error?.publicMessage || error?.message || "Processing failed.").slice(0, 1000);
}

function snapshot(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    stage: job.stage,
    progress: { ...job.progress },
    metadata: { ...job.metadata },
    result: job.result ? { ...job.result } : null,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    cancelRequested: job.cancelRequested,
  };
}

export function createProcessingJobManager(options = {}) {
  const concurrency = Math.max(1, Math.min(4, Number(options.concurrency) || 1));
  const retentionMs = Math.max(60_000, Number(options.retentionMs) || 24 * 60 * 60 * 1000);
  const clock = options.clock || Date.now;
  const jobs = new Map();
  const queue = [];
  const active = new Map();

  function prune() {
    const current = Number(clock()) || Date.now();
    for (const [id, job] of jobs) {
      const finishedAt = job.completedAt ? Date.parse(job.completedAt) : 0;
      if (finishedAt && current - finishedAt > retentionMs) jobs.delete(id);
    }
  }

  function update(id, values = {}) {
    const job = jobs.get(id);
    if (!job) return null;
    Object.assign(job, values);
    return snapshot(job);
  }

  function finish(job, status, values = {}) {
    job.status = status;
    job.stage = status;
    job.completedAt = new Date(Number(clock()) || Date.now()).toISOString();
    Object.assign(job, values);
    job.resolve?.(snapshot(job));
  }

  function drain() {
    while (active.size < concurrency && queue.length) {
      const queued = queue.shift();
      const job = jobs.get(queued.id);
      if (!job || job.status === "cancelled") continue;
      const controller = new AbortController();
      active.set(job.id, controller);
      job.status = "running";
      job.stage = "starting";
      job.startedAt = new Date(Number(clock()) || Date.now()).toISOString();
      Promise.resolve().then(() => queued.task({
        signal: controller.signal,
        reportProgress(progress = {}) {
          job.progress = { ...job.progress, ...progress };
          if (progress.stage) job.stage = String(progress.stage);
        },
      })).then((result) => {
        if (controller.signal.aborted || job.cancelRequested) {
          finish(job, "cancelled", { error: "Job cancelled." });
        } else {
          finish(job, "succeeded", { progress: { ...job.progress, ratio: 1 }, result });
        }
      }).catch((error) => {
        if (controller.signal.aborted || error?.code === "ABORT_ERR" || job.cancelRequested) {
          finish(job, "cancelled", { error: "Job cancelled." });
        } else {
          finish(job, "failed", { error: publicError(error) });
        }
      }).finally(() => {
        active.delete(job.id);
        prune();
        drain();
      });
    }
  }

  return {
    create(type, metadata = {}) {
      prune();
      const id = randomUUID();
      let resolve;
      const completion = new Promise((completionResolve) => {
        resolve = completionResolve;
      });
      const job = {
        id,
        type: String(type || "processing"),
        status: "created",
        stage: "receiving",
        progress: { ratio: 0 },
        metadata: { ...metadata },
        result: null,
        error: "",
        createdAt: new Date(Number(clock()) || Date.now()).toISOString(),
        startedAt: "",
        completedAt: "",
        cancelRequested: false,
        completion,
        resolve,
      };
      jobs.set(id, job);
      return snapshot(job);
    },
    enqueue(id, task) {
      const job = jobs.get(String(id || ""));
      if (!job || typeof task !== "function") return null;
      job.status = "queued";
      job.stage = "queued";
      queue.push({ id: job.id, task });
      drain();
      return snapshot(job);
    },
    updateProgress(id, progress = {}) {
      const job = jobs.get(String(id || ""));
      if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) return null;
      job.progress = { ...job.progress, ...progress };
      if (progress.stage) job.stage = String(progress.stage);
      return snapshot(job);
    },
    get(id) {
      prune();
      const job = jobs.get(String(id || ""));
      return job ? snapshot(job) : null;
    },
    wait(id) {
      const job = jobs.get(String(id || ""));
      return job ? job.completion : Promise.resolve(null);
    },
    cancel(id) {
      const job = jobs.get(String(id || ""));
      if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) return false;
      job.cancelRequested = true;
      const activeController = active.get(job.id);
      if (activeController) {
        activeController.abort();
      } else {
        const queueIndex = queue.findIndex((entry) => entry.id === job.id);
        if (queueIndex >= 0) queue.splice(queueIndex, 1);
        finish(job, "cancelled", { error: "Job cancelled." });
      }
      return true;
    },
    discard(id) {
      const key = String(id || "");
      if (active.has(key) || queue.some((entry) => entry.id === key)) return false;
      return jobs.delete(key);
    },
    activeIds() {
      return [...active.keys()];
    },
    stats() {
      return {
        concurrency,
        active: active.size,
        queued: queue.length,
        retained: jobs.size,
      };
    },
  };
}
