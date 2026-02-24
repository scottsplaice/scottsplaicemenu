export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

export function parseCSV(text) {
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i+1] === '"') { field += '"'; i += 2; continue; }
      inQuotes = !inQuotes; i++; continue;
    }
    if (!inQuotes && (c === ',' || c === '\n' || c === '\r')) {
      if (c === '\r') { i++; continue; }
      row.push(field); field = "";
      if (c === '\n') { rows.push(row); row = []; }
      i++; continue;
    }
    field += c; i++;
  }
  row.push(field);
  rows.push(row);

  const headers = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.length && r.some(x => String(x).trim() !== ""))
    .map(r => {
      const obj = {};
      headers.forEach((h, idx) => obj[h] = (r[idx] ?? "").trim());
      return obj;
    });
}

export function money(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Number(s);
  if (Number.isFinite(n)) return "£" + n.toFixed(2).replace(/\.00$/, "");
  return s.startsWith("£") ? s : "£" + s;
}

export function nowUK() {
  return new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
}
