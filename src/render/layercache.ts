import * as THREE from 'three';

/**
 * For software rendering: while the camera rests, the building is drawn once and kept (colour and depth);
 * only people, screens and markers are drawn every frame on top.
 */
export const DYNAMIC_LAYER = 1;
export class LayerCache {
  private a: THREE.WebGLRenderTarget | null = null; private b: THREE.WebGLRenderTarget | null = null;
  private m = new THREE.Matrix4(); private age = 99; private w = 0; private h = 0; dirty = true;
  constructor(private r: THREE.WebGLRenderer) {}
  private make(w: number, h: number): THREE.WebGLRenderTarget { const t = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false, samples: 0 }); t.texture.colorSpace = THREE.SRGBColorSpace; t.texture.minFilter = t.texture.magFilter = THREE.NearestFilter; t.texture.generateMipmaps = false; (t as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true; return t; }
  render(scene: THREE.Scene, cam: THREE.PerspectiveCamera, dt: number, maxAge: number): boolean {
    const s = this.r.getDrawingBufferSize(new THREE.Vector2());
    if (s.x !== this.w || s.y !== this.h || !this.a) { this.a?.dispose(); this.b?.dispose(); this.a = this.make(s.x, s.y); this.b = this.make(s.x, s.y); this.w = s.x; this.h = s.y; this.dirty = true; }
    const e = cam.matrixWorld.elements, f = this.m.elements; let moved = false;
    for (let i = 0; i < 16; i++) if (Math.abs(e[i]! - f[i]!) > 2e-3) { moved = true; break; }
    this.m.copy(cam.matrixWorld); this.age += dt;
    const gl = this.r.getContext() as WebGL2RenderingContext;
    if (moved) { cam.layers.enableAll(); this.r.setRenderTarget(null); this.r.render(scene, cam); this.dirty = true; return false; }
    if (this.dirty || this.age > maxAge) { cam.layers.set(0); this.r.setRenderTarget(this.a); this.r.autoClear = true; this.r.clear(); this.r.render(scene, cam); this.age = 0; this.dirty = false; }
    // make sure both targets exist on the GPU
    this.r.setRenderTarget(this.b);
    const fb = (t: THREE.WebGLRenderTarget) => (this.r.properties.get(t) as { __webglFramebuffer: WebGLFramebuffer }).__webglFramebuffer;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb(this.a!)); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb(this.b!));
    gl.blitFramebuffer(0, 0, s.x, s.y, 0, 0, s.x, s.y, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    this.r.state.bindFramebuffer(gl.FRAMEBUFFER, null); this.r.resetState();
    this.r.setRenderTarget(this.b); this.r.autoClear = false; cam.layers.set(DYNAMIC_LAYER);
    const bg = scene.background; scene.background = null; this.r.render(scene, cam); scene.background = bg; this.r.autoClear = true;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb(this.b!)); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, s.x, s.y, 0, 0, s.x, s.y, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    this.r.resetState(); this.r.setRenderTarget(null);
    cam.layers.enableAll();
    return true;
  }
}
export function dynamic(o: THREE.Object3D): void { o.traverse((x) => x.layers.set(DYNAMIC_LAYER)); }
