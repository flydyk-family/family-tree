// Pure argv -> options parser for generate-media.mjs. No I/O.
const SIZES = new Set(['720x1280', '1280x720', '1024x1792', '1792x1024']);
const SECONDS = new Set(['4', '8', '12']);

export function parseArgs(argv) {
  const opts = {
    only: null, withVideo: false, image: null, prompt: null,
    force: false, size: '720x1280', seconds: '4', dryRun: false, yes: false
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) {
        throw new Error(`Missing value for ${flag}`);
      }
      return v;
    };
    switch (flag) {
      case '--only': opts.only = value().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--with-video': opts.withVideo = true; break;
      case '--image': opts.image = value(); break;
      case '--prompt': opts.prompt = value(); break;
      case '--force': opts.force = true; break;
      case '--size': opts.size = value(); break;
      case '--seconds': opts.seconds = value(); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--yes': opts.yes = true; break;
      default: throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!SIZES.has(opts.size)) {
    throw new Error(`--size must be one of ${[...SIZES].join(', ')}`);
  }
  if (!SECONDS.has(opts.seconds)) {
    throw new Error(`--seconds must be one of ${[...SECONDS].join(', ')}`);
  }
  if (opts.image && (!opts.only || opts.only.length !== 1)) {
    throw new Error('--image requires exactly one --only <id>');
  }
  return opts;
}
