import { Canvas } from "@react-three/fiber";
import type { BodyMeasurementsCm } from "../measure/sizeChart";

interface AvatarViewerProps {
  measurements: BodyMeasurementsCm;
}

const GENERIC_CIRCUMFERENCE_CM = { chest: 96, waist: 82, hips: 100 };

/**
 * Simple parametric mannequin: three stacked capsules whose radii scale with
 * the user's chest/waist/hips relative to a generic reference body. Not a
 * photoreal avatar — a proportion preview, per architecture doc §5
 * ("Rendering 3D: Three.js + @react-three/fiber per avatar").
 */
export function AvatarViewer({ measurements }: AvatarViewerProps) {
  const chestScale = measurements.chest / GENERIC_CIRCUMFERENCE_CM.chest;
  const waistScale = measurements.waist / GENERIC_CIRCUMFERENCE_CM.waist;
  const hipsScale = measurements.hips / GENERIC_CIRCUMFERENCE_CM.hips;

  return (
    <div className="avatar-viewer">
      <Canvas camera={{ position: [0, 0, 4], fov: 40 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 4]} intensity={0.8} />

        {/* head */}
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.28, 24, 24]} />
          <meshStandardMaterial color="#d9b99b" />
        </mesh>

        {/* chest */}
        <mesh position={[0, 0.95, 0]} scale={[chestScale, 1, chestScale]}>
          <capsuleGeometry args={[0.42, 0.5, 8, 16]} />
          <meshStandardMaterial color="#4f7cff" />
        </mesh>

        {/* waist */}
        <mesh position={[0, 0.35, 0]} scale={[waistScale, 1, waistScale]}>
          <capsuleGeometry args={[0.34, 0.3, 8, 16]} />
          <meshStandardMaterial color="#3a5fd9" />
        </mesh>

        {/* hips */}
        <mesh position={[0, -0.15, 0]} scale={[hipsScale, 1, hipsScale]}>
          <capsuleGeometry args={[0.4, 0.28, 8, 16]} />
          <meshStandardMaterial color="#2c3e91" />
        </mesh>

        {/* legs */}
        <mesh position={[-0.18, -1.05, 0]}>
          <capsuleGeometry args={[0.14, 1.1, 8, 16]} />
          <meshStandardMaterial color="#1f2b5c" />
        </mesh>
        <mesh position={[0.18, -1.05, 0]}>
          <capsuleGeometry args={[0.14, 1.1, 8, 16]} />
          <meshStandardMaterial color="#1f2b5c" />
        </mesh>
      </Canvas>
    </div>
  );
}
