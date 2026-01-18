import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Mannequin } from './components/Mannequin';
import { Controls } from './components/Controls';
import { Timeline } from './components/Timeline';
import { SystemGrid } from './components/SystemGrid';
import { DEFAULT_POSE, HEAD_UNIT, ANATOMY } from './constants';
import { Pose } from './types';
import { interpolatePose, getMaxPoseDeviation } from './utils/kinematics';
import JSZip from 'jszip';
import FileSaver from 'file-saver';

// History State Interface
interface HistoryState {
  frames: Pose[];
  index: number;
}

const App = () => {
  // --- ANIMATION STATE ---
  const [frames, setFrames] = useState<Pose[]>([DEFAULT_POSE]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTweening, setIsTweening] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'rendering' | 'zipping'>('idle');
  const [fps, setFps] = useState(6); 
  
  const MAX_FRAMES = 60;
  const RECORDING_THRESHOLD = 22.5; 

  // --- HISTORY STATE ---
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  // Visual options
  const [overlayMode, setOverlayMode] = useState<'auto' | 'on' | 'off'>('auto');
  const [isActivity, setIsActivity] = useState(false);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // VISIBILITY STATE (Granular Toggles)
  // Default {} implies all visible. false means hidden.
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});

  // Interpolation
  const [interpolatedPose, setInterpolatedPose] = useState<Pose | null>(null);
  const displayPose = (isPlaying && isTweening && interpolatedPose) ? interpolatedPose : frames[currentFrameIndex];

  // --- HISTORY MANAGEMENT ---
  
  // Snapshots the CURRENT state into 'past' before making a change
  const recordHistory = useCallback(() => {
    setPast(prev => [...prev, { frames, index: currentFrameIndex }]);
    setFuture([]); // Clear future on new branch
  }, [frames, currentFrameIndex]);

  const handleUndo = useCallback(() => {
    if (past.length === 0) return;
    
    const newPast = [...past];
    const previousState = newPast.pop();
    
    // Push current state to future
    setFuture(prev => [{ frames, index: currentFrameIndex }, ...prev]);
    setPast(newPast);
    
    if (previousState) {
        setFrames(previousState.frames);
        setCurrentFrameIndex(previousState.index);
        // Stop playback if undoing
        setIsPlaying(false);
    }
  }, [past, frames, currentFrameIndex]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;

    const newFuture = [...future];
    const nextState = newFuture.shift(); // Get oldest future

    // Push current state to past
    setPast(prev => [...prev, { frames, index: currentFrameIndex }]);
    setFuture(newFuture);

    if (nextState) {
        setFrames(nextState.frames);
        setCurrentFrameIndex(nextState.index);
        setIsPlaying(false);
    }
  }, [future, frames, currentFrameIndex]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if focus is in an input (though we used range inputs which usually don't capture keys, mostly fine)
        if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                handleRedo();
            } else {
                handleUndo();
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            handleRedo();
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);


  // --- Animation Loop ---
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let accumulatedTime = 0;
    
    const FRAME_DURATION = 1000 / fps; 

    const loop = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      if (isPlaying) {
        if (isTweening) {
            accumulatedTime += deltaTime;
            const totalDuration = frames.length * FRAME_DURATION;
            const globalTime = accumulatedTime % totalDuration;
            const exactFrame = globalTime / FRAME_DURATION;
            const frameIndex = Math.floor(exactFrame);
            const nextFrameIndex = (frameIndex + 1) % frames.length;
            const t = exactFrame - frameIndex;

            if (frameIndex !== currentFrameIndex) {
                 setCurrentFrameIndex(frameIndex);
            }
            const p1 = frames[frameIndex];
            const p2 = frames[nextFrameIndex];
            setInterpolatedPose(interpolatePose(p1, p2, t));
        } else {
            accumulatedTime += deltaTime;
            if (accumulatedTime >= FRAME_DURATION) {
                setCurrentFrameIndex(prev => (prev + 1) % frames.length);
                accumulatedTime = 0;
            }
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
        lastTime = performance.now();
        accumulatedTime = currentFrameIndex * FRAME_DURATION; 
        animationFrameId = requestAnimationFrame(loop);
    } else {
        setInterpolatedPose(null);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, isTweening, frames, fps]);

  // Activity monitor
  useEffect(() => {
    setIsActivity(true);
    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
    activityTimeoutRef.current = setTimeout(() => setIsActivity(false), 2000);
    return () => { if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current); };
  }, [displayPose]);

  const showOverlay = useMemo(() => {
    if (overlayMode === 'on') return true;
    if (overlayMode === 'off') return false;
    return isActivity;
  }, [overlayMode, isActivity]);

  // --- STATE HANDLERS ---

  const handlePoseChange = (updates: Partial<Pose>) => {
    if (isPlaying) setIsPlaying(false);

    const updatedFrame = {
        ...frames[currentFrameIndex],
        ...updates
    };

    // 2. LIVE RECORDING LOGIC (Auto-Keyframe)
    if (isRecording && frames.length < MAX_FRAMES) {
        const prevFrameIndex = Math.max(0, currentFrameIndex - 1);
        
        if (currentFrameIndex > 0) {
            const previousFrame = frames[prevFrameIndex];
            const deviation = getMaxPoseDeviation(updatedFrame, previousFrame);
            
            if (deviation > RECORDING_THRESHOLD) {
                recordHistory(); 
                setFrames(prev => {
                   const newFrames = [...prev];
                   newFrames[currentFrameIndex] = updatedFrame;
                   return [...newFrames, updatedFrame];
                });
                setCurrentFrameIndex(prev => prev + 1);
                return; 
            }
        } else if (currentFrameIndex === 0 && frames.length === 1) {
             const deviation = getMaxPoseDeviation(updatedFrame, DEFAULT_POSE);
             if (deviation > RECORDING_THRESHOLD) {
                 recordHistory();
                 setFrames(prev => {
                     const newFrames = [...prev];
                     newFrames[0] = updatedFrame;
                     return [...newFrames, updatedFrame];
                 });
                 setCurrentFrameIndex(1);
                 return;
             }
        }
    }

    setFrames(prev => {
        const newFrames = [...prev];
        newFrames[currentFrameIndex] = updatedFrame;
        return newFrames;
    });
  };
  
  const handleLoadPose = (newPose: Pose) => {
    if (isPlaying) setIsPlaying(false);
    recordHistory(); // Snapshot before load
    setFrames(prev => {
        const newFrames = [...prev];
        newFrames[currentFrameIndex] = newPose;
        return newFrames;
    });
  };

  const handleAddFrame = () => {
      if (frames.length >= MAX_FRAMES) return;
      recordHistory(); // Snapshot before add
      setFrames(prev => {
          const newFrame = { ...prev[currentFrameIndex] };
          return [...prev, newFrame];
      });
      setCurrentFrameIndex(prev => prev + 1);
  };

  const handleInsertInBetween = () => {
      if (frames.length >= MAX_FRAMES) return;
      recordHistory(); // Snapshot before insert
      
      const nextIndex = (currentFrameIndex + 1) % frames.length;
      const p1 = frames[currentFrameIndex];
      const p2 = frames[nextIndex];
      const newPose = interpolatePose(p1, p2, 0.5);

      setFrames(prev => {
          const newFrames = [...prev];
          newFrames.splice(currentFrameIndex + 1, 0, newPose);
          return newFrames;
      });
      setCurrentFrameIndex(prev => prev + 1);
  };

  const handleDeleteFrame = () => {
      if (frames.length <= 1) return;
      recordHistory(); // Snapshot before delete
      setFrames(prev => {
          const newFrames = prev.filter((_, i) => i !== currentFrameIndex);
          return newFrames;
      });
      if (currentFrameIndex >= frames.length - 1) {
          setCurrentFrameIndex(frames.length - 2);
      }
  };

  const handleToggleRecord = () => {
      if (isPlaying) setIsPlaying(false);
      setIsRecording(!isRecording);
  };

  const handleExportSequence = async () => {
      setExportStatus('rendering');
      setIsPlaying(false); 
      setIsRecording(false);
      const zip = new JSZip();
      const originalIndex = currentFrameIndex;
      const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

      try {
          for (let i = 0; i < frames.length; i++) {
              setCurrentFrameIndex(i);
              await wait(150); 
              const svgElement = document.getElementById('mannequin-root-svg');
              if (!svgElement) continue;

              const serializer = new XMLSerializer();
              const svgString = serializer.serializeToString(svgElement);
              const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
              const url = URL.createObjectURL(svgBlob);

              const canvas = document.createElement('canvas');
              canvas.width = 1200; canvas.height = 1600;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                  ctx.scale(2, 2);
                  await new Promise<void>((resolve) => {
                      const img = new Image();
                      img.onload = () => {
                          ctx.translate(300, 400);
                          ctx.fillStyle = '#fdf6e3'; 
                          ctx.fillRect(-300, -400, 600, 800);
                          ctx.drawImage(img, -300, -400, 600, 800);
                          resolve();
                      };
                      img.src = url;
                  });
                  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
                  if (blob) zip.file(`frame_${String(i).padStart(3, '0')}.png`, blob);
              }
              URL.revokeObjectURL(url);
          }
          setExportStatus('zipping');
          const content = await zip.generateAsync({type: "blob"});
          const saveAs = (FileSaver as any).saveAs || FileSaver;
          saveAs(content, `bitruvius_sequence_${Date.now()}.zip`);
      } catch (e) {
          console.error("Export failed", e);
      } finally {
          setCurrentFrameIndex(originalIndex);
          setExportStatus('idle');
      }
  };


  const floorY = ANATOMY.PELVIS + ANATOMY.LEG_UPPER + ANATOMY.LEG_LOWER;

  // VISIBILITY LOGIC
  const toggleVisibility = (key: string) => {
      setVisibility(prev => {
          // If explicitly false, set to true. Otherwise (undefined or true) set to false.
          const current = prev[key] !== false; 
          return { ...prev, [key]: !current };
      });
  };

  const isolateVisibility = (key: string) => {
      // Logic:
      // If we are "isolated" on this key (meaning ONLY this key is visible?), restore all?
      // Simplified: 
      // 1. If everything else is hidden, SHOW ALL.
      // 2. Otherwise, HIDE ALL EXCEPT this key.
      
      // Since we don't have a list of ALL keys easily accessible here without defining them in constants,
      // we can check the visibility map state. 
      // Actually, a safer "Show All" is just clearing the map ({} = all visible).
      
      const allKeys = Object.keys(DEFAULT_POSE).filter(k => k !== 'root'); // root object handled separately usually
      
      // Heuristic: If map has many 'false' values, we are likely isolated.
      const hiddenCount = Object.values(visibility).filter(v => v === false).length;
      
      if (hiddenCount > 2) {
          // Restore All
          setVisibility({});
      } else {
          // Isolate
          const newVis: Record<string, boolean> = {};
          allKeys.forEach(k => {
              newVis[k] = (k === key); // True for target, false for others
          });
          setVisibility(newVis);
      }
  };

  return (
    <div className="w-full h-screen bg-paper relative overflow-hidden flex items-center justify-center touch-none">
      
      <SystemGrid floorY={floorY} />

      <div className={`relative z-10 ${isRecording ? 'border-4 border-red-500/30 rounded-lg' : ''}`}>
        <svg 
            id="mannequin-root-svg"
            width="600" 
            height="800" 
            viewBox="-300 -400 600 800" 
            className="overflow-visible"
        >
          <Mannequin pose={displayPose} showOverlay={showOverlay} visibility={visibility} />
        </svg>
      </div>

      <div className="absolute top-4 left-40 font-mono text-ink opacity-60 pointer-events-none select-none">
        <h1 className="text-xl font-bold tracking-tighter">BITRUVIUS SYSTEM</h1>
        <p className="text-[10px] font-bold text-gray-400 mt-1">
             FRAME: {currentFrameIndex + 1}/{frames.length} 
             {isTweening && isPlaying ? ' [INTERPOLATING]' : ''}
             {isRecording ? ' [● LIVE RECORDING]' : ''}
        </p>
      </div>

      <Timeline 
         frames={frames}
         currentFrameIndex={currentFrameIndex}
         onSelectFrame={setCurrentFrameIndex}
         onAddFrame={handleAddFrame}
         onInsertInBetween={handleInsertInBetween}
         onDeleteFrame={handleDeleteFrame}
         isPlaying={isPlaying}
         onTogglePlay={() => setIsPlaying(!isPlaying)}
         isRecording={isRecording}
         onToggleRecord={handleToggleRecord}
         isTweening={isTweening}
         onToggleTween={() => setIsTweening(!isTweening)}
         onExport={handleExportSequence}
         exportStatus={exportStatus}
         fps={fps}
         onChangeFps={setFps}
         onUndo={handleUndo}
         onRedo={handleRedo}
         canUndo={past.length > 0}
         canRedo={future.length > 0}
      />

      <Controls 
        pose={frames[currentFrameIndex]} 
        overlayMode={overlayMode} 
        setOverlayMode={setOverlayMode} 
        onChange={handlePoseChange} 
        onLoad={handleLoadPose}
        frames={frames}
        onInteractionStart={recordHistory} 
        visibility={visibility}
        onToggleVisibility={toggleVisibility}
        onIsolateVisibility={isolateVisibility}
      />

    </div>
  );
};

export default App;