import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { SceneManager } from './engine/SceneManager';
import { DepthEngine } from './engine/DepthEngine';
import { MeshGenerator } from './engine/MeshGenerator';
import { SkeletonSystem } from './engine/SkeletonSystem';
import { AIController } from './engine/AIController';
import { ResourceManager } from './engine/ResourceManager';
import { ClothPhysics, RagdollPhysics } from './engine/PhysicsEngine';

export type ProcessingStage = 'idle' | 'loading-model' | 'estimating-depth' | 'generating-mesh' | 'rigging' | 'ready';

export interface SystemState {
  stage: ProcessingStage;
  progress: number;
  gpuUsage: number;
  memUsage: number;
  fps: number;
  depthMap: ImageData | null;
  meshReady: boolean;
  skeletonReady: boolean;
  aiActive: boolean;
  originalImage: string | null;
  physicsActive: boolean;
  clothActive: boolean;
  windStrength: number;
  showWireframe: boolean;
  showSkeleton: boolean;
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

function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneManager | null>(null);
  const depthEngineRef = useRef<DepthEngine | null>(null);
  const meshGenRef = useRef<MeshGenerator | null>(null);
  const skeletonRef = useRef<SkeletonSystem | null>(null);
  const aiControllerRef = useRef<AIController | null>(null);
  const resourceMgrRef = useRef<ResourceManager | null>(null);
  const clothRef = useRef<ClothPhysics | null>(null);
  const ragdollRef = useRef<RagdollPhysics | null>(null);

  const [state, setState] = useState<SystemState>({
    stage: 'idle',
    progress: 0,
    gpuUsage: 0,
    memUsage: 0,
    fps: 0,
    depthMap: null,
    meshReady: false,
    skeletonReady: false,
    aiActive: false,
    originalImage: null,
    physicsActive: false,
    clothActive: false,
    windStrength: 0.5,
    showWireframe: false,
    showSkeleton: false,
  });

  const [logs, setLogs] = useState<string[]>(['[INIT] LocalForge 3D v2.0 starting...']);
  const [activeMode, setActiveMode] = useState('idle');

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-80), `[${ts}] ${msg}`]);
  }, []);

  // Initialize all engines
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const resourceMgr = new ResourceManager({ maxGpuMB: 2048, maxMemMB: 4096, targetFPS: 30 });
    resourceMgrRef.current = resourceMgr;

    const scene = new SceneManager(container, resourceMgr);
    sceneRef.current = scene;

    const depthEngine = new DepthEngine(resourceMgr);
    depthEngineRef.current = depthEngine;

    const meshGen = new MeshGenerator(resourceMgr);
    meshGenRef.current = meshGen;

    const skeleton = new SkeletonSystem();
    skeletonRef.current = skeleton;

    const aiCtrl = new AIController(skeleton, scene);
    aiControllerRef.current = aiCtrl;

    const ragdoll = new RagdollPhysics();
    ragdollRef.current = ragdoll;

    addLog('✓ All engines initialized');
    addLog('✓ DepthAnything-V2-Small (ONNX/WebGPU)');
    addLog('✓ AnimationMixer + 8 procedural clips');
    addLog('✓ Verlet cloth physics + Ragdoll ready');
    addLog('✓ 28-bone humanoid skeleton system');

    // Main loop: stats + physics
    const interval = setInterval(() => {
      const stats = resourceMgr.getStats();
      setState(prev => ({ ...prev, gpuUsage: stats.gpuUsage, memUsage: stats.memUsage, fps: stats.fps }));

      if (clothRef.current) clothRef.current.simulate(0.016);
      if (ragdollRef.current?.isActive()) ragdollRef.current.update(0.016);
    }, 16);

    return () => {
      clearInterval(interval);
      scene.dispose();
      resourceMgr.dispose();
    };
  }, [addLog]);

  // Process image into 3D character
  const processImage = useCallback(async (file: File) => {
    if (!sceneRef.current || !depthEngineRef.current || !meshGenRef.current || !skeletonRef.current) {
      addLog('✗ Engines not ready');
      return;
    }

    const url = URL.createObjectURL(file);
    setState(prev => ({ ...prev, originalImage: url, stage: 'loading-model', progress: 0, meshReady: false, skeletonReady: false, aiActive: false }));
    addLog(`→ Processing: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);

    try {
      // Stage 1: Load depth model
      addLog('→ Loading Depth Anything V2 (ONNX)...');
      await depthEngineRef.current.loadModel((p: number) => {
        setState(prev => ({ ...prev, progress: 5 + p * 30 }));
      });
      addLog('✓ Depth model ready');

      // Stage 2: Estimate depth
      setState(prev => ({ ...prev, stage: 'estimating-depth' }));
      addLog('→ Estimating depth map...');
      const depthData = await depthEngineRef.current.estimateDepth(file, (p: number) => {
        setState(prev => ({ ...prev, progress: 35 + p * 25 }));
      });
      setState(prev => ({ ...prev, depthMap: depthData }));
      addLog(`✓ Depth map: ${depthData.width}×${depthData.height}`);

      // Stage 3: Generate mesh
      setState(prev => ({ ...prev, stage: 'generating-mesh' }));
      addLog('→ Building 3D mesh from depth...');
      const meshData = await meshGenRef.current.generateFromDepth(depthData, file, (p: number) => {
        setState(prev => ({ ...prev, progress: 60 + p * 15 }));
      });
      sceneRef.current.setCharacterMesh(meshData);
      setState(prev => ({ ...prev, meshReady: true }));
      addLog('✓ 3D character mesh created');

      // Stage 4: Rig skeleton
      setState(prev => ({ ...prev, stage: 'rigging' }));
      addLog('→ Attaching 28-bone humanoid rig...');
      const skeletonData = skeletonRef.current.createHumanoidRig(meshData);
      sceneRef.current.attachSkeleton(skeletonData);
      aiControllerRef.current?.setSkeleton(skeletonData);
      ragdollRef.current?.initFromSkeleton(skeletonData);
      setState(prev => ({ ...prev, skeletonReady: true, stage: 'ready', progress: 100 }));
      addLog('✓ Character rigged and ready!');
      addLog('→ Click "Activate AI" to animate');

    } catch (err) {
      addLog(`✗ ERROR: ${(err as Error).message}`);
      setState(prev => ({ ...prev, stage: 'idle', progress: 0 }));
    }
  }, [addLog]);

  // Generate a demo character (test pattern) without needing an image
  const generateDemo = useCallback(async () => {
    if (!sceneRef.current || !meshGenRef.current || !skeletonRef.current) return;

    setState(prev => ({ ...prev, stage: 'generating-mesh', progress: 0, meshReady: false, skeletonReady: false }));
    addLog('→ Generating demo character (procedural)...');

    try {
      // Create a synthetic depth map (humanoid silhouette)
      const w = 128, h = 192;
      const depthData = new ImageData(w, h);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const cx = (x / w - 0.5) * 2;
          const cy = (y / h - 0.5) * 2;

          // Head (circle at top)
          const headDist = Math.sqrt(cx * cx * 4 + (cy + 0.7) * (cy + 0.7) * 8);
          const head = headDist < 0.35 ? Math.max(0, 1 - headDist / 0.35) : 0;

          // Torso (ellipse in middle)
          const torsoDist = Math.sqrt(cx * cx * 2 + (cy + 0.1) * (cy + 0.1) * 3);
          const torso = torsoDist < 0.5 ? Math.max(0, 1 - torsoDist / 0.5) : 0;

          // Arms
          const lArmDist = Math.sqrt((cx + 0.6) * (cx + 0.6) * 8 + (cy + 0.1) * (cy + 0.1) * 2);
          const lArm = lArmDist < 0.4 ? Math.max(0, 1 - lArmDist / 0.4) * 0.7 : 0;
          const rArmDist = Math.sqrt((cx - 0.6) * (cx - 0.6) * 8 + (cy + 0.1) * (cy + 0.1) * 2);
          const rArm = rArmDist < 0.4 ? Math.max(0, 1 - rArmDist / 0.4) * 0.7 : 0;

          // Legs
          const lLegDist = Math.sqrt((cx + 0.2) * (cx + 0.2) * 8 + (cy - 0.55) * (cy - 0.55) * 2);
          const lLeg = lLegDist < 0.4 ? Math.max(0, 1 - lLegDist / 0.4) * 0.8 : 0;
          const rLegDist = Math.sqrt((cx - 0.2) * (cx - 0.2) * 8 + (cy - 0.55) * (cy - 0.55) * 2);
          const rLeg = rLegDist < 0.4 ? Math.max(0, 1 - rLegDist / 0.4) * 0.8 : 0;

          const depth = Math.max(head, torso, lArm, rArm, lLeg, rLeg);
          const val = Math.round(depth * 255);
          const idx = (y * w + x) * 4;
          depthData.data[idx] = val;
          depthData.data[idx + 1] = val;
          depthData.data[idx + 2] = val;
          depthData.data[idx + 3] = 255;
        }
      }

      setState(prev => ({ ...prev, depthMap: depthData, progress: 40 }));
      addLog('✓ Synthetic depth map generated (128×192)');

      // Create a synthetic texture (gradient body)
      const texCanvas = document.createElement('canvas');
      texCanvas.width = w;
      texCanvas.height = h;
      const texCtx = texCanvas.getContext('2d')!;

      // Draw a colorful humanoid
      const grad = texCtx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#ff6b6b');   // head
      grad.addColorStop(0.2, '#4ecdc4'); // torso
      grad.addColorStop(0.5, '#45b7d1'); // waist
      grad.addColorStop(0.7, '#96ceb4'); // legs
      grad.addColorStop(1, '#2d3436');   // feet
      texCtx.fillStyle = grad;
      texCtx.fillRect(0, 0, w, h);

      // Add some detail
      texCtx.fillStyle = '#ffe66d';
      texCtx.beginPath();
      texCtx.arc(w / 2, h * 0.15, w * 0.12, 0, Math.PI * 2);
      texCtx.fill();

      // Eyes
      texCtx.fillStyle = '#2d3436';
      texCtx.beginPath();
      texCtx.arc(w * 0.42, h * 0.13, 4, 0, Math.PI * 2);
      texCtx.arc(w * 0.58, h * 0.13, 4, 0, Math.PI * 2);
      texCtx.fill();

      const texBlob = await new Promise<Blob>((resolve) => {
        texCanvas.toBlob((b) => resolve(b!), 'image/png');
      });
      const texFile = new File([texBlob], 'demo.png', { type: 'image/png' });

      setState(prev => ({ ...prev, originalImage: URL.createObjectURL(texBlob), progress: 60 }));

      // Generate mesh
      addLog('→ Building 3D mesh...');
      const meshData = await meshGenRef.current.generateFromDepth(depthData, texFile, (p: number) => {
        setState(prev => ({ ...prev, progress: 60 + p * 20 }));
      });
      sceneRef.current.setCharacterMesh(meshData);
      setState(prev => ({ ...prev, meshReady: true, progress: 80 }));
      addLog('✓ Demo mesh created');

      // Rig
      addLog('→ Rigging skeleton...');
      const skeletonData = skeletonRef.current.createHumanoidRig(meshData);
      sceneRef.current.attachSkeleton(skeletonData);
      aiControllerRef.current?.setSkeleton(skeletonData);
      ragdollRef.current?.initFromSkeleton(skeletonData);
      setState(prev => ({ ...prev, skeletonReady: true, stage: 'ready', progress: 100 }));
      addLog('✓ Demo character fully rigged!');
      addLog('→ Click "Activate AI" to see movement');

    } catch (err) {
      addLog(`✗ Demo error: ${(err as Error).message}`);
      setState(prev => ({ ...prev, stage: 'idle', progress: 0 }));
    }
  }, [addLog]);

  // AI Controls
  const toggleAI = useCallback(() => {
    if (!aiControllerRef.current) return;
    const next = !state.aiActive;
    if (next) {
      aiControllerRef.current.start();
      addLog('▶ AI Controller ON');
    } else {
      aiControllerRef.current.stop();
      addLog('■ AI Controller OFF');
    }
    setState(prev => ({ ...prev, aiActive: next }));
  }, [state.aiActive, addLog]);

  const setAIMode = useCallback((mode: string) => {
    if (!aiControllerRef.current) return;
    setActiveMode(mode);
    aiControllerRef.current.setMode(mode);
    addLog(`→ Animation: ${mode}`);
  }, [addLog]);

  // Physics Controls
  const togglePhysics = useCallback(() => {
    if (!ragdollRef.current) return;
    const next = !state.physicsActive;
    if (next) {
      ragdollRef.current.activate();
      addLog('▶ Ragdoll physics ON');
    } else {
      ragdollRef.current.deactivate();
      addLog('■ Ragdoll physics OFF');
    }
    setState(prev => ({ ...prev, physicsActive: next }));
  }, [state.physicsActive, addLog]);

  const toggleCloth = useCallback(() => {
    const next = !state.clothActive;
    if (next && !clothRef.current && sceneRef.current) {
      const cloth = new ClothPhysics({
        width: 12, height: 16, particleMass: 0.1,
        gravity: new THREE.Vector3(0, -9.81, 0),
        wind: new THREE.Vector3(state.windStrength, 0, 0.5),
        damping: 0.97, constraintIterations: 5, pinnedEdges: ['top'],
      });
      clothRef.current = cloth;
      sceneRef.current.addCloth(cloth);
      addLog('▶ Cloth sim ON (cape)');
    } else if (!next && clothRef.current) {
      sceneRef.current?.removeCloth(clothRef.current);
      clothRef.current.dispose();
      clothRef.current = null;
      addLog('■ Cloth sim OFF');
    }
    setState(prev => ({ ...prev, clothActive: next }));
  }, [state.clothActive, state.windStrength, addLog]);

  const setWind = useCallback((v: number) => {
    setState(prev => ({ ...prev, windStrength: v }));
    clothRef.current?.setWind(new THREE.Vector3(v, 0, 0.5));
  }, []);

  // Viewport Controls
  const toggleWireframe = useCallback(() => {
    const next = !state.showWireframe;
    sceneRef.current?.toggleWireframe(next);
    setState(prev => ({ ...prev, showWireframe: next }));
    addLog(next ? '◻ Wireframe ON' : '◼ Wireframe OFF');
  }, [state.showWireframe, addLog]);

  const toggleSkeletonVis = useCallback(() => {
    const vis = sceneRef.current?.toggleSkeletonVisibility();
    setState(prev => ({ ...prev, showSkeleton: !!vis }));
    addLog(vis ? '🦴 Skeleton visible' : '🦴 Skeleton hidden');
  }, [addLog]);

  const resetCamera = useCallback(() => {
    sceneRef.current?.resetCamera();
    addLog('→ Camera reset');
  }, [addLog]);

  // File handling
  const handleFile = useCallback((file: File) => {
    if (file.type.startsWith('image/')) processImage(file);
  }, [processImage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div
      className="w-full h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden font-mono select-none"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* ═══════ HEADER ═══════ */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#111118] border-b border-[#1a1a2e] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-sm font-bold">3D</div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-cyan-400">LOCALFORGE 3D</h1>
            <p className="text-[10px] text-gray-500">AI Character Engine • AnimationMixer • Verlet Physics • 100% Local</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-gray-400">
          <span><i className="fas fa-microchip text-cyan-500 mr-1" />GPU: {state.gpuUsage}%</span>
          <span><i className="fas fa-memory text-purple-500 mr-1" />MEM: {state.memUsage}%</span>
          <span><i className="fas fa-gauge-high text-green-500 mr-1" />FPS: {state.fps}</span>
        </div>
      </header>

      {/* ═══════ MAIN ═══════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ─── LEFT PANEL ─── */}
        <div className="w-72 bg-[#0d0d15] border-r border-[#1a1a2e] flex flex-col overflow-y-auto shrink-0">

          {/* Image Upload */}
          <div className="p-3 border-b border-[#1a1a2e]">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <i className="fas fa-image" /> Source Image
            </h3>
            {state.originalImage ? (
              <div className="relative group">
                <img src={state.originalImage} alt="Source" className="w-full h-28 object-cover rounded-lg border border-[#1a1a2e]" />
                <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg cursor-pointer">
                  <span className="text-xs text-white">Change Image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
              </div>
            ) : (
              <label className="w-full h-28 border-2 border-dashed border-[#2a2a4e] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500/50 transition-colors">
                <i className="fas fa-cloud-upload-alt text-xl text-gray-600 mb-1" />
                <span className="text-xs text-gray-500">Drop image or click</span>
                <span className="text-[10px] text-gray-600 mt-0.5">PNG, JPG, WEBP</span>
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
            )}
            <button
              onClick={generateDemo}
              disabled={state.stage !== 'idle' && state.stage !== 'ready'}
              className="w-full mt-2 px-3 py-1.5 bg-gradient-to-r from-cyan-900/50 to-purple-900/50 border border-cyan-700/30 rounded-lg text-xs text-cyan-300 hover:from-cyan-800/50 hover:to-purple-800/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <i className="fas fa-wand-magic-sparkles mr-1" /> Generate Demo Character
            </button>
          </div>

          {/* AI Controller */}
          <div className="p-3 border-b border-[#1a1a2e]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                <i className="fas fa-robot" /> AI Controller
              </h3>
              <button
                onClick={toggleAI}
                disabled={!state.skeletonReady}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                  state.aiActive
                    ? 'bg-green-900/60 text-green-300 border border-green-600/50 animate-pulse'
                    : 'bg-gray-800 text-gray-400 border border-gray-700/50'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {state.aiActive ? '● ON' : '○ OFF'}
              </button>
            </div>

            {state.skeletonReady ? (
              <div className="grid grid-cols-4 gap-1">
                {AI_MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setAIMode(m.id)}
                    disabled={!state.aiActive}
                    className={`px-1 py-1.5 rounded text-center transition-all ${
                      activeMode === m.id
                        ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-600/50'
                        : 'bg-[#111120] text-gray-500 border border-[#1a1a2e] hover:border-gray-600'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                    title={m.label}
                  >
                    <span className="block text-base leading-none">{m.icon}</span>
                    <span className="block text-[8px] mt-0.5">{m.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-gray-600 italic">Upload image or generate demo first</p>
            )}
          </div>

          {/* Physics */}
          <div className="p-3 border-b border-[#1a1a2e]">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <i className="fas fa-atom" /> Physics
            </h3>
            <div className="flex gap-1 mb-2">
              <button
                onClick={togglePhysics}
                disabled={!state.skeletonReady}
                className={`flex-1 px-2 py-1.5 rounded text-[10px] transition-all ${
                  state.physicsActive
                    ? 'bg-orange-900/50 text-orange-300 border border-orange-600/50'
                    : 'bg-[#111120] text-gray-500 border border-[#1a1a2e] hover:border-gray-600'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <i className="fas fa-person-falling mr-1" />Ragdoll
              </button>
              <button
                onClick={toggleCloth}
                disabled={!state.skeletonReady}
                className={`flex-1 px-2 py-1.5 rounded text-[10px] transition-all ${
                  state.clothActive
                    ? 'bg-purple-900/50 text-purple-300 border border-purple-600/50'
                    : 'bg-[#111120] text-gray-500 border border-[#1a1a2e] hover:border-gray-600'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <i className="fas fa-wind mr-1" />Cloth
              </button>
            </div>
            {state.clothActive && (
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">Wind Force: {state.windStrength.toFixed(1)}</label>
                <input
                  type="range" min="0" max="3" step="0.1"
                  value={state.windStrength}
                  onChange={e => setWind(parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            )}
          </div>

          {/* Viewport Controls */}
          <div className="p-3 border-b border-[#1a1a2e]">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <i className="fas fa-eye" /> Viewport
            </h3>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={toggleWireframe}
                className={`px-2 py-1.5 rounded text-[10px] transition-all ${
                  state.showWireframe
                    ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-600/50'
                    : 'bg-[#111120] text-gray-500 border border-[#1a1a2e] hover:border-gray-600'
                }`}
              >
                <i className="fas fa-border-all mr-0.5" />Wire
              </button>
              <button
                onClick={toggleSkeletonVis}
                className={`px-2 py-1.5 rounded text-[10px] transition-all ${
                  state.showSkeleton
                    ? 'bg-green-900/50 text-green-300 border border-green-600/50'
                    : 'bg-[#111120] text-gray-500 border border-[#1a1a2e] hover:border-gray-600'
                }`}
              >
                <i className="fas fa-bone mr-0.5" />Bones
              </button>
              <button
                onClick={resetCamera}
                className="px-2 py-1.5 rounded text-[10px] bg-[#111120] text-gray-500 border border-[#1a1a2e] hover:border-gray-600 transition-all"
              >
                <i className="fas fa-video mr-0.5" />Reset
              </button>
            </div>
          </div>

          {/* Pipeline */}
          <div className="p-3 border-b border-[#1a1a2e]">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <i className="fas fa-sitemap" /> Pipeline
            </h3>
            <div className="space-y-1">
              <PipeRow label="Depth Estimation" done={state.progress >= 35} active={state.stage === 'estimating-depth' || state.stage === 'loading-model'} />
              <PipeRow label="3D Mesh Gen" done={state.meshReady} active={state.stage === 'generating-mesh'} />
              <PipeRow label="Skeletal Rig" done={state.skeletonReady} active={state.stage === 'rigging'} />
              <PipeRow label="AI Animation" done={state.aiActive} active={false} />
              <PipeRow label="Physics Sim" done={state.physicsActive || state.clothActive} active={false} />
            </div>
          </div>

          {/* Logs */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1 shrink-0">
              <i className="fas fa-terminal" /> Logs
            </h3>
            <div className="flex-1 overflow-y-auto px-3 pb-2">
              {logs.map((l, i) => (
                <p key={i} className="text-[9px] text-gray-600 leading-tight break-all">{l}</p>
              ))}
            </div>
          </div>
        </div>

        {/* ─── CENTER: 3D VIEWPORT ─── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex-1 relative bg-[#080810] min-h-0">
            {/* Three.js canvas mounts here */}
            <div ref={canvasContainerRef} className="absolute inset-0" />

            {/* Idle overlay */}
            {state.stage === 'idle' && !state.meshReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="text-center">
                  <div className="text-7xl mb-4 opacity-20">🎭</div>
                  <p className="text-gray-400 text-sm font-bold">Upload an image or generate demo</p>
                  <p className="text-gray-600 text-xs mt-1">Your image becomes a 3D character with AI animation</p>
                </div>
              </div>
            )}

            {/* Progress overlay */}
            {state.stage !== 'idle' && state.stage !== 'ready' && (
              <div className="absolute top-4 left-4 right-4 z-10">
                <div className="bg-black/80 backdrop-blur rounded-lg p-3 border border-cyan-900/40">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-xs text-cyan-400 uppercase tracking-wider">
                      {state.stage === 'loading-model' && 'Loading AI Model...'}
                      {state.stage === 'estimating-depth' && 'Estimating Depth...'}
                      {state.stage === 'generating-mesh' && 'Building 3D Mesh...'}
                      {state.stage === 'rigging' && 'Rigging Skeleton...'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-300" style={{ width: `${state.progress}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">{Math.round(state.progress)}%</span>
                </div>
              </div>
            )}

            {/* Ready badge */}
            {state.stage === 'ready' && (
              <div className="absolute top-4 left-4 z-10">
                <div className="bg-black/70 backdrop-blur rounded-lg px-3 py-1.5 border border-green-800/40 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-xs text-green-400 font-bold">CHARACTER READY</span>
                </div>
              </div>
            )}

            {/* Controls hint */}
            <div className="absolute bottom-3 right-3 text-[10px] text-gray-600 z-10">
              LMB: Rotate | RMB: Pan | Scroll: Zoom
            </div>
          </div>

          {/* Depth map bar */}
          {state.depthMap && (
            <DepthBar depthMap={state.depthMap} />
          )}
        </div>
      </div>

      {/* ═══════ STATUS BAR ═══════ */}
      <footer className="h-6 bg-[#0a0a12] border-t border-[#1a1a2e] flex items-center px-3 justify-between shrink-0">
        <span className="text-[9px] text-gray-600">
          <span className="text-cyan-600 font-bold">LOCALFORGE 3D</span> v2.0 — AnimationMixer + Verlet Physics + DepthAnything-V2
        </span>
        <span className="text-[9px] text-gray-600 flex items-center gap-3">
          {state.meshReady && <span className="text-green-500">● Mesh</span>}
          {state.skeletonReady && <span className="text-green-500">● Skeleton</span>}
          {state.aiActive && <span className="text-cyan-500">● AI</span>}
          {state.physicsActive && <span className="text-orange-500">● Physics</span>}
          {state.clothActive && <span className="text-purple-500">● Cloth</span>}
          <span className="text-gray-500">100% Local • Free</span>
        </span>
      </footer>
    </div>
  );
}

// ─── Sub-components ───

function PipeRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${done ? 'bg-green-400' : active ? 'bg-cyan-400 animate-pulse' : 'bg-gray-700'}`} />
      <span className={`text-[10px] ${done ? 'text-green-400' : active ? 'text-cyan-400' : 'text-gray-600'}`}>{label}</span>
      {done && <i className="fas fa-check text-[8px] text-green-500 ml-auto" />}
    </div>
  );
}

function DepthBar({ depthMap }: { depthMap: ImageData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = depthMap.width;
    c.height = depthMap.height;
    c.getContext('2d')?.putImageData(depthMap, 0, 0);
  }, [depthMap]);

  return (
    <div className="h-24 bg-[#080810] border-t border-[#1a1a2e] flex shrink-0">
      <div className="flex-1 p-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] uppercase tracking-wider text-gray-500"><i className="fas fa-layer-group mr-1" />Depth Map</span>
          <span className="text-[8px] text-gray-600">{depthMap.width}×{depthMap.height}</span>
        </div>
        <div className="h-[calc(100%-18px)] bg-black rounded overflow-hidden flex items-center justify-center">
          <canvas ref={canvasRef} className="max-w-full max-h-full" style={{ imageRendering: 'pixelated' }} />
        </div>
      </div>
      <div className="w-28 p-2 border-l border-[#1a1a2e]">
        <span className="text-[9px] uppercase tracking-wider text-gray-500 block mb-1"><i className="fas fa-chart-bar mr-1" />Info</span>
        <div className="space-y-0.5">
          <div className="flex justify-between"><span className="text-[9px] text-gray-600">Width</span><span className="text-[9px] text-cyan-400">{depthMap.width}px</span></div>
          <div className="flex justify-between"><span className="text-[9px] text-gray-600">Height</span><span className="text-[9px] text-cyan-400">{depthMap.height}px</span></div>
          <div className="flex justify-between"><span className="text-[9px] text-gray-600">Vertices</span><span className="text-[9px] text-cyan-400">{((depthMap.width * depthMap.height) / 1000).toFixed(0)}K</span></div>
          <div className="flex justify-between"><span className="text-[9px] text-gray-600">Format</span><span className="text-[9px] text-cyan-400">Float32</span></div>
        </div>
      </div>
    </div>
  );
}

export default App;
