import React, { useState, useEffect, useRef } from 'react';
import { Pose } from '../types';
import { PoseLibrary } from '../PoseLibrary';
import { ANATOMY, HEAD_UNIT } from '../constants';
import { getJointPositions, solveTwoBoneIK } from '../utils/kinematics';

interface ControlsProps {
  pose: Pose;
  overlayMode: 'auto' | 'on' | 'off';
  setOverlayMode: (mode: 'auto' | 'on' | 'off') => void;
  onChange: (updates: Partial<Pose>) => void;
  onLoad: (pose: Pose) => void;
  frames: Pose[];
  onInteractionStart: () => void;
  // Visibility & Locks
  visibility: Record<string, boolean>;
  onToggleVisibility: (key: string) => void;
  onIsolateVisibility: (key: string) => void;
}

// Group Definitions for Collections
const BODY_GROUPS = {
  L_LEG: ['lThigh', 'lThighCorrective', 'lCalf', 'lAnkle', 'lToes'],
  R_LEG: ['rThigh', 'rThighCorrective', 'rCalf', 'rAnkle', 'rToes'],
  L_ARM: ['lShoulder', 'lBicepCorrective', 'lForearm', 'lWrist'],
  R_ARM: ['rShoulder', 'rBicepCorrective', 'rForearm', 'rWrist'],
  TORSO_GRP: ['torso', 'neck'],
  HIPS_GRP: ['hips']
};

const Slider = ({ 
    label, 
    value, 
    min, 
    max, 
    onChange, 
    highlight = false,
    locked = false,
    onToggleLock,
    visible = true,
    onToggleVisibility,
    onIsolateVisibility,
    onPointerDown
}: { 
    label: string, 
    value: number, 
    min: number, 
    max: number, 
    onChange: (val: number) => void, 
    highlight?: boolean,
    locked?: boolean,
    onToggleLock?: () => void,
    visible?: boolean,
    onToggleVisibility?: () => void,
    onIsolateVisibility?: () => void,
    onPointerDown: () => void
}) => {
    // Long Press Logic for Visibility Button
    // Initialize with undefined explicitly to satisfy strict argument requirements
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const isLongPress = useRef(false);

    const handleEyeDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            if (onIsolateVisibility) onIsolateVisibility();
        }, 600); // 600ms long press
    };

    const handleEyeUp = (e: React.PointerEvent) => {
        e.stopPropagation();
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = undefined;
        }
        if (!isLongPress.current && onToggleVisibility) {
            onToggleVisibility();
        }
    };

    return (
      <div className="flex flex-col mb-4 select-none group relative">
        <div className={`flex justify-between text-[10px] font-mono mb-1 tracking-tight ${highlight ? 'text-purple-600 font-bold' : 'text-ink'}`}>
          <span className="opacity-90 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
            {/* Visibility Toggle (Eye) */}
            {onToggleVisibility && (
                <button
                    onPointerDown={handleEyeDown}
                    onPointerUp={handleEyeUp}
                    onPointerLeave={handleEyeUp} // Cancel on leave
                    className={`p-0.5 rounded transition-colors ${!visible ? 'text-gray-300' : 'text-ink hover:text-blue-600'}`}
                    title="Tap to Hide/Show. Hold to Isolate."
                >
                    {visible ? '👁' : '✕'}
                </button>
            )}
            
            {label}
            
            {/* Lock Toggle */}
            {onToggleLock && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
                    className={`ml-0.5 px-0.5 rounded hover:bg-gray-200 transition-colors ${locked ? 'text-red-500' : 'text-gray-300'}`}
                    title={locked ? "Unlock Pivot" : "Lock Pivot"}
                >
                    {locked ? '🔒' : '🔓'}
                </button>
            )}
          </span>
          <span className="opacity-100">{Math.round(value)}{label.includes('POS') ? 'px' : '°'}</span>
        </div>
        <div className="relative h-5 w-full flex items-center">
            <input 
            type="range" 
            min={min} 
            max={max} 
            value={value} 
            disabled={locked}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            onPointerDown={(e) => {
                e.stopPropagation();
                if (!locked) onPointerDown();
            }}
            className={`w-full h-1.5 rounded-lg appearance-none focus:outline-none transition-all ${
                locked 
                ? 'bg-gray-100 cursor-not-allowed accent-gray-300' 
                : highlight 
                    ? 'bg-purple-200 accent-purple-600 cursor-pointer' 
                    : 'bg-gray-200 accent-ink/80 hover:bg-gray-300 cursor-pointer'
            }`}
            />
        </div>
      </div>
    );
};

const SectionHeader = ({ title, expanded, onToggle, extraControls }: { title: string, expanded: boolean, onToggle: () => void, extraControls?: React.ReactNode }) => (
  <div className="w-full flex justify-between items-center py-2 px-1 border-b border-gray-100 group">
    <button 
        onClick={onToggle}
        className="flex-1 text-left flex justify-between items-center outline-none focus:bg-gray-50 hover:bg-gray-50 py-1"
    >
        <span className="text-[10px] font-bold font-mono tracking-wider text-ink/80 group-hover:text-ink">{title}</span>
        <span className="text-[10px] text-gray-400 group-hover:text-ink transform transition-transform duration-200" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
    </button>
    {extraControls && <div className="ml-2 flex items-center gap-1">{extraControls}</div>}
  </div>
);

const SubHeader = ({ label, onToggleLock, onToggleVis, isLocked, isVisible }: any) => (
    <div className="flex justify-between items-center px-1 py-1 mb-2 bg-gray-50/80 rounded border border-gray-100">
        <span className="text-[9px] font-bold text-gray-500 uppercase">{label}</span>
        <div className="flex gap-2">
            <button onClick={onToggleVis} className={`text-[10px] ${isVisible ? 'text-ink' : 'text-gray-300'}`} title="Toggle Visibility">{isVisible ? '👁' : '✕'}</button>
            <button onClick={onToggleLock} className={`text-[10px] ${isLocked ? 'text-red-500' : 'text-gray-300'}`} title="Toggle Lock">{isLocked ? '🔒' : '🔓'}</button>
        </div>
    </div>
);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Kinematic helper to project leg chain vector (Offset from Root to Toe)
const calculateChainVector = (
    rootRot: number, 
    hips: number, 
    thigh: number, 
    calf: number, 
    ankle: number, 
    toes: number
) => {
    // Basic Forward Kinematics
    const rad = (deg: number) => deg * Math.PI / 180;
    
    // Angles accumulate down the chain
    const a1 = rootRot + hips; // Pelvis global angle
    const a2 = a1 + thigh;     // Thigh global angle
    const a3 = a2 + calf;      // Calf global angle
    // Foot base angle: Right leg is -90 offset from calf in neutral T-pose logic
    const a4 = a3 - 90 + ankle; 
    const a5 = a4 + toes;      

    // Lengths
    const L1 = ANATOMY.PELVIS;
    const L2 = ANATOMY.LEG_UPPER;
    const L3 = ANATOMY.LEG_LOWER;
    const L4 = ANATOMY.FOOT;
    const L5 = ANATOMY.TOES;

    // Y Component (Vertical) - Standard Cosine projection (0deg = Down)
    const y = 
        Math.cos(rad(a1)) * L1 + 
        Math.cos(rad(a2)) * L2 + 
        Math.cos(rad(a3)) * L3 + 
        Math.cos(rad(a4)) * L4 + 
        Math.cos(rad(a5)) * L5;

    // X Component (Horizontal) - Sine projection (0deg = Down, 90deg = Left/Right?)
    // In SVG rotation (+CW): 0 is Down (0,1). 90 is Left (-1,0). 
    // So X = -sin(angle) * Length.
    const x = 
        -Math.sin(rad(a1)) * L1 + 
        -Math.sin(rad(a2)) * L2 + 
        -Math.sin(rad(a3)) * L3 + 
        -Math.sin(rad(a4)) * L4 + 
        -Math.sin(rad(a5)) * L5;

    return { x, y };
};

export const Controls: React.FC<ControlsProps> = ({ 
    pose, 
    overlayMode, 
    setOverlayMode, 
    onChange, 
    onLoad,
    frames,
    onInteractionStart,
    visibility,
    onToggleVisibility,
    onIsolateVisibility
}) => {
  const [expanded, setExpanded] = useState<'upper' | 'lower' | 'library' | 'base' | null>('base'); 
  const [dualPivotMode, setDualPivotMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [basePivotActive, setBasePivotActive] = useState(false);
  
  // Logic States
  const [tethered, setTethered] = useState(false);
  const [balanceIntensity, setBalanceIntensity] = useState(0); // 0.0 to 1.5
  
  // PHYSICS ENGINE STATE: -1.0 (Stiff) <-> 0.0 (Neutral) <-> +1.0 (Collapse)
  const [physicsState, setPhysicsState] = useState(0); 

  const [lockedParams, setLockedParams] = useState<Set<string>>(new Set());

  const tetherRef = useRef<{ 
      l: {x: number, y: number}, 
      r: {x: number, y: number} 
  } | null>(null);
  
  const FULL_ROTATION = { min: -180, max: 180 };
  const CORRECTIVE_RANGE = { min: -45, max: 45 };
  
  // The Visual Floor Line in the app is drawn at this Y value relative to 0,0
  const VISUAL_FLOOR_Y = 280;

  // Sync Base Pivot state with data
  useEffect(() => {
    if (pose.root.x !== 0 || pose.root.y !== 0 || (pose.rootRotation && pose.rootRotation !== 0)) {
        setBasePivotActive(true);
    }
  }, [pose.root, pose.rootRotation]);

  // Handle Tether Toggle
  const toggleTether = () => {
      const newState = !tethered;
      if (newState) {
          onInteractionStart();
      }
      setTethered(newState);
      if (newState) {
          const joints = getJointPositions(pose);
          tetherRef.current = { l: joints.lAnkle, r: joints.rAnkle };
      } else {
          tetherRef.current = null;
      }
  };

  const toggleBasePivot = () => {
    onInteractionStart();
    if (basePivotActive) {
        setBasePivotActive(false);
        onChange({ root: { x: 0, y: 0 }, rootRotation: 0 });
    } else {
        setBasePivotActive(true);
    }
  };

  const toggleLock = (key: string) => {
      setLockedParams(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
      });
  };

  // Group Handlers
  const handleGroupLock = (keys: string[]) => {
      setLockedParams(prev => {
          const next = new Set(prev);
          const allLocked = keys.every(k => prev.has(k));
          keys.forEach(k => {
              if (allLocked) next.delete(k);
              else next.add(k);
          });
          return next;
      });
  };

  const handleGroupVis = (keys: string[]) => {
      // If any are hidden, show all. If all visible, hide all.
      // Default undefined = visible.
      const allVisible = keys.every(k => visibility[k] !== false);
      keys.forEach(k => {
          if (allVisible) onToggleVisibility(k); // Hide
          else if (visibility[k] === false) onToggleVisibility(k); // Show
      });
  };

  const isGroupLocked = (keys: string[]) => keys.every(k => lockedParams.has(k));
  const isGroupVisible = (keys: string[]) => keys.every(k => visibility[k] !== false);

  const handleCopyToClipboard = () => {
    const code = JSON.stringify(frames.length > 1 ? frames : pose, null, 2);
    navigator.clipboard.writeText(code).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    });
  };

  // --- UNIFIED UPDATE HANDLER ---
  const handleUpdate = (updates: Partial<Pose>) => {
      
      // 1. Start with the Candidate Pose (Current + Updates)
      let candidateRoot = pose.root;
      if (updates.root) {
          candidateRoot = { ...pose.root, ...updates.root };
      }
      const candidatePose: Pose = { 
          ...pose, 
          ...updates, 
          root: candidateRoot 
      };

      // 2. Prepare final changeset
      const finalChanges: Partial<Pose> = { ...updates };

      // --- PHYSICS LAYER 1: STRUCTURAL INTEGRITY (Bipolar Engine) ---
      // This layer overrides basic inputs if the engine is engaged (Non-Zero)
      if (physicsState !== 0) {
          
          if (physicsState > 0) {
             // >>> POSITIVE: COLLAPSE (STAGE 1: KUMBAYA/SIT -> STAGE 2: HORIZONTAL) <<<
             const intensity = physicsState;
             const KUMBAYA_LIMIT = 0.75; // 75% of slider is the Vertical Split/Sit

             // 1. KUMBAYA TARGET (Vertical Split / Sit)
             const KUMBAYA_TARGET = {
                 rootRot: 0, 
                 hips: 0,
                 lThigh: 85,   rThigh: -85,   // Middle Splits
                 lCalf: 0,     rCalf: 0,
                 lAnkle: 45,   rAnkle: -45,   // Pointed feet
                 lShoulder: 80, rShoulder: -80, // Arms DOWN (Vertical)
                 lForearm: 0,  rForearm: 0,
                 neck: 0,
                 torso: 180,
             };

             // 2. HORIZONTAL TARGET (Fall Over)
             const HORIZONTAL_TARGET = {
                 rootRot: 90,
                 lShoulder: -160, rShoulder: 160, // Splayed
                 lAnkle: 0, rAnkle: 0
             };

             // Interpolation Logic
             if (intensity <= KUMBAYA_LIMIT) {
                 // PHASE 1: Stand -> Sit (Vertical)
                 const t = intensity / KUMBAYA_LIMIT;
                 
                 finalChanges.rootRotation = lerp(candidatePose.rootRotation || 0, KUMBAYA_TARGET.rootRot, t);
                 finalChanges.hips = lerp(candidatePose.hips, KUMBAYA_TARGET.hips, t);
                 finalChanges.torso = lerp(candidatePose.torso, KUMBAYA_TARGET.torso, t);
                 
                 finalChanges.lThigh = lerp(candidatePose.lThigh, KUMBAYA_TARGET.lThigh, t);
                 finalChanges.rThigh = lerp(candidatePose.rThigh, KUMBAYA_TARGET.rThigh, t);
                 finalChanges.lCalf = lerp(candidatePose.lCalf, KUMBAYA_TARGET.lCalf, t);
                 finalChanges.rCalf = lerp(candidatePose.rCalf, KUMBAYA_TARGET.rCalf, t);
                 
                 finalChanges.lAnkle = lerp(candidatePose.lAnkle, KUMBAYA_TARGET.lAnkle, t);
                 finalChanges.rAnkle = lerp(candidatePose.rAnkle, KUMBAYA_TARGET.rAnkle, t);

                 finalChanges.lShoulder = lerp(candidatePose.lShoulder, KUMBAYA_TARGET.lShoulder, t);
                 finalChanges.rShoulder = lerp(candidatePose.rShoulder, KUMBAYA_TARGET.rShoulder, t);
                 finalChanges.lForearm = lerp(candidatePose.lForearm, KUMBAYA_TARGET.lForearm, t);
                 finalChanges.rForearm = lerp(candidatePose.rForearm, KUMBAYA_TARGET.rForearm, t);
                 finalChanges.neck = lerp(candidatePose.neck, KUMBAYA_TARGET.neck, t);

             } else {
                 // PHASE 2: Sit -> Fall (Horizontal)
                 const t = (intensity - KUMBAYA_LIMIT) / (1 - KUMBAYA_LIMIT);

                 finalChanges.rootRotation = lerp(KUMBAYA_TARGET.rootRot, HORIZONTAL_TARGET.rootRot, t);
                 finalChanges.hips = KUMBAYA_TARGET.hips;
                 finalChanges.torso = KUMBAYA_TARGET.torso;
                 finalChanges.neck = KUMBAYA_TARGET.neck;

                 finalChanges.lThigh = KUMBAYA_TARGET.lThigh;
                 finalChanges.rThigh = KUMBAYA_TARGET.rThigh;
                 finalChanges.lCalf = KUMBAYA_TARGET.lCalf;
                 finalChanges.rCalf = KUMBAYA_TARGET.rCalf;
                 finalChanges.lAnkle = lerp(KUMBAYA_TARGET.lAnkle, HORIZONTAL_TARGET.lAnkle, t);
                 finalChanges.rAnkle = lerp(KUMBAYA_TARGET.rAnkle, HORIZONTAL_TARGET.rAnkle, t);
                 
                 finalChanges.lShoulder = lerp(KUMBAYA_TARGET.lShoulder, HORIZONTAL_TARGET.lShoulder, t);
                 finalChanges.rShoulder = lerp(KUMBAYA_TARGET.rShoulder, HORIZONTAL_TARGET.rShoulder, t);
             }

             // KINEMATIC ANCHORING (COLLAPSE MODE):
             // We only anchor Y here. X anchor during splits/sit would shift the character aggressively.
             const currentRot = finalChanges.rootRotation ?? candidatePose.rootRotation ?? 0;
             const currentHips = finalChanges.hips ?? candidatePose.hips;
             const currentThigh = finalChanges.rThigh ?? candidatePose.rThigh;
             const currentCalf = finalChanges.rCalf ?? candidatePose.rCalf;
             const currentAnkle = finalChanges.rAnkle ?? candidatePose.rAnkle;
             
             const chain = calculateChainVector(currentRot, currentHips, currentThigh, currentCalf, currentAnkle, 0);
             
             if (!updates.root) {
                 finalChanges.root = {
                     x: candidatePose.root.x, // Keep X logic as-is for collapse
                     y: VISUAL_FLOOR_Y - chain.y
                 };
             }

          } else {
             // >>> NEGATIVE: STIFF / ASCENSION (TIP-TOE VARIETY) <<<
             const intensity = Math.abs(physicsState);
             
             const STIFF_TARGET = {
                 rootRot: 0,
                 hips: 0,
                 torso: 180,
                 neck: 0,
                 shoulders: -100, // Arms tight to body (Up/Diver)
                 thighs: 0,       // Straight
                 calves: 0,       // Straight
                 ankles: 90,      // Pointed Toes (Plantar Flexion)
                 toes: 0
             };

             finalChanges.rootRotation = lerp(candidatePose.rootRotation || 0, STIFF_TARGET.rootRot, intensity);
             finalChanges.hips = lerp(candidatePose.hips, STIFF_TARGET.hips, intensity);
             finalChanges.torso = lerp(candidatePose.torso, STIFF_TARGET.torso, intensity);
             
             finalChanges.lShoulder = lerp(candidatePose.lShoulder, STIFF_TARGET.shoulders, intensity);
             finalChanges.rShoulder = lerp(candidatePose.rShoulder, STIFF_TARGET.shoulders, intensity);
             
             // Legs Straighten
             finalChanges.lThigh = lerp(candidatePose.lThigh, -STIFF_TARGET.thighs, intensity);
             finalChanges.rThigh = lerp(candidatePose.rThigh, STIFF_TARGET.thighs, intensity);
             finalChanges.lCalf = lerp(candidatePose.lCalf, STIFF_TARGET.calves, intensity);
             finalChanges.rCalf = lerp(candidatePose.rCalf, STIFF_TARGET.calves, intensity);
             
             // ANKLES: This drives the height change!
             finalChanges.lAnkle = lerp(candidatePose.lAnkle, -STIFF_TARGET.ankles, intensity);
             finalChanges.rAnkle = lerp(candidatePose.rAnkle, STIFF_TARGET.ankles, intensity);
             
             // KINEMATIC ANCHORING (RIGID MODE):
             // Apply full Vector anchoring (X and Y) to keep feet planted as we rotate/lean.
             const currentRot = finalChanges.rootRotation ?? 0;
             const currentHips = finalChanges.hips ?? 0;
             const currentThigh = finalChanges.rThigh ?? 0;
             const currentCalf = finalChanges.rCalf ?? 0;
             const currentAnkle = finalChanges.rAnkle ?? 0;
             
             const chain = calculateChainVector(currentRot, currentHips, currentThigh, currentCalf, currentAnkle, 0);
             
             if (!updates.root) {
                 finalChanges.root = {
                     x: 0 - chain.x, // Anchor Toes to X=0 (Center)
                     y: VISUAL_FLOOR_Y - chain.y // Anchor Toes to Floor
                 };
             }
          }
      }

      // --- PHYSICS LAYER 2: TETHER (IK) ---
      const structuralChange = updates.root || updates.rootRotation !== undefined || updates.hips !== undefined;
      // Disable IK visual tether during rigid/ragdoll modes to avoid fighting the engine
      const isPhysicsActive = Math.abs(physicsState) > 0.05;
      
      if (tethered && tetherRef.current && structuralChange && !isPhysicsActive) {
          const ikCandidate = { ...candidatePose, ...finalChanges };
          const joints = getJointPositions(ikCandidate);
          
          const lBend = pose.lCalf >= 0 ? 1 : -1;
          const rBend = pose.rCalf >= 0 ? 1 : -1;
          const rootRot = ikCandidate.rootRotation || 0;
          const hipsRot = ikCandidate.hips;

          const lIK = solveTwoBoneIK(
              rootRot, hipsRot, joints.lHip, tetherRef.current.l,
              ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, lBend
          );

          const rIK = solveTwoBoneIK(
              rootRot, hipsRot, joints.rHip, tetherRef.current.r,
              ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, rBend
          );
          
          finalChanges.lThigh = lIK.thigh;
          finalChanges.lCalf = lIK.calf;
          finalChanges.rThigh = rIK.thigh;
          finalChanges.rCalf = rIK.calf;
      }

      // --- PHYSICS LAYER 3: SKATEBOARD BALANCE (Incremental) ---
      const balanceChange = updates.rootRotation !== undefined || updates.torso !== undefined;

      if (balanceIntensity > 0 && balanceChange) {
         const prevBodyRot = (pose.rootRotation || 0) + pose.torso;
         const nextBodyRot = (candidatePose.rootRotation || 0) + candidatePose.torso;
         const deltaRot = nextBodyRot - prevBodyRot;
         
         if (Math.abs(deltaRot) > 0.001) {
             if (!lockedParams.has('rShoulder')) {
                  finalChanges.rShoulder = (finalChanges.rShoulder ?? pose.rShoulder) - (deltaRot * balanceIntensity);
             }
             if (!lockedParams.has('lShoulder')) {
                  finalChanges.lShoulder = (finalChanges.lShoulder ?? pose.lShoulder) + (deltaRot * balanceIntensity);
             }
         }
      }

      onChange(finalChanges);
  };

  const handlePhysicsEngineChange = (val: number) => {
      setPhysicsState(val);
      // Trigger a refresh with no manual changes to apply the new physics state
      handleUpdate({});
  };

  // Helper to generate slider props
  const bindSlider = (key: keyof Pose) => ({
      value: pose[key] as number,
      onChange: (v: number) => handleUpdate({ [key]: v }),
      locked: lockedParams.has(key),
      onToggleLock: () => toggleLock(key),
      visible: visibility[key] !== false,
      onToggleVisibility: () => onToggleVisibility(key),
      onIsolateVisibility: () => onIsolateVisibility(key),
      onPointerDown: onInteractionStart
  });

  return (
    <div 
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="absolute top-4 right-4 bg-white/95 backdrop-blur-md p-5 rounded-sm border border-gray-200 shadow-2xl w-64 select-none max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col"
    >
      
      {/* Header */}
      <h3 className="text-xs font-bold font-mono mb-4 border-b border-ink/10 pb-3 flex justify-between items-center">
        <span>SYS_MANIPULATION_PANEL</span>
        <span className="flex items-center gap-2 px-2 py-1 bg-green-50 rounded-full border border-green-100">
           <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
           <span className="text-[9px] text-green-700 font-bold tracking-wide">ONLINE</span>
        </span>
      </h3>

      {/* Visual Options */}
      <div className="mb-4 flex gap-1 bg-gray-100 p-1 rounded-md border border-gray-200">
        {(['auto', 'on', 'off'] as const).map(mode => (
             <button 
                key={mode}
                onClick={() => setOverlayMode(mode)}
                className={`flex-1 py-1.5 text-[9px] font-bold font-mono rounded-sm transition-all cursor-pointer ${
                    overlayMode === mode 
                    ? 'bg-white text-ink shadow-sm border border-gray-200' 
                    : 'text-gray-500 hover:bg-gray-200/50 hover:text-ink'
                }`}
             >
                {mode.toUpperCase()}
             </button>
        ))}
      </div>

       {/* Mode Toggles */}
       <div className="mb-4 flex gap-2">
         <button 
           onClick={() => setDualPivotMode(!dualPivotMode)}
           className={`flex-1 text-[9px] font-bold font-mono px-2 py-2 rounded-sm transition-all border shadow-sm cursor-pointer flex items-center justify-center ${
               dualPivotMode 
               ? 'bg-purple-50 text-purple-700 border-purple-300' 
               : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-ink hover:bg-gray-50'
           }`}
         >
           {dualPivotMode ? '[DUAL: ON]' : '[DUAL-PIVOT]'}
         </button>
         <button 
           onClick={() => setExpanded(expanded === 'library' ? null : 'library')}
           className={`flex-1 text-[9px] font-bold font-mono px-2 py-2 rounded-sm transition-all border shadow-sm cursor-pointer flex items-center justify-center ${
               expanded === 'library'
               ? 'bg-blue-50 text-blue-700 border-blue-300' 
               : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-ink hover:bg-gray-50'
           }`}
         >
           {expanded === 'library' ? '[LIB: OPEN]' : '[CARTRIDGE]'}
         </button>
       </div>

       {/* LIBRARY SECTION */}
       {expanded === 'library' && (
           <div className="mb-4 animate-in fade-in slide-in-from-right-1 duration-200 bg-gray-50 p-2 rounded border border-gray-200 shadow-inner">
               <div className="text-[9px] font-bold text-ink/50 mb-2 uppercase tracking-wider px-1">INJECT CARTRIDGE</div>
               <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                   {Object.keys(PoseLibrary).map(key => (
                       <button
                           key={key}
                           onClick={() => onLoad(PoseLibrary[key])}
                           className="w-full text-left px-3 py-2 bg-white border border-gray-200 rounded-sm hover:border-blue-400 hover:text-blue-700 hover:shadow-sm text-[10px] font-mono transition-all cursor-pointer"
                       >
                           {key}
                       </button>
                   ))}
               </div>
               <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                    <button 
                        onClick={handleCopyToClipboard}
                        className="w-full flex items-center justify-center gap-2 bg-ink text-white py-2 rounded-sm text-[9px] font-bold font-mono hover:bg-gray-800 transition-colors shadow-sm cursor-pointer"
                    >
                        {copyStatus === 'copied' ? 'DATA COPIED' : '[EXPORT JSON DATA]'}
                    </button>
               </div>
           </div>
       )}

      {/* BASE PIVOT SECTION */}
      <div className="mb-1">
        <SectionHeader 
          title="1. BASE PIVOT & BALANCE" 
          expanded={expanded === 'base'} 
          onToggle={() => setExpanded(expanded === 'base' ? null : 'base')} 
        />
        {expanded === 'base' && (
          <div className="pt-3 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
             <div className="flex gap-2 mb-3">
                 <button
                    onClick={toggleBasePivot}
                    className={`flex-1 py-1.5 text-[9px] font-bold font-mono rounded-sm transition-all border shadow-sm cursor-pointer ${
                        basePivotActive
                        ? 'bg-purple-50 text-purple-700 border-purple-300'
                        : 'bg-white text-gray-500 border-gray-200 hover:text-ink'
                    }`}
                 >
                    {basePivotActive ? 'ROOT: UNLOCKED' : 'ROOT: LOCKED'}
                 </button>
                 <button
                    onClick={toggleTether}
                    disabled={Math.abs(physicsState) > 0.1}
                    className={`flex-1 py-1.5 text-[9px] font-bold font-mono rounded-sm transition-all border shadow-sm cursor-pointer ${
                        tethered && Math.abs(physicsState) < 0.1
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-white text-gray-400 border-gray-200 hover:text-ink'
                    } ${Math.abs(physicsState) > 0.1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Lock feet to ground when moving Root"
                 >
                    {tethered ? 'FEET: TETHERED' : 'FEET: FREE'}
                 </button>
             </div>
             
             {/* Skateboard Balance Slider */}
             <div className="flex flex-col mb-4 select-none group relative px-1">
                <div className="flex justify-between text-[10px] font-mono mb-1 tracking-tight text-indigo-700 font-bold">
                  <span className="opacity-70 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    SKATEBOARD BALANCE
                  </span>
                  <span className="opacity-100">
                    {balanceIntensity === 0 ? 'OFF' : `${(balanceIntensity * 100).toFixed(0)}%`}
                  </span>
                </div>
                <div className="relative h-5 w-full flex items-center">
                    <input 
                    type="range" 
                    min={0} 
                    max={1.5} 
                    step={0.05}
                    value={balanceIntensity} 
                    onChange={(e) => setBalanceIntensity(parseFloat(e.target.value))}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-full h-1.5 rounded-lg appearance-none focus:outline-none transition-all bg-indigo-200 accent-indigo-600 cursor-pointer"
                    />
                </div>
             </div>
             
             {/* STRUCTURAL INTEGRITY ENGINE */}
             <div className="flex flex-col mb-4 select-none group relative px-1">
                <div className={`flex justify-between text-[10px] font-mono mb-1 tracking-tight font-bold transition-colors ${
                    physicsState < -0.1 ? 'text-cyan-600' : physicsState > 0.1 ? 'text-rose-600' : 'text-gray-500'
                }`}>
                  <span className="opacity-90 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    {physicsState < -0.1 ? 'STRUCTURAL INTEGRITY: RIGID' : physicsState > 0.1 ? 'STRUCTURAL INTEGRITY: COLLAPSED' : 'STRUCTURAL INTEGRITY: NOMINAL'}
                  </span>
                  <span className="opacity-100">
                    {Math.abs(physicsState * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="relative h-5 w-full flex items-center">
                    <div className="absolute inset-x-0 h-1.5 rounded-lg bg-gradient-to-r from-cyan-100 via-gray-200 to-rose-200 pointer-events-none" />
                    <input 
                    type="range" 
                    min={-1.0} 
                    max={1.0} 
                    step={0.01}
                    value={physicsState} 
                    onChange={(e) => handlePhysicsEngineChange(parseFloat(e.target.value))}
                    onPointerDown={(e) => { e.stopPropagation(); onInteractionStart(); }}
                    className={`w-full h-1.5 rounded-lg appearance-none focus:outline-none transition-all bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:mt-[-5px] ${
                        physicsState < 0 ? '[&::-webkit-slider-thumb]:bg-cyan-500' : '[&::-webkit-slider-thumb]:bg-rose-500'
                    }`}
                    style={{ WebkitAppearance: 'none' }} 
                    />
                </div>
             </div>

             {basePivotActive && (
                <div className="p-2 bg-gray-50 border border-gray-200 rounded-sm mb-3">
                    <div className="text-[8px] font-bold text-gray-400 mb-2 uppercase tracking-wider text-center">Center of Gravity</div>
                    <Slider 
                        label="ROOT X" 
                        min={-200} max={200} 
                        value={pose.root.x}
                        onChange={(v) => handleUpdate({ root: { ...pose.root, x: v } })}
                        highlight
                        locked={false} 
                        onPointerDown={onInteractionStart}
                    />
                    <Slider 
                        label="ROOT Y (HEIGHT)" 
                        min={-200} max={200} 
                        value={pose.root.y}
                        onChange={(v) => handleUpdate({ root: { ...pose.root, y: v } })}
                        highlight
                        locked={false}
                        onPointerDown={onInteractionStart}
                    />
                        <Slider 
                        label="ROOT ROTATION" 
                        min={-180} max={180} 
                        {...bindSlider('rootRotation')}
                    />
                    
                    <SubHeader 
                        label="HIPS / PELVIS"
                        onToggleLock={() => handleGroupLock(BODY_GROUPS.HIPS_GRP)}
                        onToggleVis={() => handleGroupVis(BODY_GROUPS.HIPS_GRP)}
                        isLocked={isGroupLocked(BODY_GROUPS.HIPS_GRP)}
                        isVisible={isGroupVisible(BODY_GROUPS.HIPS_GRP)}
                    />
                    <Slider 
                        label="WAIST PIVOT (HIPS)" 
                        min={-360} max={360} 
                        {...bindSlider('hips')}
                    />
                </div>
             )}
          </div>
        )}
      </div>

      {/* LOWER BODY SECTION */}
      <div className="mb-1">
        <SectionHeader 
          title="2. LOWER BODY" 
          expanded={expanded === 'lower'} 
          onToggle={() => setExpanded(expanded === 'lower' ? null : 'lower')} 
        />
        
        {expanded === 'lower' && (
          <div className="pt-3 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <SubHeader 
                label="LEFT LEG" 
                onToggleLock={() => handleGroupLock(BODY_GROUPS.L_LEG)}
                onToggleVis={() => handleGroupVis(BODY_GROUPS.L_LEG)}
                isLocked={isGroupLocked(BODY_GROUPS.L_LEG)}
                isVisible={isGroupVisible(BODY_GROUPS.L_LEG)}
            />
            <Slider label="L. THIGH" {...FULL_ROTATION} {...bindSlider('lThigh')} />
            {dualPivotMode && <Slider label="↳ L. THIGH" {...CORRECTIVE_RANGE} highlight {...bindSlider('lThighCorrective')} />}
            <Slider label="L. CALF" {...FULL_ROTATION} {...bindSlider('lCalf')} />
            <Slider label="L. ANKLE" {...FULL_ROTATION} {...bindSlider('lAnkle')} />
            <Slider label="L. TOES" {...FULL_ROTATION} {...bindSlider('lToes')} />
            
            <div className="my-3 border-t border-dashed border-gray-200" />
            
            <SubHeader 
                label="RIGHT LEG" 
                onToggleLock={() => handleGroupLock(BODY_GROUPS.R_LEG)}
                onToggleVis={() => handleGroupVis(BODY_GROUPS.R_LEG)}
                isLocked={isGroupLocked(BODY_GROUPS.R_LEG)}
                isVisible={isGroupVisible(BODY_GROUPS.R_LEG)}
            />
            <Slider label="R. THIGH" {...FULL_ROTATION} {...bindSlider('rThigh')} />
            {dualPivotMode && <Slider label="↳ R. THIGH" {...CORRECTIVE_RANGE} highlight {...bindSlider('rThighCorrective')} />}
            <Slider label="R. CALF" {...FULL_ROTATION} {...bindSlider('rCalf')} />
            <Slider label="R. ANKLE" {...FULL_ROTATION} {...bindSlider('rAnkle')} />
            <Slider label="R. TOES" {...FULL_ROTATION} {...bindSlider('rToes')} />
          </div>
        )}
      </div>

      {/* UPPER BODY SECTION */}
      <div className="mb-1">
        <SectionHeader 
          title="3. UPPER BODY" 
          expanded={expanded === 'upper'} 
          onToggle={() => setExpanded(expanded === 'upper' ? null : 'upper')} 
        />
        
        {expanded === 'upper' && (
          <div className="pt-3 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <SubHeader 
                label="TORSO & NECK" 
                onToggleLock={() => handleGroupLock(BODY_GROUPS.TORSO_GRP)}
                onToggleVis={() => handleGroupVis(BODY_GROUPS.TORSO_GRP)}
                isLocked={isGroupLocked(BODY_GROUPS.TORSO_GRP)}
                isVisible={isGroupVisible(BODY_GROUPS.TORSO_GRP)}
            />
            <Slider label="TORSO" min={0} max={360} {...bindSlider('torso')} />
            <Slider label="NECK" {...FULL_ROTATION} {...bindSlider('neck')} />
            
            <div className="my-3 border-t border-dashed border-gray-200" />
            
            <SubHeader 
                label="LEFT ARM" 
                onToggleLock={() => handleGroupLock(BODY_GROUPS.L_ARM)}
                onToggleVis={() => handleGroupVis(BODY_GROUPS.L_ARM)}
                isLocked={isGroupLocked(BODY_GROUPS.L_ARM)}
                isVisible={isGroupVisible(BODY_GROUPS.L_ARM)}
            />
            <Slider label="L. SHOULDER" {...FULL_ROTATION} {...bindSlider('lShoulder')} />
            {dualPivotMode && <Slider label="↳ L. BICEP" {...CORRECTIVE_RANGE} highlight {...bindSlider('lBicepCorrective')} />}
            <Slider label="L. FOREARM" {...FULL_ROTATION} {...bindSlider('lForearm')} />
            <Slider label="L. WRIST" {...FULL_ROTATION} {...bindSlider('lWrist')} />

            <div className="my-3 border-t border-dashed border-gray-200" />

            <SubHeader 
                label="RIGHT ARM" 
                onToggleLock={() => handleGroupLock(BODY_GROUPS.R_ARM)}
                onToggleVis={() => handleGroupVis(BODY_GROUPS.R_ARM)}
                isLocked={isGroupLocked(BODY_GROUPS.R_ARM)}
                isVisible={isGroupVisible(BODY_GROUPS.R_ARM)}
            />
            <Slider label="R. SHOULDER" {...FULL_ROTATION} {...bindSlider('rShoulder')} />
            {dualPivotMode && <Slider label="↳ R. BICEP" {...CORRECTIVE_RANGE} highlight {...bindSlider('rBicepCorrective')} />}
            <Slider label="R. FOREARM" {...FULL_ROTATION} {...bindSlider('rForearm')} />
            <Slider label="R. WRIST" {...FULL_ROTATION} {...bindSlider('rWrist')} />
          </div>
        )}
      </div>

    </div>
  );
};