"""MakeHuman (CC0, via the Anny package) base mesh + macro morphs -> posed-neutral human in metres, Y up, facing +Z."""
import numpy as np, json, gzip, os, itertools, functools
import anny_path
D=anny_path.DATA
@functools.lru_cache(None)
def base():
    V=[];VT=[];F=[];g=None
    for l in open(f'{D}/3dobjs/base.obj'):
        if l.startswith('v '): V.append([float(t) for t in l.split()[1:4]])
        elif l.startswith('vt '): VT.append([float(t) for t in l.split()[1:3]])
        elif l.startswith('g '): g=l.split()[1]
        elif l.startswith('f '):
            p=[t.split('/') for t in l.split()[1:]]
            F.append((g,[int(t[0])-1 for t in p],[int(t[1])-1 if len(t)>1 and t[1] else 0 for t in p]))
    return np.array(V),np.array(VT),F
@functools.lru_cache(None)
def groups():
    d=json.load(open(f'{D}/mesh_metadata/basemesh_vertex_groups.json'))
    return {k:np.concatenate([np.arange(a,b+1) for a,b in v]) for k,v in d.items()}
@functools.lru_cache(None)
def target(name):
    p=f'{D}/targets/{name}.target.gz'
    if not os.path.exists(p): return None
    idx=[];off=[]
    for l in gzip.open(p,'rt'):
        if l.startswith('#') or not l.strip(): continue
        t=l.split(); idx.append(int(t[0])); off.append([float(x) for x in t[1:4]])
    return np.array(idx,int),np.array(off,float).reshape(-1,3)
def lerp2(v,stops):
    """stops: [(pos,name)...] -> {name:weight}"""
    out={}
    for (a,na),(b,nb) in zip(stops,stops[1:]):
        if a<=v<=b: t=(v-a)/(b-a); out[na]=out.get(na,0)+1-t; out[nb]=out.get(nb,0)+t; break
    return out
def human(gender=1.0,age=.5,muscle=.5,weight=.5,height=.5,prop=.6,race=None,extra=None):
    race=race or {'caucasian':1}
    V=base()[0].copy()
    G={'female':1-gender,'male':gender}; A=lerp2(age,[(0,'baby'),(.1875,'child'),(.5,'young'),(1,'old')])
    M=lerp2(muscle,[(0,'minmuscle'),(.5,'averagemuscle'),(1,'maxmuscle')]); W=lerp2(weight,[(0,'minweight'),(.5,'averageweight'),(1,'maxweight')])
    H=lerp2(height,[(0,'minheight'),(.5,''),(1,'maxheight')]); P=lerp2(prop,[(0,'uncommonproportions'),(.5,''),(1,'idealproportions')])
    def add(n,w):
        if w<1e-4: return
        t=target('macrodetails/'+n)
        if t is not None: V[t[0]]+=t[1]*w
    for g,a in itertools.product(G,A):
        for r,rw in race.items(): add(f'{r}-{g}-{a}',rw*G[g]*A[a])
        for m,w in itertools.product(M,W):
            k=G[g]*A[a]*M[m]*W[w]; add(f'universal-{g}-{a}-{m}-{w}',k)
            for h in H:
                if h: add(f'height/{g}-{a}-{m}-{w}-{h}',k*H[h])
            for p in P:
                if p: add(f'proportions/{g}-{a}-{m}-{w}-{p}',k*P[p])
    for n,w in (extra or {}).items():
        t=target(n)
        if t is None: print('missing target',n); continue
        V[t[0]]+=t[1]*w
    V*=0.1
    V[:,1]-=V[:13380,1].min()
    return V
BONES=['pelvis','spine_01','spine_02','spine_03','neck_01','head','clavicle_l','upperarm_l','lowerarm_l','hand_l','fingers_l','clavicle_r','upperarm_r','lowerarm_r','hand_r','fingers_r','thigh_l','calf_l','foot_l','ball_l','thigh_r','calf_r','foot_r','ball_r']
PARENT=[-1,0,1,2,3,4,3,6,7,8,9,3,11,12,13,14,0,16,17,18,0,20,21,22]
@functools.lru_cache(None)
def rigdef():
    r=json.load(open(f'{D}/rigs/standard/rig.game_engine.json')); r=r.get('bones') or r
    w=json.load(open(f'{D}/rigs/standard/weights.game_engine.json'))['weights']
    n=len(base()[0]); W=np.zeros((n,len(BONES)))
    for b,lst in w.items():
        side=b[-1]
        if b.startswith(('index','middle','ring','pinky')): t=f'fingers_{side}'
        elif b.startswith('thumb'): t=f'hand_{side}'
        elif b=='Root': t='pelvis'
        else: t=b
        j=BONES.index(t)
        for i,x in lst: W[int(i),j]+=x
    s=W.sum(1); 
    return r,W,s
def joints(V):
    r,_,_=rigdef(); gr=groups()
    def pos(spec):
        if spec['strategy']=='CUBE': return V[gr[spec['cube_name']]].mean(0)
        if spec['strategy']=='VERTEX': return V[spec['vertex_index']]
        if spec['strategy']=='MEAN': return V[spec['vertex_indices']].mean(0)
        raise Exception(spec)
    J={}
    for b in BONES:
        src='index_01'+b[-2:] if b.startswith('fingers') else b
        if b.startswith('fingers'):
            J[b]=(pos(r['middle_01'+b[-2:]]['head']),pos(r['middle_03'+b[-2:]]['tail']))
        else: J[b]=(pos(r[src]['head']),pos(r[src]['tail']))
    return J
