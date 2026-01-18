import React, { useState, useEffect, useRef } from 'react';
import { Pose } from '../types';
import { PoseLibrary } from '../PoseLibrary';
import { ANATOMY } from '../constants';
import { getJointPositions, solveTwoBoneIK } from '../utils/kinematics';

interface ControlsProps {
  pose: Pose;
  overlayMode: 'auto' | 'on' | 'off';
  setOverlayMode: (mode: 'auto' | 'on' | 'off') => void;
  onChange: (updates: Partial<Pose>) => void;
  onLoad: (pose: Pose) => void;
  frames: Pose[];
  onInteractionStart: () => void;
}

const Slider = ({ 
    label, 
    value, 
    min, 
    max, 
    onChange, 
    highlight = false,
    locked = false,
    onToggleLock,
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
    onPointerDown: () => void
}) => (
  <div className="flex flex-col mb-4 select-none group relative">
    <div className={`flex justify-between text-[10px] font-mono mb-1 tracking-tight ${highlight ? 'text-purple-600 font-bold' : 'text-ink'}`}>
      <span className="opacity-70 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        {label}
        {onToggleLock && (
            <button 
                onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
                className={`ml-1 px-1 rounded hover:bg-gray-200 transition-colors ${locked ? 'text-red-500' : 'text-gray-300'}`}
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

const SectionHeader = ({ title, expanded, onToggle }: { title: string, expanded: boolean, onToggle: () => void }) => (
  <button 
    onClick={onToggle}
    className="w-full flex justify-between items-center py-3 px-1 border-b border-gray-100 hover:bg-gray-50 transition-colors group text-left cursor-pointer outline-none focus:bg-gray-50"
  >
    <span className="text-[10px] font-bold font-mono tracking-wider text-ink/80 group-hover:text-ink">{title}</span>
    <span className="text-[10px] text-gray-400 group-hover:text-ink transform transition-transform duration-200" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
  </button>
);

export const Controls: React.FC<ControlsProps> = ({ 
    pose, 
    overlayMode, 
    setOverlayMode, 
    onChange, 
    onLoad,
    frames,
    onInteractionStart
}) => {
  const [expanded, setExpanded] = useState<'upper' | 'lower' | 'library' | 'base' | null>('base'); 
  const [dualPivotMode, setDualPivotMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [basePivotActive, setBasePivotActive] = useState(false);
  
  // Logic States
  const [tethered, setTethered] = useState(false);
  const [balanceIntensity, setBalanceIntensity] = useState(0); // 0.0 to 1.5
  const [lockedParams, setLockedParams] = useState<Set<string>>(new Set());

  const tetherRef = useRef<{ 
      l: {x: number, y: number}, 
      r: {x: number, y: number} 
  } | null>(null);
  
  const FULL_ROTATION = { min: -180, max: 180 };
  const CORRECTIVE_RANGE = { min: -45, max: 45 };

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
          // If turning ON, snapshot history first
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

      // --- PHYSICS LAYER 1: TETHER (IK) ---
      const structuralChange = updates.root || updates.rootRotation !== undefined || updates.hips !== undefined;
      
      if (tethered && tetherRef.current && structuralChange) {
          const joints = getJointPositions(candidatePose);
          const lBend = pose.lCalf >= 0 ? 1 : -1;
          const rBend = pose.rCalf >= 0 ? 1 : -1;
          const rootRot = candidatePose.rootRotation || 0;
          const hipsRot = candidatePose.hips;

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

      // --- PHYSICS LAYER 2: SKATEBOARD BALANCE (Incremental) ---
      // Replaces Hard Lock and Soft Damping with user-controlled intensity.
      const balanceChange = updates.rootRotation !== undefined || updates.torso !== undefined;

      if (balanceIntensity > 0 && balanceChange) {
         const prevBodyRot = (pose.rootRotation || 0) + pose.torso;
         const nextBodyRot = (candidatePose.rootRotation || 0) + candidatePose.torso;
         const deltaRot = nextBodyRot - prevBodyRot;
         
         if (Math.abs(deltaRot) > 0.001) {
             if (!lockedParams.has('rShoulder')) {
                  finalChanges.rShoulder = (pose.rShoulder) - (deltaRot * balanceIntensity);
             }
             if (!lockedParams.has('lShoulder')) {
                  finalChanges.lShoulder = (pose.lShoulder) + (deltaRot * balanceIntensity);
             }
         }
      }

      onChange(finalChanges);
  };

  // Helper to generate slider props
  const bindSlider = (key: keyof Pose) => ({
      value: pose[key] as number,
      onChange: (v: number) => handleUpdate({ [key]: v }),
      locked: lockedParams.has(key),
      onToggleLock: () => toggleLock(key),
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
                    className={`flex-1 py-1.5 text-[9px] font-bold font-mono rounded-sm transition-all border shadow-sm cursor-pointer ${
                        tethered
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-white text-gray-400 border-gray-200 hover:text-ink'
                    }`}
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

             {basePivotActive && (
                <>
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
                        <Slider 
                            label="WAIST PIVOT (HIPS)" 
                            min={-360} max={360} 
                            {...bindSlider('hips')}
                        />
                    </div>
                </>
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
            <Slider label="L. THIGH" {...FULL_ROTATION} {...bindSlider('lThigh')} />
            {dualPivotMode && <Slider label="↳ L. THIGH" {...CORRECTIVE_RANGE} highlight {...bindSlider('lThighCorrective')} />}
            
            <Slider label="L. CALF" {...FULL_ROTATION} {...bindSlider('lCalf')} />
            <Slider label="L. ANKLE" {...FULL_ROTATION} {...bindSlider('lAnkle')} />
            <Slider label="L. TOE BEND" {...CORRECTIVE_RANGE} {...bindSlider('lToes')} />
            
            <div className="my-3 border-t border-dashed border-gray-200" />
            
            <Slider label="R. THIGH" {...FULL_ROTATION} {...bindSlider('rThigh')} />
            {dualPivotMode && <Slider label="↳ R. THIGH" {...CORRECTIVE_RANGE} highlight {...bindSlider('rThighCorrective')} />}

            <Slider label="R. CALF" {...FULL_ROTATION} {...bindSlider('rCalf')} />
            <Slider label="R. ANKLE" {...FULL_ROTATION} {...bindSlider('rAnkle')} />
            <Slider label="R. TOE BEND" {...CORRECTIVE_RANGE} {...bindSlider('rToes')} />
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
            <Slider label="TORSO" min={0} max={360} {...bindSlider('torso')} />
            <Slider label="NECK" {...FULL_ROTATION} {...bindSlider('neck')} />
            
            <div className="my-3 border-t border-dashed border-gray-200" />
            
            <Slider label="L. SHOULDER" {...FULL_ROTATION} {...bindSlider('lShoulder')} />
            {dualPivotMode && <Slider label="↳ L. BICEP" {...CORRECTIVE_RANGE} highlight {...bindSlider('lBicepCorrective')} />}
            
            <Slider label="L. FOREARM" {...FULL_ROTATION} {...bindSlider('lForearm')} />
            <Slider label="L. WRIST" {...FULL_ROTATION} {...bindSlider('lWrist')} />

            <div className="my-3 border-t border-dashed border-gray-200" />

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