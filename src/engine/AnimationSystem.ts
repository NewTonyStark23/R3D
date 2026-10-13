/**
 * AnimationSystem - Implements the THREE.AnimationMixer/Clip/Action pattern
 * 
 * Breakdown of the Three.js animation system (as used in Nilo/play.nilo.io):
 * 
 * • AnimationMixer: The main "player" - manages playback, blending, timing
 *   - Holds references to all AnimationActions
 *   - Updates every frame (delta time based)
 *   - Handles cross-fading between clips
 * 
 * • AnimationClip: The actual animation DATA (keyframes for each bone)
 *   - Contains KeyframeTrack[] (one per animated property)
 *   - Each track has times[] and values[] arrays
 *   - Like a "walk cycle" or "idle" animation imported from Blender
 * 
 * • AnimationAction: Controls ONE clip's playback on a specific object
 *   - play(), stop(), pause(), crossFadeTo()
 *   - weight (0-1) for blending
 *   - timeScale for speed
 *   - loop modes: LoopOnce, LoopRepeat, LoopPingPong
 * 
 * We implement our own version that works with our invisible skeleton system.
 */

import * as THREE from 'three';
import { SkeletonData } from './SkeletonSystem';

// ============ AnimationClip ============
// Contains keyframe data for all bones in a skeleton

export interface KeyframeTrack {
  boneName: string;
  property: 'rotation' | 'position' | 'scale';
  times: Float32Array;   // Timestamps in seconds
  values: Float32Array;  // Values (quaternion xyzw for rotation, vec3 for pos/scale)
}

export class AnimationClip {
  name: string;
  duration: number;
  tracks: KeyframeTrack[];

  constructor(name: string, duration: number, tracks: KeyframeTrack[]) {
    this.name = name;
    this.duration = duration;
    this.tracks = tracks;
  }

  // Create a clip from procedural movement data
  static createFromPattern(
    name: string,
    duration: number,
    bonePatterns: Map<string, { x: number; y: number; z: number; speed: number; phase: number }>
  ): AnimationClip {
    const tracks: KeyframeTrack[] = [];
    const fps = 30;
    const frameCount = Math.ceil(duration * fps);
    const times = new Float32Array(frameCount);
    
    for (let i = 0; i < frameCount; i++) {
      times[i] = i / fps;
    }

    for (const [boneName, params] of bonePatterns) {
      const values = new Float32Array(frameCount * 4); // quaternion xyzw
      
      for (let i = 0; i < frameCount; i++) {
        const t = times[i];
        const sinVal = Math.sin(t * params.speed * Math.PI * 2 + params.phase);
        
        // Convert Euler angles to quaternion
        const euler = new THREE.Euler(
          params.x * sinVal,
          params.y * sinVal,
          params.z * sinVal
        );
        const quat = new THREE.Quaternion().setFromEuler(euler);
        
        values[i * 4] = quat.x;
        values[i * 4 + 1] = quat.y;
        values[i * 4 + 2] = quat.z;
        values[i * 4 + 3] = quat.w;
      }

      tracks.push({
        boneName,
        property: 'rotation',
        times,
        values,
      });
    }

    return new AnimationClip(name, duration, tracks);
  }
}

// ============ AnimationAction ============
// Controls playback of a single clip

export enum LoopMode {
  Once = 0,
  Repeat = 1,
  PingPong = 2,
}

export class AnimationAction {
  clip: AnimationClip;
  weight: number = 1;
  timeScale: number = 1;
  loopMode: LoopMode = LoopMode.Repeat;
  enabled: boolean = true;
  paused: boolean = false;
  
  private currentTime: number = 0;
  private direction: number = 1; // For ping-pong
  private _playing: boolean = false;

  constructor(clip: AnimationClip) {
    this.clip = clip;
  }

  play() {
    this._playing = true;
    this.paused = false;
    return this;
  }

  stop() {
    this._playing = false;
    this.currentTime = 0;
    this.direction = 1;
    return this;
  }

  pause() {
    this.paused = true;
    return this;
  }

  reset() {
    this.currentTime = 0;
    this.direction = 1;
    return this;
  }

  isPlaying(): boolean {
    return this._playing && !this.paused;
  }

  getTime(): number {
    return this.currentTime;
  }

  // Called by the mixer every frame
  update(deltaTime: number): void {
    if (!this._playing || this.paused) return;

    this.currentTime += deltaTime * this.timeScale * this.direction;

    switch (this.loopMode) {
      case LoopMode.Once:
        if (this.currentTime >= this.clip.duration) {
          this.currentTime = this.clip.duration;
          this._playing = false;
        }
        break;
      case LoopMode.Repeat:
        while (this.currentTime >= this.clip.duration) {
          this.currentTime -= this.clip.duration;
        }
        while (this.currentTime < 0) {
          this.currentTime += this.clip.duration;
        }
        break;
      case LoopMode.PingPong:
        if (this.currentTime >= this.clip.duration) {
          this.currentTime = this.clip.duration - (this.currentTime - this.clip.duration);
          this.direction = -1;
        } else if (this.currentTime < 0) {
          this.currentTime = -this.currentTime;
          this.direction = 1;
        }
        break;
    }
  }

  // Sample the clip at current time, returns bone rotations
  sample(): Map<string, THREE.Quaternion> {
    const result = new Map<string, THREE.Quaternion>();
    const t = this.currentTime;

    for (const track of this.clip.tracks) {
      const quat = this.interpolateTrack(track, t);
      result.set(track.boneName, quat);
    }

    return result;
  }

  private interpolateTrack(track: KeyframeTrack, time: number): THREE.Quaternion {
    const { times, values } = track;
    
    // Find the two keyframes we're between
    let idx = 0;
    for (let i = 0; i < times.length - 1; i++) {
      if (time >= times[i] && time < times[i + 1]) {
        idx = i;
        break;
      }
      if (i === times.length - 2) idx = i;
    }

    const t0 = times[idx];
    const t1 = times[Math.min(idx + 1, times.length - 1)];
    const alpha = t1 > t0 ? (time - t0) / (t1 - t0) : 0;

    // Slerp between quaternions
    const q0 = new THREE.Quaternion(
      values[idx * 4],
      values[idx * 4 + 1],
      values[idx * 4 + 2],
      values[idx * 4 + 3]
    );
    const q1 = new THREE.Quaternion(
      values[Math.min(idx + 1, times.length - 1) * 4],
      values[Math.min(idx + 1, times.length - 1) * 4 + 1],
      values[Math.min(idx + 1, times.length - 1) * 4 + 2],
      values[Math.min(idx + 1, times.length - 1) * 4 + 3]
    );

    return new THREE.Quaternion().slerpQuaternions(q0, q1, alpha);
  }
}

// ============ AnimationMixer ============
// The main controller - manages all actions, blends them, drives the skeleton

export class AnimationMixer {
  private actions: Map<string, AnimationAction> = new Map();
  private skeleton: SkeletonData | null = null;
  private lastTime: number = 0;

  constructor() {
    this.lastTime = performance.now() / 1000;
  }

  setSkeleton(skeleton: SkeletonData) {
    this.skeleton = skeleton;
  }

  // Create and register a new action from a clip
  clipAction(clip: AnimationClip): AnimationAction {
    let action = this.actions.get(clip.name);
    if (!action) {
      action = new AnimationAction(clip);
      this.actions.set(clip.name, action);
    }
    return action;
  }

  // Get existing action by clip name
  getAction(name: string): AnimationAction | undefined {
    return this.actions.get(name);
  }

  // Stop all actions
  stopAllAction() {
    for (const action of this.actions.values()) {
      action.stop();
    }
  }

  // Cross-fade from one action to another
  crossFadeTo(fromName: string, toName: string, duration: number = 0.5) {
    const from = this.actions.get(fromName);
    const to = this.actions.get(toName);
    if (!from || !to) return;

    to.weight = 0;
    to.play();
    
    // Simple cross-fade: ramp weights over time
    const fadeStart = performance.now();
    const fadeInterval = setInterval(() => {
      const elapsed = (performance.now() - fadeStart) / 1000;
      const alpha = Math.min(elapsed / duration, 1);
      
      from.weight = 1 - alpha;
      to.weight = alpha;
      
      if (alpha >= 1) {
        from.stop();
        clearInterval(fadeInterval);
      }
    }, 16);
  }

  // Update all actions and apply to skeleton
  update() {
    if (!this.skeleton) return;

    const now = performance.now() / 1000;
    const delta = now - this.lastTime;
    this.lastTime = now;

    // Accumulate weighted rotations from all playing actions
    const blendedRotations = new Map<string, THREE.Quaternion>();
    let totalWeight = 0;

    for (const action of this.actions.values()) {
      if (!action.isPlaying() || action.weight <= 0) continue;

      action.update(delta);
      const sample = action.sample();

      for (const [boneName, quat] of sample) {
        const existing = blendedRotations.get(boneName);
        if (existing) {
          // Weighted slerp blend
          const totalSoFar = totalWeight + action.weight;
          const alpha = action.weight / totalSoFar;
          existing.slerp(quat, alpha);
        } else {
          blendedRotations.set(boneName, quat.clone());
        }
      }
      totalWeight += action.weight;
    }

    // Apply blended rotations to skeleton bones
    for (const [boneName, quat] of blendedRotations) {
      const boneNode = this.skeleton.bones.get(boneName);
      if (boneNode) {
        boneNode.bone.quaternion.copy(quat);
        boneNode.bone.updateMatrixWorld(true);
      }
    }
  }

  dispose() {
    this.actions.clear();
    this.skeleton = null;
  }
}
