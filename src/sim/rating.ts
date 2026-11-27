import { DECOR, ITEMS, PRODUCTS, itemById, siteDef } from './data/catalog';
import { comfortOf, pictureOf, soundOf } from './screenings';
import { cleanliness } from './maintenance';
import { fairTicket, fairFood } from './guests';
import { clamp } from './rng';
import type { Game } from './game';

/** The Palace Rating, 0 to 999, in the spirit of a park inspector's clipboard. */
export function computeRating(g: Game): void {
  const s = g.s, st = g.site;
  const built = st.auds.filter((a) => a.built);
  const avg = (f: (id: number) => number) => built.reduce((a, x) => a + f(x.id), 0) / Math.max(1, built.length);
  const live = s.guests.length > 5 ? g.avgHappy() : null;
  const dayS = s.satN > 4 ? s.satSum / s.satN : null;
  const prev = s.rating.guests;
  const guests = live !== null && dayS !== null ? live * 0.5 + dayS * 0.5 : live ?? dayS ?? prev;
  const clean = cleanliness(g);
  const tech = avg((i) => pictureOf(g, i) * 0.6 + soundOf(g, i) * 0.4);
  const comfort = avg((i) => comfortOf(g, i)) * 0.7 + Math.min(100, DECOR.lobby[st.decor.lobby]!.beauty + (g.beauty.lobby ?? 0) + DECOR.wc[st.decor.wc]!.beauty * 0.3) * 0.3;
  const fair = avg((i) => fairTicket(g, i));
  const foods = PRODUCTS.filter((p) => st.equipment[p.equip]!.owned && st.products[p.id]!.enabled);
  const fr = foods.length ? foods.reduce((a, p) => a + st.products[p.id]!.price / fairFood(g, p), 0) / foods.length : 1;
  const value = clamp(112 - (st.prices.adult / fair) * 42 - fr * 20, 0, 100);
  const films = new Set(s.contracts.filter((c) => s.day >= c.startDay && s.day <= c.endDay).map((c) => c.filmId)).size;
  const kinds = new Set(st.items.map((i) => itemById(i.type).id)).size;
  const variety = clamp(films * 8 + foods.length * 3.2 + kinds * 1.6 + st.wings.length * 3, 0, 100);
  const raw = (guests * 3.6 + clean * 1.6 + tech * 1.5 + comfort * 1.2 + value * 0.9 + variety * 1.2) / 1000;
  const total = clamp(999 * Math.pow(raw, 1.3), 0, 999);
  const stars = clamp(Math.round((total / 999) * 5 * 2) / 2, 0.5, 5);
  const k = 0.5;
  s.rating = { total: Math.round(s.rating.total + (total - s.rating.total) * k), guests, clean, tech, comfort, value, variety, stars };
  void siteDef; void ITEMS;
}
