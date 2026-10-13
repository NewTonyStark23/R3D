import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { SceneManager } from './engine/SceneManager';
import { DepthEngine } from './engine/DepthEngine';
import { MeshGenerator } from './engine/MeshGenerator';
import { SkeletonSystem } from './engine/SkeletonSystem';
import { AIController } from './engine/AIController';
import { ResourceManager } from './engine/ResourceManager';
import { ClothPhysics, RagdollPhysics } from './engine/PhysicsEngine';
import { Viewport } from './components/Viewport';
import { ControlPanel } from './components/ControlPanel';
import { DepthView } from './components/DepthView';
import { StatusBar } from './components/StatusBar';

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
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
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
  });

  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-50), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Initialize engines
  useEffect(() => {
    if (!containerRef.current) return;

    const resourceMgr = new ResourceManager({
      maxGpuMB: 2048, // 2GB for our use (4GB GPU total)
      maxMemMB: 4096, // 4GB RAM allocation
      targetFPS: 30,
    });
    resourceMgrRef.current = resourceMgr;

    const scene = new SceneManager(containerRef.current, resourceMgr);
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

    addLog('System initialized. Engines ready.');
    addLog('GPU Target: 2GB | RAM Target: 4GB | FPS Target: 30');
    addLog('Physics: Verlet cloth + Ragdoll ready');

    // Resource monitoring + physics simulation loop
    const monitorInterval = setInterval(() => {
      const stats = resourceMgr.getStats();
      setState(prev => ({
        ...prev,
        gpuUsage: stats.gpuUsage,
        memUsage: stats.memUsage,
        fps: stats.fps,
      }));

      // Update cloth physics if active
      if (clothRef.current) {
        clothRef.current.simulate(0.016);
      }

      // Update ragdoll physics if active
      if (ragdollRef.current && ragdollRef.current.isActive()) {
        ragdollRef.current.update(0.016);
      }
    }, 16); // ~60fps physics

    return () => {
      clearInterval(monitorInterval);
      scene.dispose();
      resourceMgr.dispose();
    };
  }, [addLog]);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!sceneRef.current || !depthEngineRef.current || !meshGenRef.current || !skeletonRef.current) return;

    const imageUrl = URL.createObjectURL(file);
    setState(prev => ({ ...prev, originalImage: imageUrl, stage: 'loading-model', progress: 0 }));
    addLog(`Processing image: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);

    try {
      // Stage 1: Load depth model
      setState(prev => ({ ...prev, stage: 'loading-model', progress: 10 }));
      addLog('Loading Depth Anything V2 Small model (ONNX)...');
      await depthEngineRef.current.loadModel((p: number) => {
        setState(prev => ({ ...prev, progress: 10 + p * 0.3 }));
      });
      addLog('✓ Depth model loaded successfully');

      // Stage 2: Estimate depth
      setState(prev => ({ ...prev, stage: 'estimating-depth', progress: 40 }));
      addLog('Running depth estimation via WebGPU...');
      const depthData = await depthEngineRef.current.estimateDepth(file, (p: number) => {
        setState(prev => ({ ...prev, progress: 40 + p * 0.2 }));
      });
      setState(prev => ({ ...prev, depthMap: depthData }));
      addLog('✓ Depth map generated');

      // Stage 3: Generate 3D mesh from depth
      setState(prev => ({ ...prev, stage: 'generating-mesh', progress: 60 }));
      addLog('Generating 3D mesh from depth data...');
      const meshData = await meshGenRef.current.generateFromDepth(depthData, file, (p: number) => {
        setState(prev => ({ ...prev, progress: 60 + p * 0.15 }));
      });
      sceneRef.current.setCharacterMesh(meshData);
      setState(prev => ({ ...prev, meshReady: true }));
      addLog('✓ 3D character mesh created');

      // Stage 4: Rig with invisible skeleton
      setState(prev => ({ ...prev, stage: 'rigging', progress: 75 }));
      addLog('Attaching invisible skeletal rig (28 bones)...');
      const skeletonData = skeletonRef.current.createHumanoidRig(meshData);
      sceneRef.current.attachSkeleton(skeletonData);
      aiControllerRef.current?.setSkeleton(skeletonData);
      ragdollRef.current?.initFromSkeleton(skeletonData);
      setState(prev => ({ ...prev, skeletonReady: true, stage: 'ready', progress: 100 }));
      addLog('✓ Skeletal rig attached. Character is alive!');
      addLog('AnimationMixer ready with 8 clips. AI Controller active.');
      addLog('Physics: Ragdoll + Cloth available.');

    } catch (err) {
      addLog(`✗ Error: ${(err as Error).message}`);
      setState(prev => ({ ...prev, stage: 'idle', progress: 0 }));
    }
  }, [addLog]);

  const toggleAI = () => {
    if (!aiControllerRef.current) return;
    const active = !state.aiActive;
    if (active) {
      aiControllerRef.current.start();
      addLog('AI Controller activated - character is moving');
    } else {
      aiControllerRef.current.stop();
      addLog('AI Controller deactivated');
    }
    setState(prev => ({ ...prev, aiActive: active }));
  };

  const setAIMode = (mode: string) => {
    if (!aiControllerRef.current) return;
    aiControllerRef.current.setMode(mode);
    addLog(`AI Mode: ${mode}`);
  };

  const togglePhysics = () => {
    if (!ragdollRef.current) return;

    const active = !state.physicsActive;
    if (active) {
      ragdollRef.current.activate();
      addLog('Physics activated - ragdoll simulation running');
    } else {
      ragdollRef.current.deactivate();
      addLog('Physics deactivated');
    }
    setState(prev => ({ ...prev, physicsActive: active }));
  };

  const toggleCloth = () => {
    const active = !state.clothActive;
    if (active && !clothRef.current && sceneRef.current) {
      const cloth = new ClothPhysics({
        width: 12,
        height: 16,
        particleMass: 0.1,
        gravity: new THREE.Vector3(0, -9.81, 0),
        wind: new THREE.Vector3(state.windStrength, 0, 0.5),
        damping: 0.97,
        constraintIterations: 5,
        pinnedEdges: ['top'],
      });
      clothRef.current = cloth;
      sceneRef.current.addCloth(cloth);
      addLog('Cloth simulation activated (cape)');
    } else if (!active && clothRef.current) {
      sceneRef.current?.removeCloth(clothRef.current);
      clothRef.current.dispose();
      clothRef.current = null;
      addLog('Cloth simulation deactivated');
    }
    setState(prev => ({ ...prev, clothActive: active }));
  };

  const setWindStrength = (strength: number) => {
    setState(prev => ({ ...prev, windStrength: strength }));
    if (clothRef.current) {
      clothRef.current.setWind(new THREE.Vector3(strength, 0, 0.5));
    }
  };

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      className="w-full h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden font-mono"
      onDrop={handleGlobalDrop}
      onDragOver={handleGlobalDragOver}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#111118] border-b border-[#1a1a2e]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
            <i className="fas fa-cube text-white text-sm"></i>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-cyan-400">LOCALFORGE 3D</h1>
            <p className="text-[10px] text-gray-500">AI Character Engine • Local • Free • GPU-Accelerated</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-gray-400">
          <span><i className="fas fa-microchip text-cyan-500 mr-1"></i>GPU: {state.gpuUsage}%</span>
          <span><i className="fas fa-memory text-purple-500 mr-1"></i>MEM: {state.memUsage}%</span>
          <span><i className="fas fa-gauge-high text-green-500 mr-1"></i>FPS: {state.fps}</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <ControlPanel
          state={state}
          onImageUpload={handleImageUpload}
          onToggleAI={toggleAI}
          onSetAIMode={setAIMode}
          onTogglePhysics={togglePhysics}
          onToggleCloth={toggleCloth}
          onSetWind={setWindStrength}
          logs={logs}
        />

        {/* Center - 3D Viewport */}
        <div className="flex-1 flex flex-col">
          <Viewport ref={containerRef} state={state} />
          {state.depthMap && <DepthView depthMap={state.depthMap} />}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar state={state} />
    </div>
  );
}

export default App;
