import React, { useState, useEffect } from 'react';
import { Pose } from '../types';
import { PoseLibrary } from '../PoseLibrary';

interface ControlsProps {
  pose: Pose;
  overlayMode: 'auto' | 'on' | 'off';
  setOverlayMode: (mode: 'auto' | 'on' | 'off') => void;
  onChange: (key: keyof Pose, value: any) => void;
  onLoad: (pose: Pose) => void;
  frames: Pose[];
}

const Slider = ({ 
    label, 
    value, 
    min, 
    max, 
    onChange, 
    highlight = false,
}: { 
    label: string, 
    value: number, 
    min: number, 
    max: number, 
    onChange: (val: number) => void, 
    highlight?: boolean,
}) => (
  <div className="flex flex-col mb-4 select-none group">
    <div className={`flex justify-between text-[10px] font-mono mb-1 tracking-tight ${highlight ? 'text-purple-600 font-bold' : 'text-ink'}`}>
      <span className="opacity-70 group-hover:opacity-100 transition-opacity">
        {label}
      </span>
      <span className="opacity-100">{Math.round(value)}{label.includes('POS') ? 'px' : '°'}</span>
    </div>
    <div className="relative h-5 w-full flex items-center">
        <input 
        type="range" 
        min={min} 
        max={max} 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerDown={(e) => e.stopPropagation()}
        className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none transition-all ${highlight ? 'bg-purple-200 accent-purple-600' : 'bg-gray-200 accent-ink/80 hover:bg-gray-300'}`}
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
    frames
}) => {
  const [expanded, setExpanded] = useState<'upper' | 'lower' | 'library' | 'base' | null>('lower'); 
  const [dualPivotMode, setDualPivotMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [basePivotActive, setBasePivotActive] = useState(false);
  
  const FULL_ROTATION = { min: -180, max: 180 };
  const CORRECTIVE_RANGE = { min: -45, max: 45 };

  // Sync Base Pivot state with data
  useEffect(() => {
    if (pose.root.x !== 0 || pose.root.y !== 0 || (pose.rootRotation && pose.rootRotation !== 0)) {
        setBasePivotActive(true);
    }
  }, [pose.root, pose.rootRotation]);

  const toggleBasePivot = () => {
    if (basePivotActive) {
        setBasePivotActive(false);
        onChange('root', { x: 0, y: 0 });
        onChange('rootRotation', 0);
    } else {
        setBasePivotActive(true);
    }
  };

  const handleCopyToClipboard = () => {
    const code = JSON.stringify(frames.length > 1 ? frames : pose, null, 2);
    navigator.clipboard.writeText(code).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    });
  };

  // Macro for Foot Pivot (Heel Lift)
  // When this changes, we adjust Ankle (+) and Toes (-)
  const handleHeelLift = (side: 'left' | 'right', delta: number) => {
     // This is a "soft" control, it doesn't store state itself, just modifies bones
     // To implement properly in React without infinite loops, we usually imply it 
     // or just manually adjust the bones. 
     // For this UI, we will just manually adjust Ankle and Toes directly via their specific sliders.
  };

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
          title="1. BASE PIVOT (ROOT)" 
          expanded={expanded === 'base'} 
          onToggle={() => setExpanded(expanded === 'base' ? null : 'base')} 
        />
        {expanded === 'base' && (
          <div className="pt-3 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
             <button
                onClick={toggleBasePivot}
                className={`w-full mb-3 py-1.5 text-[9px] font-bold font-mono rounded-sm transition-all border shadow-sm cursor-pointer ${
                    basePivotActive
                    ? 'bg-purple-50 text-purple-700 border-purple-300'
                    : 'bg-white text-gray-500 border-gray-200 hover:text-ink'
                }`}
             >
                {basePivotActive ? 'PIVOT: UNLOCKED' : 'PIVOT: LOCKED (CENTER)'}
             </button>

             {basePivotActive && (
                <>
                    <Slider 
                        label="OFFSET X" 
                        value={pose.root.x} 
                        min={-200} 
                        max={200} 
                        onChange={(v) => onChange('root', { ...pose.root, x: v })} 
                        highlight
                    />
                    <Slider 
                        label="OFFSET Y" 
                        value={pose.root.y} 
                        min={-200} 
                        max={200} 
                        onChange={(v) => onChange('root', { ...pose.root, y: v })} 
                        highlight
                    />
                    <Slider 
                        label="ROTATION" 
                        value={pose.rootRotation || 0} 
                        min={-180} 
                        max={180} 
                        onChange={(v) => onChange('rootRotation', v)} 
                        highlight
                    />
                </>
             )}
          </div>
        )}
      </div>

      {/* LOWER BODY SECTION (Reordered: Feet first) */}
      <div className="mb-1">
        <SectionHeader 
          title="2. LOWER BODY" 
          expanded={expanded === 'lower'} 
          onToggle={() => setExpanded(expanded === 'lower' ? null : 'lower')} 
        />
        
        {expanded === 'lower' && (
          <div className="pt-3 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <Slider label="L. THIGH" value={pose.lThigh} {...FULL_ROTATION} onChange={(v) => onChange('lThigh', v)} />
            {dualPivotMode && <Slider label="↳ L. THIGH" value={pose.lThighCorrective} {...CORRECTIVE_RANGE} highlight onChange={(v) => onChange('lThighCorrective', v)} />}
            
            <Slider label="L. CALF" value={pose.lCalf} {...FULL_ROTATION} onChange={(v) => onChange('lCalf', v)} />
            <Slider label="L. ANKLE" value={pose.lAnkle} {...FULL_ROTATION} onChange={(v) => onChange('lAnkle', v)} />
            <Slider label="↳ TOE PIVOT" value={pose.lToes || 0} {...CORRECTIVE_RANGE} highlight onChange={(v) => onChange('lToes', v)} />
            
            <div className="my-3 border-t border-dashed border-gray-200" />
            
            <Slider label="R. THIGH" value={pose.rThigh} {...FULL_ROTATION} onChange={(v) => onChange('rThigh', v)} />
            {dualPivotMode && <Slider label="↳ R. THIGH" value={pose.rThighCorrective} {...CORRECTIVE_RANGE} highlight onChange={(v) => onChange('rThighCorrective', v)} />}

            <Slider label="R. CALF" value={pose.rCalf} {...FULL_ROTATION} onChange={(v) => onChange('rCalf', v)} />
            <Slider label="R. ANKLE" value={pose.rAnkle} {...FULL_ROTATION} onChange={(v) => onChange('rAnkle', v)} />
            <Slider label="↳ TOE PIVOT" value={pose.rToes || 0} {...CORRECTIVE_RANGE} highlight onChange={(v) => onChange('rToes', v)} />
          </div>
        )}
      </div>

      {/* UPPER BODY SECTION (Reordered: Head last) */}
      <div className="mb-1">
        <SectionHeader 
          title="3. UPPER BODY" 
          expanded={expanded === 'upper'} 
          onToggle={() => setExpanded(expanded === 'upper' ? null : 'upper')} 
        />
        
        {expanded === 'upper' && (
          <div className="pt-3 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <Slider label="TORSO" value={pose.torso} min={0} max={360} onChange={(v) => onChange('torso', v)} />
            <Slider label="NECK" value={pose.neck} {...FULL_ROTATION} onChange={(v) => onChange('neck', v)} />
            
            <div className="my-3 border-t border-dashed border-gray-200" />
            
            <Slider label="L. SHOULDER" value={pose.lShoulder} {...FULL_ROTATION} onChange={(v) => onChange('lShoulder', v)} />
            {dualPivotMode && <Slider label="↳ L. BICEP" value={pose.lBicepCorrective} {...CORRECTIVE_RANGE} highlight onChange={(v) => onChange('lBicepCorrective', v)} />}
            
            <Slider label="L. FOREARM" value={pose.lForearm} {...FULL_ROTATION} onChange={(v) => onChange('lForearm', v)} />
            <Slider label="L. WRIST" value={pose.lWrist} {...FULL_ROTATION} onChange={(v) => onChange('lWrist', v)} />

            <div className="my-3 border-t border-dashed border-gray-200" />

            <Slider label="R. SHOULDER" value={pose.rShoulder} {...FULL_ROTATION} onChange={(v) => onChange('rShoulder', v)} />
            {dualPivotMode && <Slider label="↳ R. BICEP" value={pose.rBicepCorrective} {...CORRECTIVE_RANGE} highlight onChange={(v) => onChange('rBicepCorrective', v)} />}
            
            <Slider label="R. FOREARM" value={pose.rForearm} {...FULL_ROTATION} onChange={(v) => onChange('rForearm', v)} />
            <Slider label="R. WRIST" value={pose.rWrist} {...FULL_ROTATION} onChange={(v) => onChange('rWrist', v)} />
          </div>
        )}
      </div>

    </div>
  );
};