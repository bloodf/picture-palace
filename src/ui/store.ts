import { create } from 'zustand';
import { Game, type Result } from '../sim/game';
import type { NewGameOptions } from '../sim/state';
import type { Engine, Prompt, Selection } from '../render/engine';
import type { Job } from '../sim/types';
import { audio } from '../audio/audio';

export type PanelId = 'films' | 'programme' | 'boxoffice' | 'concessions' | 'staff' | 'upkeep' | 'screens' | 'guests' | 'build' | 'desk' | 'promote' | 'ledger' | 'city';
export interface Toast { id: number; text: string; bad: boolean }
export interface UiState {
  phase: 'loading' | 'title' | 'play'; progress: number; loadWhat: string; error: string; v: number;
  panel: PanelId | null; sel: Selection; prompt: Prompt | null; mode: 'manager' | 'walk'; toasts: Toast[]; paused: boolean; menu: null | 'pause' | 'new' | 'load' | 'settings' | 'help'; outcome: { title: string; text: string } | null; minigame: Job | null; building: string | null; overlay: 'none' | 'mood' | 'dirt' | 'crowd'; moods: boolean; wingFocus: string | null; objectivesOpen: boolean; wireOpen: boolean; coach: number; celebrate: { title: string; reward: number } | null;
  set: (p: Partial<UiState>) => void;
}
export const useUi = create<UiState>((set) => ({
  phase: 'loading', progress: 0, loadWhat: '', error: '', v: 0, panel: null, sel: null, prompt: null, mode: 'manager', toasts: [], paused: false, menu: null, outcome: null, minigame: null, building: null, overlay: 'none', moods: false, wingFocus: null, objectivesOpen: true, wireOpen: true, coach: -1, celebrate: null,
  set: (p) => set(p),
}));
export const ui = () => useUi.getState();

class Session {
  game: Game = new Game(undefined, { seed: 20260 });
  engine: Engine | null = null;
  started = false;
  slot = 1;
  private unsub: (() => void) | null = null;
  private toastId = 1;
  bind(g: Game): void {
    this.unsub?.();
    this.game = g;
    this.unsub = g.on((e) => {
      if (e.type === 'dayEnd') { ui().set({ panel: null, sel: null, menu: null, minigame: null, building: null }); this.engine?.setMode('manager'); this.autosave(); }
      else if (e.type === 'objective') { ui().set({ celebrate: { title: e.title, reward: e.reward } }); audio.play('fanfare', 0.8); setTimeout(() => ui().set({ celebrate: null }), 5200); }
      else if (e.type === 'event') audio.play('event');
      else if (e.type === 'news' && e.item.kind === 'bad') audio.play('bad', 0.5);
    });
    this.engine?.bindGame();
    this.bump();
  }
  newGame(o: NewGameOptions): void { const seed = Number(new URLSearchParams(location.search).get('seed')); this.bind(new Game(undefined, seed ? { seed, ...o } : o)); this.begin(0); }
  begin(coach: number): void { this.started = true; ui().set({ phase: 'play', menu: null, panel: null, sel: null, paused: false, mode: 'manager', coach, outcome: null }); this.engine?.setMode('manager'); this.engine?.leaveMenu(); this.syncPause(); this.bump(); }
  toTitle(): void { this.started = false; ui().set({ phase: 'title', panel: null, sel: null, menu: null, coach: -1 }); this.engine?.enterMenu(); }
  bump(): void { ui().set({ v: ui().v + 1 }); }
  toast(text: string, bad = false): void { if (!text) return; const id = this.toastId++; ui().set({ toasts: [...ui().toasts.slice(-3), { id, text, bad }] }); setTimeout(() => ui().set({ toasts: ui().toasts.filter((t) => t.id !== id) }), 3600); }
  /** Run a command, report failures, refresh the interface. */
  act(r: Result | void, snd = 'click'): boolean { const good = !r || r.ok; if (r && !r.ok) { this.toast(r.msg, true); audio.play('bad', 0.6); } else { if (r?.msg) this.toast(r.msg); audio.play(snd); } this.bump(); return good; }
  syncPause(): void { const u = ui(); if (this.engine) this.engine.paused = u.phase !== 'play' || u.paused || u.menu !== null || u.coach >= 0 || u.minigame !== null || u.outcome !== null || this.game.s.events.some((e) => e.choices.length > 0) || this.game.s.phase === 'report' || !!this.game.s.gameOver; }
  // ---- saving
  static key(slot: number | 'auto'): string { return `pp.save.${slot}`; }
  serialize(): string { const s = JSON.parse(this.game.serialize()) as Record<string, unknown> & { site: { dirt: number[] }; others: { dirt: number[] }[] }; const pack = (x: { dirt: number[] }) => { x.dirt = x.dirt.map((v) => Math.round(v * 100) / 100); }; pack(s.site); s.others.forEach(pack); return JSON.stringify(s); }
  save(slot: number | 'auto'): boolean {
    try { localStorage.setItem(Session.key(slot), this.serialize()); localStorage.setItem(Session.key(slot) + '.meta', JSON.stringify({ name: this.game.s.site.name, day: this.game.s.day, cash: this.game.s.cash, chapter: this.game.s.chapter, when: Date.now(), rating: this.game.s.rating.total })); return true; }
    catch { this.toast('The browser refused to store the save.', true); return false; }
  }
  autosave(): void { this.save('auto'); }
  meta(slot: number | 'auto'): { name: string; day: number; cash: number; chapter: number; when: number; rating: number } | null { const m = localStorage.getItem(Session.key(slot) + '.meta'); return m && localStorage.getItem(Session.key(slot)) ? JSON.parse(m) : null; }
  load(slot: number | 'auto'): boolean {
    const raw = localStorage.getItem(Session.key(slot));
    if (!raw) return false;
    try { this.bind(Game.load(raw)); this.begin(-1); return true; } catch (e) { this.toast(`That save could not be read: ${(e as Error).message}`, true); return false; }
  }
}
export const session = new Session();
/** Subscribe to the 4 Hz refresh and read the live game. */
export function useGame(): Game { useUi((s) => s.v); return session.game; }
export const act = (r: Result | void, snd?: string) => session.act(r, snd);
