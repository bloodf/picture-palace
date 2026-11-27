export type Tier = 'low' | 'medium' | 'high' | 'ultra';
export interface Quality { tier: Tier; pbr: boolean; normals: boolean; env: boolean; post: boolean; ao: boolean; dpr: number; minDpr: number; lod0: number; lod1: number; lod2: number; crowdMax: number; aniso: number; particles: number }
export const TIERS: Record<Tier, Quality> = {
  low: { tier: 'low', pbr: false, normals: false, env: false, post: false, ao: false, dpr: 0.8, minDpr: 0.5, lod0: 1.5, lod1: 3, lod2: 9, crowdMax: 320, aniso: 1, particles: 0.3 },
  medium: { tier: 'medium', pbr: true, normals: false, env: true, post: false, ao: false, dpr: 1, minDpr: 0.7, lod0: 7, lod1: 18, lod2: 46, crowdMax: 420, aniso: 4, particles: 0.7 },
  high: { tier: 'high', pbr: true, normals: true, env: true, post: true, ao: false, dpr: 1.25, minDpr: 0.8, lod0: 11, lod1: 32, lod2: 70, crowdMax: 460, aniso: 8, particles: 1 },
  ultra: { tier: 'ultra', pbr: true, normals: true, env: true, post: true, ao: true, dpr: 2, minDpr: 1, lod0: 16, lod1: 45, lod2: 90, crowdMax: 460, aniso: 16, particles: 1 },
};
export function gpuName(gl: WebGL2RenderingContext): string {
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}
export function detectTier(gl: WebGL2RenderingContext): Tier {
  const n = gpuName(gl).toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(n)) return 'low';
  if (/intel|mali|adreno|apple gpu|iris|uhd/.test(n) && !/arc/.test(n)) return 'medium';
  return /rtx 4|rtx 5|rx 7|rx 9|m3|m4/.test(n) ? 'ultra' : 'high';
}
