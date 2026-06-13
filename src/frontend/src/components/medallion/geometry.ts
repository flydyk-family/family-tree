import type { NodeRole } from '../../layout/treeLayout';

// The native artwork is 1362x1548; the container is deliberately taller
// (1362x1648, owner-tuned) so the frame draws stretched ~6.5% vertically.
const FRAME_RATIO = 1648 / 1362; // h / w

// Locked oval clip: ellipse(30% 35% at 49.8% 42%) — fractions of the frame box.
const OVAL_CX_F = 0.498;
const OVAL_CY_F = 0.42;
const OVAL_RX_F = 0.30;
const OVAL_RY_F = 0.35;

// Banner one-line name band (fractions of the frame box) — tuned live in Task 9.
const NAME_CY_F = 0.865;
const YEARS_DY_F = 0.075;

export interface FrameGeom {
  role: NodeRole;
  w: number;
  h: number;
  frameX: number;        // frame image top-left (oval centre lands on origin)
  frameY: number;
  ovalRx: number;        // oval radii: clip + dark mount + vignette
  ovalRy: number;
  portraitZoom: number;  // portrait width as a fraction of the frame width
  portraitOffsetY: number; // the locked "-14%" vertical pan, in user units
  nameY: number;
  yearsY: number;
  nameMax: number;       // usable one-line name width
  yearsSize: number;
}

const W_BY_ROLE: Record<NodeRole, number> = { trunk: 200, branch: 186, root: 186, leaf: 158 };
// Trunk zoomed out (the focus portrait reads better less tight on the face).
const ZOOM_BY_ROLE: Record<NodeRole, number> = { trunk: 0.64, branch: 0.70, root: 0.70, leaf: 0.60 };
// Vertical pan of the portrait within the oval (+down). Tuned live so the head
// isn't clipped at the top of the cameo.
const PORTRAIT_OFFSET_Y_F = 0.02;

export function frameGeom(role: NodeRole): FrameGeom {
  const w = W_BY_ROLE[role];
  const h = w * FRAME_RATIO;
  const frameX = -OVAL_CX_F * w;
  const frameY = -OVAL_CY_F * h;
  return {
    role, w, h, frameX, frameY,
    ovalRx: OVAL_RX_F * w,
    ovalRy: OVAL_RY_F * h,
    portraitZoom: ZOOM_BY_ROLE[role],
    portraitOffsetY: PORTRAIT_OFFSET_Y_F * h,
    nameY: frameY + NAME_CY_F * h,
    yearsY: frameY + (NAME_CY_F + YEARS_DY_F) * h,
    nameMax: 0.82 * w,
    yearsSize: 0.054 * w
  };
}
