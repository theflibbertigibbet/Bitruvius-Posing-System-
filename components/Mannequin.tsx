import React from 'react';
import { Bone } from './Bone';
import { Pose } from '../types';
import { ANATOMY, HEAD_UNIT, RIGGING } from '../constants';

interface MannequinProps {
  pose: Pose;
  showOverlay?: boolean;
}

export const Mannequin: React.FC<MannequinProps> = ({ pose, showOverlay = true }) => {
  // Use shared Rigging constants to ensure IK solver matches visual output
  const shoulderInset = RIGGING.SHOULDER_INSET; 
  const shoulderLift = RIGGING.SHOULDER_LIFT;
  const clavicleExtension = RIGGING.CLAVICLE_EXTENSION;
  const neckSink = RIGGING.NECK_SINK;

  // Match the shoulder circle size to the arm width for a seamless "teardrop" transition
  const shoulderSize = ANATOMY.LIMB_WIDTH_ARM; 
  
  // Calculations for Gesture Lines (The Diamond)
  const navelY_Torso = -ANATOMY.TORSO;
  
  // Apply clavicle extension to the anchors
  const rShoulderX = -(ANATOMY.SHOULDER_WIDTH/2 - shoulderInset + clavicleExtension);
  const lShoulderX = (ANATOMY.SHOULDER_WIDTH/2 - shoulderInset + clavicleExtension);
  const shoulderY = shoulderLift;
  
  // Relative to Pelvis End (Hips)
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
      <Bone 
        rotation={pose.torso} 
        length={ANATOMY.TORSO} 
        width={ANATOMY.SHOULDER_WIDTH} 
        variant="wedge"
        rounded={true}
        cutout={12} 
        showOverlay={showOverlay}
        decorations={[
          { position: 0.65, shape: 'square', type: 'filled', size: 8 },
          { position: 0.85, shape: 'circle', type: 'filled', size: 10 }
        ]}
      >
        
        {showOverlay && (
            <>
                {/* 1. Navel to Shoulder (Pectoral/Abdominal Line) */}
                <line x1={0} y1={navelY_Torso} x2={rShoulderX} y2={shoulderY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                <line x1={0} y1={navelY_Torso} x2={lShoulderX} y2={shoulderY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />

                {/* 2. Shoulder to Neck Base (Trapezius Line) */}
                <line x1={rShoulderX} y1={shoulderY} x2={0} y2={neckSink} stroke="#a855f7" strokeWidth={1.5} opacity={0.75} strokeLinecap="round" />
                <line x1={lShoulderX} y1={shoulderY} x2={0} y2={neckSink} stroke="#a855f7" strokeWidth={1.5} opacity={0.75} strokeLinecap="round" />
            </>
        )}

        {/* Neck + Head: Merged Unit */}
        <g transform={`translate(0, ${neckSink})`}>
          <Bone 
              rotation={pose.neck} 
              length={ANATOMY.NECK} 
              width={ANATOMY.NECK_BASE} 
              variant="column"
              showOverlay={showOverlay}
              decorations={[]}
          >
               <g transform={`translate(0, ${0})`}> 
                  <circle cx="0" cy={ANATOMY.HEAD/2} r={ANATOMY.HEAD / 2} fill="currentColor" />
                  
                  {showOverlay && (
                    <>
                        <line x1={0} y1={-ANATOMY.NECK} x2={0} y2={ANATOMY.HEAD/2} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                        <circle cx="0" cy={ANATOMY.HEAD/2} r={3} fill="#a855f7" />
                    </>
                  )}
               </g>
          </Bone>
        </g>

        {/* Arms */}
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
      <Bone 
        rotation={pose.hips} 
        length={ANATOMY.PELVIS} 
        width={ANATOMY.HIP_WIDTH * 0.65} 
        variant="pelvis"
        rounded={true}
        showOverlay={showOverlay}
        decorations={[]}
      >
        
        {showOverlay && (
            <>
                <line x1={0} y1={navelY_Pelvis} x2={rHipX} y2={hipY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                <line x1={0} y1={navelY_Pelvis} x2={lHipX} y2={hipY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
            </>
        )}

        {/* Legs */}
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
                    <Bone 
                        rotation={-90 + pose.rAnkle} 
                        length={ANATOMY.FOOT} 
                        width={ANATOMY.EFFECTOR_WIDTH * 1.2} 
                        variant="diamond" 
                        showOverlay={showOverlay}
                    >
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
                    <Bone 
                        rotation={90 + pose.lAnkle} 
                        length={ANATOMY.FOOT} 
                        width={ANATOMY.EFFECTOR_WIDTH * 1.2} 
                        variant="diamond" 
                        showOverlay={showOverlay}
                    >
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