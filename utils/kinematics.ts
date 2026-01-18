import { Pose } from '../types';
import { ANATOMY, RIGGING, HEAD_UNIT } from '../constants';

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
 */
export const getMaxPoseDeviation = (poseA: Pose, poseB: Pose): number => {
    let maxDiff = 0;
    const dx = poseA.root.x - poseB.root.x;
    const dy = poseA.root.y - poseB.root.y;
    maxDiff = Math.max(maxDiff, Math.sqrt(dx * dx + dy * dy));
    maxDiff = Math.max(maxDiff, Math.abs((poseA.rootRotation || 0) - (poseB.rootRotation || 0)));

    const keys = Object.keys(poseA) as Array<keyof Pose>;
    for (const key of keys) {
        if (key === 'root' || key === 'rootRotation') continue;
        const valA = poseA[key];
        const valB = poseB[key];
        if (typeof valA === 'number' && typeof valB === 'number') {
            maxDiff = Math.max(maxDiff, Math.abs(valA - valB));
        }
    }
    return maxDiff;
};

// --- FORWARD KINEMATICS ENGINE ---

const rad = (deg: number) => deg * Math.PI / 180;
const rotateVec = (x: number, y: number, angleDeg: number) => {
    const r = rad(angleDeg);
    const c = Math.cos(r);
    const s = Math.sin(r);
    return {
        x: x * c - y * s,
        y: x * s + y * c
    };
};
const addVec = (v1: {x:number, y:number}, v2: {x:number, y:number}) => ({ x: v1.x + v2.x, y: v1.y + v2.y });

/**
 * Calculates Global Joint Positions for the entire body.
 * Used for IK locking and collision detection.
 */
export const getJointPositions = (pose: Pose) => {
    const { root, rootRotation = 0 } = pose;

    // --- LOWER BODY ---
    // Root -> Rotate(RootRot) -> Rotate(Hips) -> PelvisBone -> [HipOffsets] -> Legs
    // Note: The Mannequin structure has Hips rotating AT the root.
    // The Pelvis bone extends from Root to Hips.
    // Legs attach at the end of the Pelvis bone.
    
    const globalAnglePelvis = rootRotation + pose.hips;
    
    // Vector from Root to End-of-Pelvis (where hips attach)
    // Pelvis bone is length ANATOMY.PELVIS along Y axis in its local space.
    const pelvisVec = rotateVec(0, ANATOMY.PELVIS, globalAnglePelvis);
    const pelvisEnd = addVec(root, pelvisVec);

    const getLegJoints = (side: 'left' | 'right') => {
        const isRight = side === 'right';
        const thighAngle = isRight ? pose.rThigh : pose.lThigh;
        const calfAngle = isRight ? pose.rCalf : pose.lCalf;
        const ankleAngle = isRight ? pose.rAnkle : pose.lAnkle;
        const toesAngle = isRight ? pose.rToes : pose.lToes;
        
        // Hip Joint Offset relative to Pelvis End
        // Right is Negative X in Mannequin setup? No:
        // rHipX = ANATOMY.HIP_WIDTH/4. lHipX = -ANATOMY.HIP_WIDTH/4.
        // Wait, checking Mannequin.tsx:
        // rHipX = ANATOMY.HIP_WIDTH/4; (Positive)
        // lHipX = -ANATOMY.HIP_WIDTH/4; (Negative)
        // Transform is translate(rHipX, hipY).
        // Since we are inside the Pelvis Bone (rotated by globalAnglePelvis),
        // we rotate the offset vector by globalAnglePelvis.
        const hipOffsetX = isRight ? ANATOMY.HIP_WIDTH/4 : -ANATOMY.HIP_WIDTH/4;
        const hipOffsetVec = rotateVec(hipOffsetX, 0, globalAnglePelvis);
        const hipJoint = addVec(pelvisEnd, hipOffsetVec);
        
        // Thigh
        const angleThighGlobal = globalAnglePelvis + thighAngle;
        const thighVec = rotateVec(0, ANATOMY.LEG_UPPER, angleThighGlobal);
        const kneeJoint = addVec(hipJoint, thighVec);
        
        // Calf
        const angleCalfGlobal = angleThighGlobal + calfAngle;
        const calfVec = rotateVec(0, ANATOMY.LEG_LOWER, angleCalfGlobal);
        const ankleJoint = addVec(kneeJoint, calfVec);
        
        // Foot
        // Mannequin uses -90 offset for Right, +90 for Left.
        // rotation={-90 + pose.rAnkle}
        const footBaseAngle = isRight ? -90 : 90;
        const angleFootGlobal = angleCalfGlobal + footBaseAngle + ankleAngle;
        const footVec = rotateVec(0, ANATOMY.FOOT, angleFootGlobal);
        const toeBase = addVec(ankleJoint, footVec);
        
        // Toes
        const angleToesGlobal = angleFootGlobal + toesAngle;
        const toesVec = rotateVec(0, ANATOMY.TOES, angleToesGlobal);
        const toeTip = addVec(toeBase, toesVec);

        return { hip: hipJoint, knee: kneeJoint, ankle: ankleJoint, toeBase, toeTip };
    };

    const rightLeg = getLegJoints('right');
    const leftLeg = getLegJoints('left');

    // --- UPPER BODY ---
    // Root -> Rotate(RootRot) -> Rotate(Torso) -> TorsoBone -> Neck -> Head
    const globalAngleTorso = rootRotation + pose.torso;
    
    // Neck Base (End of Torso Bone)
    // Torso Bone is Wedge, length ANATOMY.TORSO along Y.
    // Note: In Mannequin, `navelY_Torso = -ANATOMY.TORSO`.
    // Wait, Mannequin: <Bone rotation={pose.torso} ... >
    // The bone starts at Root. Children at Length.
    // So NeckBase is at (0, TORSO) in Torso space.
    const torsoVec = rotateVec(0, ANATOMY.TORSO, globalAngleTorso);
    const neckBase = addVec(root, torsoVec);
    
    // Head
    const globalAngleNeck = globalAngleTorso + pose.neck;
    // Head Top is NeckLength + HeadLength away
    const headVec = rotateVec(0, ANATOMY.NECK + ANATOMY.HEAD, globalAngleNeck);
    const headTop = addVec(neckBase, headVec);

    // Shoulders
    // Attached to Torso Bone.
    // Offsets defined in RIGGING/Mannequin.
    // rShoulderX = -(ANATOMY.SHOULDER_WIDTH/2 - inset + extension)
    // lShoulderX = +(ANATOMY.SHOULDER_WIDTH/2 - inset + extension)
    // shoulderY = RIGGING.SHOULDER_LIFT (Negative Y in local space? No, usually positive down)
    // Mannequin says shoulderY = RIGGING.SHOULDER_LIFT (-12).
    
    const getArmJoints = (side: 'left' | 'right') => {
        const isRight = side === 'right';
        const shoulderAngle = isRight ? pose.rShoulder : pose.lShoulder;
        const forearmAngle = isRight ? pose.rForearm : pose.lForearm;
        const wristAngle = isRight ? pose.rWrist : pose.lWrist;

        // Shoulder Joint Position
        // rShoulderX is Negative. lShoulderX is Positive.
        const halfWidth = ANATOMY.SHOULDER_WIDTH/2 - RIGGING.SHOULDER_INSET + RIGGING.CLAVICLE_EXTENSION;
        const sx = isRight ? -halfWidth : halfWidth;
        const sy = RIGGING.SHOULDER_LIFT;
        
        const shoulderOffsetVec = rotateVec(sx, sy, globalAngleTorso);
        const shoulderJoint = addVec(root, shoulderOffsetVec); // Torso starts at Root

        // Upper Arm
        // Right: rotation = 90 + rShoulder
        // Left: rotation = -(90 + lShoulder)
        const baseArmAngle = isRight ? 90 : -90;
        // For Left, the Mannequin uses -(90 + lShoulder) = -90 - lShoulder.
        const effectiveShoulderAngle = isRight 
            ? baseArmAngle + shoulderAngle 
            : baseArmAngle - shoulderAngle;
            
        const globalAngleArm = globalAngleTorso + effectiveShoulderAngle;
        const armVec = rotateVec(0, ANATOMY.UPPER_ARM, globalAngleArm);
        const elbowJoint = addVec(shoulderJoint, armVec);
        
        // Forearm
        const globalAngleForearm = globalAngleArm + forearmAngle;
        const forearmVec = rotateVec(0, ANATOMY.LOWER_ARM, globalAngleForearm);
        const wristJoint = addVec(elbowJoint, forearmVec);
        
        // Hand
        const globalAngleHand = globalAngleForearm + wristAngle;
        const handVec = rotateVec(0, ANATOMY.HAND, globalAngleHand);
        const handTip = addVec(wristJoint, handVec);
        
        return { shoulder: shoulderJoint, elbow: elbowJoint, wrist: wristJoint, handTip };
    };

    const rightArm = getArmJoints('right');
    const leftArm = getArmJoints('left');

    return {
        lHip: leftLeg.hip, rHip: rightLeg.hip,
        lKnee: leftLeg.knee, rKnee: rightLeg.knee,
        lAnkle: leftLeg.ankle, rAnkle: rightLeg.ankle,
        lToeTip: leftLeg.toeTip, rToeTip: rightLeg.toeTip,
        
        neckBase,
        headTop,
        
        lShoulder: leftArm.shoulder, rShoulder: rightArm.shoulder,
        lElbow: leftArm.elbow, rElbow: rightArm.elbow,
        lWrist: leftArm.wrist, rWrist: rightArm.wrist,
        lHandTip: leftArm.handTip, rHandTip: rightArm.handTip
    };
};

export const solveTwoBoneIK = (
    rootRot: number,
    hipsRot: number,
    hipPos: {x: number, y: number},
    targetAnkle: {x: number, y: number},
    L1: number,
    L2: number,
    currentBendDir: number 
) => {
    const dx = targetAnkle.x - hipPos.x;
    const dy = targetAnkle.y - hipPos.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const reach = Math.min(dist, L1 + L2 - 0.1);
    
    const cosAlpha = (L1*L1 + reach*reach - L2*L2) / (2 * L1 * reach);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
    const vectorAngle = Math.atan2(dy, dx) - (Math.PI / 2);
    const thighGlobalRad = vectorAngle - (alpha * currentBendDir);
    
    const cosC = (L1*L1 + L2*L2 - reach*reach) / (2 * L1 * L2);
    const angleC = Math.acos(Math.max(-1, Math.min(1, cosC)));
    const calfLocalRad = (Math.PI - angleC) * currentBendDir;
    
    let thighGlobalDeg = thighGlobalRad * 180 / Math.PI;
    const calfLocalDeg = calfLocalRad * 180 / Math.PI;
    const thighLocalDeg = thighGlobalDeg - rootRot - hipsRot;
    
    return {
        thigh: thighLocalDeg,
        calf: calfLocalDeg
    };
};
