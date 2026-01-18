import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Mannequin } from './components/Mannequin';
import { Controls } from './components/Controls';
import { Timeline } from './components/Timeline';
import { SystemGrid } from './components/SystemGrid';
import { DEFAULT_POSE, HEAD_UNIT, ANATOMY } from './constants';
import { Pose } from './types';
import { interpolatePose } from './utils/kinematics';
import JSZip from 'jszip';
import FileSaver from 'file-saver';

const App = () => {
  // --- ANIMATION STATE ---
  const [frames, setFrames] = useState<Pose[]>([DEFAULT_POSE]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTweening, setIsTweening] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'rendering' | 'zipping'>('idle');
  
  const MAX_FRAMES = 12;

  // Visual options
  const [overlayMode, setOverlayMode] = useState<'auto' | 'on' | 'off'>('auto');
  
  // --- Activity Monitor (for auto overlay) ---
  const [isActivity, setIsActivity] = useState(false);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Interpolation State ---
  // If playing + tweening, we calculate a dynamic pose. 
  // Otherwise we render the static frame.
  const [interpolatedPose, setInterpolatedPose] = useState<Pose | null>(null);

  // Derived state: The current pose being rendered
  // If tweening and playing, use interpolated. Otherwise use strict keyframe.
  const displayPose = (isPlaying && isTweening && interpolatedPose) ? interpolatedPose : frames[currentFrameIndex];

  // --- Animation Loop ---
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let accumulatedTime = 0;
    
    // FPS configuration
    const FPS = 8; // Keyframes per second
    const FRAME_DURATION = 1000 / FPS; 

    const loop = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      if (isPlaying) {
        if (isTweening) {
            // SMOOTH PLAYBACK (Interpolated)
            // Use accumulated time to progress through "t" (0.0 to 1.0) between frames
            accumulatedTime += deltaTime;
            
            // Calculate global progress
            const totalDuration = frames.length * FRAME_DURATION;
            const globalTime = accumulatedTime % totalDuration;
            
            // Determine which two frames we are between
            const exactFrame = globalTime / FRAME_DURATION;
            const frameIndex = Math.floor(exactFrame);
            const nextFrameIndex = (frameIndex + 1) % frames.length;
            const t = exactFrame - frameIndex; // Decimal part is interpolation factor

            // Update UI index to follow along (optional, maybe distracting if fast)
            if (frameIndex !== currentFrameIndex) {
                 setCurrentFrameIndex(frameIndex);
            }

            // Calculate interpolated pose
            const p1 = frames[frameIndex];
            const p2 = frames[nextFrameIndex];
            setInterpolatedPose(interpolatePose(p1, p2, t));

        } else {
            // STEPPED PLAYBACK (Original Stop-Motion style)
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
        // Reset timers on start
        lastTime = performance.now();
        accumulatedTime = currentFrameIndex * FRAME_DURATION; 
        animationFrameId = requestAnimationFrame(loop);
    } else {
        setInterpolatedPose(null);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, isTweening, frames]); // Re-bind if frames change

  // Activity monitor trigger
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

  // Update the CURRENT frame's data
  const handlePoseChange = (key: keyof Pose, value: any) => {
    // If playing, pause first to edit
    if (isPlaying) setIsPlaying(false);

    setFrames(prev => {
        const newFrames = [...prev];
        newFrames[currentFrameIndex] = {
            ...newFrames[currentFrameIndex],
            [key]: value
        };
        return newFrames;
    });
  };
  
  // Replace current frame with loaded pose (for Cartridges)
  const handleLoadPose = (newPose: Pose) => {
    if (isPlaying) setIsPlaying(false);
    setFrames(prev => {
        const newFrames = [...prev];
        newFrames[currentFrameIndex] = newPose;
        return newFrames;
    });
  };

  // --- Sequencer Actions ---
  const handleAddFrame = () => {
      if (frames.length >= MAX_FRAMES) return;
      setFrames(prev => {
          // Duplicate current frame to the end
          const newFrame = { ...prev[currentFrameIndex] };
          return [...prev, newFrame];
      });
      // Jump to the new frame
      setCurrentFrameIndex(prev => prev + 1);
  };

  const handleInsertInBetween = () => {
      if (frames.length >= MAX_FRAMES) return;
      
      const nextIndex = (currentFrameIndex + 1) % frames.length;
      // If at last frame, nextIndex is 0 (loop). We interpolate between last and first.
      
      const p1 = frames[currentFrameIndex];
      const p2 = frames[nextIndex];
      const newPose = interpolatePose(p1, p2, 0.5); // 50% blend

      setFrames(prev => {
          const newFrames = [...prev];
          // Insert after current index
          newFrames.splice(currentFrameIndex + 1, 0, newPose);
          return newFrames;
      });
      
      // Jump to the newly created frame
      setCurrentFrameIndex(prev => prev + 1);
  };

  const handleDeleteFrame = () => {
      if (frames.length <= 1) return;
      setFrames(prev => {
          const newFrames = prev.filter((_, i) => i !== currentFrameIndex);
          return newFrames;
      });
      // Adjust index if we deleted the last frame
      if (currentFrameIndex >= frames.length - 1) {
          setCurrentFrameIndex(frames.length - 2);
      }
  };

  // --- Export Sequence Logic ---
  const handleExportSequence = async () => {
      setExportStatus('rendering');
      setIsPlaying(false); 

      const zip = new JSZip();
      const originalIndex = currentFrameIndex;
      const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

      try {
          // Temporarily disable overlay for clean render? optional.
          // keeping user preference for now.

          for (let i = 0; i < frames.length; i++) {
              setCurrentFrameIndex(i);
              await wait(150); // Wait for React render + DOM update

              const svgElement = document.getElementById('mannequin-root-svg');
              if (!svgElement) continue;

              const serializer = new XMLSerializer();
              const svgString = serializer.serializeToString(svgElement);
              const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
              const url = URL.createObjectURL(svgBlob);

              const canvas = document.createElement('canvas');
              // High res export
              const width = 600;
              const height = 800;
              const scale = 2;
              canvas.width = width * scale;
              canvas.height = height * scale;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                  ctx.scale(scale, scale);
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
                  if (blob) {
                      zip.file(`frame_${String(i).padStart(3, '0')}.png`, blob);
                  }
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

  return (
    <div className="w-full h-screen bg-paper relative overflow-hidden flex items-center justify-center touch-none">
      
      {/* 1. SYSTEM ENVIRONMENT */}
      <SystemGrid floorY={floorY} />

      {/* 2. SYSTEM HARDWARE */}
      <div className="relative z-10">
        <svg 
            id="mannequin-root-svg"
            width="600" 
            height="800" 
            viewBox="-300 -400 600 800" 
            className="overflow-visible"
        >
          <Mannequin pose={displayPose} showOverlay={showOverlay} />
        </svg>
      </div>

      {/* 3. SYSTEM UI - Overlay Text */}
      <div className="absolute top-4 left-40 font-mono text-ink opacity-60 pointer-events-none select-none">
        <h1 className="text-xl font-bold tracking-tighter">BITRUVIUS SYSTEM</h1>
        <p className="text-[10px] font-bold text-gray-400 mt-1">
             FRAME: {currentFrameIndex + 1}/{frames.length} 
             {isTweening && isPlaying ? ' [INTERPOLATING]' : ''}
        </p>
      </div>

      {/* 4. LEFT SIDEBAR - TIMELINE */}
      <Timeline 
         frames={frames}
         currentFrameIndex={currentFrameIndex}
         onSelectFrame={setCurrentFrameIndex}
         onAddFrame={handleAddFrame}
         onInsertInBetween={handleInsertInBetween}
         onDeleteFrame={handleDeleteFrame}
         isPlaying={isPlaying}
         onTogglePlay={() => setIsPlaying(!isPlaying)}
         isTweening={isTweening}
         onToggleTween={() => setIsTweening(!isTweening)}
         onExport={handleExportSequence}
         exportStatus={exportStatus}
      />

      {/* 5. RIGHT SIDEBAR - CONTROLS */}
      <Controls 
        pose={frames[currentFrameIndex]} // Controls always edit keyframe data
        overlayMode={overlayMode} 
        setOverlayMode={setOverlayMode} 
        onChange={handlePoseChange} 
        onLoad={handleLoadPose}
        frames={frames}
      />

    </div>
  );
};

export default App;