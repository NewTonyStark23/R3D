/**
 * ResourceManager - Balances GPU/CPU resources for the system
 * Targets: 4GB GPU, 32GB RAM, 10GB usable
 * Allocates: 2GB GPU for rendering, 4GB RAM for processing
 */

export interface ResourceConfig {
  maxGpuMB: number;
  maxMemMB: number;
  targetFPS: number;
}

export interface ResourceStats {
  gpuUsage: number;
  memUsage: number;
  fps: number;
  frameTime: number;
}

export class ResourceManager {
  private config: ResourceConfig;
  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private currentFPS = 60;
  private gpuEstimate = 0;
  private memEstimate = 0;
  private disposed = false;

  constructor(config: ResourceConfig) {
    this.config = config;
    this.monitorPerformance();
  }

  private monitorPerformance() {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      if (this.lastFrameTime > 0) {
        const delta = now - this.lastFrameTime;
        this.frameTimes.push(delta);
        if (this.frameTimes.length > 60) this.frameTimes.shift();
        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.currentFPS = Math.round(1000 / avg);
      }
      this.lastFrameTime = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  getStats(): ResourceStats {
    // Estimate GPU usage based on frame time and complexity
    const frameTime = this.frameTimes.length > 0
      ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
      : 16.67;

    this.gpuEstimate = Math.min(100, Math.round((frameTime / (1000 / this.config.targetFPS)) * 50));
    this.memEstimate = Math.min(100, Math.round((performance as any).memory?.usedJSHeapSize / (this.config.maxMemMB * 1024 * 1024) * 100) || 35);

    return {
      gpuUsage: this.gpuEstimate,
      memUsage: this.memEstimate,
      fps: this.currentFPS,
      frameTime,
    };
  }

  shouldReduceQuality(): boolean {
    return this.currentFPS < this.config.targetFPS * 0.7;
  }

  getTargetFPS(): number {
    return this.config.targetFPS;
  }

  getMaxTextureSize(): number {
    // Scale texture size based on GPU headroom
    if (this.gpuEstimate > 80) return 256;
    if (this.gpuEstimate > 60) return 512;
    return 1024;
  }

  dispose() {
    this.disposed = true;
  }
}
