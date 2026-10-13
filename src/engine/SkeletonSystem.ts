/**
 * SkeletonSystem - Creates invisible skeletal rigs for characters
 * This is the "body" that the AI uses to move the character
 * Three.js is used ONLY as a rendering space for these invisible bones
 * The skeleton is a humanoid rig with full range of motion
 */

import * as THREE from 'three';
import { MeshData } from './MeshGenerator';

export interface BoneNode {
  name: string;
  bone: THREE.Bone;
  parent?: string;
  restPosition: THREE.Vector3;
  restRotation: THREE.Quaternion;
  minRotation: THREE.Euler;
  maxRotation: THREE.Euler;
  children: string[];
}

export interface SkeletonData {
  skeleton: THREE.Skeleton;
  bones: Map<string, BoneNode>;
  rootBone: THREE.Bone;
  boneNames: string[];
  bindMatrix: THREE.Matrix4;
}

export class SkeletonSystem {
  private boneHierarchy: Map<string, { parent?: string; children: string[] }> = new Map();

  constructor() {
    this.defineHumanoidHierarchy();
  }

  private defineHumanoidHierarchy() {
    // Define the humanoid bone hierarchy
    // This is the "invisible skeleton" that gives the character a body
    const hierarchy: [string, string | undefined][] = [
      ['root', undefined],
      ['hips', 'root'],
      ['spine', 'hips'],
      ['spine1', 'spine'],
      ['spine2', 'spine1'],
      ['neck', 'spine2'],
      ['head', 'neck'],
      ['jaw', 'head'],
      ['leftShoulder', 'spine2'],
      ['leftArm', 'leftShoulder'],
      ['leftForeArm', 'leftArm'],
      ['leftHand', 'leftForeArm'],
      ['leftThumb1', 'leftHand'],
      ['leftIndex1', 'leftHand'],
      ['rightShoulder', 'spine2'],
      ['rightArm', 'rightShoulder'],
      ['rightForeArm', 'rightArm'],
      ['rightHand', 'rightForeArm'],
      ['rightThumb1', 'rightHand'],
      ['rightIndex1', 'rightHand'],
      ['leftUpLeg', 'hips'],
      ['leftLeg', 'leftUpLeg'],
      ['leftFoot', 'leftLeg'],
      ['leftToe', 'leftFoot'],
      ['rightUpLeg', 'hips'],
      ['rightLeg', 'rightUpLeg'],
      ['rightFoot', 'rightLeg'],
      ['rightToe', 'rightFoot'],
    ];

    for (const [name, parent] of hierarchy) {
      const existing = this.boneHierarchy.get(name) || { children: [] };
      existing.parent = parent || undefined;
      this.boneHierarchy.set(name, existing);

      if (parent) {
        const parentData = this.boneHierarchy.get(parent) || { children: [] };
        parentData.children.push(name);
        this.boneHierarchy.set(parent, parentData);
      }
    }
  }

  createHumanoidRig(meshData: MeshData): SkeletonData {
    const bones = new Map<string, BoneNode>();
    const boneList: THREE.Bone[] = [];
    const boneNames: string[] = [];

    // Calculate bone positions based on mesh bounds
    const bounds = this.calculateBounds(meshData);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const height = bounds.maxY - bounds.minY;
    const width = bounds.maxX - bounds.minX;

    // Define bone positions relative to character proportions
    const bonePositions = this.calculateBonePositions(centerX, centerY, height, width);

    // Create bones recursively
    const createBone = (name: string, parent?: THREE.Bone): THREE.Bone => {
      const bone = new THREE.Bone();
      bone.name = name;

      const pos = bonePositions.get(name) || new THREE.Vector3(0, 0, 0);
      bone.position.copy(pos);

      // Define rotation limits for this bone
      const limits = this.getRotationLimits(name);

      const boneNode: BoneNode = {
        name,
        bone,
        parent: this.boneHierarchy.get(name)?.parent,
        restPosition: pos.clone(),
        restRotation: new THREE.Quaternion(),
        minRotation: limits.min,
        maxRotation: limits.max,
        children: this.boneHierarchy.get(name)?.children || [],
      };

      bones.set(name, boneNode);
      boneList.push(bone);
      boneNames.push(name);

      // Create children
      const children = this.boneHierarchy.get(name)?.children || [];
      for (const childName of children) {
        const childBone = createBone(childName, bone);
        bone.add(childBone);
      }

      return bone;
    };

    const rootBone = createBone('root');

    // Create skeleton
    const skeleton = new THREE.Skeleton(boneList);
    const bindMatrix = new THREE.Matrix4();

    return {
      skeleton,
      bones,
      rootBone,
      boneNames,
      bindMatrix,
    };
  }

  private calculateBounds(meshData: MeshData) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < meshData.vertices.length; i += 3) {
      const x = meshData.vertices[i];
      const y = meshData.vertices[i + 1];
      const z = meshData.vertices[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  private calculateBonePositions(
    centerX: number,
    centerY: number,
    height: number,
    width: number
  ): Map<string, THREE.Vector3> {
    const positions = new Map<string, THREE.Vector3>();
    const h = height;
    const w = width;

    // Map bone positions to character proportions
    // Y goes from bottom (feet) to top (head)
    positions.set('root', new THREE.Vector3(centerX, centerY - h * 0.45, 0.4));
    positions.set('hips', new THREE.Vector3(centerX, centerY - h * 0.35, 0.4));
    positions.set('spine', new THREE.Vector3(centerX, centerY - h * 0.2, 0.45));
    positions.set('spine1', new THREE.Vector3(centerX, centerY - h * 0.05, 0.5));
    positions.set('spine2', new THREE.Vector3(centerX, centerY + h * 0.1, 0.5));
    positions.set('neck', new THREE.Vector3(centerX, centerY + h * 0.2, 0.45));
    positions.set('head', new THREE.Vector3(centerX, centerY + h * 0.32, 0.4));
    positions.set('jaw', new THREE.Vector3(centerX, centerY + h * 0.26, 0.35));

    // Left arm chain
    positions.set('leftShoulder', new THREE.Vector3(centerX - w * 0.15, centerY + h * 0.1, 0.45));
    positions.set('leftArm', new THREE.Vector3(centerX - w * 0.28, centerY + h * 0.08, 0.4));
    positions.set('leftForeArm', new THREE.Vector3(centerX - w * 0.38, centerY - h * 0.05, 0.35));
    positions.set('leftHand', new THREE.Vector3(centerX - w * 0.45, centerY - h * 0.15, 0.3));
    positions.set('leftThumb1', new THREE.Vector3(centerX - w * 0.46, centerY - h * 0.17, 0.28));
    positions.set('leftIndex1', new THREE.Vector3(centerX - w * 0.47, centerY - h * 0.18, 0.28));

    // Right arm chain
    positions.set('rightShoulder', new THREE.Vector3(centerX + w * 0.15, centerY + h * 0.1, 0.45));
    positions.set('rightArm', new THREE.Vector3(centerX + w * 0.28, centerY + h * 0.08, 0.4));
    positions.set('rightForeArm', new THREE.Vector3(centerX + w * 0.38, centerY - h * 0.05, 0.35));
    positions.set('rightHand', new THREE.Vector3(centerX + w * 0.45, centerY - h * 0.15, 0.3));
    positions.set('rightThumb1', new THREE.Vector3(centerX + w * 0.46, centerY - h * 0.17, 0.28));
    positions.set('rightIndex1', new THREE.Vector3(centerX + w * 0.47, centerY - h * 0.18, 0.28));

    // Left leg chain
    positions.set('leftUpLeg', new THREE.Vector3(centerX - w * 0.1, centerY - h * 0.38, 0.4));
    positions.set('leftLeg', new THREE.Vector3(centerX - w * 0.1, centerY - h * 0.55, 0.35));
    positions.set('leftFoot', new THREE.Vector3(centerX - w * 0.1, centerY - h * 0.7, 0.3));
    positions.set('leftToe', new THREE.Vector3(centerX - w * 0.1, centerY - h * 0.73, 0.2));

    // Right leg chain
    positions.set('rightUpLeg', new THREE.Vector3(centerX + w * 0.1, centerY - h * 0.38, 0.4));
    positions.set('rightLeg', new THREE.Vector3(centerX + w * 0.1, centerY - h * 0.55, 0.35));
    positions.set('rightFoot', new THREE.Vector3(centerX + w * 0.1, centerY - h * 0.7, 0.3));
    positions.set('rightToe', new THREE.Vector3(centerX + w * 0.1, centerY - h * 0.73, 0.2));

    return positions;
  }

  private getRotationLimits(boneName: string): { min: THREE.Euler; max: THREE.Euler } {
    // Define range of motion for each joint
    const limits: Record<string, { min: THREE.Euler; max: THREE.Euler }> = {
      root: { min: new THREE.Euler(-0.1, -0.3, -0.1), max: new THREE.Euler(0.1, 0.3, 0.1) },
      hips: { min: new THREE.Euler(-0.3, -0.4, -0.2), max: new THREE.Euler(0.3, 0.4, 0.2) },
      spine: { min: new THREE.Euler(-0.4, -0.3, -0.2), max: new THREE.Euler(0.5, 0.3, 0.2) },
      spine1: { min: new THREE.Euler(-0.3, -0.2, -0.15), max: new THREE.Euler(0.4, 0.2, 0.15) },
      spine2: { min: new THREE.Euler(-0.3, -0.2, -0.15), max: new THREE.Euler(0.3, 0.2, 0.15) },
      neck: { min: new THREE.Euler(-0.5, -0.7, -0.3), max: new THREE.Euler(0.4, 0.7, 0.3) },
      head: { min: new THREE.Euler(-0.5, -0.8, -0.3), max: new THREE.Euler(0.4, 0.8, 0.3) },
      jaw: { min: new THREE.Euler(-0.3, 0, 0), max: new THREE.Euler(0.1, 0, 0) },
      leftShoulder: { min: new THREE.Euler(-0.3, -0.2, -0.3), max: new THREE.Euler(0.2, 0.2, 0.1) },
      leftArm: { min: new THREE.Euler(-2.5, -0.5, -1.5), max: new THREE.Euler(1.0, 0.5, 1.5) },
      leftForeArm: { min: new THREE.Euler(-2.5, 0, -0.2), max: new THREE.Euler(0, 0, 0.2) },
      leftHand: { min: new THREE.Euler(-0.6, -0.4, -0.5), max: new THREE.Euler(0.6, 0.4, 0.5) },
      rightShoulder: { min: new THREE.Euler(-0.3, -0.2, -0.1), max: new THREE.Euler(0.2, 0.2, 0.3) },
      rightArm: { min: new THREE.Euler(-2.5, -0.5, -1.5), max: new THREE.Euler(1.0, 0.5, 1.5) },
      rightForeArm: { min: new THREE.Euler(-2.5, -0.2, 0), max: new THREE.Euler(0, 0.2, 0) },
      rightHand: { min: new THREE.Euler(-0.6, -0.4, -0.5), max: new THREE.Euler(0.6, 0.4, 0.5) },
      leftUpLeg: { min: new THREE.Euler(-1.8, -0.3, -0.3), max: new THREE.Euler(0.5, 0.3, 0.5) },
      leftLeg: { min: new THREE.Euler(0, 0, -0.1), max: new THREE.Euler(2.2, 0, 0.1) },
      leftFoot: { min: new THREE.Euler(-0.5, -0.3, -0.2), max: new THREE.Euler(0.7, 0.3, 0.2) },
      rightUpLeg: { min: new THREE.Euler(-1.8, -0.3, -0.5), max: new THREE.Euler(0.5, 0.3, 0.3) },
      rightLeg: { min: new THREE.Euler(0, 0, -0.1), max: new THREE.Euler(2.2, 0, 0.1) },
      rightFoot: { min: new THREE.Euler(-0.5, -0.3, -0.2), max: new THREE.Euler(0.7, 0.3, 0.2) },
    };

    return limits[boneName] || {
      min: new THREE.Euler(-0.5, -0.5, -0.5),
      max: new THREE.Euler(0.5, 0.5, 0.5),
    };
  }

  // Apply rotation to a bone, clamped to its range of motion
  applyBoneRotation(skeleton: SkeletonData, boneName: string, rotation: THREE.Euler): void {
    const boneNode = skeleton.bones.get(boneName);
    if (!boneNode) return;

    // Clamp rotation to limits
    const clampedX = Math.max(boneNode.minRotation.x, Math.min(boneNode.maxRotation.x, rotation.x));
    const clampedY = Math.max(boneNode.minRotation.y, Math.min(boneNode.maxRotation.y, rotation.y));
    const clampedZ = Math.max(boneNode.minRotation.z, Math.min(boneNode.maxRotation.z, rotation.z));

    boneNode.bone.rotation.set(clampedX, clampedY, clampedZ);
    boneNode.bone.updateMatrixWorld(true);
  }

  // Reset all bones to rest pose
  resetPose(skeleton: SkeletonData): void {
    for (const [, boneNode] of skeleton.bones) {
      boneNode.bone.rotation.set(0, 0, 0);
      boneNode.bone.position.copy(boneNode.restPosition);
    }
  }

  dispose() {}
}
