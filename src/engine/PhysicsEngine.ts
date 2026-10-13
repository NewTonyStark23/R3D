/**
 * PhysicsEngine - Lightweight Verlet-based physics for cloth/soft-body simulation
 * 
 * Implements real-time cloth physics using Verlet integration:
 * - Particles connected by constraints (springs)
 * - Gravity, wind, collision
 * - Runs on GPU via position updates in the render loop
 * - Much lighter than Ammo.js for browser use
 * 
 * This gives characters realistic cloth movement (capes, flags, hair, skirts)
 */

import * as THREE from 'three';

export interface ClothConfig {
  width: number;       // Grid width (particles)
  height: number;      // Grid height (particles)
  particleMass: number;
  gravity: THREE.Vector3;
  wind: THREE.Vector3;
  damping: number;
  constraintIterations: number;
  pinnedEdges?: ('top' | 'bottom' | 'left' | 'right')[];
}

interface Particle {
  position: THREE.Vector3;
  previous: THREE.Vector3;
  acceleration: THREE.Vector3;
  mass: number;
  invMass: number;
  pinned: boolean;
}

interface Constraint {
  p1: number;
  p2: number;
  restLength: number;
}

export class ClothPhysics {
  private particles: Particle[] = [];
  private constraints: Constraint[] = [];
  private config: ClothConfig;
  private geometry: THREE.BufferGeometry;
  private mesh: THREE.Mesh;
  private time = 0;

  constructor(config: ClothConfig, material?: THREE.Material) {
    this.config = config;
    this.geometry = new THREE.BufferGeometry();
    
    // Create particle grid
    this.initParticles();
    this.initConstraints();
    this.initGeometry();

    // Create mesh
    const mat = material || new THREE.MeshStandardMaterial({
      color: 0x884422,
      side: THREE.DoubleSide,
      wireframe: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, mat);
    this.mesh.castShadow = true;
  }

  private initParticles() {
    const { width, height, particleMass } = this.config;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = new THREE.Vector3(
          (x / (width - 1) - 0.5) * 1.0,
          (y / (height - 1)) * 1.5,
          0
        );

        const pinned = this.isPinned(x, y);

        this.particles.push({
          position: pos.clone(),
          previous: pos.clone(),
          acceleration: new THREE.Vector3(),
          mass: particleMass,
          invMass: pinned ? 0 : 1 / particleMass,
          pinned,
        });
      }
    }
  }

  private isPinned(x: number, y: number): boolean {
    const { width, height, pinnedEdges } = this.config;
    if (!pinnedEdges) return y === height - 1; // Default: pin top

    if (pinnedEdges.includes('top') && y === height - 1) return true;
    if (pinnedEdges.includes('bottom') && y === 0) return true;
    if (pinnedEdges.includes('left') && x === 0) return true;
    if (pinnedEdges.includes('right') && x === width - 1) return true;

    return false;
  }

  private initConstraints() {
    const { width, height } = this.config;

    // Structural constraints (horizontal + vertical)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        // Right neighbor
        if (x < width - 1) {
          this.addConstraint(idx, idx + 1);
        }
        // Top neighbor
        if (y < height - 1) {
          this.addConstraint(idx, idx + width);
        }
      }
    }

    // Shear constraints (diagonal) for stability
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const idx = y * width + x;
        this.addConstraint(idx, idx + width + 1);
        this.addConstraint(idx + 1, idx + width);
      }
    }
  }

  private addConstraint(i1: number, i2: number) {
    const p1 = this.particles[i1];
    const p2 = this.particles[i2];
    this.constraints.push({
      p1: i1,
      p2: i2,
      restLength: p1.position.distanceTo(p2.position),
    });
  }

  private initGeometry() {
    const { width, height } = this.config;
    const positions = new Float32Array(width * height * 3);
    const normals = new Float32Array(width * height * 3);
    const uvs = new Float32Array(width * height * 2);
    const indices: number[] = [];

    // UVs
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        uvs[idx * 2] = x / (width - 1);
        uvs[idx * 2 + 1] = y / (height - 1);
      }
    }

    // Indices
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const i = y * width + x;
        indices.push(i, i + width, i + 1);
        indices.push(i + 1, i + width, i + width + 1);
      }
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
  }

  // Verlet integration step
  simulate(dt: number) {
    const { gravity, wind, damping } = this.config;
    this.time += dt;

    // Apply forces
    for (const p of this.particles) {
      if (p.pinned) continue;

      // Gravity
      p.acceleration.copy(gravity);

      // Wind (oscillating)
      const windForce = wind.clone();
      windForce.x += Math.sin(this.time * 2) * 0.5;
      windForce.z += Math.cos(this.time * 1.5) * 0.3;
      p.acceleration.add(windForce);
    }

    // Verlet integration
    const tmp = new THREE.Vector3();
    for (const p of this.particles) {
      if (p.pinned) continue;

      tmp.copy(p.position);
      const velocity = p.position.clone().sub(p.previous).multiplyScalar(damping);
      p.position.add(velocity);
      p.position.add(p.acceleration.multiplyScalar(dt * dt));
      p.previous.copy(tmp);
    }

    // Satisfy constraints
    for (let iter = 0; iter < this.config.constraintIterations; iter++) {
      for (const c of this.constraints) {
        const p1 = this.particles[c.p1];
        const p2 = this.particles[c.p2];

        const diff = p2.position.clone().sub(p1.position);
        const dist = diff.length();
        if (dist === 0) continue;

        const correction = diff.multiplyScalar((1 - c.restLength / dist) * 0.5);

        if (!p1.pinned) p1.position.add(correction);
        if (!p2.pinned) p2.position.sub(correction);
      }
    }

    // Update geometry
    this.updateGeometry();
  }

  private updateGeometry() {
    const positions = this.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < this.particles.length; i++) {
      positions[i * 3] = this.particles[i].position.x;
      positions[i * 3 + 1] = this.particles[i].position.y;
      positions[i * 3 + 2] = this.particles[i].position.z;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  setWind(wind: THREE.Vector3) {
    this.config.wind = wind;
  }

  dispose() {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ============ Ragdoll Physics ============
// Simple ragdoll for character body physics

export class RagdollPhysics {
  private bones: Map<string, { position: THREE.Vector3; velocity: THREE.Vector3; mass: number }> = new Map();
  private joints: { bone1: string; bone2: string; restLength: number; stiffness: number }[] = [];
  private gravity = new THREE.Vector3(0, -9.81, 0);
  private damping = 0.98;
  private active = false;

  initFromSkeleton(skeletonData: any) {
    const boneNames = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
      'leftArm', 'leftForeArm', 'leftHand',
      'rightArm', 'rightForeArm', 'rightHand',
      'leftUpLeg', 'leftLeg', 'leftFoot',
      'rightUpLeg', 'rightLeg', 'rightFoot'];

    for (const name of boneNames) {
      const boneNode = skeletonData.bones.get(name);
      if (boneNode) {
        const worldPos = new THREE.Vector3();
        boneNode.bone.getWorldPosition(worldPos);
        this.bones.set(name, {
          position: worldPos.clone(),
          velocity: new THREE.Vector3(),
          mass: name.includes('Leg') || name.includes('UpLeg') ? 5 : 
                name.includes('Arm') || name.includes('ForeArm') ? 3 :
                name === 'head' ? 4 : 6,
        });
      }
    }

    // Create joints
    const jointPairs: [string, string][] = [
      ['hips', 'spine'], ['spine', 'spine1'], ['spine1', 'spine2'],
      ['spine2', 'neck'], ['neck', 'head'],
      ['spine2', 'leftArm'], ['leftArm', 'leftForeArm'], ['leftForeArm', 'leftHand'],
      ['spine2', 'rightArm'], ['rightArm', 'rightForeArm'], ['rightForeArm', 'rightHand'],
      ['hips', 'leftUpLeg'], ['leftUpLeg', 'leftLeg'], ['leftLeg', 'leftFoot'],
      ['hips', 'rightUpLeg'], ['rightUpLeg', 'rightLeg'], ['rightLeg', 'rightFoot'],
    ];

    for (const [b1, b2] of jointPairs) {
      const p1 = this.bones.get(b1);
      const p2 = this.bones.get(b2);
      if (p1 && p2) {
        this.joints.push({
          bone1: b1,
          bone2: b2,
          restLength: p1.position.distanceTo(p2.position),
          stiffness: 0.8,
        });
      }
    }
  }

  activate() {
    this.active = true;
  }

  deactivate() {
    this.active = false;
  }

  update(dt: number) {
    if (!this.active) return;

    // Apply gravity and integrate
    for (const [, body] of this.bones) {
      body.velocity.add(this.gravity.clone().multiplyScalar(dt));
      body.velocity.multiplyScalar(this.damping);
      body.position.add(body.velocity.clone().multiplyScalar(dt));

      // Floor collision
      if (body.position.y < 0) {
        body.position.y = 0;
        body.velocity.y *= -0.3; // Bounce (restitution)
        body.velocity.x *= 0.9; // Friction
        body.velocity.z *= 0.9;
      }
    }

    // Satisfy joint constraints
    for (let iter = 0; iter < 5; iter++) {
      for (const joint of this.joints) {
        const b1 = this.bones.get(joint.bone1);
        const b2 = this.bones.get(joint.bone2);
        if (!b1 || !b2) continue;

        const diff = b2.position.clone().sub(b1.position);
        const dist = diff.length();
        if (dist === 0) continue;

        const error = (dist - joint.restLength) / dist * joint.stiffness * 0.5;
        const correction = diff.multiplyScalar(error);

        b1.position.add(correction);
        b2.position.sub(correction);
      }
    }
  }

  applyToSkeleton(skeletonData: any) {
    if (!this.active) return;

    for (const [name, body] of this.bones) {
      const boneNode = skeletonData.bones.get(name);
      if (boneNode) {
        // Convert world position to local
        const parent = boneNode.bone.parent;
        if (parent) {
          const localPos = body.position.clone();
          parent.worldToLocal(localPos);
          boneNode.bone.position.copy(localPos);
        }
      }
    }
  }

  isActive() { return this.active; }
}
