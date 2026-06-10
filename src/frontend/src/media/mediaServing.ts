/**
 * Pure helpers behind functions/media/[[path]].ts (the R2-backed Pages
 * Function). Kept here, like src/api/apiProxy.ts, so they are type-checked
 * and unit-tested; the function file itself is thin glue.
 */

export interface ByteRange {
  offset: number;
  length: number;
}

/**
 * Maps a request pathname to an R2 object key, or null when the path is not
 * a well-formed /media/<key>. Rejects traversal and empty segments outright —
 * keys are always like `portraits/p-0001.jpg`.
 */
export function resolveMediaKey(pathname: string): string | null {
  if (!pathname.startsWith('/media/')) {
    return null;
  }
  let key: string;
  try {
    key = decodeURIComponent(pathname.slice('/media/'.length));
  } catch {
    return null;
  }
  if (!key || key.includes('\\') || key.endsWith('/')) {
    return null;
  }
  if (key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null;
  }
  return key;
}

/**
 * Parses a single-range `Range: bytes=…` header against the object size.
 * Returns null to serve the full body (no header, malformed, or multi-range —
 * per RFC 9110 a server MAY ignore Range), 'unsatisfiable' for a 416, or the
 * byte window to serve with a 206.
 */
export function parseRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) {
    return null;
  }
  if (match[1] === '') {
    // Suffix form bytes=-N: the last N bytes.
    const suffix = Number(match[2]);
    if (suffix === 0 || size === 0) {
      return 'unsatisfiable';
    }
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(match[1]);
  if (start >= size) {
    return 'unsatisfiable';
  }
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (end < start) {
    return null;
  }
  return { offset: start, length: end - start + 1 };
}
