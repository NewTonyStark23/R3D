/**
 * DepthEngine - Runs Depth Anything V2 Small in-browser via Transformers.js
 * Uses ONNX Runtime with WebGPU backend for GPU-accelerated inference
 * Model: ~99MB, 25M params - fits in your 4GB GPU easily
 */

import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js for local operation
env.allowLocalModels = false;
env.useBrowserCache = true;

export class DepthEngine {
  private model: any = null;
  private modelLoaded = false;
  private resourceMgr: any;

  constructor(resourceMgr: any) {
    this.resourceMgr = resourceMgr;
  }

  async loadModel(onProgress?: (p: number) => void): Promise<void> {
    if (this.modelLoaded) return;

    try {
      // Use Depth Anything V2 Small - optimized for browser
      // Only 25M params, ~99MB - runs well on 4GB GPU
      onProgress?.(0.1);

      this.model = await pipeline(
        'depth-estimation',
        'onnx-community/depth-anything-v2-small',
        {
          device: 'webgpu', // Use WebGPU for GPU acceleration
          dtype: 'fp32',
          progress_callback: (progress: any) => {
            if (progress.status === 'progress' && progress.total) {
              const p = progress.loaded / progress.total;
              onProgress?.(p);
            }
          },
        }
      );

      this.modelLoaded = true;
      onProgress?.(1);
    } catch (err) {
      // Try WASM fallback
      console.warn('WebGPU not available, trying WASM...');
      try {
        this.model = await pipeline(
          'depth-estimation',
          'onnx-community/depth-anything-v2-small',
          {
            device: 'wasm',
            progress_callback: (progress: any) => {
              if (progress.status === 'progress' && progress.total) {
                onProgress?.(progress.loaded / progress.total);
              }
            },
          }
        );
        this.modelLoaded = true;
        onProgress?.(1);
      } catch (err2) {
        // Model can't be loaded - will use algorithmic fallback
        console.warn('AI model unavailable, using algorithmic depth estimation');
        this.modelLoaded = false;
        onProgress?.(1);
      }
    }
  }

  async estimateDepth(imageFile: File, onProgress?: (p: number) => void): Promise<ImageData> {
    // Convert File to HTMLImageElement
    const img = await this.fileToImage(imageFile);
    onProgress?.(0.1);

    // If AI model is loaded, use it for accurate depth estimation
    if (this.model) {
      return this.estimateDepthAI(img, onProgress);
    }

    // Fallback: algorithmic depth estimation (no model needed)
    // Uses luminance + edge detection + center-bias for pseudo-depth
    return this.estimateDepthFallback(img, onProgress);
  }

  private async estimateDepthAI(img: HTMLImageElement, onProgress?: (p: number) => void): Promise<ImageData> {
    onProgress?.(0.3);

    // Run depth estimation
    const result = await this.model(img);
    onProgress?.(0.8);

    // Extract depth data
    const depthTensor = result.depth || result;
    const width = depthTensor.dims[depthTensor.dims.length - 1];
    const height = depthTensor.dims[depthTensor.dims.length - 2];
    const data = depthTensor.data;

    // Normalize depth to 0-255 range for ImageData
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < minDepth) minDepth = data[i];
      if (data[i] > maxDepth) maxDepth = data[i];
    }

    const range = maxDepth - minDepth || 1;
    const imageData = new ImageData(width, height);

    for (let i = 0; i < data.length; i++) {
      const normalized = ((data[i] - minDepth) / range) * 255;
      const idx = i * 4;
      imageData.data[idx] = normalized;     // R
      imageData.data[idx + 1] = normalized; // G
      imageData.data[idx + 2] = normalized; // B
      imageData.data[idx + 3] = 255;        // A
    }

    onProgress?.(1);
    return imageData;
  }

  private async estimateDepthFallback(img: HTMLImageElement, onProgress?: (p: number) => void): Promise<ImageData> {
    // Algorithmic depth estimation - works without any AI model
    // Combines: luminance, vertical position bias, edge detection, center focus
    const canvas = document.createElement('canvas');
    const maxDim = 512; // Keep it small for performance
    const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    onProgress?.(0.4);

    const { width, height } = canvas;
    const depthData = new Float32Array(width * height);

    // Step 1: Luminance-based depth (brighter = closer typically for subjects)
    const luminance = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = imgData.data[i * 4] / 255;
      const g = imgData.data[i * 4 + 1] / 255;
      const b = imgData.data[i * 4 + 2] / 255;
      luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    onProgress?.(0.5);

    // Step 2: Edge detection (Sobel) for depth discontinuities
    const edges = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gx = -luminance[(y-1)*width+(x-1)] + luminance[(y-1)*width+(x+1)]
                   -2*luminance[y*width+(x-1)] + 2*luminance[y*width+(x+1)]
                   -luminance[(y+1)*width+(x-1)] + luminance[(y+1)*width+(x+1)];
        const gy = -luminance[(y-1)*width+(x-1)] - 2*luminance[(y-1)*width+x] - luminance[(y-1)*width+(x+1)]
                   +luminance[(y+1)*width+(x-1)] + 2*luminance[(y+1)*width+x] + luminance[(y+1)*width+(x+1)];
        edges[idx] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    onProgress?.(0.6);

    // Step 3: Combine cues for depth estimation
    // - Center bias (subjects tend to be in center, closer)
    // - Vertical position (lower = closer in typical portraits)
    // - Saturation (high saturation = foreground subject)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        // Center distance (0 at center, 1 at corners)
        const cx = (x / width - 0.5) * 2;
        const cy = (y / height - 0.5) * 2;
        const centerDist = Math.sqrt(cx * cx + cy * cy) / 1.414;
        const centerBias = 1 - centerDist * 0.4;

        // Vertical bias (bottom = closer)
        const verticalBias = 1 - (y / height) * 0.3;

        // Saturation as foreground indicator
        const r = imgData.data[idx * 4] / 255;
        const g = imgData.data[idx * 4 + 1] / 255;
        const b = imgData.data[idx * 4 + 2] / 255;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
        const satBias = 0.7 + saturation * 0.3;

        // Edge penalty (edges = depth discontinuities)
        const edgePenalty = 1 - edges[idx] * 0.5;

        // Combine all cues
        depthData[idx] = (luminance[idx] * 0.3 + centerBias * 0.3 + verticalBias * 0.2 + satBias * 0.1 + edgePenalty * 0.1);
      }
    }

    onProgress?.(0.8);

    // Step 4: Smooth the depth map (simple box blur)
    const smoothed = new Float32Array(width * height);
    const kernelSize = 3;
    const half = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const ny = y + ky;
            const nx = x + kx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              sum += depthData[ny * width + nx];
              count++;
            }
          }
        }
        smoothed[y * width + x] = sum / count;
      }
    }

    onProgress?.(0.9);

    // Normalize to ImageData
    let minD = Infinity, maxD = -Infinity;
    for (let i = 0; i < smoothed.length; i++) {
      if (smoothed[i] < minD) minD = smoothed[i];
      if (smoothed[i] > maxD) maxD = smoothed[i];
    }
    const range = maxD - minD || 1;

    const imageData = new ImageData(width, height);
    for (let i = 0; i < smoothed.length; i++) {
      const val = ((smoothed[i] - minD) / range) * 255;
      imageData.data[i * 4] = val;
      imageData.data[i * 4 + 1] = val;
      imageData.data[i * 4 + 2] = val;
      imageData.data[i * 4 + 3] = 255;
    }

    onProgress?.(1);
    return imageData;
  }

  private fileToImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  dispose() {
    this.model = null;
    this.modelLoaded = false;
  }
}
