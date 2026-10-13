/**
 * SceneManager - Three.js rendering space
 * Uses Three.js ONLY as a rendering canvas for:
 * - Displaying the 3D mesh
 * - Rendering the invisible skeleton (optional debug view)
 * - Camera controls
 * - Lighting
 * Does NOT use Three.js for model creation - mesh comes from MeshGenerator
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshData } from './MeshGenerator';
import { SkeletonData } from './SkeletonSystem';
import { ResourceManager } from './ResourceManager';

export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private characterMesh: THREE.Mesh | null = null;
  private skeletonHelper: THREE.SkeletonHelper | null = null;
  private skeletonData: SkeletonData | null = null;
  private container: HTMLElement;
  private resourceMgr: ResourceManager;
  private animFrame = 0;
  private showSkeleton = false;
  private gridHelper: THREE.GridHelper;
  private disposed = false;

  constructor(container: HTMLElement, resourceMgr: ResourceManager) {
    this.container = container;
    this.resourceMgr = resourceMgr;

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a14);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0.5, 3);

    // Renderer - optimized for your GPU
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 10;
    this.controls.target.set(0, 0.5, 0);

    // Lighting
    this.setupLighting();

    // Grid
    this.gridHelper = new THREE.GridHelper(4, 20, 0x1a1a3e, 0x111128);
    this.scene.add(this.gridHelper);

    // Start render loop
    this.animate();

    // Handle resize
    window.addEventListener('resize', this.onResize);
  }

  private setupLighting() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambient);

    // Key light
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2, 3, 2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.4);
    fillLight.position.set(-2, 1, -1);
    this.scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0xff8844, 0.3);
    rimLight.position.set(0, 2, -3);
    this.scene.add(rimLight);

    // Ground plane for shadows
    const groundGeo = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setCharacterMesh(meshData: MeshData) {
    // Remove existing character
    if (this.characterMesh) {
      this.scene.remove(this.characterMesh);
      this.characterMesh.geometry.dispose();
    }

    // Create mesh from the generated geometry
    this.characterMesh = new THREE.Mesh(meshData.geometry, meshData.material);
    this.characterMesh.castShadow = true;
    this.characterMesh.receiveShadow = true;
    this.scene.add(this.characterMesh);

    // Center camera on character
    const box = new THREE.Box3().setFromObject(this.characterMesh);
    const center = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + 0.5, center.z + 3);
  }

  attachSkeleton(skeletonData: SkeletonData) {
    this.skeletonData = skeletonData;

    // Add skeleton to character mesh for skinning
    if (this.characterMesh) {
      // Bind skeleton to mesh
      this.characterMesh.add(skeletonData.rootBone);
      (this.characterMesh as any).bind(skeletonData.skeleton, skeletonData.bindMatrix);

      // Create skeleton helper for debug visualization
      this.skeletonHelper = new THREE.SkeletonHelper(this.characterMesh);
      (this.skeletonHelper.material as THREE.LineBasicMaterial).color.set(0x00ff88);
      (this.skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 2;
      this.skeletonHelper.visible = this.showSkeleton;
      this.scene.add(this.skeletonHelper);
    }
  }

  updateSkeleton(skeletonData: SkeletonData) {
    this.skeletonData = skeletonData;
    // SkeletonHelper auto-updates on render
    if (this.skeletonHelper) {
      this.skeletonHelper.updateMatrixWorld();
    }
  }

  toggleSkeletonVisibility() {
    this.showSkeleton = !this.showSkeleton;
    if (this.skeletonHelper) {
      this.skeletonHelper.visible = this.showSkeleton;
    }
    return this.showSkeleton;
  }

  private animate = () => {
    if (this.disposed) return;
    this.animFrame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    if (this.disposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  getRenderer() { return this.renderer; }
  getScene() { return this.scene; }
  getCamera() { return this.camera; }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animFrame);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
