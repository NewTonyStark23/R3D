/**
 * AIController v2 - Uses AnimationMixer/Clip/Action system
 * This is the "brain" that gives the character life
 * It creates AnimationClips procedurally and plays them through the mixer
 */

import * as THREE from 'three';
import { SkeletonSystem, SkeletonData } from './SkeletonSystem';
import { SceneManager } from './SceneManager';
import { AnimationMixer, AnimationClip, AnimationAction, LoopMode } from './AnimationSystem';

export type AIMode = 'idle' | 'walk' | 'wave' | 'dance' | 'look_around' | 'breathe' | 'jump' | 'fight' | 'custom';

export class AIController {
  private skeletonSystem: SkeletonSystem;
  private scene: SceneManager;
  private mixer: AnimationMixer;
  private clips: Map<AIMode, AnimationClip> = new Map();
  private currentAction: AnimationAction | null = null;
  private currentMode: AIMode = 'idle';
  private active = false;
  private animFrame = 0;

  constructor(skeletonSystem: SkeletonSystem, scene: SceneManager) {
    this.skeletonSystem = skeletonSystem;
    this.scene = scene;
    this.mixer = new AnimationMixer();
    this.createClips();
  }

  private createClips() {
    // Each clip is a procedural animation - like importing from Blender
    // Duration is in seconds, patterns define bone rotations over time

    // IDLE - subtle breathing
    this.clips.set('idle', AnimationClip.createFromPattern('idle', 3.0, new Map([
      ['spine', { x: 0.02, y: 0, z: 0, speed: 0.4, phase: 0 }],
      ['spine1', { x: 0.015, y: 0, z: 0, speed: 0.4, phase: 0.1 }],
      ['spine2', { x: 0.01, y: 0, z: 0, speed: 0.4, phase: 0.2 }],
      ['neck', { x: 0.01, y: 0.005, z: 0, speed: 0.3, phase: 0.3 }],
      ['head', { x: 0.005, y: 0.01, z: 0.003, speed: 0.2, phase: 0.4 }],
      ['leftArm', { x: 0, y: 0, z: 0.02, speed: 0.3, phase: 0 }],
      ['rightArm', { x: 0, y: 0, z: -0.02, speed: 0.3, phase: Math.PI }],
      ['hips', { x: 0.005, y: 0, z: 0, speed: 0.4, phase: 0 }],
    ])));

    // WALK - full body walk cycle
    this.clips.set('walk', AnimationClip.createFromPattern('walk', 1.0, new Map([
      ['hips', { x: 0.05, y: 0.08, z: 0.02, speed: 1.0, phase: 0 }],
      ['spine', { x: -0.05, y: -0.05, z: 0, speed: 1.0, phase: 0 }],
      ['spine1', { x: -0.03, y: 0, z: 0, speed: 1.0, phase: 0.1 }],
      ['leftUpLeg', { x: 0.5, y: 0, z: 0, speed: 1.0, phase: 0 }],
      ['leftLeg', { x: 0.8, y: 0, z: 0, speed: 1.0, phase: 0.2 }],
      ['rightUpLeg', { x: 0.5, y: 0, z: 0, speed: 1.0, phase: Math.PI }],
      ['rightLeg', { x: 0.8, y: 0, z: 0, speed: 1.0, phase: Math.PI + 0.2 }],
      ['leftArm', { x: 0.4, y: 0, z: 0.1, speed: 1.0, phase: Math.PI }],
      ['leftForeArm', { x: -0.3, y: 0, z: 0, speed: 1.0, phase: Math.PI }],
      ['rightArm', { x: 0.4, y: 0, z: -0.1, speed: 1.0, phase: 0 }],
      ['rightForeArm', { x: -0.3, y: 0, z: 0, speed: 1.0, phase: 0 }],
      ['neck', { x: 0.02, y: 0.03, z: 0, speed: 1.0, phase: 0 }],
      ['head', { x: -0.02, y: -0.02, z: 0, speed: 0.5, phase: 0 }],
    ])));

    // WAVE - waving hand
    this.clips.set('wave', AnimationClip.createFromPattern('wave', 2.0, new Map([
      ['rightShoulder', { x: 0, y: 0, z: 0.3, speed: 0.25, phase: 0 }],
      ['rightArm', { x: 0, y: 0, z: 2.0, speed: 0.25, phase: 0 }],
      ['rightForeArm', { x: -1.5, y: 0, z: 0, speed: 0.25, phase: 0 }],
      ['rightHand', { x: 0, y: 0, z: 0.4, speed: 2.0, phase: 0 }],
      ['spine', { x: 0, y: 0.05, z: -0.03, speed: 0.25, phase: 0 }],
      ['head', { x: 0, y: 0.1, z: 0.05, speed: 1.0, phase: 0 }],
      ['hips', { x: 0, y: 0, z: -0.02, speed: 0.25, phase: 0 }],
    ])));

    // DANCE - energetic movement
    this.clips.set('dance', AnimationClip.createFromPattern('dance', 2.0, new Map([
      ['hips', { x: 0.1, y: 0.15, z: 0.1, speed: 2.0, phase: 0 }],
      ['spine', { x: 0.1, y: 0.1, z: 0.05, speed: 2.0, phase: 0.5 }],
      ['spine1', { x: 0.05, y: 0.05, z: 0, speed: 2.0, phase: 1.0 }],
      ['spine2', { x: 0.05, y: -0.05, z: 0, speed: 2.0, phase: 1.5 }],
      ['leftArm', { x: 0.5, y: 0.3, z: 1.0, speed: 2.0, phase: 0 }],
      ['leftForeArm', { x: -1.0, y: 0, z: 0.3, speed: 2.0, phase: 0.5 }],
      ['rightArm', { x: 0.5, y: -0.3, z: -1.0, speed: 2.0, phase: Math.PI }],
      ['rightForeArm', { x: -1.0, y: 0, z: -0.3, speed: 2.0, phase: Math.PI + 0.5 }],
      ['leftUpLeg', { x: 0.3, y: 0, z: 0.2, speed: 2.0, phase: 0 }],
      ['rightUpLeg', { x: 0.3, y: 0, z: -0.2, speed: 2.0, phase: Math.PI }],
      ['leftLeg', { x: 0.5, y: 0, z: 0, speed: 2.0, phase: 0.3 }],
      ['rightLeg', { x: 0.5, y: 0, z: 0, speed: 2.0, phase: Math.PI + 0.3 }],
      ['head', { x: 0.1, y: 0.2, z: 0.1, speed: 1.0, phase: 0 }],
      ['neck', { x: 0.05, y: 0.1, z: 0.05, speed: 1.0, phase: 0.3 }],
    ])));

    // LOOK AROUND
    this.clips.set('look_around', AnimationClip.createFromPattern('look_around', 4.0, new Map([
      ['neck', { x: 0.1, y: 0.6, z: 0.05, speed: 0.2, phase: 0 }],
      ['head', { x: 0.15, y: 0.7, z: 0.1, speed: 0.2, phase: 0.2 }],
      ['spine2', { x: 0.02, y: 0.1, z: 0, speed: 0.2, phase: 0.1 }],
      ['spine', { x: 0.01, y: 0.05, z: 0, speed: 0.2, phase: 0.05 }],
    ])));

    // BREATHE - deep breathing
    this.clips.set('breathe', AnimationClip.createFromPattern('breathe', 4.0, new Map([
      ['spine', { x: 0.04, y: 0, z: 0, speed: 0.15, phase: 0 }],
      ['spine1', { x: 0.035, y: 0, z: 0, speed: 0.15, phase: 0.05 }],
      ['spine2', { x: 0.03, y: 0, z: 0, speed: 0.15, phase: 0.1 }],
      ['leftShoulder', { x: 0, y: 0, z: 0.03, speed: 0.15, phase: 0 }],
      ['rightShoulder', { x: 0, y: 0, z: -0.03, speed: 0.15, phase: 0 }],
      ['neck', { x: 0.02, y: 0, z: 0, speed: 0.15, phase: 0.15 }],
      ['hips', { x: 0.01, y: 0, z: 0, speed: 0.15, phase: 0 }],
    ])));

    // JUMP
    this.clips.set('jump', AnimationClip.createFromPattern('jump', 1.5, new Map([
      ['hips', { x: 0.3, y: 0, z: 0, speed: 0.7, phase: 0 }],
      ['spine', { x: -0.1, y: 0, z: 0, speed: 0.7, phase: 0 }],
      ['leftUpLeg', { x: -0.5, y: 0, z: 0, speed: 0.7, phase: 0 }],
      ['leftLeg', { x: 1.0, y: 0, z: 0, speed: 0.7, phase: 0.3 }],
      ['rightUpLeg', { x: -0.5, y: 0, z: 0, speed: 0.7, phase: 0 }],
      ['rightLeg', { x: 1.0, y: 0, z: 0, speed: 0.7, phase: 0.3 }],
      ['leftArm', { x: -1.5, y: 0, z: 0.3, speed: 0.7, phase: 0 }],
      ['rightArm', { x: -1.5, y: 0, z: -0.3, speed: 0.7, phase: 0 }],
      ['head', { x: -0.2, y: 0, z: 0, speed: 0.7, phase: 0 }],
    ])));

    // FIGHT - combat stance
    this.clips.set('fight', AnimationClip.createFromPattern('fight', 1.5, new Map([
      ['hips', { x: 0.05, y: 0.1, z: 0, speed: 0.7, phase: 0 }],
      ['spine', { x: 0.1, y: 0, z: 0, speed: 0.7, phase: 0 }],
      ['leftArm', { x: -1.2, y: 0.3, z: 0.5, speed: 0.7, phase: 0 }],
      ['leftForeArm', { x: -1.5, y: 0, z: 0, speed: 0.7, phase: 0.2 }],
      ['rightArm', { x: -0.8, y: -0.3, z: -0.3, speed: 0.7, phase: Math.PI }],
      ['rightForeArm', { x: -1.8, y: 0, z: 0, speed: 0.7, phase: Math.PI + 0.2 }],
      ['leftUpLeg', { x: 0.2, y: 0, z: 0.15, speed: 0.7, phase: 0 }],
      ['rightUpLeg', { x: 0.3, y: 0, z: -0.15, speed: 0.7, phase: Math.PI }],
      ['leftLeg', { x: 0.3, y: 0, z: 0, speed: 0.7, phase: 0.2 }],
      ['rightLeg', { x: 0.4, y: 0, z: 0, speed: 0.7, phase: Math.PI + 0.2 }],
      ['head', { x: 0, y: 0.1, z: 0, speed: 0.35, phase: 0 }],
    ])));
  }

  setSkeleton(skeleton: SkeletonData) {
    this.mixer.setSkeleton(skeleton);
    
    // Register all clips as actions
    for (const [mode, clip] of this.clips) {
      const action = this.mixer.clipAction(clip);
      action.loopMode = mode === 'jump' ? LoopMode.Once : LoopMode.Repeat;
    }
  }

  start() {
    this.active = true;
    this.playMode('idle');
    this.animate();
  }

  stop() {
    this.active = false;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
    }
    this.mixer.stopAllAction();
  }

  setMode(mode: AIMode | string) {
    this.playMode(mode as AIMode);
  }

  private playMode(mode: AIMode) {
    if (mode === this.currentMode && this.currentAction?.isPlaying()) return;

    const clip = this.clips.get(mode);
    if (!clip) return;

    const newAction = this.mixer.clipAction(clip);
    
    if (this.currentAction && this.currentAction.isPlaying()) {
      // Cross-fade to new animation
      this.mixer.crossFadeTo(this.currentMode, mode, 0.3);
    } else {
      newAction.reset().play();
    }

    this.currentAction = newAction;
    this.currentMode = mode;
  }

  private animate = () => {
    if (!this.active) return;
    this.animFrame = requestAnimationFrame(this.animate);
    this.mixer.update();
    this.scene.notifyUpdate();
  };

  getMixer() { return this.mixer; }
  getCurrentMode() { return this.currentMode; }
  getAvailableModes(): string[] { return Array.from(this.clips.keys()); }

  dispose() {
    this.stop();
    this.mixer.dispose();
  }
}
