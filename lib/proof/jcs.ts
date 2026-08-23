/**
 * JCS (RFC 8785) — JSON Canonicalization Scheme (P1 Step 5 prep, candidate C4).
 *
 * Satu-satunya serializer payload proof. Dipakai BFF saat membuat payload
 * DAN saat re-hash sebelum submit treasury; kedua jalur WAJIB identik
 * (PLAN_04 §7.6/§7.13). Tidak ada whitespace; object keys diurutkan
 * berdasarkan UTF-16 code unit; string hanya di-escape `"`, `\`, dan
 * kontrol U+0000–U+001F; number berupa ECMAScript finite number.
 *
 * Numeric harus sudah dikonversi ke canonical decimal string SEBELUM
 * masuk ke sini (PRD §16, AGENT.md §3) — BigInt ditolak (fail-closed).
 */

function escapeString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    switch (code) {
      case 0x22: // "
        out += '\\"';
        break;
      case 0x5c: // \
        out += "\\\\";
        break;
      case 0x08:
        out += "\\b";
        break;
      case 0x09:
        out += "\\t";
        break;
      case 0x0a:
        out += "\\n";
        break;
      case 0x0c:
        out += "\\f";
        break;
      case 0x0d:
        out += "\\r";
        break;
      default:
        if (code < 0x20) {
          out += "\\u" + code.toString(16).padStart(4, "0");
        } else {
          out += value[i];
        }
    }
  }
  return out + '"';
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) {
        throw new Error("JCS: number must be finite (no NaN/Infinity).");
      }
      return String(value);
    }
    case "string":
      return escapeString(value);
    case "bigint":
      throw new Error(
        "JCS: BigInt not allowed — convert to canonical decimal string first."
      );
    case "object": {
      if (Array.isArray(value)) {
        return "[" + value.map(serialize).join(",") + "]";
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const members = keys.map(
        (key) => escapeString(key) + ":" + serialize(record[key])
      );
      return "{" + members.join(",") + "}";
    }
    default:
      throw new Error(`JCS: unsupported value type "${typeof value}".`);
  }
}

export function canonicalize(value: unknown): string {
  return serialize(value);
}
