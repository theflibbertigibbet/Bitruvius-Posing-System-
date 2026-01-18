import React from 'react';
import { Pose } from '../types';

interface TimelineProps {
  frames: Pose[];
  currentFrameIndex: number;
  onSelectFrame: (index: number) => void;
  onAddFrame: () => void;
  onInsertInBetween: () => void;
  onDeleteFrame: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  isTweening: boolean;
  onToggleTween: () => void;
  onExport: () => void;
  exportStatus: 'idle' | 'rendering' | 'zipping';
}

export const Timeline: React.FC<TimelineProps> = ({
  frames,
  currentFrameIndex,
  onSelectFrame,
  onAddFrame,
  onInsertInBetween,
  onDeleteFrame,
  isPlaying,
  onTogglePlay,
  isTweening,
  onToggleTween,
  onExport,
  exportStatus
}) => {
  
  return (
    <div className="absolute top-4 left-4 bottom-4 w-32 bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-sm flex flex-col pointer-events-auto select-none">
      
      {/* Header */}
      <div className="p-3 border-b border-gray-100">
        <h3 className="text-[10px] font-bold font-mono text-ink/80 tracking-wider mb-2">TIMELINE</h3>
        
        {/* Playback Controls */}
        <div className="flex flex-col gap-1.5">
           <button 
              onClick={onTogglePlay}
              className={`w-full py-2 rounded-sm text-[9px] font-bold font-mono border transition-all ${isPlaying ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}
            >
              {isPlaying ? 'PAUSE' : 'PLAY LOOP'}
            </button>
            
            <button
               onClick={onToggleTween}
               className={`w-full py-1.5 rounded-sm text-[9px] font-bold font-mono border transition-all ${isTweening ? 'bg-purple-600 text-white border-purple-700' : 'bg-gray-50 text-gray-400 border-gray-200 hover:text-purple-600'}`}
               title="Interpolate frames during playback"
            >
               {isTweening ? 'TWEEN: ON' : 'TWEEN: OFF'}
            </button>
        </div>
      </div>

      {/* Frame List (Scrollable) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {frames.map((_, i) => (
          <div 
            key={i}
            onClick={() => onSelectFrame(i)}
            className={`
                group relative h-12 w-full border rounded-sm cursor-pointer transition-all flex items-center justify-center
                ${i === currentFrameIndex ? 'bg-purple-100 border-purple-400 shadow-sm' : 'bg-gray-50 border-gray-100 hover:bg-white hover:border-gray-300'}
            `}
          >
            <span className={`text-[10px] font-mono font-bold ${i === currentFrameIndex ? 'text-purple-700' : 'text-gray-400 group-hover:text-gray-600'}`}>
               FRAME {i + 1}
            </span>
            
            {/* Active Indicator */}
            {i === currentFrameIndex && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500 rounded-l-sm" />
            )}
          </div>
        ))}

        {/* Add Button at end of list */}
        {frames.length < 12 && (
             <button 
                onClick={onAddFrame}
                disabled={isPlaying}
                className="w-full h-8 border border-dashed border-gray-300 rounded-sm flex items-center justify-center text-gray-400 hover:text-ink hover:border-gray-400 hover:bg-gray-50 transition-all disabled:opacity-30"
            >
                <span className="text-[12px] font-bold">+</span>
            </button>
        )}
      </div>

      {/* Edit Actions Footer */}
      <div className="p-2 border-t border-gray-100 bg-gray-50/50 space-y-1.5">
         <div className="text-[8px] font-mono text-center text-gray-400 mb-1">EDITING</div>
         
         <button 
            onClick={onInsertInBetween}
            disabled={isPlaying || frames.length >= 12}
            className="w-full py-1.5 bg-white border border-gray-200 rounded-sm text-[8px] font-bold font-mono text-ink hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all disabled:opacity-40"
            title="Create a new frame averaged between current and next frame"
         >
            + IN-BETWEEN (50%)
         </button>

         <button 
            onClick={onDeleteFrame}
            disabled={isPlaying || frames.length <= 1}
            className="w-full py-1.5 bg-white border border-gray-200 rounded-sm text-[8px] font-bold font-mono text-red-500 hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-40"
         >
            DELETE FRAME
         </button>
         
         <div className="border-t border-dashed border-gray-200 my-2 pt-2">
            <button 
                onClick={onExport}
                disabled={exportStatus !== 'idle'}
                className="w-full py-2 bg-ink text-white rounded-sm text-[8px] font-bold font-mono hover:bg-gray-800 disabled:opacity-70 shadow-sm"
            >
                {exportStatus === 'rendering' ? 'RENDERING...' : exportStatus === 'zipping' ? 'ZIPPING...' : 'EXPORT GIF/ZIP'}
            </button>
         </div>
      </div>

    </div>
  );
};