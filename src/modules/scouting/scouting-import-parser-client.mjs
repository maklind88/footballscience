function createAbortError() {
  return new DOMException("Scouting import parsing was cancelled.", "AbortError");
}

const defaultExcludedSheetNames = ["NWSL (Statsbomb)"];

export function createScoutingImportParserClient(deps = {}) {
  let active = null;
  let requestSequence = 0;

  function cancel() {
    if (!active) return;
    active.abort?.();
  }

  function parseXlsx(buffer, options = {}) {
    if (!(buffer instanceof ArrayBuffer)) {
      return Promise.resolve({ ok: false, reason: "Excel source buffer is missing." });
    }
    if (options.signal?.aborted) return Promise.reject(createAbortError());
    cancel();
    const worker = deps.createWorker?.();
    if (!worker?.postMessage) {
      return Promise.resolve({ ok: false, reason: "Background Excel parsing is not available in this browser." });
    }
    const requestId = `scouting-import-${Date.now()}-${requestSequence += 1}`;
    return new Promise((resolve, reject) => {
      let sheets = [];
      let sheetIndex = 0;
      let offset = 0;
      let completedRows = 0;
      let totalRows = 0;
      const chunkSize = Math.max(20, Math.min(250, Math.floor(Number(options.chunkSize) || 250)));
      const schedule = deps.schedule || ((callback) => globalThis.setTimeout(callback, 0));
      const cleanup = () => {
        options.signal?.removeEventListener?.("abort", onAbort);
        worker.terminate?.();
        if (active?.requestId === requestId) active = null;
      };
      const onAbort = () => {
        cleanup();
        reject(createAbortError());
      };
      active = { requestId, worker, abort: onAbort };
      const finish = (result) => {
        cleanup();
        resolve(result);
      };
      const requestChunk = () => {
        if (options.signal?.aborted) {
          onAbort();
          return;
        }
        worker.postMessage({
          type: "read-xlsx-chunk",
          requestId,
          sheetIndex,
          offset,
          limit: chunkSize,
        });
      };
      worker.onmessage = (event) => {
        if (event.data?.requestId !== requestId) return;
        const message = event.data || {};
        if (!message.ok) {
          finish(message);
          return;
        }
        if (message.phase === "ready") {
          sheets = (Array.isArray(message.sheets) ? message.sheets : []).map((sheet) => ({ ...sheet, rows: [] }));
          totalRows = sheets.reduce((sum, sheet) => sum + Math.max(0, Math.floor(Number(sheet.rowCount) || 0)), 0);
          if (!sheets.length || totalRows === 0) {
            finish({ ok: true, sheets });
            return;
          }
          schedule(requestChunk);
          return;
        }
        if (message.phase === "chunk") {
          const currentSheet = sheets[message.sheetIndex];
          if (!currentSheet) {
            finish({ ok: false, reason: "Parsed workbook sheet order changed while reading." });
            return;
          }
          const rows = Array.isArray(message.rows) ? message.rows : [];
          currentSheet.rows.push(...rows);
          completedRows += rows.length;
          options.onProgress?.({ completed: completedRows, total: totalRows, sheetIndex: message.sheetIndex });
          offset = Math.max(0, Math.floor(Number(message.nextOffset) || currentSheet.rows.length));
          if (message.sheetDone) {
            sheetIndex += 1;
            offset = 0;
          }
          if (sheetIndex >= sheets.length) {
            finish({ ok: true, sheets });
            return;
          }
          schedule(requestChunk);
          return;
        }
        finish(message);
      };
      worker.onerror = (event) => {
        cleanup();
        reject(new Error(event?.message || "Background Excel parsing failed."));
      };
      options.signal?.addEventListener?.("abort", onAbort, { once: true });
      worker.postMessage({
        type: "parse-xlsx",
        requestId,
        buffer,
        maxRowsPerSheet: Math.max(1, Math.min(50000, Math.floor(Number(options.maxRowsPerSheet) || 50000))),
        excludedSheetNames: [...defaultExcludedSheetNames, ...(Array.isArray(options.excludedSheetNames) ? options.excludedSheetNames : [])],
      }, [buffer]);
    });
  }

  return { cancel, parseXlsx };
}
