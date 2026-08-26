self.window = self;

const XLSX_PARSER_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
let parserLoaded = false;
const parsedWorkbooks = new Map();

function ensureParser() {
  if (parserLoaded && self.XLSX?.read) return;
  importScripts(XLSX_PARSER_URL);
  if (!self.XLSX?.read) {
    throw new Error("Spreadsheet parser did not load.");
  }
  parserLoaded = true;
}

function getSheetHeaderPlan(sheet) {
  const range = self.XLSX.utils.decode_range(sheet?.["!ref"] || "A1:A1");
  const rawHeaders = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[self.XLSX.utils.encode_cell({ r: range.s.r, c: column })];
    rawHeaders.push(String(cell?.w ?? cell?.v ?? "").replace(/\s+/g, " ").trim());
  }
  const hasLeague = rawHeaders.some((value) => ["league", "leagie"].includes(value.toLowerCase()));
  const hasSeason = rawHeaders.some((value) => value.toLowerCase() === "season");
  const normalized = rawHeaders.map((header, index) => {
    const lower = header.toLowerCase();
    if (lower === "leagie") return "League";
    if (index === 0 && !hasLeague) return "League";
    if (index === 1 && !hasSeason) return "Season";
    return header;
  });
  const sourceHeaders = normalized.map((header, index) => header || `__ignored_column_${index + 1}`);
  const includedColumns = normalized
    .map((header, index) => ({ header, sourceHeader: sourceHeaders[index] }))
    .filter((column) => column.header);
  return {
    headers: includedColumns.map((column) => column.header),
    includedColumns,
    sourceHeaders,
    dataStartRow: range.s.r + 1,
  };
}

function parseWorkbook(buffer, maxRowsPerSheet, excludedSheetNames = []) {
  ensureParser();
  const workbook = self.XLSX.read(buffer, { type: "array" });
  const excluded = new Set(excludedSheetNames.map((name) => String(name || "").trim().toLowerCase()).filter(Boolean));
  return workbook.SheetNames.filter((sheetName) => !excluded.has(sheetName.trim().toLowerCase())).map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const headerPlan = getSheetHeaderPlan(sheet);
    const objectRows = self.XLSX.utils
      .sheet_to_json(sheet, {
        header: headerPlan.sourceHeaders,
        range: headerPlan.dataStartRow,
        defval: "",
        raw: false,
        blankrows: false,
      })
      .slice(0, maxRowsPerSheet);
    const headers = headerPlan.headers;
    const rows = objectRows.map((row) => headerPlan.includedColumns.map((column) => row?.[column.sourceHeader] ?? ""));
    return {
      name: sheetName,
      rows,
      headers,
      rowCount: rows.length,
      rowFormat: "columns",
    };
  }).filter((sheet) => sheet.headers.length);
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (!message.requestId) return;
  if (message.type === "read-xlsx-chunk") {
    const sheets = parsedWorkbooks.get(message.requestId);
    const sheetIndex = Math.max(0, Math.floor(Number(message.sheetIndex) || 0));
    const offset = Math.max(0, Math.floor(Number(message.offset) || 0));
    const limit = Math.max(20, Math.min(250, Math.floor(Number(message.limit) || 120)));
    const sheet = sheets?.[sheetIndex];
    if (!sheet) {
      self.postMessage({ requestId: message.requestId, ok: false, reason: "Parsed workbook chunk is unavailable." });
      return;
    }
    const rows = sheet.rows.slice(offset, offset + limit);
    const nextOffset = offset + rows.length;
    self.postMessage({
      requestId: message.requestId,
      ok: true,
      phase: "chunk",
      sheetIndex,
      rows,
      nextOffset,
      sheetDone: nextOffset >= sheet.rows.length,
    });
    return;
  }
  if (message.type !== "parse-xlsx") return;
  try {
    const maxRows = Math.max(1, Math.min(50000, Math.floor(Number(message.maxRowsPerSheet) || 50000)));
    const sheets = parseWorkbook(message.buffer, maxRows, Array.isArray(message.excludedSheetNames) ? message.excludedSheetNames : []);
    parsedWorkbooks.set(message.requestId, sheets);
    self.postMessage({
      requestId: message.requestId,
      ok: true,
      phase: "ready",
      sheets: sheets.map(({ name, headers, rowCount, rowFormat }) => ({ name, headers, rowCount, rowFormat })),
    });
  } catch (error) {
    self.postMessage({
      requestId: message.requestId,
      ok: false,
      reason: String(error?.message || "Could not parse the selected Excel file.").slice(0, 320),
    });
  }
};
