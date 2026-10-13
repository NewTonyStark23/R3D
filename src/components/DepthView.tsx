import { useRef, useEffect, useState } from 'react';

interface DepthViewProps {
  depthMap: ImageData;
}

export function DepthView({ depthMap }: DepthViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [colorized, setColorized] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = depthMap.width;
    canvas.height = depthMap.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (colorized) {
      // Colorized depth (blue = far, red = near)
      const colorData = new ImageData(depthMap.width, depthMap.height);
      for (let i = 0; i < depthMap.width * depthMap.height; i++) {
        const depth = depthMap.data[i * 4] / 255;
        const [r, g, b] = depthToColor(depth);
        colorData.data[i * 4] = r;
        colorData.data[i * 4 + 1] = g;
        colorData.data[i * 4 + 2] = b;
        colorData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(colorData, 0, 0);
    } else {
      ctx.putImageData(depthMap, 0, 0);
    }
  }, [depthMap, colorized]);

  return (
    <div className="h-28 bg-[#080810] border-t border-[#1a1a2e] flex">
      {/* Depth map visualization */}
      <div className="flex-1 p-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] uppercase tracking-wider text-gray-500">
            <i className="fas fa-layer-group mr-1"></i> Depth Map
          </span>
          <span className="text-[8px] text-gray-600">
            {depthMap.width}×{depthMap.height}
          </span>
          <button
            onClick={() => setColorized(!colorized)}
            className={`ml-auto px-1.5 py-0.5 rounded text-[8px] transition-colors ${
              colorized
                ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50'
                : 'bg-[#111120] text-gray-500 border border-[#1a1a2e]'
            }`}
          >
            {colorized ? '🌈 Color' : '◼ Gray'}
          </button>
        </div>
        <div className="h-[calc(100%-20px)] bg-black rounded overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      </div>

      {/* Depth stats */}
      <div className="w-32 p-2 border-l border-[#1a1a2e]">
        <span className="text-[9px] uppercase tracking-wider text-gray-500 block mb-1">
          <i className="fas fa-chart-bar mr-1"></i> Stats
        </span>
        <div className="space-y-1">
          <DepthStat label="Width" value={`${depthMap.width}px`} />
          <DepthStat label="Height" value={`${depthMap.height}px`} />
          <DepthStat label="Pixels" value={`${(depthMap.width * depthMap.height / 1000).toFixed(0)}K`} />
          <DepthStat label="Format" value="Float32" />
        </div>
      </div>
    </div>
  );
}

function DepthStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[9px] text-gray-600">{label}</span>
      <span className="text-[9px] text-cyan-400 font-mono">{value}</span>
    </div>
  );
}

// Convert depth value (0-1) to color (blue=far, cyan=mid, red=near)
function depthToColor(depth: number): [number, number, number] {
  // Turbo-like colormap
  const t = depth;
  let r: number, g: number, b: number;

  if (t < 0.25) {
    r = 0;
    g = t * 4 * 255;
    b = 255;
  } else if (t < 0.5) {
    r = 0;
    g = 255;
    b = (1 - (t - 0.25) * 4) * 255;
  } else if (t < 0.75) {
    r = (t - 0.5) * 4 * 255;
    g = 255;
    b = 0;
  } else {
    r = 255;
    g = (1 - (t - 0.75) * 4) * 255;
    b = 0;
  }

  return [Math.round(r), Math.round(g), Math.round(b)];
}
