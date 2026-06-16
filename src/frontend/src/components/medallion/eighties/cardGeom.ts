import type { NodeRole } from '../../../layout/treeLayout';

export interface CardGeom {
  role: NodeRole;
  w: number;        // overall card width
  imgX: number; imgY: number; imgW: number; imgH: number; // portrait box (origin-centred)
  perfW: number;    // sprocket strip width (film era)
  nameY: number;    // baseline for the name (above)
  yearsY: number;   // baseline for the years chip (below)
  nameMax: number;  // usable one-line name width
  yearsSize: number;
}

// Match the classic medallion widths so layout spacing is unchanged.
const W_BY_ROLE: Record<NodeRole, number> = { trunk: 200, branch: 186, root: 186, leaf: 158 };
const IMG_RATIO = 1.32; // portrait h/w — vertical frame

export function cardGeom(role: NodeRole): CardGeom {
  const w = W_BY_ROLE[role];
  const perfW = Math.round(w * 0.085);
  const imgW = w - perfW * 2 - Math.round(w * 0.12); // leave room for perf + edge strips
  const imgH = imgW * IMG_RATIO;
  const imgX = -imgW / 2;
  const imgY = -imgH / 2;
  return {
    role, w, perfW,
    imgX, imgY, imgW, imgH,
    nameY: imgY - 10,
    yearsY: imgY + imgH + 18,
    nameMax: 0.82 * w,
    yearsSize: 0.072 * w
  };
}
