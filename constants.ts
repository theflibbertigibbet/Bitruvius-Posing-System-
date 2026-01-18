import { Pose } from './types';

// 1 Head Unit in Pixels (Scaling Factor)
export const HEAD_UNIT = 40;

// Anatomical Ratios (Refined for Geometric Facsimile)
export const ANATOMY = {
  // Heights / Lengths
  HEAD: 1.0 * HEAD_UNIT,
  NECK: 0.5 * HEAD_UNIT,
  TORSO: 2.6 * HEAD_UNIT, // Reduced from 3.0 to 2.6 for a lower shoulder line
  PELVIS: 2.0 * HEAD_UNIT, // Prominent Base Triangle
  
  // Limbs - Elongated geometric look
  UPPER_ARM: 2.0 * HEAD_UNIT,
  LOWER_ARM: 2.0 * HEAD_UNIT,
  HAND: 0.8 * HEAD_UNIT,
  
  LEG_UPPER: 2.5 * HEAD_UNIT,
  LEG_LOWER: 2.5 * HEAD_UNIT,
  // Split foot into Foot + Toes (Total approx 1.0)
  FOOT: 0.6 * HEAD_UNIT, 
  TOES: 0.4 * HEAD_UNIT,
  
  // Widths (Geometric shapes)
  SHOULDER_WIDTH: 2.0 * HEAD_UNIT, // REVERTED to 2.0 to keep torso slim. Joint offset handled in Mannequin.tsx
  HIP_WIDTH: 1.8 * HEAD_UNIT,      // Wide hips for the A shape
  NECK_BASE: 0.525 * HEAD_UNIT,    // Thickened 1.5x (from 0.35) for angular structure
  
  // Limb Thickness (for Diamond shapes)
  LIMB_WIDTH_ARM: 0.8 * HEAD_UNIT, // Doubled from 0.4 to 0.8
  LIMB_WIDTH_FOREARM: 0.35 * HEAD_UNIT,
  // Thicker legs (1.5x previous values of 0.55 and 0.45)
  LIMB_WIDTH_THIGH: 0.825 * HEAD_UNIT,
  LIMB_WIDTH_CALF: 0.675 * HEAD_UNIT,
  EFFECTOR_WIDTH: 0.3 * HEAD_UNIT, // Sharp extremities
};

// RIGGING CONSTANTS (Internal Offsets)
// Exported to ensure IK Solver matches Visual Mannequin exactly
export const RIGGING = {
    SHOULDER_INSET: 5,
    SHOULDER_LIFT: -12,
    CLAVICLE_EXTENSION: 0.5 * HEAD_UNIT,
    NECK_SINK: -15,
};

// SYSTEM BIOS: Factory Default State (T-Pose Baseline)
// This serves as the universal "Ground Truth" for all kinematic operations.
export const DEFAULT_POSE: Pose = {
  root: { x: 0, y: 0 }, // Navel at World Origin (CPU Anchor)
  rootRotation: 0, // Global rotation around the anchor
  hips: 0, // Waist/Pelvis rotation
  torso: 180, // Vertical Up (Upright)
  neck: 0,
  lShoulder: 0, // T-pose (Parallel to ground)
  lBicepCorrective: -12, // User-defined depth correction
  lForearm: 0,
  lWrist: 0,
  rShoulder: 0,
  rBicepCorrective: 12, // User-defined depth correction (Mirrored)
  rForearm: 0,
  rWrist: 0,
  lThigh: 0,
  lThighCorrective: 5, // Splays the hip connection inward
  lCalf: 0,
  lAnkle: 0,
  lToes: 0,
  rThigh: 0,
  rThighCorrective: -5, // Splays the hip connection inward
  rCalf: 0,
  rAnkle: 0,
  rToes: 0,
};