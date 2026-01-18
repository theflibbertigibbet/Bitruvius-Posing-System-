import { Pose } from '../types';

export const IK_REMOVED = true;

const lerp = (start: number, end: number, t: number) => {
  return start * (1 - t) + end * t;
};

// Interpolate between two full Poses
export const interpolatePose = (poseA: Pose, poseB: Pose, t: number): Pose => {
  // Clamp t
  const clampedT = Math.max(0, Math.min(1, t));

  const result: any = { ...poseA };
  
  // Interpolate Root (Object)
  result.root = {
    x: lerp(poseA.root.x, poseB.root.x, clampedT),
    y: lerp(poseA.root.y, poseB.root.y, clampedT),
  };
  
  // Interpolate Root Rotation (Optional Number)
  result.rootRotation = lerp(poseA.rootRotation || 0, poseB.rootRotation || 0, clampedT);

  // Interpolate all other numeric properties
  Object.keys(poseA).forEach((key) => {
    if (key === 'root' || key === 'rootRotation') return;
    
    const valA = (poseA as any)[key];
    const valB = (poseB as any)[key];
    
    if (typeof valA === 'number' && typeof valB === 'number') {
      result[key] = lerp(valA, valB, clampedT);
    }
  });

  return result as Pose;
};