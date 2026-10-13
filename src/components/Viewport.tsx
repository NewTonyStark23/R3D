import { forwardRef, useState } from 'react';
import type { SystemState } from '../App';

interface ViewportProps {
  state: SystemState;
}

export const Viewport = forwardRef<HTMLDivElement, ViewportProps>(({ state }, ref) => {
  const [showInfo, setShowInfo] = useState(true);

  return (
    <div className="flex-1 relative bg-[#080810]">
      {/* Three.js canvas container */}
      <div ref={ref} className="w-full h-full" />

      {/* Viewport toolbar */}
      {state.meshReady && (
        <div className="absolute top-4 right-4 flex gap-1">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="w-7 h-7 bg-black/60 backdrop-blur-sm rounded border border-[#1a1a2e] flex items-center justify-center text-gray-400 hover:text-white hover:border-cyan-700 transition-colors"
            title="Toggle Info"
          >
            <i className="fas fa-info text-[10px]"></i>
          </button>
        </div>
      )}

      {/* Character info overlay */}
      {state.meshReady && showInfo && (
        <div className="absolute bottom-12 left-4 bg-black/60 backdrop-blur-sm rounded-lg p-2 border border-[#1a1a2e]">
          <div className="space-y-0.5">
            <p className="text-[9px] text-gray-500"><span className="text-cyan-400">Bones:</span> 28 humanoid joints</p>
            <p className="text-[9px] text-gray-500"><span className="text-cyan-400">Mesh:</span> Depth-displaced surface</p>
            <p className="text-[9px] text-gray-500"><span className="text-cyan-400">Mode:</span> Procedural AI movement</p>
            <p className="text-[9px] text-gray-500"><span className="text-cyan-400">Render:</span> WebGL GPU-accelerated</p>
          </div>
        </div>
      )}

      {/* Overlay info */}
      {state.stage === 'idle' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-6xl mb-4 opacity-20">🎭</div>
            <p className="text-gray-500 text-sm">Upload an image to generate a 3D character</p>
            <p className="text-gray-600 text-xs mt-2">Supports: PNG, JPG, WEBP</p>
          </div>
        </div>
      )}

      {/* Processing overlay */}
      {state.stage !== 'idle' && state.stage !== 'ready' && (
        <div className="absolute top-4 left-4 right-4">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 border border-cyan-900/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
              <span className="text-xs text-cyan-400 font-mono uppercase tracking-wider">
                {state.stage === 'loading-model' && 'Loading AI Model...'}
                {state.stage === 'estimating-depth' && 'Estimating Depth...'}
                {state.stage === 'generating-mesh' && 'Generating 3D Mesh...'}
                {state.stage === 'rigging' && 'Attaching Skeleton...'}
              </span>
            </div>
            <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 mt-1">{Math.round(state.progress)}%</span>
          </div>
        </div>
      )}

      {/* Ready indicator */}
      {state.stage === 'ready' && (
        <div className="absolute top-4 left-4">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-green-900/30">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              <span className="text-xs text-green-400 font-mono">CHARACTER READY</span>
            </div>
          </div>
        </div>
      )}

      {/* Viewport controls hint */}
      <div className="absolute bottom-4 right-4 text-[10px] text-gray-600">
        <div>LMB: Rotate | RMB: Pan | Scroll: Zoom</div>
      </div>
    </div>
  );
});

Viewport.displayName = 'Viewport';
