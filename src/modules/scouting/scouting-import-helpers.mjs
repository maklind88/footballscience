function defaultNormalizeText(value = "", maxLength = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const defaultIsolatedSheetNames = ["NWSL (Statsbomb)"];

export function createScoutingImportHelpers(deps = {}) {
  const normalizeText = typeof deps.normalizeText === "function" ? deps.normalizeText : defaultNormalizeText;
  const normalizeDateValue = typeof deps.normalizeDateValue === "function" ? deps.normalizeDateValue : (value = "") => normalizeText(value, 40);
  const normalizeIdentityPart = typeof deps.normalizeIdentityPart === "function" ? deps.normalizeIdentityPart : normalizeText;
  const normalizeLeague = typeof deps.normalizeLeague === "function" ? deps.normalizeLeague : normalizeText;
  const getImportDraft = typeof deps.getImportDraft === "function" ? deps.getImportDraft : () => null;
  const getPdfParserPromise = typeof deps.getPdfParserPromise === "function" ? deps.getPdfParserPromise : () => null;
  const setPdfParserPromise = typeof deps.setPdfParserPromise === "function" ? deps.setPdfParserPromise : () => {};
  const getWindow = () => deps.windowRef || globalThis.window || {};
  const getDocument = () => deps.documentRef || globalThis.document || {};
  const getSourceTypes = () => {
    const sourceTypes = Array.isArray(deps.supportedSourceTypes) ? deps.supportedSourceTypes : [];
    return sourceTypes.length ? sourceTypes : [{ id: "file-import", label: "File import", extensions: [], parser: "csv" }];
  };

  function getScoutingImportSourceFromFile(fileName = "") {
    const sourceTypes = getSourceTypes();
    const extension = normalizeText(fileName, 80).toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    return sourceTypes.find((sourceType) => sourceType.extensions.includes(extension)) || sourceTypes[0];
  }

  function buildScoutingImportHash(value = "") {
    const text = String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 50000);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(36);
  }

  function buildScoutingImportCollectionHash(parts = []) {
    let hash = 2166136261;
    (Array.isArray(parts) ? parts : [parts]).forEach((part) => {
      const text = String(part ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      hash ^= 31;
      hash = Math.imul(hash, 16777619) >>> 0;
    });
    return hash.toString(36);
  }

  function buildScoutingImportRecordId(seed = "", fallback = "record", maxLength = 160) {
    const normalized = normalizeText(seed, 240).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const hash = buildScoutingImportHash(seed);
    const base = normalized || fallback;
    return `${base.slice(0, Math.max(20, maxLength - hash.length - 1))}-${hash}`.slice(0, maxLength);
  }

  function buildScoutingScopedId(value = "", sourceSystem = "file-import") {
    const source = normalizeText(sourceSystem, 40) || "file-import";
    const normalized = normalizeText(value, 160);
    if (!normalized) {
      return "";
    }
    return normalized.includes("::") ? normalized : normalizeText(`${source}::${normalized}`, 160);
  }

  function getScoutingImportSourceSystem(draft = getImportDraft()) {
    return normalizeText(draft?.sourceSystem, 40) || "file-import";
  }

  function isScoutingVerifiedImportIdentityKey(key = "") {
    return ["federationId", "wyscoutId", "fbrefId", "transfermarktId", "footballScienceDb"].includes(
      normalizeText(key, 60)
    );
  }

  function getScoutingImportIdentityCandidates(row = {}, map = {}) {
    const candidates = [
      { key: "playerIdentityId", label: "player identity id", header: map.playerIdentityId },
      { key: "sourceIdentityId", label: "source identity id", header: map.sourceIdentityId },
      { key: "federationId", label: "federation id", header: map.federationId },
      { key: "wyscoutId", label: "Wyscout ID", header: map.wyscoutId },
      { key: "fbrefId", label: "FBref ID", header: map.fbrefId },
      { key: "transfermarktId", label: "Transfermarkt ID", header: map.transfermarktId },
      { key: "playerSourceId", label: "player source id", header: map.playerSourceId },
    ];
    const seen = new Set();
    return candidates
      .map((candidate) => ({
        key: candidate.key,
        label: candidate.label,
        value: normalizeText(row?.[candidate.header], 160),
      }))
      .filter((candidate) => candidate.value && !seen.has(candidate.value) && seen.add(candidate.value));
  }

  function buildScoutingPlayerSourceId(row = {}, map = {}) {
    const primary = getScoutingImportIdentityCandidates(row, map)[0];
    if (primary?.value && isScoutingVerifiedImportIdentityKey(primary.key)) {
      return buildScoutingImportRecordId(`${primary.key} ${primary.value}`, "player", 140);
    }
    const player = normalizeText(row?.[map.player], 120);
    const dateOfBirth = normalizeDateValue(row?.[map.dateOfBirth]);
    const birthCountry = normalizeText(row?.[map.birthCountry], 120);
    const passportCountry = normalizeText(row?.[map.passportCountry], 120);
    const nationality = passportCountry || birthCountry;
    return buildScoutingImportRecordId(
      [
        normalizeIdentityPart(player),
        normalizeIdentityPart(dateOfBirth),
        normalizeIdentityPart(nationality),
      ].filter(Boolean).join("::"),
      "player",
      140
    );
  }

  function buildScoutingRecordSourceId(row = {}, map = {}, playerSourceId = "") {
    const draft = getImportDraft();
    const sourceSystem = getScoutingImportSourceSystem();
    const mapped = normalizeText(row?.[map.sourceRecordId], 160);
    if (mapped) {
      return buildScoutingScopedId(mapped, sourceSystem);
    }
    const seed = [
      playerSourceId,
      normalizeText(draft?.seasonOverride, 80) || normalizeText(row?.[map.season], 80),
      normalizeLeague(row?.[map.league]),
      normalizeText(row?.[map.team], 120),
    ].join("::");
    return buildScoutingScopedId(buildScoutingImportRecordId(seed, "record"), sourceSystem);
  }

  function parseScoutingMetricValue(value) {
    const text = String(value ?? "").trim();
    if (!text || /^(-|n\/?a|null|undefined)$/i.test(text)) return null;
    const normalized = text.replace(/,/g, ".").replace(/[^0-9.+-]/g, "");
    if (!normalized || !/[0-9]/.test(normalized)) return null;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function readScoutingText(file) {
    return new Promise((resolve, reject) => {
      const Reader = deps.fileReaderConstructor || globalThis.FileReader;
      if (!Reader) {
        reject(new Error("Could not read the selected file."));
        return;
      }
      const reader = new Reader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read the selected file."));
      reader.readAsText(file);
    });
  }

  function parseScoutingSeparatedLine(line = "", delimiter = ",") {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === delimiter && !inQuotes) {
        cells.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    cells.push(current);
    return cells.map((item) => item.trim());
  }

  function detectScoutingImportDelimiter(lines = []) {
    const candidates = [",", "\t", ";", "|"];
    const counts = candidates.map((delimiter) => {
      const count = lines.slice(0, 20).reduce((total, line) => total + Math.max(0, line.split(delimiter).length - 1), 0);
      return { delimiter, count };
    });
    const winner = counts.sort((a, b) => b.count - a.count)[0];
    return winner && winner.count > 0 ? winner.delimiter : ",";
  }

  function parseScoutingSeparatedRows(text = "", delimiter = ",") {
    return String(text || "")
      .split(/\r\n|\r|\n/)
      .filter((line) => line.trim())
      .map((line) => parseScoutingSeparatedLine(line, delimiter));
  }

  function parseScoutingTextRowsToRecords(rows = [], fallbackHeaders = []) {
    if (!rows.length) {
      return { headers: [], rows: [] };
    }
    const headers = rows[0].map((header) => String(header || "").trim()).filter((header) => header.length > 0);
    if (!headers.length) {
      return { headers: fallbackHeaders, rows: [] };
    }
    const parsedRows = rows
      .slice(1)
      .map((row) => {
        const record = {};
        headers.forEach((header, index) => {
          record[header] = row[index] ?? "";
        });
        return record;
      })
      .filter((record) => {
        if (!record || typeof record !== "object") {
          return false;
        }
        return Object.values(record).some((value) => normalizeText(value, 12));
      });
    return { headers, rows: parsedRows };
  }

  function parseScoutingJsonRows(payload = null) {
    const records = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.records)
        ? payload.records
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.players)
            ? payload.players
            : [];
    if (!Array.isArray(records)) {
      return { headers: [], rows: [] };
    }
    const headers = [...new Set(records.flatMap((row) => (row && typeof row === "object" && !Array.isArray(row) ? Object.keys(row) : [])))];
    const rows = records
      .filter((row) => row && typeof row === "object" && !Array.isArray(row))
      .map((row) => {
        const values = {};
        headers.forEach((header) => {
          values[header] = row?.[header] ?? "";
        });
        return values;
      })
      .filter((record) => Object.values(record).some((value) => normalizeText(value, 12)));
    return { headers, rows };
  }

  function normalizeScoutingImportText(value = "") {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function parseScoutingPdfSource(file, sourceType) {
    return ensureScoutingPdfParserLoaded().then(async (pdfjs) => {
      const buffer = await file.arrayBuffer();
      const documentHandle = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
      const tables = [];
      const pageCount = Math.min(documentHandle.numPages, 16);
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await documentHandle.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const lines = textContent.items.map((item) => normalizeScoutingImportText(item?.str || "")).filter(Boolean);
        const delimiter = detectScoutingImportDelimiter(lines);
        const parsedRows = parseScoutingSeparatedRows(lines.join("\n"), delimiter);
        const parsed = parseScoutingTextRowsToRecords(parsedRows);
        if (parsed.headers.length > 1 && parsed.rows.length) {
          tables.push({ name: `${sourceType.label} page ${pageNumber}`, headers: parsed.headers, rows: parsed.rows });
        }
      }
      return tables;
    });
  }

  function ensureScoutingPdfParserLoaded() {
    const cachedPromise = getPdfParserPromise();
    if (cachedPromise) {
      return cachedPromise;
    }
    const promise = new Promise((resolve, reject) => {
      const win = getWindow();
      const documentRef = getDocument();
      if (win.pdfjsLib?.getDocument) {
        resolve(win.pdfjsLib);
        return;
      }
      const existing = documentRef.getElementById?.("scoutingPdfParserScript");
      if (existing) {
        existing.addEventListener("load", () => {
          if (!win.pdfjsLib?.getDocument) {
            reject(new Error("PDF parser did not load."));
            return;
          }
          resolve(win.pdfjsLib);
        }, { once: true });
        existing.addEventListener("error", () => reject(new Error("PDF parser could not be loaded.")), { once: true });
        return;
      }
      const script = documentRef.createElement("script");
      script.id = "scoutingPdfParserScript";
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.async = true;
      script.onload = () => {
        if (!win.pdfjsLib?.getDocument) {
          reject(new Error("PDF parser did not load."));
          return;
        }
        if (win.pdfjsLib.GlobalWorkerOptions) {
          win.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        resolve(win.pdfjsLib);
      };
      script.onerror = () => reject(new Error("PDF parser could not be loaded."));
      documentRef.head.appendChild(script);
    });
    setPdfParserPromise(promise);
    return promise;
  }

  function getScoutingImportMetricHeaders(headers = [], map = {}) {
    const coreHeaders = new Set(Object.values(map).filter(Boolean));
    return headers.filter((header) => !coreHeaders.has(header));
  }

  function getScoutingImportSheetsForBatch(draft = getImportDraft()) {
    const isolatedSheetNames = new Set(
      [...defaultIsolatedSheetNames, ...(Array.isArray(deps.isolatedSheetNames) ? deps.isolatedSheetNames : [])]
        .map((name) => normalizeText(name, 160).toLowerCase())
        .filter(Boolean)
    );
    return (Array.isArray(draft?.sheets) ? draft.sheets : []).filter((sheet) => {
      const sheetName = normalizeText(sheet?.name, 160).toLowerCase();
      return Array.isArray(sheet?.rows) && sheet.rows.length && !isolatedSheetNames.has(sheetName);
    });
  }

  function getScoutingImportHeadersForBatch(sheets = []) {
    const seen = new Set();
    return (Array.isArray(sheets) ? sheets : [])
      .flatMap((sheet) => (Array.isArray(sheet?.headers) ? sheet.headers : []))
      .filter((header) => {
        const normalized = normalizeText(header, 160);
        if (!normalized || seen.has(normalized)) {
          return false;
        }
        seen.add(normalized);
        return true;
      });
  }

  function getScoutingImportMetricDirection(header = "") {
    const label = normalizeText(header, 120).toLowerCase();
    return /(against|conceded|lost|errors|fouls|cards|turnovers|losses)/.test(label) ? "lower" : "higher";
  }

  function getScoutingImportMetricQuality(rawValue, minutes = 0) {
    const text = normalizeText(rawValue, 120).toLowerCase();
    if (!Number.isFinite(parseScoutingMetricValue(rawValue))) {
      return "missing";
    }
    if (/(^|[^a-z])(est|estimated|estimate|approx|approximate)([^a-z]|$)|~/.test(text)) {
      return "estimated";
    }
    return Number(minutes) > 0 && Number(minutes) < 450 ? "estimated" : "trusted";
  }

  function getScoutingImportMergeKey(sourceSystem = "", playerIdentityId = "", season = "", league = "", team = "") {
    return [
      normalizeIdentityPart(sourceSystem || "file-import", 40),
      normalizeIdentityPart(playerIdentityId, 160),
      normalizeIdentityPart(season, 80),
      normalizeIdentityPart(normalizeLeague(league), 180),
      normalizeIdentityPart(team, 180),
    ].join("|");
  }

  return {
    buildScoutingImportCollectionHash,
    buildScoutingImportHash,
    buildScoutingImportRecordId,
    buildScoutingPlayerSourceId,
    buildScoutingRecordSourceId,
    buildScoutingScopedId,
    detectScoutingImportDelimiter,
    ensureScoutingPdfParserLoaded,
    getScoutingImportHeadersForBatch,
    getScoutingImportIdentityCandidates,
    getScoutingImportMergeKey,
    getScoutingImportMetricDirection,
    getScoutingImportMetricHeaders,
    getScoutingImportMetricQuality,
    getScoutingImportSheetsForBatch,
    getScoutingImportSourceFromFile,
    getScoutingImportSourceSystem,
    isScoutingVerifiedImportIdentityKey,
    normalizeScoutingImportText,
    parseScoutingJsonRows,
    parseScoutingMetricValue,
    parseScoutingPdfSource,
    parseScoutingSeparatedLine,
    parseScoutingSeparatedRows,
    parseScoutingTextRowsToRecords,
    readScoutingText,
  };
}
