import type { SystemState } from '../App';

interface StatusBarProps {
  state: SystemState;
}

export function StatusBar({ state }: StatusBarProps) {
  return (
    <div className="h-6 bg-[#0a0a12] border-t border-[#1a1a2e] flex items-center px-3 justify-between">
      <div className="flex items-center gap-4">
        <span className="text-[9px] text-gray-600 font-mono">
          <span className="text-cyan-600">LOCALFORGE</span> v1.0
        </span>
        <span className="text-[9px] text-gray-600">
          Engine: DepthAnything-V2-Small + Custom MeshGen + Three.js Skeleton
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[9px] text-gray-600">
          {state.meshReady && <span className="text-green-600 mr-2">● Mesh</span>}
          {state.skeletonReady && <span className="text-green-600 mr-2">● Skeleton</span>}
          {state.aiActive && <span className="text-cyan-600">● AI</span>}
        </span>
        <span className="text-[9px] text-gray-600">
          100% Local • Free • No API Keys
        </span>
      </div>
    </div>
  );
}
