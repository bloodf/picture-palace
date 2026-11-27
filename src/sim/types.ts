import type { WingId } from './plan';

export type Genre = 'action' | 'comedy' | 'drama' | 'horror' | 'scifi' | 'romance' | 'animation' | 'thriller' | 'fantasy' | 'documentary' | 'adventure' | 'musical';
export type Certificate = 'G' | 'PG' | 'PG-13' | 'R';
export type ArchetypeId = 'family' | 'teens' | 'couple' | 'cinephile' | 'seniors' | 'solo' | 'friends' | 'influencer' | 'critic';
export type AgeBand = 'child' | 'teen' | 'adult' | 'senior';
export type Emotion = 'delighted' | 'happy' | 'content' | 'neutral' | 'bored' | 'annoyed' | 'angry' | 'sad' | 'scared' | 'laughing' | 'moved' | 'sleepy' | 'disgusted';
export type Temperament = 'jolly' | 'grumpy' | 'anxious' | 'chill' | 'rowdy' | 'curious';
export type StaffRole = 'box' | 'concession' | 'usher' | 'janitor' | 'tech' | 'security';
export type LedgerCat = 'tickets' | 'concessions' | 'food' | 'arcade' | 'vip' | 'other' | 'studio' | 'license' | 'wages' | 'stock' | 'utilities' | 'rent' | 'repairs' | 'build' | 'marketing' | 'fines' | 'loan' | 'events' | 'chain' | 'refunds';

export interface Film {
  id: string; title: string; tagline: string; genre: Genre; cert: Certificate; studio: string; runtime: number;
  quality: number; star: number; budget: number; hype: number; legs: number; art: string; palette: number; releaseDay: number; critic: number | null; wom: number; weeks: number; sequel?: number; repertory?: boolean; gross: number;
}
export interface StudioState { id: string; relation: number }
export interface ContractTerms { fee: number; share: number; minWeeks: number; minShows: number; exclusive: boolean }
export interface Offer { id: number; filmId: string; terms: ContractTerms; patience: number; rounds: number; expires: number; rival: number | null; mood: string; closed?: 'lost' | 'walked' | 'signed' }
export interface Contract { id: number; filmId: string; terms: ContractTerms; startDay: number; endDay: number; showsToday: number; gross: number; paid: number; breaches: number; admissions: number }

export interface ProgramSlot { id: number; filmId: string; start: number }
export interface Screening {
  id: number; aud: number; filmId: string; start: number; filmStart: number; end: number; sold: number; seats: number[]; price: number;
  state: 'upcoming' | 'seating' | 'trailers' | 'playing' | 'ended' | 'cancelled'; delay: number; fault: ProjectorFault | null; faultTime: number; demand: number; enjoy: number; enjoyN: number; revenue: number; refunded: boolean;
}
export type ProjectorFault = 'jam' | 'lamp' | 'focus' | 'audio' | 'power';
export interface AudState {
  id: number; built: boolean; seatTier: number; screenTier: number; soundTier: number; projTier: number;
  projCond: number; lampHours: number; focus: number; fault: ProjectorFault | null;
  seatBroken: number[]; seatDirt: number[]; program: ProgramSlot[];
}
export interface ProductState { price: number; tier: 0 | 1 | 2; stock: number; reorderAt: number; reorderQty: number; auto: boolean; enabled: boolean; soldToday: number; soldTotal: number }
export interface EquipState { owned: boolean; cond: number; broken: boolean }
export interface PlacedItem { id: number; type: string; x: number; z: number; rot: 0 | 1 | 2 | 3; cond: number; fill: number; broken: boolean; users: number[]; poster?: string; income: number }
export interface FixtureState { clean: number; broken: boolean; clogged: boolean; user: number }
export interface Litter { id: number; kind: 'popcorn' | 'cup' | 'bucket' | 'wrapper' | 'spill' | 'vomit' | 'water' | 'graffiti'; x: number; z: number; size: number }

export interface Thought { t: number; code: string; text: string; tone: -2 | -1 | 0 | 1 | 2 }
export type GuestState =
  | 'enter' | 'queueBox' | 'atBox' | 'follow' | 'idle' | 'walk' | 'queueCon' | 'atCon' | 'restroomGo' | 'restroomWait' | 'fixture' | 'sink'
  | 'toSeat' | 'sitting' | 'seated' | 'standing' | 'bench' | 'arcade' | 'table' | 'browse' | 'leave' | 'kiosk' | 'bin' | 'wait' | 'event';
export interface Guest {
  id: number; group: number; leader: boolean; name: string; model: number; tint: number; age: AgeBand; female: boolean; arch: ArchetypeId; temper: Temperament;
  x: number; z: number; y: number; px: number; pz: number; py: number; dir: number; speed: number;
  state: GuestState; anim: number; path: { x: number; z: number }[]; pi: number; goal: string; timer: number; stuck: number; ghost: number;
  hunger: number; thirst: number; bladder: number; energy: number; fun: number;
  happy: number; emotion: Emotion; emoT: number; patience: number; humor: number; tidy: number; thrift: number; rowdy: number; taste: Genre;
  cash: number; spent: number; spentFood: number; ticketPaid: number; carry: number; foodQ: number;
  screening: number; seat: number; queueSt: string; fixtureId: string; itemId: number; seen: boolean; enjoy: number; thoughts: Thought[]; arrive: number; visits: number; phone: boolean; coughT: number; offended: number; special?: string; lastNeedT: number; walkout?: boolean;
}
export interface Group { id: number; members: number[]; leader: number; arch: ArchetypeId; screening: number; tickets: boolean; conDone: boolean; done: boolean; vip: boolean; online: boolean; arcadeDone: boolean }

export interface Staff {
  id: number; name: string; role: StaffRole; model: number; tint: number; female: boolean; skill: number; speed: number; charm: number; honesty: number; wage: number; fair: number; morale: number; energy: number; hired: number; xp: number;
  x: number; z: number; y: number; px: number; pz: number; py: number; dir: number; path: { x: number; z: number }[]; pi: number; state: 'idle' | 'walk' | 'work' | 'station' | 'break' | 'strike' | 'off'; anim: number; station: string; job: number; timer: number; served: number; cleaned: number; fixed: number; area: string; training: number; carry: number; speed0?: number; cellT?: number; stuck: number;
}
export interface Candidate { id: number; name: string; role: StaffRole; model: number; female: boolean; skill: number; speed: number; charm: number; honesty: number; wage: number; trait: string }

export type JobKind = 'projector' | 'seat' | 'toilet' | 'equipment' | 'item' | 'spill' | 'litter' | 'bin' | 'fixtureClean' | 'audClean' | 'fire' | 'leak' | 'pirate' | 'rowdy' | 'faint' | 'lostchild' | 'rat' | 'graffiti' | 'power' | 'supplies' | 'heckler' | 'lostitem' | 'bat';
export interface Job { id: number; kind: JobKind; role: StaffRole | 'any'; title: string; x: number; z: number; y: number; severity: number; created: number; need: number; progress: number; assignee: number; ref: string; player: boolean; ttl?: number }

export interface EventInstance { id: number; def: string; t: number; day: number; vars: Record<string, string | number>; title: string; body: string; art: string; choices: { label: string; hint: string; cost: number }[]; expires: number }
export interface NewsItem { id: number; day: number; t: number; kind: 'info' | 'good' | 'bad' | 'money' | 'event' | 'review' | 'film' | 'staff'; text: string; x?: number; z?: number }
export interface Review { id: number; day: number; stars: number; text: string; name: string; film: string; arch: ArchetypeId; source: 'guest' | 'critic' | 'influencer' }
export interface Campaign { id: string; until: number }
export interface Ambience { temp: number; music: string; volume: number; lights: number; scent: number }
export interface Policies { strict: number; outsideFood: boolean; phones: boolean; refunds: boolean; cleaningPace: number; trailers: number }
export interface Prices { adult: number; child: number; senior: number; matinee: number; weekend: number; vip: number }

export interface SiteState {
  id: string; name: string; owned: boolean; wings: WingId[]; auds: AudState[]; prices: Prices; products: Record<string, ProductState>; recipe: { salt: number; butter: number; ice: number };
  equipment: Record<string, EquipState>; items: PlacedItem[]; fixtures: Record<string, FixtureState>; supplies: number; staff: Staff[]; candidates: Candidate[]; boxOpen: number; conOpen: number;
  decor: { lobby: number; wc: number; prom: number; facade: number }; amb: Ambience; policy: Policies; campaigns: Campaign[]; litter: Litter[]; dirt: number[]; jobs: Job[];
  reputation: number; loyalty: number; hvac: number; power: boolean; powerOut: number; insured: boolean; manager: { name: string; skill: number; wage: number } | null; dayRev: number; dayCost: number; dayGuests: number; history: { day: number; rev: number; cost: number; guests: number; sat: number }[];
  security: number; heat: number;
}
export interface DayReport { day: number; weekday: number; ledger: Partial<Record<LedgerCat, number>>; guests: number; sat: number; rating: number; cash: number; weather: string; turnedAway: number; walkouts: number; best: string; headline: string; reviews: number; stars: number }

export interface Rating { total: number; guests: number; clean: number; tech: number; comfort: number; value: number; variety: number; stars: number }

export interface GameState {
  v: number; seed: number; rng: [number, number, number, number]; name: string; manager: string; avatar: 'mgr_m' | 'mgr_f'; difficulty: 'matinee' | 'feature' | 'directors';
  day: number; minute: number; phase: 'prep' | 'open' | 'closing' | 'report'; speed: number; weather: 'clear' | 'cloudy' | 'rain' | 'snow' | 'heat' | 'storm'; weatherNext: string;
  cash: number; loan: number; loanRate: number; creditLimit: number; today: Partial<Record<LedgerCat, number>>; reports: DayReport[]; insolvent: number;
  films: Film[]; studios: StudioState[]; offers: Offer[]; contracts: Contract[]; nextFilm: number;
  site: SiteState; others: SiteState[];
  screenings: Screening[]; guests: Guest[]; groups: Group[]; queues: Record<string, number[]>;
  rating: Rating; ratingHist: { day: number; v: number; s: number }[]; reviews: Review[]; news: NewsItem[]; thoughtLog: { code: string; text: string; tone: number; n: number; t: number }[];
  events: EventInstance[]; eventCool: Record<string, number>; eventLog: { day: number; title: string; outcome: string }[]; effects: { id: string; until: number; v: number }[]; flags: Record<string, number>;
  chapter: number; done: string[]; stats: Record<string, number>; turnedAway: number; walkouts: number; guestsToday: number; satSum: number; satN: number; ids: number; gameOver: string | null; tutorial: number;
}
