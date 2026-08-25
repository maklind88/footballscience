import crypto from "node:crypto";

function digest(algorithm, value) {
  return crypto.createHash(algorithm).update(value).digest("hex");
}

function readyState() {
  return { type: "ready" };
}

function isIdentifierCharacter(character) {
  return /[\p{L}\p{N}_$]/u.test(character || "");
}

function isBeginAtomic(data) {
  const atomicStart = data.length - "ATOMIC".length;
  if (atomicStart < 0 || data.slice(atomicStart).toUpperCase() !== "ATOMIC") return false;
  if (atomicStart > 0 && isIdentifierCharacter(data[atomicStart - 1])) return false;
  const prefix = data.slice(0, atomicStart).trimEnd();
  const beginStart = prefix.length - "BEGIN".length;
  if (beginStart < 0 || prefix.slice(beginStart).toUpperCase() !== "BEGIN") return false;
  return beginStart === 0 || !isIdentifierCharacter(prefix[beginStart - 1]);
}

function nextParserState(state, character, data) {
  if (state.type === "ready") {
    if (character === "$") return { type: "tag", offset: data.length - 1 };
    if (character === "'" || character === '"') return { type: "quote", delimiter: character, escape: false };
    if (character === "-") return { type: "comment" };
    if (character === "/") return { type: "block", depth: 0 };
    if (character === "\\") return { type: "escape" };
    if (character === ";") return null;
    if (character === "(") return { type: "atomic", previous: state, delimiter: ")" };
    if ((character === "c" || character === "C") && isBeginAtomic(data)) {
      return { type: "atomic", previous: state, delimiter: "END" };
    }
    return state;
  }
  if (state.type === "comment") {
    return character === "-" ? { type: "dollar", delimiter: "\n" } : nextParserState(readyState(), character, data);
  }
  if (state.type === "block") {
    const window = data.slice(-2);
    if (window === "/*") return { ...state, depth: state.depth + 1 };
    if (state.depth === 0) return nextParserState(readyState(), character, data);
    if (window === "*/") return state.depth === 1 ? readyState() : { ...state, depth: state.depth - 1 };
    return state;
  }
  if (state.type === "quote") {
    if (state.escape) {
      return character === state.delimiter ? { ...state, escape: false } : nextParserState(readyState(), character, data);
    }
    return character === state.delimiter ? { ...state, escape: true } : state;
  }
  if (state.type === "dollar") return data.endsWith(state.delimiter) ? readyState() : state;
  if (state.type === "tag") {
    if (character === "$") return { type: "dollar", delimiter: data.slice(state.offset) };
    return /[\p{L}\p{N}_]/u.test(character) ? state : nextParserState(readyState(), character, data);
  }
  if (state.type === "escape") return readyState();
  if (state.type === "atomic") {
    const current = nextParserState(state.previous, character, data);
    const previous = current === null ? state.previous : current;
    if (previous.type === "ready" && data.slice(-state.delimiter.length).toUpperCase() === state.delimiter) return readyState();
    return { ...state, previous };
  }
  throw new Error(`Unknown Supabase parser state ${state.type}.`);
}

// Exact JavaScript port of Supabase CLI v2.115.0 parser.SplitAndTrim.
export function canonicalizeSupabaseMigration(value) {
  const sql = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  const statements = [];
  let state = readyState();
  let tokenStart = 0;
  for (let index = 0; index < sql.length; index += 1) {
    const data = sql.slice(tokenStart, index + 1);
    state = nextParserState(state, sql[index], data);
    if (state !== null) continue;
    const statement = data.replace(/;+$/, "").trim();
    if (statement) statements.push(statement);
    tokenStart = index + 1;
    state = readyState();
  }
  const finalStatement = sql.slice(tokenStart).replace(/;+$/, "").trim();
  if (finalStatement) statements.push(finalStatement);
  const reconstruction = Buffer.from(`${statements.join(";\n")};\n`, "utf8");
  return Object.freeze({
    statements: statements.length,
    bytes: reconstruction.length,
    md5: digest("md5", reconstruction),
    sha256: digest("sha256", reconstruction),
  });
}
