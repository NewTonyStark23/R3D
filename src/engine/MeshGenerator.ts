/**
 * MeshGenerator - Custom depth-to-3D mesh generation
 * Does NOT use Three.js modeling tools - builds raw geometry from depth data
 * Creates a displacement mesh that represents the 3D surface of the image
 * This is the core "image to 3D" engine
 */

import * as THREE from 'three';

export interface MeshData {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  texture: THREE.Texture;
  depthData: Float32Array;
  width: number;
  height: number;
  vertices: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export class MeshGenerator {
  private resourceMgr: any;

  constructor(resourceMgr: any) {
    this.resourceMgr = resourceMgr;
  }

  async generateFromDepth(
    depthImage: ImageData,
    imageFile: File,
    onProgress?: (p: number) => void
  ): Promise<MeshData> {
    onProgress?.(0.1);

    const { width, height } = depthImage;

    // Extract depth values as float array (normalized 0-1)
    const depthData = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      depthData[i] = depthImage.data[i * 4] / 255.0;
    }
    onProgress?.(0.3);

    // Generate mesh vertices from depth map
    // Each pixel becomes a vertex displaced by its depth value
    const { vertices, normals, uvs, indices } = this.buildGeometry(depthData, width, height);
    onProgress?.(0.5);

    // Create Three.js geometry from raw data
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();
    onProgress?.(0.7);

    // Create texture from original image
    const texture = await this.createTexture(imageFile);
    onProgress?.(0.8);

    // Create material with the original image texture
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0.1,
    });
    onProgress?.(0.9);

    // Create a back-face for solid appearance
    this.addBackFace(geometry, vertices, normals, uvs, indices, width, height);

    onProgress?.(1);

    return {
      geometry,
      material,
      texture,
      depthData,
      width,
      height,
      vertices,
      normals,
      uvs,
      indices,
    };
  }

  private buildGeometry(
    depthData: Float32Array,
    width: number,
    height: number
  ): {
    vertices: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
  } {
    // Scale factors - optimized for character proportions
    const scaleX = 2.0; // Character width in world units
    const scaleY = scaleX * (height / width); // Maintain aspect ratio
    const depthScale = 1.2; // How much depth displaces vertices (increased for 360° feel)

    const vertexCount = width * height;
    const vertices = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    // Generate vertices
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const depth = depthData[idx];

        // Position: x,y mapped to world space, z from depth
        vertices[idx * 3] = (x / width - 0.5) * scaleX;
        vertices[idx * 3 + 1] = (0.5 - y / height) * scaleY;
        vertices[idx * 3 + 2] = depth * depthScale;

        // UV coordinates
        uvs[idx * 2] = x / width;
        uvs[idx * 2 + 1] = 1.0 - y / height;
      }
    }

    // Compute normals from depth gradient
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        // Sample neighbors for normal calculation
        const left = x > 0 ? depthData[y * width + (x - 1)] : depthData[idx];
        const right = x < width - 1 ? depthData[y * width + (x + 1)] : depthData[idx];
        const up = y > 0 ? depthData[(y - 1) * width + x] : depthData[idx];
        const down = y < height - 1 ? depthData[(y + 1) * width + x] : depthData[idx];

        // Normal from cross product of depth gradients
        const dx = (right - left) * depthScale;
        const dy = (down - up) * depthScale;

        const normal = new THREE.Vector3(-dx, -dy, 1).normalize();
        normals[idx * 3] = normal.x;
        normals[idx * 3 + 1] = normal.y;
        normals[idx * 3 + 2] = normal.z;
      }
    }

    // Generate indices (triangles)
    const indexCount = (width - 1) * (height - 1) * 6;
    const indices = new Uint32Array(indexCount);
    let triIdx = 0;

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const tl = y * width + x;
        const tr = y * width + x + 1;
        const bl = (y + 1) * width + x;
        const br = (y + 1) * width + x + 1;

        // Two triangles per quad
        indices[triIdx++] = tl;
        indices[triIdx++] = bl;
        indices[triIdx++] = tr;

        indices[triIdx++] = tr;
        indices[triIdx++] = bl;
        indices[triIdx++] = br;
      }
    }

    return { vertices, normals, uvs, indices };
  }

  private addBackFace(
    geometry: THREE.BufferGeometry,
    vertices: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    width: number,
    height: number
  ) {
    // Add back vertices (mirrored Z) for solid 360° character
    const offset = vertices.length / 3;
    const backVertices = new Float32Array(vertices.length);
    const backNormals = new Float32Array(normals.length);
    const thickness = 0.15; // Character body thickness

    for (let i = 0; i < vertices.length; i += 3) {
      backVertices[i] = vertices[i];
      backVertices[i + 1] = vertices[i + 1];
      // Create depth variation for more 3D feel
      const depth = vertices[i + 2];
      backVertices[i + 2] = depth - thickness - (1.0 - depth) * 0.1;
      backNormals[i] = -normals[i];
      backNormals[i + 1] = -normals[i + 1];
      backNormals[i + 2] = -normals[i + 2];
    }

    // Merge back face into geometry
    const allVertices = new Float32Array(vertices.length * 2);
    allVertices.set(vertices);
    allVertices.set(backVertices, vertices.length);

    const allNormals = new Float32Array(normals.length * 2);
    allNormals.set(normals);
    allNormals.set(backNormals, normals.length);

    const allUvs = new Float32Array(uvs.length * 2);
    allUvs.set(uvs);
    allUvs.set(uvs, uvs.length);

    // Back face indices (reversed winding)
    const backIndices = new Uint32Array(indices.length);
    for (let i = 0; i < indices.length; i += 3) {
      backIndices[i] = indices[i + 2] + offset;
      backIndices[i + 1] = indices[i + 1] + offset;
      backIndices[i + 2] = indices[i] + offset;
    }

    const allIndices = new Uint32Array(indices.length * 2);
    allIndices.set(indices);
    allIndices.set(backIndices, indices.length);

    geometry.setAttribute('position', new THREE.BufferAttribute(allVertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(allNormals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(allUvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(allIndices, 1));
  }

  private createTexture(file: File): Promise<THREE.Texture> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const texture = new THREE.Texture(img);
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        resolve(texture);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  dispose() {}
}
