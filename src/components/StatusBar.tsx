import type { SystemState } from '../App';

interface StatusBarProps {
  state: SystemState;
}

export function StatusBar({ state }: StatusBarProps) {
  return (
    <div className="h-6 bg-[#0a0a12] border-t border-[#1a1a2e] flex items-center px-3 justify-between">
      <div className="flex items-center gap-4">
        <span className="text-[9px] text-gray-600 font-mono">
          <span className="text-cyan-600">LOCALFORGE 3D</span> v2.0
        </span>
        <span className="text-[9px] text-gray-600">
          AnimationMixer + Verlet Physics + DepthAnything-V2 + Custom MeshGen
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[9px] text-gray-600">
          {state.meshReady && <span className="text-green-600 mr-2">● Mesh</span>}
          {state.skeletonReady && <span className="text-green-600 mr-2">● Skeleton</span>}
          {state.aiActive && <span className="text-cyan-600 mr-2">● AI</span>}
          {state.physicsActive && <span className="text-orange-600 mr-2">● Physics</span>}
          {state.clothActive && <span className="text-purple-600">● Cloth</span>}
        </span>
        <span className="text-[9px] text-gray-600">
          100% Local • Free • GPU-Accelerated • No API Keys
        </span>
      </div>
    </div>
  );
}
