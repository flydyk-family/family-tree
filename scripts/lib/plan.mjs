// Pure per-person action planning and a rough USD cost estimate.
// Pricing is approximate (verify current OpenAI pricing): gpt-image-2 high-quality
// still ~ $0.04; Sora 2 $0.10/s for 720x1280 / 1280x720, sora-2-pro $0.30/s for
// 1024x1792 / 1792x1024.
const STILL_USD = 0.04;
const PRO_SIZES = new Set(['1024x1792', '1792x1024']);

export function planActions(opts, { stillExists, videoExists }) {
  let still;
  if (opts.image) {
    still = 'provided';
  } else if (stillExists && !opts.force) {
    still = 'reuse';
  } else {
    still = 'generate';
  }

  let video;
  if (!opts.withVideo) {
    video = 'none';
  } else if (videoExists && !opts.force) {
    video = 'skip';
  } else {
    video = 'generate';
  }

  return { still, video };
}

export function estimateCost(plan, { seconds, size }) {
  const perSecond = PRO_SIZES.has(size) ? 0.30 : 0.10;
  const stills = plan.filter((p) => p.still === 'generate').length;
  const videos = plan.filter((p) => p.video === 'generate').length;
  return stills * STILL_USD + videos * Number(seconds) * perSecond;
}
