import { useRef, useState, useCallback } from 'react';
import type { SystemState } from '../App';

interface ControlPanelProps {
  state: SystemState;
  onImageUpload: (file: File) => void;
  onToggleAI: () => void;
  onSetAIMode: (mode: string) => void;
  onTogglePhysics?: () => void;
  onToggleCloth?: () => void;
  onSetWind?: (strength: number) => void;
  logs: string[];
}

const AI_MODES = [
  { id: 'idle', label: 'Idle', icon: '🧍' },
  { id: 'walk', label: 'Walk', icon: '🚶' },
  { id: 'wave', label: 'Wave', icon: '👋' },
  { id: 'dance', label: 'Dance', icon: '💃' },
  { id: 'look_around', label: 'Look', icon: '👀' },
  { id: 'breathe', label: 'Breathe', icon: '🌬️' },
  { id: 'jump', label: 'Jump', icon: '🦘' },
  { id: 'fight', label: 'Fight', icon: '🥊' },
];

export function ControlPanel({ state, onImageUpload, onToggleAI, onSetAIMode, onTogglePhysics, onToggleCloth, onSetWind, logs }: ControlPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeMode, setActiveMode] = useState('idle');
  const [showLogs, setShowLogs] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onImageUpload(file);
    }
  }, [onImageUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleModeChange = (mode: string) => {
    setActiveMode(mode);
    onSetAIMode(mode);
  };

  return (
    <div className="w-72 bg-[#0d0d15] border-r border-[#1a1a2e] flex flex-col overflow-hidden">
      {/* Image Upload Section */}
      <div className="p-3 border-b border-[#1a1a2e]">
        <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
          <i className="fas fa-image mr-1"></i> Source Image
        </h3>

        {state.originalImage ? (
          <div
            className="relative group"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <img
              src={state.originalImage}
              alt="Source"
              className="w-full h-32 object-cover rounded-lg border border-[#1a1a2e]"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
            >
              <span className="text-xs text-white">Change Image</span>
            </button>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all ${
              isDragging
                ? 'border-cyan-400 bg-cyan-900/20'
                : 'border-[#2a2a4e] hover:border-cyan-500/50'
            }`}
          >
            <i className={`fas fa-cloud-upload-alt text-2xl mb-2 ${isDragging ? 'text-cyan-400' : 'text-gray-600'}`}></i>
            <span className="text-xs text-gray-500">Drop image or click</span>
            <span className="text-[10px] text-gray-600 mt-1">PNG, JPG, WEBP</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* AI Controller Section */}
      <div className="p-3 border-b border-[#1a1a2e]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] uppercase tracking-wider text-gray-500">
            <i className="fas fa-robot mr-1"></i> AI Controller
          </h3>
          {state.skeletonReady && (
            <button
              onClick={onToggleAI}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                state.aiActive
                  ? 'bg-green-900/50 text-green-400 border border-green-700/50'
                  : 'bg-gray-800 text-gray-400 border border-gray-700/50'
              }`}
            >
              {state.aiActive ? '● ACTIVE' : '○ INACTIVE'}
            </button>
          )}
        </div>

        {state.skeletonReady ? (
          <div className="grid grid-cols-4 gap-1">
            {AI_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleModeChange(mode.id)}
                disabled={!state.aiActive}
                className={`px-2 py-1.5 rounded text-[10px] transition-all ${
                  activeMode === mode.id
                    ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50'
                    : 'bg-[#111120] text-gray-500 border border-[#1a1a2e] hover:border-gray-600'
                } ${!state.aiActive ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <span className="block text-sm">{mode.icon}</span>
                <span className="block mt-0.5">{mode.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-gray-600 italic">
            Upload an image first to enable AI controls
          </p>
        )}
      </div>

      {/* Physics Section */}
      {state.skeletonReady && (
        <div className="p-3 border-b border-[#1a1a2e]">
          <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
            <i className="fas fa-atom mr-1"></i> Physics
          </h3>
          <div className="space-y-2">
            <div className="flex gap-1">
              <button
                onClick={onTogglePhysics}
                className={`flex-1 px-2 py-1.5 rounded text-[10px] transition-all ${
                  state.physicsActive
                    ? 'bg-orange-900/50 text-orange-300 border border-orange-700/50'
                    : 'bg-[#111120] text-gray-500 border border-[#1a1a2e] hover:border-gray-600'
                }`}
              >
                <i className="fas fa-person-falling mr-1"></i> Ragdoll
              </button>
              <button
                onClick={onToggleCloth}
                className={`flex-1 px-2 py-1.5 rounded text-[10px] transition-all ${
                  state.clothActive
                    ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50'
                    : 'bg-[#111120] text-gray-500 border border-[#1a1a2e] hover:border-gray-600'
                }`}
              >
                <i className="fas fa-wind mr-1"></i> Cloth
              </button>
            </div>
            {state.clothActive && (
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">Wind: {state.windStrength.toFixed(1)}</label>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={state.windStrength}
                  onChange={(e) => onSetWind?.(parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pipeline Status */}
      <div className="p-3 border-b border-[#1a1a2e]">
        <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
          <i className="fas fa-sitemap mr-1"></i> Pipeline
        </h3>
        <div className="space-y-1.5">
          <PipelineStep
            label="Depth Estimation"
            status={state.stage === 'idle' ? 'pending' : state.progress >= 60 ? 'done' : state.progress >= 10 ? 'active' : 'pending'}
          />
          <PipelineStep
            label="3D Mesh Generation"
            status={state.stage === 'idle' ? 'pending' : state.progress >= 75 ? 'done' : state.progress >= 60 ? 'active' : 'pending'}
          />
          <PipelineStep
            label="Skeletal Rigging"
            status={state.stage === 'idle' ? 'pending' : state.progress >= 100 ? 'done' : state.progress >= 75 ? 'active' : 'pending'}
          />
          <PipelineStep
            label="AI Movement"
            status={state.aiActive ? 'active' : state.skeletonReady ? 'done' : 'pending'}
          />
          <PipelineStep
            label="Physics Sim"
            status={state.physicsActive || state.clothActive ? 'active' : state.skeletonReady ? 'done' : 'pending'}
          />
        </div>
      </div>

      {/* System Logs */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="p-3 pb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-400"
        >
          <span><i className="fas fa-terminal mr-1"></i> System Logs</span>
          <i className={`fas fa-chevron-${showLogs ? 'up' : 'down'} text-[8px]`}></i>
        </button>
        {showLogs && (
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="space-y-0.5">
              {logs.map((log, i) => (
                <p key={i} className="text-[9px] text-gray-600 font-mono leading-tight break-all">
                  {log}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineStep({ label, status }: { label: string; status: 'pending' | 'active' | 'done' }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${
        status === 'done' ? 'bg-green-400' :
        status === 'active' ? 'bg-cyan-400 animate-pulse' :
        'bg-gray-700'
      }`} />
      <span className={`text-[10px] ${
        status === 'done' ? 'text-green-400' :
        status === 'active' ? 'text-cyan-400' :
        'text-gray-600'
      }`}>{label}</span>
      {status === 'done' && <i className="fas fa-check text-[8px] text-green-500 ml-auto"></i>}
    </div>
  );
}
