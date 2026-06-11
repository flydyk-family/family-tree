/**
 * Builds the public URL for a media object. Media is served same-origin at
 * /media/* — by the R2-backed Pages Function in production, and by the local
 * media/ folder (or a proxy to production) under the Vite dev server.
 */
export type MediaKind = 'portraits';

export function mediaUrl(kind: MediaKind, filename: string): string {
  return `/media/${kind}/${encodeURIComponent(filename)}`;
}
