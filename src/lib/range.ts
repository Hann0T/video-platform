/**
 * HTTP Range header parsing for single byte ranges (RFC 9110 §14).
 *
 * - "none":           no usable Range header; serve the whole file (200).
 *                     Malformed or multi-range headers land here too, since a
 *                     server may ignore Range and send the full body.
 * - "range":          serve bytes [start, end] inclusive (206).
 * - "unsatisfiable":  syntactically valid but outside the file (416).
 */
export type RangeResult =
  | { type: "none" }
  | { type: "range"; start: number; end: number }
  | { type: "unsatisfiable" };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { type: "none" };
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) return { type: "none" };

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return { type: "none" };

  // Suffix range: "bytes=-N" means the last N bytes.
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (suffix === 0 || size === 0) return { type: "unsatisfiable" };
    return { type: "range", start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  if (rawEnd !== "" && Number(rawEnd) < start) return { type: "none" }; // invalid; ignore
  if (start >= size) return { type: "unsatisfiable" };
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  return { type: "range", start, end };
}
