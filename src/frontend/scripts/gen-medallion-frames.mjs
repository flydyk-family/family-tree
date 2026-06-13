// Generates the two recoloured frame variants from frame-gold.svg.
// The state colour map lives ONLY here (spec §3.4). Re-run after editing the map.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../src/assets/medallion/', import.meta.url));
const gold = readFileSync(dir + 'frame-gold.svg', 'utf8');

// gilt: light #f7bb50 · mid #cb9137 · deep #7a4d1c  (parchment/brown/black untouched)
const VARIANTS = {
  'frame-selected.svg': { '#f7bb50': '#ffe79e', '#cb9137': '#eac266', '#7a4d1c': '#a2792f' }, // lit gold
  'frame-match.svg':    { '#f7bb50': '#d6c45e', '#cb9137': '#9c9a3f', '#7a4d1c': '#586322' }  // green-gold
};

for (const [file, map] of Object.entries(VARIANTS)) {
  let svg = gold;
  for (const [from, to] of Object.entries(map)) svg = svg.replaceAll(from, to);
  writeFileSync(dir + file, svg);
  console.log('wrote', file);
}
