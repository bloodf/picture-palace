import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { Quality } from './quality';

/** Film-style finishing: ambient occlusion, bloom on bulbs and neon, filmic tone curve, a breath of vignette. */
export class Post {
  private composer: EffectComposer;
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, q: Quality) {
    renderer.toneMapping = THREE.NoToneMapping;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(scene, cam));
    if (q.ao) {
      const ao = new N8AOPostPass(scene, cam, innerWidth, innerHeight) as unknown as { configuration: Record<string, number | boolean | THREE.Color> } & import('postprocessing').Pass;
      Object.assign(ao.configuration, { aoRadius: 0.8, distanceFalloff: 0.5, intensity: 1.5, halfRes: false, aoSamples: 16, denoiseSamples: 8, denoiseRadius: 10 });
      this.composer.addPass(ao);
    }
    this.composer.addPass(new EffectPass(cam, new BloomEffect({ luminanceThreshold: 1.55, luminanceSmoothing: 0.5, intensity: 0.55, mipmapBlur: true, radius: 0.68 }), new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), new VignetteEffect({ darkness: 0.42, offset: 0.28 })));
    this.composer.addPass(new EffectPass(cam, new SMAAEffect()));
  }
  setExposure(e: number): void { this.renderer.toneMappingExposure = e; }
  setSize(w: number, h: number): void { this.composer.setSize(w, h, false); }
  render(dt: number): void { this.composer.render(dt); }
}
