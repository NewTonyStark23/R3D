/**
 * AIController - Local AI movement system for character animation
 * Uses procedural movement patterns that simulate AI-driven behavior
 * Controls the invisible skeleton to give the character life
 * Runs locally - no external API needed
 */

import * as THREE from 'three';
import { SkeletonSystem, SkeletonData } from './SkeletonSystem';
import { SceneManager } from './SceneManager';

export type AIMode = 'idle' | 'walk' | 'wave' | 'dance' | 'look_around' | 'breathe' | 'custom';

interface MovementPattern {
  bones: Map<string, { x: number; y: number; z: number; speed: number; phase: number }>;
}

export class AIController {
  private skeletonSystem: SkeletonSystem;
  private scene: SceneManager;
  private skeleton: SkeletonData | null = null;
  private active = false;
  private mode: AIMode = 'idle';
  private time = 0;
  private animFrame = 0;
  private patterns: Map<AIMode, MovementPattern> = new Map();
  private blendFactor = 0;
  private targetMode: AIMode = 'idle';

  constructor(skeletonSystem: SkeletonSystem, scene: SceneManager) {
    this.skeletonSystem = skeletonSystem;
    this.scene = scene;
    this.defineMovementPatterns();
  }

  private defineMovementPatterns() {
    // Idle breathing pattern
    this.patterns.set('idle', {
      bones: new Map([
        ['spine', { x: 0.02, y: 0, z: 0, speed: 1.2, phase: 0 }],
        ['spine1', { x: 0.015, y: 0, z: 0, speed: 1.2, phase: 0.1 }],
        ['spine2', { x: 0.01, y: 0, z: 0, speed: 1.2, phase: 0.2 }],
        ['neck', { x: 0.01, y: 0.005, z: 0, speed: 0.8, phase: 0.3 }],
        ['head', { x: 0.005, y: 0.01, z: 0.003, speed: 0.6, phase: 0.4 }],
        ['leftArm', { x: 0, y: 0, z: 0.02, speed: 0.9, phase: 0 }],
        ['rightArm', { x: 0, y: 0, z: -0.02, speed: 0.9, phase: Math.PI }],
        ['hips', { x: 0.005, y: 0, z: 0, speed: 1.2, phase: 0 }],
      ]),
    });

    // Walking pattern
    this.patterns.set('walk', {
      bones: new Map([
        ['hips', { x: 0.05, y: 0.08, z: 0.02, speed: 3.0, phase: 0 }],
        ['spine', { x: -0.05, y: -0.05, z: 0, speed: 3.0, phase: 0 }],
        ['spine1', { x: -0.03, y: 0, z: 0, speed: 3.0, phase: 0.1 }],
        ['leftUpLeg', { x: 0.5, y: 0, z: 0, speed: 3.0, phase: 0 }],
        ['leftLeg', { x: 0.8, y: 0, z: 0, speed: 3.0, phase: 0.2 }],
        ['rightUpLeg', { x: 0.5, y: 0, z: 0, speed: 3.0, phase: Math.PI }],
        ['rightLeg', { x: 0.8, y: 0, z: 0, speed: 3.0, phase: Math.PI + 0.2 }],
        ['leftArm', { x: 0.4, y: 0, z: 0.1, speed: 3.0, phase: Math.PI }],
        ['leftForeArm', { x: -0.3, y: 0, z: 0, speed: 3.0, phase: Math.PI }],
        ['rightArm', { x: 0.4, y: 0, z: -0.1, speed: 3.0, phase: 0 }],
        ['rightForeArm', { x: -0.3, y: 0, z: 0, speed: 3.0, phase: 0 }],
        ['neck', { x: 0.02, y: 0.03, z: 0, speed: 3.0, phase: 0 }],
        ['head', { x: -0.02, y: -0.02, z: 0, speed: 1.5, phase: 0 }],
      ]),
    });

    // Waving pattern
    this.patterns.set('wave', {
      bones: new Map([
        ['rightShoulder', { x: 0, y: 0, z: 0.3, speed: 0.5, phase: 0 }],
        ['rightArm', { x: 0, y: 0, z: 2.0, speed: 0.5, phase: 0 }],
        ['rightForeArm', { x: -1.5, y: 0, z: 0, speed: 0.5, phase: 0 }],
        ['rightHand', { x: 0, y: 0, z: 0.4, speed: 4.0, phase: 0 }],
        ['spine', { x: 0, y: 0.05, z: -0.03, speed: 0.5, phase: 0 }],
        ['head', { x: 0, y: 0.1, z: 0.05, speed: 2.0, phase: 0 }],
        ['hips', { x: 0, y: 0, z: -0.02, speed: 0.5, phase: 0 }],
      ]),
    });

    // Dance pattern
    this.patterns.set('dance', {
      bones: new Map([
        ['hips', { x: 0.1, y: 0.15, z: 0.1, speed: 4.0, phase: 0 }],
        ['spine', { x: 0.1, y: 0.1, z: 0.05, speed: 4.0, phase: 0.5 }],
        ['spine1', { x: 0.05, y: 0.05, z: 0, speed: 4.0, phase: 1.0 }],
        ['spine2', { x: 0.05, y: -0.05, z: 0, speed: 4.0, phase: 1.5 }],
        ['leftArm', { x: 0.5, y: 0.3, z: 1.0, speed: 4.0, phase: 0 }],
        ['leftForeArm', { x: -1.0, y: 0, z: 0.3, speed: 4.0, phase: 0.5 }],
        ['rightArm', { x: 0.5, y: -0.3, z: -1.0, speed: 4.0, phase: Math.PI }],
        ['rightForeArm', { x: -1.0, y: 0, z: -0.3, speed: 4.0, phase: Math.PI + 0.5 }],
        ['leftUpLeg', { x: 0.3, y: 0, z: 0.2, speed: 4.0, phase: 0 }],
        ['rightUpLeg', { x: 0.3, y: 0, z: -0.2, speed: 4.0, phase: Math.PI }],
        ['leftLeg', { x: 0.5, y: 0, z: 0, speed: 4.0, phase: 0.3 }],
        ['rightLeg', { x: 0.5, y: 0, z: 0, speed: 4.0, phase: Math.PI + 0.3 }],
        ['head', { x: 0.1, y: 0.2, z: 0.1, speed: 2.0, phase: 0 }],
        ['neck', { x: 0.05, y: 0.1, z: 0.05, speed: 2.0, phase: 0.3 }],
      ]),
    });

    // Look around pattern
    this.patterns.set('look_around', {
      bones: new Map([
        ['neck', { x: 0.1, y: 0.6, z: 0.05, speed: 0.8, phase: 0 }],
        ['head', { x: 0.15, y: 0.7, z: 0.1, speed: 0.8, phase: 0.2 }],
        ['spine2', { x: 0.02, y: 0.1, z: 0, speed: 0.8, phase: 0.1 }],
        ['spine', { x: 0.01, y: 0.05, z: 0, speed: 0.8, phase: 0.05 }],
      ]),
    });

    // Breathing (deep) pattern
    this.patterns.set('breathe', {
      bones: new Map([
        ['spine', { x: 0.04, y: 0, z: 0, speed: 0.6, phase: 0 }],
        ['spine1', { x: 0.035, y: 0, z: 0, speed: 0.6, phase: 0.05 }],
        ['spine2', { x: 0.03, y: 0, z: 0, speed: 0.6, phase: 0.1 }],
        ['leftShoulder', { x: 0, y: 0, z: 0.03, speed: 0.6, phase: 0 }],
        ['rightShoulder', { x: 0, y: 0, z: -0.03, speed: 0.6, phase: 0 }],
        ['neck', { x: 0.02, y: 0, z: 0, speed: 0.6, phase: 0.15 }],
        ['hips', { x: 0.01, y: 0, z: 0, speed: 0.6, phase: 0 }],
      ]),
    });
  }

  setSkeleton(skeleton: SkeletonData) {
    this.skeleton = skeleton;
  }

  start() {
    this.active = true;
    this.animate();
  }

  stop() {
    this.active = false;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
    }
    if (this.skeleton) {
      this.skeletonSystem.resetPose(this.skeleton);
    }
  }

  setMode(mode: AIMode | string) {
    this.targetMode = mode as AIMode;
    this.blendFactor = 0;
  }

  private animate = () => {
    if (!this.active || !this.skeleton) return;

    this.time += 0.016; // ~60fps time step
    this.animFrame = requestAnimationFrame(this.animate);

    // Blend between modes
    if (this.mode !== this.targetMode) {
      this.blendFactor += 0.02;
      if (this.blendFactor >= 1) {
        this.mode = this.targetMode;
        this.blendFactor = 0;
      }
    }

    // Apply current pattern
    const currentPattern = this.patterns.get(this.mode);
    if (currentPattern) {
      this.applyPattern(currentPattern, 1.0);
    }

    // If blending, also apply target pattern
    if (this.mode !== this.targetMode && this.blendFactor > 0) {
      const targetPattern = this.patterns.get(this.targetMode);
      if (targetPattern) {
        this.applyPattern(targetPattern, this.blendFactor);
      }
    }

    // Update the scene
    this.scene.updateSkeleton(this.skeleton);
  };

  private applyPattern(pattern: MovementPattern, intensity: number) {
    if (!this.skeleton) return;

    for (const [boneName, params] of pattern.bones) {
      const sinVal = Math.sin(this.time * params.speed + params.phase);
      const rotation = new THREE.Euler(
        params.x * sinVal * intensity,
        params.y * sinVal * intensity,
        params.z * sinVal * intensity
      );
      this.skeletonSystem.applyBoneRotation(this.skeleton, boneName, rotation);
    }
  }

  dispose() {
    this.stop();
  }
}
