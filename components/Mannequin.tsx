import React from 'react';
import { Bone } from './Bone';
import { Pose } from '../types';
import { ANATOMY, HEAD_UNIT } from '../constants';

interface MannequinProps {
  pose: Pose;
  showOverlay?: boolean;
}

export const Mannequin: React.FC<MannequinProps> = ({ pose, showOverlay = true }) => {
  // Calculated offsets for "In-socket" arm placement
  // Recalibrated to align with Shield Torso corners (12px cutout)
  const shoulderInset = 5; // Reduced from 10 to 5 to widen the stance
  const shoulderLift = -12; // Exact alignment with the 12px cutout depth
  
  // New: Clavicle Extension (0.5 Head Unit)
  // Moves the arm pivots outboard without widening the main torso wedge.
  const clavicleExtension = 0.5 * HEAD_UNIT;

  // Sink the neck partially (-15px). 
  // Neck is 20px long. 
  // -15px sink means 5px is visible (Definable neck).
  // Triangle hole is at 10px. 10 - 15 = -5px (Inside torso).
  const neckSink = -15;

  // Match the shoulder circle size to the arm width for a seamless "teardrop" transition
  const shoulderSize = ANATOMY.LIMB_WIDTH_ARM; 
  
  // Calculations for Gesture Lines (The Diamond)
  // Relative to the Torso End (Neck Base) which is at (0, length)
  // Navel is at (0, -ANATOMY.TORSO) relative to the children container
  const navelY_Torso = -ANATOMY.TORSO;
  
  // Apply clavicle extension to the anchors
  const rShoulderX = -(ANATOMY.SHOULDER_WIDTH/2 - shoulderInset + clavicleExtension);
  const lShoulderX = (ANATOMY.SHOULDER_WIDTH/2 - shoulderInset + clavicleExtension);
  const shoulderY = shoulderLift;
  
  // Relative to Pelvis End (Hips)
  // Navel is at (0, -ANATOMY.PELVIS)
  const navelY_Pelvis = -ANATOMY.PELVIS;
  const rHipX = ANATOMY.HIP_WIDTH/4;
  const lHipX = -ANATOMY.HIP_WIDTH/4;
  const hipY = 0;

  return (
    <g 
      className="mannequin-root text-ink"
      transform={`translate(${pose.root.x}, ${pose.root.y}) rotate(${pose.rootRotation || 0})`}
    >
      {/* 
        Navel (0,0) - The Geometric Center / Origin
      */}

      {/* --- UPPER BODY (Torso Branch) --- */}
      {/* Torso: Grows UP (180deg) from Navel */}
      <Bone 
        rotation={pose.torso} 
        length={ANATOMY.TORSO} 
        width={ANATOMY.SHOULDER_WIDTH} 
        variant="wedge"
        rounded={true}
        cutout={12} // Flatter top (12) to create shield-like upper edge
        showOverlay={showOverlay}
        decorations={[
          // 2. The Square (Upper Chest) - Removed holes
          { position: 0.65, shape: 'square', type: 'filled', size: 8 },
          // 3. Neck Peak (Sternal Notch)
          { position: 0.85, shape: 'circle', type: 'filled', size: 10 }
        ]}
      >
        
        {/* GESTURE LINES: Torso Triangle (Navel to Shoulders) */}
        {/* These sit inside the children container (at Neck), so we draw back to Navel */}
        {showOverlay && (
            <>
                {/* Visual "Kite" Structure - Anatomical Gesture Lines */}
                
                {/* 1. Navel to Shoulder (Pectoral/Abdominal Line) */}
                <line x1={0} y1={navelY_Torso} x2={rShoulderX} y2={shoulderY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                <line x1={0} y1={navelY_Torso} x2={lShoulderX} y2={shoulderY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />

                {/* 2. Shoulder to Neck Base (Trapezius Line) */}
                <line x1={rShoulderX} y1={shoulderY} x2={0} y2={neckSink} stroke="#a855f7" strokeWidth={1.5} opacity={0.75} strokeLinecap="round" />
                <line x1={lShoulderX} y1={shoulderY} x2={0} y2={neckSink} stroke="#a855f7" strokeWidth={1.5} opacity={0.75} strokeLinecap="round" />
            </>
        )}

        {/* Neck + Head: Merged Unit */}
        {/* Attached at end of Torso. We sink it downwards to bury the base. */}
        <g transform={`translate(0, ${neckSink})`}>
          <Bone 
              rotation={pose.neck} 
              length={ANATOMY.NECK} 
              width={ANATOMY.NECK_BASE} 
              variant="column"
              showOverlay={showOverlay}
              decorations={[]}
          >
               {/* Head: Attached at end of Neck */}
               <g transform={`translate(0, ${0})`}> 
                  {/* Head Shape (Circle) - Render First so lines sit on top */}
                  <circle cx="0" cy={ANATOMY.HEAD/2} r={ANATOMY.HEAD / 2} fill="currentColor" />
                  
                  {showOverlay && (
                    <>
                        {/* Head Gesture Line (Spine extension) - Connects Neck Base to Head Center */}
                        <line x1={0} y1={-ANATOMY.NECK} x2={0} y2={ANATOMY.HEAD/2} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                        
                        {/* Cranial Node (Center of Head) */}
                        <circle cx="0" cy={ANATOMY.HEAD/2} r={3} fill="#a855f7" />
                        
                        {/* REMOVED: Intermediate Joint at Head/Neck connection to unify them */}
                    </>
                  )}
               </g>
          </Bone>
        </g>

        {/* Arms: Attached at the corners of the Torso Wedge (Shoulders) */}
        {/* Adjusted using Inset logic to create "Socket" look */}
        
        {/* Right Arm Chain */}
        <g transform={`translate(${rShoulderX}, ${shoulderY})`}> 
          <Bone 
            rotation={90 + pose.rShoulder} 
            corrective={pose.rBicepCorrective}
            length={ANATOMY.UPPER_ARM} 
            width={ANATOMY.LIMB_WIDTH_ARM} 
            variant="taper" 
            showOverlay={showOverlay}
            decorations={[
              // Shoulder Joint Cap: Matches arm width for seamless teardrop shape
              { position: 0, shape: 'circle', type: 'filled', size: shoulderSize },
            ]}
          >
            <Bone 
                rotation={pose.rForearm} 
                length={ANATOMY.LOWER_ARM} 
                width={ANATOMY.LIMB_WIDTH_FOREARM}
                variant="diamond"
                showOverlay={showOverlay}
            >
              <Bone 
                rotation={pose.rWrist} 
                length={ANATOMY.HAND} 
                width={ANATOMY.EFFECTOR_WIDTH} 
                variant="arrowhead" 
                showOverlay={showOverlay}
               />
            </Bone>
          </Bone>
        </g>

        {/* Left Arm Chain */}
        <g transform={`translate(${lShoulderX}, ${shoulderY})`}>
          <Bone 
            rotation={-(90 + pose.lShoulder)} 
            corrective={pose.lBicepCorrective}
            length={ANATOMY.UPPER_ARM} 
            width={ANATOMY.LIMB_WIDTH_ARM}
            variant="taper"
            showOverlay={showOverlay}
            decorations={[
              // Shoulder Joint Cap: Matches arm width for seamless teardrop shape
              { position: 0, shape: 'circle', type: 'filled', size: shoulderSize },
            ]}
          >
             <Bone 
                rotation={pose.lForearm} 
                length={ANATOMY.LOWER_ARM} 
                width={ANATOMY.LIMB_WIDTH_FOREARM}
                variant="diamond"
                showOverlay={showOverlay}
            >
                <Bone 
                    rotation={pose.lWrist} 
                    length={ANATOMY.HAND} 
                    width={ANATOMY.EFFECTOR_WIDTH} 
                    variant="arrowhead" 
                    showOverlay={showOverlay}
                />
             </Bone>
          </Bone>
        </g>

      </Bone>

      {/* --- LOWER BODY (Pelvis Branch) --- */}
      {/* Pelvis: Grows DOWN (0deg) from Navel */}
      <Bone 
        rotation={0} 
        length={ANATOMY.PELVIS} 
        width={ANATOMY.HIP_WIDTH * 0.65} // Tightened width to 65% so corners align just outside leg anchors
        variant="pelvis"
        rounded={true}
        showOverlay={showOverlay}
        decorations={[]}
      >
        
        {/* GESTURE LINES: Pelvis Triangle (Navel to Hips) */}
        {showOverlay && (
            <>
                <line x1={0} y1={navelY_Pelvis} x2={rHipX} y2={hipY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                <line x1={0} y1={navelY_Pelvis} x2={lHipX} y2={hipY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
            </>
        )}

        {/* Legs: Attached at Hip Joints (Inset from corners for mechanical accuracy) */}
        
        {/* Right Leg */}
        <g transform={`translate(${rHipX}, ${hipY})`}>
          <Bone 
            rotation={pose.rThigh} 
            corrective={pose.rThighCorrective}
            length={ANATOMY.LEG_UPPER} 
            width={ANATOMY.LIMB_WIDTH_THIGH}
            variant="diamond"
            showOverlay={showOverlay}
          >
               <Bone 
                rotation={pose.rCalf} 
                length={ANATOMY.LEG_LOWER} 
                width={ANATOMY.LIMB_WIDTH_CALF}
                variant="diamond"
                showOverlay={showOverlay}
               >
                    {/* FOOT: Split into Heel/Arch and Toes */}
                    <Bone 
                        rotation={-90 + pose.rAnkle} 
                        length={ANATOMY.FOOT} 
                        width={ANATOMY.EFFECTOR_WIDTH * 1.2} // Slightly wider heel
                        variant="diamond" 
                        showOverlay={showOverlay}
                    >
                         {/* TOES: Attached to end of Foot */}
                         <Bone
                            rotation={pose.rToes}
                            length={ANATOMY.TOES}
                            width={ANATOMY.EFFECTOR_WIDTH}
                            variant="arrowhead"
                            showOverlay={showOverlay}
                         />
                    </Bone>
               </Bone>
          </Bone>
        </g>

         {/* Left Leg */}
         <g transform={`translate(${lHipX}, ${hipY})`}>
          <Bone 
            rotation={pose.lThigh} 
            corrective={pose.lThighCorrective}
            length={ANATOMY.LEG_UPPER} 
            width={ANATOMY.LIMB_WIDTH_THIGH}
            variant="diamond"
            showOverlay={showOverlay}
          >
               <Bone 
                rotation={pose.lCalf} 
                length={ANATOMY.LEG_LOWER} 
                width={ANATOMY.LIMB_WIDTH_CALF}
                variant="diamond"
                showOverlay={showOverlay}
               >
                    {/* FOOT: Split into Heel/Arch and Toes */}
                    <Bone 
                        rotation={90 + pose.lAnkle} 
                        length={ANATOMY.FOOT} 
                        width={ANATOMY.EFFECTOR_WIDTH * 1.2} 
                        variant="diamond" 
                        showOverlay={showOverlay}
                    >
                        {/* TOES */}
                        <Bone
                            rotation={pose.lToes}
                            length={ANATOMY.TOES}
                            width={ANATOMY.EFFECTOR_WIDTH}
                            variant="arrowhead"
                            showOverlay={showOverlay}
                         />
                    </Bone>
               </Bone>
          </Bone>
        </g>

      </Bone>

    </g>
  );
};