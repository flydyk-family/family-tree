/**
 * Builds the public URL for a media object. Media is served same-origin at
 * /media/* — by the R2-backed Pages Function in production, and by the local
 * media/ folder (or a proxy to production) under the Vite dev server.
 */
export type MediaKind = 'portraits';

export function mediaUrl(kind: MediaKind, filename: string): string {
  return `/media/${kind}/${encodeURIComponent(filename)}`;
}

/**
 * Resolves a stored media reference to its same-origin URL. Seed assets are bare
 * filenames under the implicit `portraits/` prefix; uploaded assets are full R2 keys
 * (they contain a `/`) served verbatim under `/media/`.
 */
export function resolveMediaUrl(keyOrName: string): string {
  if (keyOrName.includes('/')) {
    return `/media/${keyOrName.split('/').map(encodeURIComponent).join('/')}`;
  }
  return mediaUrl('portraits', keyOrName);
}
