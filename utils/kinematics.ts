import { Pose } from '../types';
import { ANATOMY, RIGGING } from '../constants';

export const IK_REMOVED = false;

const lerp = (start: number, end: number, t: number) => {
  return start * (1 - t) + end * t;
};

// Interpolate between two full Poses
export const interpolatePose = (poseA: Pose, poseB: Pose, t: number): Pose => {
  const clampedT = Math.max(0, Math.min(1, t));
  const result: any = { ...poseA };
  
  result.root = {
    x: lerp(poseA.root.x, poseB.root.x, clampedT),
    y: lerp(poseA.root.y, poseB.root.y, clampedT),
  };
  
  result.rootRotation = lerp(poseA.rootRotation || 0, poseB.rootRotation || 0, clampedT);

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

/**
 * Calculates the maximum deviation between two poses.
 * Returns the largest difference found in either degrees (for joints) or pixels (for root).
 */
export const getMaxPoseDeviation = (poseA: Pose, poseB: Pose): number => {
    let maxDiff = 0;

    // Check Root Position (Pythagorean distance)
    const dx = poseA.root.x - poseB.root.x;
    const dy = poseA.root.y - poseB.root.y;
    const rootDist = Math.sqrt(dx * dx + dy * dy);
    maxDiff = Math.max(maxDiff, rootDist);

    // Check Root Rotation
    const rootRotDiff = Math.abs((poseA.rootRotation || 0) - (poseB.rootRotation || 0));
    maxDiff = Math.max(maxDiff, rootRotDiff);

    // Check all other numeric properties
    const keys = Object.keys(poseA) as Array<keyof Pose>;
    for (const key of keys) {
        if (key === 'root' || key === 'rootRotation') continue;
        
        const valA = poseA[key];
        const valB = poseB[key];

        if (typeof valA === 'number' && typeof valB === 'number') {
            const diff = Math.abs(valA - valB);
            maxDiff = Math.max(maxDiff, diff);
        }
    }

    return maxDiff;
};

// --- INVERSE KINEMATICS ENGINE ---

// Basic vector rotation
const rotateVec = (x: number, y: number, angleDeg: number) => {
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        x: x * cos - y * sin,
        y: x * sin + y * cos
    };
};

/**
 * Calculates Global Joint Positions based on the Pose
 * Useful for finding where the feet ARE so we can lock them there.
 */
export const getJointPositions = (pose: Pose) => {
    // 1. Root
    const root = pose.root;
    const rootRot = pose.rootRotation || 0;

    // 2. Hip Centers (Left/Right)
    // Hierarchy: Root -> Rotate(RootRot) -> PelvisBone -> Rotate(Hips) -> HipOffset
    
    // Hip Pivot local to Pelvis Bone End
    // Pelvis Bone Vector: (0, ANATOMY.PELVIS)
    // Hip Offset local to Bone End: (Offset, 0)
    // Total Vector relative to Root (before root rot): Rotate((0, PELVIS) + (Offset, 0), Hips)
    // Actually, Bone structure is: Rotate(Hips) -> Translate(0, Length) -> Children.
    // Children are at (0, Length) in the Rotated(Hips) frame.
    // The Leg Container is translated by (HipOffset, 0) in that frame.
    // So Vector = Rotate( (0, PELVIS) + (HipOffset, 0), Hips )
    
    const calculateHip = (side: 'left' | 'right') => {
        const xOffset = side === 'right' ? ANATOMY.HIP_WIDTH/4 : -ANATOMY.HIP_WIDTH/4;
        const totalRot = rootRot + pose.hips;
        
        // Vector from Navel to Hip Joint
        // The Pelvis bone goes down (Y+). The hip offset is X.
        const v = rotateVec(xOffset, ANATOMY.PELVIS, totalRot);
        
        return {
            x: root.x + v.x,
            y: root.y + v.y
        };
    };

    const lHip = calculateHip('left');
    const rHip = calculateHip('right');

    // 3. Ankles
    // Thigh + Calf
    const calculateAnkle = (hip: {x: number, y: number}, side: 'left' | 'right') => {
        const thighAngleLocal = side === 'right' ? pose.rThigh : pose.lThigh;
        const calfAngleLocal = side === 'right' ? pose.rCalf : pose.lCalf;
        
        // Global Angles
        const thighAngleGlobal = rootRot + pose.hips + thighAngleLocal;
        const calfAngleGlobal = thighAngleGlobal + calfAngleLocal;
        
        const thighVec = rotateVec(0, ANATOMY.LEG_UPPER, thighAngleGlobal);
        const calfVec = rotateVec(0, ANATOMY.LEG_LOWER, calfAngleGlobal);
        
        const knee = { x: hip.x + thighVec.x, y: hip.y + thighVec.y };
        const ankle = { x: knee.x + calfVec.x, y: knee.y + calfVec.y };
        
        return { knee, ankle, calfAngleGlobal };
    };

    const lLeg = calculateAnkle(lHip, 'left');
    const rLeg = calculateAnkle(rHip, 'right');

    return {
        lHip, rHip,
        lKnee: lLeg.knee, rKnee: rLeg.knee,
        lAnkle: lLeg.ankle, rAnkle: rLeg.ankle
    };
};

/**
 * Solve 2-Bone IK
 * Returns LOCAL angles for Thigh and Calf
 */
export const solveTwoBoneIK = (
    rootRot: number,
    hipsRot: number,
    hipPos: {x: number, y: number},
    targetAnkle: {x: number, y: number},
    L1: number,
    L2: number,
    currentBendDir: number // 1 or -1, to prefer current knee direction
) => {
    const dx = targetAnkle.x - hipPos.x;
    const dy = targetAnkle.y - hipPos.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    // Clamp reach to avoid NaN
    const reach = Math.min(dist, L1 + L2 - 0.1);
    
    // Law of Cosines for Alpha (Angle between Thigh and Reach Vector)
    const cosAlpha = (L1*L1 + reach*reach - L2*L2) / (2 * L1 * reach);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
    
    // Angle of Reach Vector (Global)
    // atan2(dy, dx) gives angle from X+. 
    // SVG 0 is Y+. (0,1).
    // VectorAngle in SVG space = atan2(dy, dx) - PI/2.
    const vectorAngle = Math.atan2(dy, dx) - (Math.PI / 2);
    
    // Thigh Angle Global
    // We modify vectorAngle by alpha. Direction depends on bend.
    const thighGlobalRad = vectorAngle - (alpha * currentBendDir);
    
    // Calf Angle Local (Angle relative to Thigh)
    // Law of Cosines for Angle C (Internal Knee Angle)
    const cosC = (L1*L1 + L2*L2 - reach*reach) / (2 * L1 * L2);
    const angleC = Math.acos(Math.max(-1, Math.min(1, cosC)));
    
    // If straight leg, Angle C is PI. Local Calf is 0.
    // Deviation is (PI - C). 
    // If bendDir is positive, we want positive rotation?
    const calfLocalRad = (Math.PI - angleC) * currentBendDir;
    
    // Convert to Degrees
    let thighGlobalDeg = thighGlobalRad * 180 / Math.PI;
    const calfLocalDeg = calfLocalRad * 180 / Math.PI;
    
    // Convert Global Thigh to Local Thigh
    // Global = Root + Hips + Local
    // Local = Global - Root - Hips
    const thighLocalDeg = thighGlobalDeg - rootRot - hipsRot;
    
    return {
        thigh: thighLocalDeg,
        calf: calfLocalDeg
    };
};