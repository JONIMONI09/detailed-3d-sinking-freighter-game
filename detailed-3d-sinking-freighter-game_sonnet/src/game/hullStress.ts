/**
 * Hull girder stress model (Euler-Bernoulli beam on a buoyant foundation).
 *
 * Pure functions, no rendering or simulation state. The hull is cut into
 * sections along the keel; each carries its weight and buoyant lift in newtons.
 * Net load S = B - W is integrated to shear V and bending moment M. When the
 * bending stress sigma = M * c / I at a joint exceeds the yield strength, the
 * hull fractures there and splits into two independent bodies.
 */

export const GRAVITY = 9.81;
/** High-tensile shipbuilding steel yield strength in Pa. */
export const STEEL_YIELD_PA = 355e6;

export interface GirderSection {
  /** Section length along the keel in metres. */
  length: number;
  /** Downward load in N (structure, cargo and flood water). */
  weight: number;
  /** Upward buoyant load in N. */
  buoyancy: number;
  /** Second moment of area of the section in m^4. */
  inertia: number;
  /** Distance from neutral axis to the extreme fibre in m. */
  extremeFibre: number;
}

export interface GirderResult {
  /** Shear force V in N at each joint (length n + 1, free ends are 0). */
  shear: number[];
  /** Bending moment M in N*m at each joint. */
  moment: number[];
  /** Absolute bending stress in Pa at each joint (free ends are 0). */
  stress: number[];
  maxStress: number;
  /** Joint index (1..n-1) of the highest stress, or -1 with fewer than 2 sections. */
  maxJoint: number;
  /** maxStress divided by the yield strength. */
  ratio: number;
  fractured: boolean;
}

/** Rescales buoyancy so total lift equals total weight, as for a floating body at rest. */
export function balanceBuoyancy(sections: readonly GirderSection[]): GirderSection[] {
  const w = sections.reduce((a, s) => a + s.weight, 0);
  const b = sections.reduce((a, s) => a + s.buoyancy, 0);
  const k = b > 0 ? w / b : 0;
  return sections.map((s) => ({ ...s, buoyancy: s.buoyancy * k }));
}

/**
 * Integrates shear and bending moment along the keel.
 * Section loads are treated as uniform over the section, so V is piecewise
 * linear and M is piecewise quadratic; the exact integral is used per section.
 */
export function evaluateGirder(sections: readonly GirderSection[], yieldPa = STEEL_YIELD_PA): GirderResult {
  const n = sections.length;
  const shear = new Array<number>(n + 1).fill(0);
  const moment = new Array<number>(n + 1).fill(0);
  const stress = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const s = sections[i];
    shear[i + 1] = shear[i] + (s.buoyancy - s.weight);
    moment[i + 1] = moment[i] + ((shear[i] + shear[i + 1]) / 2) * s.length;
  }
  let maxStress = 0;
  let maxJoint = -1;
  for (let j = 1; j < n; j++) {
    // Use the stiffer-neighbour-safe (weaker) section for the stress at the joint.
    const a = sections[j - 1];
    const b = sections[j];
    const sigmaA = (Math.abs(moment[j]) * a.extremeFibre) / a.inertia;
    const sigmaB = (Math.abs(moment[j]) * b.extremeFibre) / b.inertia;
    stress[j] = Math.max(sigmaA, sigmaB);
    if (stress[j] > maxStress) {
      maxStress = stress[j];
      maxJoint = j;
    }
  }
  return { shear, moment, stress, maxStress, maxJoint, ratio: maxStress / yieldPa, fractured: maxStress >= yieldPa };
}

export interface HullBody {
  sections: GirderSection[];
  /** Total weight in N. */
  weight: number;
  /** Keel coordinate of the centre of weight in m, measured from this body's own start. */
  centerOfWeight: number;
  length: number;
}

function summarize(sections: GirderSection[]): HullBody {
  let length = 0;
  let weight = 0;
  let moment = 0;
  for (const s of sections) {
    moment += s.weight * (length + s.length / 2);
    weight += s.weight;
    length += s.length;
  }
  return { sections, weight, centerOfWeight: weight > 0 ? moment / weight : length / 2, length };
}

/**
 * Splits the hull at a joint into an aft body (sections before the joint) and
 * a fore body. Each body is rebalanced on its own so it floats (or sinks)
 * independently afterwards.
 */
export function splitHull(sections: readonly GirderSection[], joint: number): { aft: HullBody; fore: HullBody } {
  if (!Number.isInteger(joint) || joint < 1 || joint > sections.length - 1) {
    throw new RangeError(`joint ${joint} is not an interior joint of ${sections.length} sections`);
  }
  return {
    aft: summarize(sections.slice(0, joint).map((s) => ({ ...s }))),
    fore: summarize(sections.slice(joint).map((s) => ({ ...s }))),
  };
}
