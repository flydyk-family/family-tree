export interface MediaItem {
  kind: 'video' | 'image';
  src: string;
  /** Static still shown while a video loads / when autoplay is blocked. */
  poster?: string;
}
