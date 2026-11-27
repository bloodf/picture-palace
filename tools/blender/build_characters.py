import bpy, bmesh, numpy as np, json, sys, os, math, struct
sys.path.insert(0,os.path.dirname(__file__))
import human as H, anny_path
from PIL import Image, ImageDraw, ImageFilter
from scipy.spatial import cKDTree
OUT=os.path.join(os.path.dirname(__file__),'../../public/assets/chars')
S=1024
R_HEAD=(0,0,640,512); R_TF=(640,0,1024,384); R_TB=(640,384,1024,768); R_BF=(0,512,320,1024); R_BB=(320,512,640,1024)
R_HAIR=(640,768,768,1024); R_SHOE=(768,768,896,896); R_EYE=(896,768,1024,896); R_WHITE=(768,896,896,1024); R_LASH=(896,896,1024,1024)
def uvr(R,u,v): # u,v in 0..1 with v up
    x0,y0,x1,y1=R; return np.stack([(x0+u*(x1-x0))/S,1-(y1-v*(y1-y0))/S],-1)
def smoothverts(V,F,it,lam=.5,fixed=None):
    n=len(V); I=[];J=[]
    for f in F:
        for a,b in zip(f,f[1:]+f[:1]): I+= [a,b]; J+=[b,a]
    import scipy.sparse as sp
    A=sp.csr_matrix((np.ones(len(I)),(I,J)),shape=(n,n)); A.data[:]=1; d=np.maximum(np.asarray(A.sum(1)).ravel(),1)
    for _ in range(it):
        L=A@V/d[:,None]; N=V+(L-V)*lam
        if fixed is not None: N[fixed]=V[fixed]
        V=N
    return V
def vnormals(V,F):
    N=np.zeros_like(V)
    for f in F:
        p=V[f]; n=np.cross(p[1]-p[0],p[2]-p[0]); 
        if len(f)==4: n=n+np.cross(p[2]-p[0],p[3]-p[0])
        N[f]+=n
    return N/np.maximum(np.linalg.norm(N,axis=1,keepdims=True),1e-9)
def reindex(V,F):
    ids=sorted({i for f in F for i in f}); m={a:i for i,a in enumerate(ids)}
    return np.array(ids),[[m[i] for i in f] for f in F]
def mkobj(name,V,F,uv=None):
    me=bpy.data.meshes.new(name); me.from_pydata([(p[0],-p[2],p[1]) for p in V],[],F); me.update()
    if uv is not None:
        l=me.uv_layers.new(name='uv'); 
        k=0
        for poly in me.polygons:
            for li in poly.loop_indices: l.data[li].uv=uv[me.loops[li].vertex_index]
    for p in me.polygons: p.use_smooth=True
    o=bpy.data.objects.new(name,me); bpy.context.scene.collection.objects.link(o); return o
def apply_mod(o,fn):
    fn(o); dg=bpy.context.evaluated_depsgraph_get(); me=bpy.data.meshes.new_from_object(o.evaluated_get(dg)); o.modifiers.clear(); o.data=me; return o
def decimate(o,ratio):
    if ratio>=.999: return o
    def f(o): m=o.modifiers.new('t','TRIANGULATE'); m=o.modifiers.new('d','DECIMATE'); m.ratio=ratio; m.use_collapse_triangulate=True
    return apply_mod(o,f)
def arrays(o):
    me=o.data; me.calc_loop_triangles()
    V=np.empty(len(me.vertices)*3); me.vertices.foreach_get('co',V); V=V.reshape(-1,3); V=np.stack([V[:,0],V[:,2],-V[:,1]],1)
    N=np.empty(len(me.vertices)*3); me.vertices.foreach_get('normal',N); N=N.reshape(-1,3); N=np.stack([N[:,0],N[:,2],-N[:,1]],1)
    T=np.array([t.vertices[:] for t in me.loop_triangles]); L=np.array([t.loops[:] for t in me.loop_triangles])
    uv=np.array([l.uv[:] for l in me.uv_layers[0].data]) if me.uv_layers else np.zeros((len(me.loops),2))
    return V,N,T,uv[L]
def bisect(V,F,faces_mask,point,normal,clear_outer=True):
    """cut the faces selected by mask with plane, remove outer side"""
    bm=bmesh.new(); vs=[bm.verts.new(p) for p in V]; bm.verts.ensure_lookup_table()
    fs=[]
    for k,f in enumerate(F):
        try: fs.append((bm.faces.new([vs[i] for i in f]),faces_mask[k]))
        except ValueError: pass
    sel=[f for f,m in fs if m]; geom=sel+list({e for f in sel for e in f.edges})+list({v for f in sel for v in f.verts})
    bmesh.ops.bisect_plane(bm,geom=geom,plane_co=point,plane_no=normal,clear_outer=clear_outer,clear_inner=False)
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    bm.verts.index_update(); V2=np.array([v.co[:] for v in bm.verts]); F2=[[v.index for v in f.verts] for f in bm.faces]; bm.free(); return V2,F2
# ------------------------------------------------------------------ specs
def C(**k): return k
EU={'caucasian':1}; AF={'african':1}; AS={'asian':1}; MX={'caucasian':.5,'african':.5}; LA={'caucasian':.6,'asian':.2,'african':.2}
CHARS=[
 C(id='m_young',g=1,age=.47,mus=.55,wt=.45,ht=.55,race=EU,top='tee',bot='jeans',hair='short',sleeve=.55,skin='#f0c3a0'),
 C(id='m_athl',g=1,age=.5,mus=.7,wt=.5,ht=.45,race=AF,top='hoodie',bot='jeans',hair='buzz',sleeve=1.9,skin='#7a4a32',fit=.022),
 C(id='m_heavy',g=1,age=.62,mus=.45,wt=.85,ht=.5,race=LA,top='polo',bot='chino',hair='short',sleeve=.6,skin='#d9a27a',beard=.8),
 C(id='m_old',g=1,age=.95,mus=.4,wt=.55,ht=.45,race=EU,top='cardigan',bot='slacks',hair='bald',sleeve=1.93,skin='#eec4a8',glasses=1),
 C(id='m_afro',g=1,age=.48,mus=.5,wt=.42,ht=.48,race=AF,top='stripe',bot='jeans',hair='afro',sleeve=.6,skin='#8a5738'),
 C(id='m_asian',g=1,age=.52,mus=.5,wt=.48,ht=.5,race=AS,top='bomber',bot='chino',hair='side',sleeve=1.93,skin='#e8bc92',fit=.018,glasses=1),
 C(id='f_young',g=0,age=.47,mus=.45,wt=.42,ht=.55,race=EU,top='blouse',bot='jeans',hair='long',sleeve=.4,skin='#f3caad'),
 C(id='f_black',g=0,age=.5,mus=.5,wt=.5,ht=.55,race=AF,top='tee',bot='skirt',hair='afro',sleeve=.35,skin='#85533a'),
 C(id='f_asian',g=0,age=.49,mus=.45,wt=.4,ht=.45,race=AS,top='stripe',bot='skirt',hair='bob',sleeve=1.2,skin='#f0c8a2'),
 C(id='f_heavy',g=0,age=.65,mus=.4,wt=.85,ht=.45,race=LA,top='shirt',bot='slacks',hair='bob',sleeve=1.0,skin='#dba882'),
 C(id='f_old',g=0,age=.95,mus=.35,wt=.55,ht=.4,race=EU,top='cardigan',bot='longskirt',hair='bun',sleeve=1.93,skin='#f0cbb2',glasses=1),
 C(id='f_latina',g=0,age=.52,mus=.5,wt=.55,ht=.5,race=LA,top='dress',bot='skirt',hair='long',sleeve=.3,skin='#cf9468'),
 C(id='boy',g=1,age=.27,mus=.5,wt=.5,ht=.5,race=EU,top='tee',bot='shorts',hair='short',sleeve=.6,skin='#f2c8a8'),
 C(id='girl',g=0,age=.26,mus=.5,wt=.5,ht=.5,race=MX,top='dress',bot='skirt',hair='pony',sleeve=.4,skin='#b97f58'),
 C(id='m_teen',g=1,age=.39,mus=.45,wt=.4,ht=.55,race=EU,top='hoodie',bot='jeans',hair='cap',sleeve=1.9,skin='#f0c6a6',fit=.024),
 C(id='f_teen',g=0,age=.4,mus=.45,wt=.42,ht=.5,race=AS,top='hoodie',bot='jeans',hair='pony',sleeve=1.9,skin='#ecc49c',fit=.02),
 C(id='staff_m',g=1,age=.5,mus=.55,wt=.48,ht=.55,race=LA,top='vest',bot='slacks',hair='side',sleeve=1.93,skin='#dfab82'),
 C(id='staff_f',g=0,age=.49,mus=.5,wt=.45,ht=.52,race=EU,top='vest',bot='slacks',hair='pony',sleeve=1.93,skin='#f1c7a6'),
 C(id='mgr_m',g=1,age=.58,mus=.6,wt=.5,ht=.52,race=EU,top='suit',bot='slacks',hair='side',sleeve=1.95,skin='#ecbf9c',fit=.014,beard=.25),
 C(id='mgr_f',g=0,age=.54,mus=.5,wt=.45,ht=.58,race=MX,top='suit',bot='slacks',hair='bob',sleeve=1.95,skin='#b57c57',fit=.012),
]
NEUTRAL=np.array([.93,.78,.69])
def paint_clothes(spec,seed):
    """RGBA atlas layer, alpha=1 -> tinted by the instance colour. Clothes drawn near-white."""
    r=np.random.default_rng(seed); ss=2
    im=Image.new('RGB',(S*ss,S*ss),(232,232,232)); al=Image.new('L',(S*ss,S*ss),255); d=ImageDraw.Draw(im); a=ImageDraw.Draw(al)
    def mk(R,xr,yr):
        def T(x,y): # normalised garment coords
            u=(x-xr[0])/(xr[1]-xr[0]); v=(y-yr[0])/(yr[1]-yr[0]); return ((R[0]+u*(R[2]-R[0]))*ss,(R[3]-v*(R[3]-R[1]))*ss)
        return T
    tf=mk(R_TF,(-3,3),(-.5,1.25)); tb=mk(R_TB,(-3,3),(-.5,1.25)); bf=mk(R_BF,(-2.6,2.6),(0,1.2)); bb=mk(R_BB,(-2.6,2.6),(0,1.2))
    def poly(T,pts,col,alpha=None):
        p=[T(*q) for q in pts]; d.polygon(p,fill=col)
        if alpha is not None: a.polygon(p,fill=alpha)
    def line(T,pts,col,w=2,alpha=None):
        p=[T(*q) for q in pts]; d.line(p,fill=col,width=w*ss,joint='curve')
        if alpha is not None: a.line(p,fill=alpha,width=w*ss)
    def dot(T,x,y,rad,col,alpha=None):
        X,Y=T(x,y); k=rad*ss; d.ellipse([X-k,Y-k,X+k,Y+k],fill=col)
        if alpha is not None: a.ellipse([X-k,Y-k,X+k,Y+k],fill=alpha)
    t=spec['top']; dark=(150,150,150); W=(240,238,232)
    if t=='tee':
        for T in(tf,tb): line(T,[(-.55,1.0),(-.3,.9),(0,.86),(.3,.9),(.55,1.0)],dark,3); line(T,[(-3,-.27),(3,-.27)],dark,1)
        k=seed%4
        if k==0:
            dot(tf,0,.52,26,(250,214,92),0); dot(tf,0,.52,20,(214,70,52),0); poly(tf,[(-.12,.44),(-.12,.6),(.16,.52)],W,0)
        elif k==1:
            for i,c in enumerate([(220,84,58),(242,178,62),(64,150,140)]): line(tf,[(-.75,.62-.09*i),(.75,.62-.09*i)],c,6,0)
        elif k==2:
            poly(tf,[(-.4,.32),(-.4,.7),(.4,.7),(.4,.32)],(40,42,52),0); 
            for i in range(4): poly(tf,[(-.36+.2*i,.63),(-.36+.2*i,.68),(-.26+.2*i,.68),(-.26+.2*i,.63)],W,0); poly(tf,[(-.36+.2*i,.34),(-.36+.2*i,.39),(-.26+.2*i,.39),(-.26+.2*i,.34)],W,0)
    elif t=='stripe':
        for T in(tf,tb):
            for i in range(18): line(T,[(-3,-.4+.1*i),(3,-.4+.1*i)],(244,240,230),5,0)
            line(T,[(-.55,1.0),(0,.86),(.55,1.0)],dark,3)
    elif t in('polo','shirt','blouse'):
        line(tf,[(0,.95),(0,.45 if t=='polo' else -.4)],dark,2)
        for i in range(3 if t=='polo' else 8): dot(tf,.0,.86-.13*i if t!='polo' else .84-.14*i,3,(120,112,100) if t!='blouse' else (235,220,190),0)
        poly(tf,[(0,.84),(-.28,.78),(-.62,1.02),(-.3,1.12)],(250,250,250)); poly(tf,[(0,.84),(.28,.78),(.62,1.02),(.3,1.12)],(250,250,250))
        line(tf,[(0,.84),(-.28,.78),(-.62,1.02)],dark,2); line(tf,[(0,.84),(.28,.78),(.62,1.02)],dark,2)
        if t=='shirt':
            poly(tf,[(.35,.42),(.35,.6),(.8,.6),(.8,.42)],(222,222,222)); line(tf,[(.35,.6),(.8,.6),(.8,.42),(.35,.42),(.35,.6)],dark,1)
            for T in(tf,tb):
                for i in range(26): line(T,[(-3+.24*i,-.5),(-3+.24*i,1.2)],(205,205,210),1)
    elif t=='hoodie':
        poly(tf,[(-.85,-.2),(-.55,.2),(.55,.2),(.85,-.2)],(214,214,214)); line(tf,[(-.85,-.2),(-.55,.2),(.55,.2),(.85,-.2)],dark,2)
        for x in(-.16,.16): line(tf,[(x,.95),(x*1.2,.55)],W,3,0)
        for T in(tf,tb): poly(T,[(-3,-.35),(-3,-.24),(3,-.24),(3,-.35)],(200,200,200)); line(T,[(-3,-.24),(3,-.24)],dark,1)
        poly(tb,[(-.7,1.15),(-.6,.62),(0,.5),(.6,.62),(.7,1.15)],(205,205,205)); line(tb,[(-.6,.68),(0,.5),(.6,.68)],dark,3)
        line(tf,[(-.6,1.1),(-.35,.9),(0,.82),(.35,.9),(.6,1.1)],dark,4)
        if seed%2: poly(tf,[(-.6,.42),(-.6,.6),(.6,.6),(.6,.42)],W,0); line(tf,[(-.45,.51),(.45,.51)],(60,64,80),6,0)
    elif t=='bomber':
        line(tf,[(0,1.0),(0,-.4)],(90,88,84),4,0); line(tf,[(0,1.0),(0,-.4)],(170,166,150),1,0)
        for T in(tf,tb):
            for i in range(5): line(T,[(-3,-.34+.03*i),(3,-.34+.03*i)],(150,150,150),1)
        line(tf,[(-.95,.1),(-.6,.32)],dark,3); line(tf,[(.95,.1),(.6,.32)],dark,3); line(tf,[(-.55,1.02),(0,.9),(.55,1.02)],(150,150,150),6)
    elif t=='cardigan':
        poly(tf,[(-.45,1.15),(0,.28),(.45,1.15)],(238,232,214),0); line(tf,[(-.45,1.15),(0,.28),(.45,1.15)],dark,4); line(tf,[(0,.28),(0,-.4)],dark,3)
        for i in range(5): dot(tf,.06,.2-.13*i,4,(110,84,56),0)
        line(tf,[(0,.9),(0,.4)],(200,194,176),1,0)
        for T in(tf,tb):
            for i in range(60): line(T,[(-3+.1*i,-.5),(-3+.1*i,1.2)],(216,216,216),1)
            poly(T,[(-3,-.36),(-3,-.25),(3,-.25),(3,-.36)],(205,205,205))
    elif t=='dress':
        for T in(tf,tb):
            for _ in range(130): dot(T,r.uniform(-3,3),r.uniform(-.5,1.2),3.2,W,0)
        line(tf,[(-.6,1.0),(0,.76),(.6,1.0)],dark,3); 
        for T in(tf,tb): line(T,[(-2,.02),(2,.02)],dark,5)
    elif t=='vest':
        for T in(tf,tb):
            d.rectangle([T(-3,1.25)[0],T(-3,1.25)[1],T(3,-.5)[0],T(3,-.5)[1]],fill=W); a.rectangle([T(-3,1.25)[0],T(-3,1.25)[1],T(3,-.5)[0],T(3,-.5)[1]],fill=0)
        poly(tf,[(-1.02,-.5),(-1.02,.55),(-.72,1.12),(-.5,1.14),(0,.42),(.5,1.14),(.72,1.12),(1.02,.55),(1.02,-.5)],(226,226,226),255)
        poly(tb,[(-1.02,-.5),(-1.02,.55),(-.72,1.2),(.72,1.2),(1.02,.55),(1.02,-.5)],(226,226,226),255)
        line(tf,[(-.5,1.14),(0,.42),(.5,1.14)],(226,182,84),3,0); line(tf,[(0,.42),(0,-.5)],(140,140,140),2)
        for i in range(4): dot(tf,.07,.32-.16*i,4,(236,190,92),0)
        poly(tf,[(0,.93),(-.3,1.02),(-.3,.84)],(24,22,26),0); poly(tf,[(0,.93),(.3,1.02),(.3,.84)],(24,22,26),0)
        poly(tf,[(.4,.5),(.4,.6),(.82,.6),(.82,.5)],(240,206,120),0); line(tf,[(.46,.55),(.76,.55)],(60,40,20),2,0)
        line(tf,[(-.5,1.14),(-.16,.98)],(200,198,190),2,0); line(tf,[(.5,1.14),(.16,.98)],(200,198,190),2,0)
    elif t=='suit':
        poly(tf,[(-.42,1.15),(0,.2),(.42,1.15)],W,0); poly(tf,[(-.07,.95),(-.13,.42),(0,.26),(.13,.42),(.07,.95)],(128,24,34),0); poly(tf,[(-.1,1.02),(-.06,.93),(.06,.93),(.1,1.02)],(104,18,28),0)
        for s in(-1,1):
            poly(tf,[(s*.42,1.15),(s*.78,.78),(s*.6,.66),(s*.66,.6),(0,.2)],(204,204,204)); line(tf,[(s*.42,1.15),(s*.78,.78),(s*.6,.66),(s*.66,.6),(0,.2)],(120,120,120),2); line(tf,[(s*.42,1.15),(0,.2)],(110,110,110),2); line(tf,[(s*.95,.02),(s*.5,-.01)],dark,3)
        line(tf,[(0,.2),(.04,-.5)],(130,130,130),2); dot(tf,.02,.1,4,(60,56,52),0); dot(tf,.02,-.06,4,(60,56,52),0); poly(tf,[(.5,.6),(.5,.66),(.78,.68),(.78,.6)],W,0); line(tb,[(0,.9),(0,-.5)],(196,196,196),1)
    b=spec['bot']
    if b in('jeans','chino','slacks','shorts'):
        for T in(bf,bb):
            for s in(-1,1): line(T,[(s*2.0,1.0),(s*2.1,.0)],(176,176,176),2)
            poly(T,[(-2.6,1.06),(-2.6,1.0),(2.6,1.0),(2.6,1.06)],(196,196,196)); 
        line(bf,[(0,1.0),(0,.84)],(150,150,150),2)
        for s in(-1,1): line(bf,[(s*.7,1.0),(s*1.5,.9),(s*1.9,.88)],(150,150,150),2); line(bb,[(s*.4,.97),(s*1.3,.97),(s*1.3,.85),(s*.85,.82),(s*.4,.85),(s*.4,.97)],(160,160,160),2)
        poly(bf,[(-2.6,1.055),(-2.6,1.01),(2.6,1.01),(2.6,1.055)],(46,32,24),0); poly(bb,[(-2.6,1.055),(-2.6,1.01),(2.6,1.01),(2.6,1.055)],(46,32,24),0); poly(bf,[(-.22,1.06),(-.22,1.005),(.22,1.005),(.22,1.06)],(206,178,110),0)
        if b=='slacks':
            for T in(bf,bb):
                for s in(-1,1): line(T,[(s*1.15,.92),(s*1.35,.02)],(250,250,250),2); line(T,[(s*1.2,.92),(s*1.4,.02)],(190,190,190),1)
    elif t=='dress':
        for T in(bf,bb):
            for _ in range(150): dot(T,r.uniform(-2.6,2.6),r.uniform(0,1.2),4,W,0)
    im=im.resize((S,S),Image.LANCZOS); al=al.resize((S,S),Image.LANCZOS)
    c=np.asarray(im).astype(float)/255; A=np.asarray(al).astype(float)/255
    # weave + soft painted folds
    n=r.standard_normal((S,S)); from scipy.ndimage import gaussian_filter as gf
    weave=gf(n,.7); weave/=weave.std(); f1=gf(r.standard_normal((S,S)),(5,14)); f1/=f1.std(); f2=gf(r.standard_normal((S,S)),(22,7)); f2/=f2.std()
    jean=.05 if spec['bot']=='jeans' else .025
    shade=np.ones((S,S)); shade[:, 640:]*=(1+.02*weave+.035*f1)[:,640:]; shade[512:,:640]*=(1+jean*weave+.05*f2)[512:,:640]
    if b=='jeans': # wash
        yy,xx=np.mgrid[0:S,0:S]; 
        for R in(R_BF,R_BB):
            for s in(-1,1):
                cx=R[0]+(R[2]-R[0])*(.5+s*.24); cy=R[3]-(R[3]-R[1])*.58; g=np.exp(-(((xx-cx)/34)**2+((yy-cy)/95)**2)); m=(xx>=R[0])&(xx<R[2])&(yy>=R[1]); shade+=m*g*.22
    return np.clip(c*shade[...,None],0,1),A
def tri_raster(img_shape,UV,attrs):
    """rasterise triangles in uv (0..1, v up) -> list of attr images + mask"""
    h,w=img_shape; out=np.zeros((h,w,attrs.shape[2])); mask=np.zeros((h,w),bool); zb=np.full((h,w),-1.)
    P=np.stack([UV[...,0]*w,(1-UV[...,1])*h],-1)
    for t in range(len(P)):
        p=P[t]; 
        if p[:,0].max()-p[:,0].min()>w*.25: continue
        x0,y0=np.floor(p.min(0)-1).astype(int); x1,y1=np.ceil(p.max(0)+1).astype(int); x0=max(x0,0);y0=max(y0,0);x1=min(x1,w-1);y1=min(y1,h-1)
        if x1<x0 or y1<y0: continue
        xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5); a,b,c=p; den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-9: continue
        l1=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den; l2=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den; l3=1-l1-l2
        m=(l1>-.02)&(l2>-.02)&(l3>-.02)
        if not m.any(): continue
        val=l1[...,None]*attrs[t,0]+l2[...,None]*attrs[t,1]+l3[...,None]*attrs[t,2]
        rad=np.hypot(val[...,2],val[...,4]+.05); m&=rad>=zb[y0:y1+1,x0:x1+1]
        sub=out[y0:y1+1,x0:x1+1]; sub[m]=val[m]; mask[y0:y1+1,x0:x1+1]|=m; z=zb[y0:y1+1,x0:x1+1]; z[m]=rad[m]
    return out,mask
_masks={}
def mhmask(n):
    if n not in _masks: _masks[n]=np.asarray(Image.open(f'{anny_path.DATA}/textures/mpfb_{n}.jpg').convert('L')).astype(float)/255
    return _masks[n]
def sample(m,uv):
    h,w=m.shape; x=np.clip((uv[...,0]*w).astype(int),0,w-1); y=np.clip(((1-uv[...,1])*h).astype(int),0,h-1); return m[y,x]
def build(spec,idx):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'
    rs=np.random.default_rng(100+idx)
    fem=spec['g']==0
    extra={}
    extra['mouth/mouth-angles-up']=.55; extra['expression/units/caucasian/mouth-corner-puller']=.35
    V=H.human(spec['g'],spec['age'],spec['mus'],spec['wt'],spec['ht'],.75,spec['race'],extra)
    baseV,VT,F=H.base(); gr=H.groups(); _,W,_=H.rigdef(); J=H.joints(V)
    Bi={b:i for i,b in enumerate(H.BONES)}
    tree_all=cKDTree(V[:18002]); 
    j=lambda b:J[b][0]
    dom=W.argmax(1)
    armI=[Bi[b] for b in('upperarm_l','lowerarm_l','hand_l','fingers_l','upperarm_r','lowerarm_r','hand_r','fingers_r')]; legI=[Bi[b] for b in('thigh_l','calf_l','foot_l','ball_l','thigh_r','calf_r','foot_r','ball_r')]
    aw=W[:,armI].sum(1); lw=W[:,legI].sum(1)
    height=V[:13380,1].max(); pelY=j('pelvis')[1]; neckY=j('neck_01')[1]; shX=J['clavicle_l'][1][0]; hipX=j('thigh_l')[0]
    parts=[]  # (obj, partid, ratio1, ratio2)
    # ---------------- head + hands (+ forearms, legs if bare)
    body=[(f[1],f[2]) for f in F if f[0]=='body']
    hw=W[:,Bi['head']]+W[:,Bi['neck_01']]
    headc=np.array([0,(j('head')[1]+height)/2,j('head')[2]+.0]); 
    def armparam(P):
        out=np.zeros(len(P))
        for s in('l','r'):
            m=(P[:,0]>0)==(s=='l'); a,b,c=j('upperarm_'+s),j('lowerarm_'+s),j('hand_'+s)
            t1=((P-a)@(b-a))/((b-a)@(b-a)); t2=((P-b)@(c-b))/((c-b)@(c-b)); out[m]=np.where(t2>0,1+t2,np.minimum(t1,1))[m]
        return out
    def legparam(P):
        out=np.zeros(len(P))
        for s in('l','r'):
            m=(P[:,0]>0)==(s=='l'); a,b,c=j('thigh_'+s),j('calf_'+s),j('foot_'+s)
            t1=((P-a)@(b-a))/((b-a)@(b-a)); t2=((P-b)@(c-b))/((c-b)@(c-b)); out[m]=np.where(t2>0,1+t2,np.minimum(t1,1))[m]
        return out
    AP=armparam(V); LP=legparam(V)
    sleeve=spec['sleeve']; bare_leg=spec['bot'] in('skirt','shorts','longskirt')
    legcut={'skirt':.35,'shorts':.6,'longskirt':1.2}.get(spec['bot'],9)
    topy=neckY-.02
    headF=[];handF=[];legF=[]
    for f,t in body:
        c=V[f].mean(0); 
        if aw[f].mean()>.5:
            if AP[f].mean()>sleeve-.12: handF.append((f,t))
        elif lw[f].mean()>.5:
            if bare_leg and LP[f].mean()>legcut-.15 and LP[f].mean()<1.93: legF.append((f,t))
        elif hw[f].mean()>.15 or c[1]>neckY-.06 or (c[1]>neckY-.15 and abs(c[0])<abs(j('upperarm_l')[0])*1.05): headF.append((f,t))
    # head uv : cylindrical, front-weighted
    hy0=neckY-.12; hy1=height+.01
    def headuv(P):
        d=P-headc; az=np.arctan2(d[:,0],d[:,2]-(-.02)); u=.5+.5*np.sign(az)*(np.abs(az)/np.pi)**.72; v=(P[:,1]-hy0)/(hy1-hy0); return uvr(R_HEAD,np.clip(u,0.002,.998),np.clip(v,0.002,.998))
    white=uvr(R_WHITE,np.array([.5]),np.array([.5]))[0]
    ids,FF=reindex(V,[f for f,_ in headF]); hV=V[ids]; 
    o=mkobj('head',hV,FF,headuv(hV)); decimate(o,.30); parts.append((o,0,.17,.05))
    for nm,lst,ratio in(('hand',handF,.14 if sleeve>1.5 else .2),('leg',legF,.3)):
        if lst:
            ids2,FF2=reindex(V,[f for f,_ in lst]); o=mkobj(nm,V[ids2],FF2,np.repeat(uvr(R_LASH,np.array([.75]),np.array([.75])),len(ids2),0)); decimate(o,ratio); parts.append((o,0,.25,.1))
    # ---------------- face texture
    T=[];U2=[]
    for f,t in headF:
        for k in range(1,len(f)-1): T.append([f[0],f[k],f[k+1]]); U2.append([t[0],t[k],t[k+1]])
    T=np.array(T);U2=np.array(U2); tuv=headuv(V)[T]; at=np.concatenate([VT[U2],V[T]],-1)
    ras,mask=tri_raster((S,S),tuv,at); muv=ras[...,:2]; pos=ras[...,2:]
    from scipy.ndimage import gaussian_filter as gf, distance_transform_edt as edt
    idxn=edt(~mask,return_distances=False,return_indices=True); muv=muv[idxn[0],idxn[1]]; pos=pos[idxn[0],idxn[1]]
    hx0,hy_0,hx1,hy_1=R_HEAD
    lips=gf(sample(mhmask('lips'),muv),1.0); ears=gf(sample(mhmask('ears'),muv),3); lids=gf(sample(mhmask('eyelids'),muv),1.5)
    eyeL=V[gr['helper-l-eye']].mean(0); eyeR=V[gr['helper-r-eye']].mean(0); mouth=V[gr['joint-mouth']].mean(0); esc=abs(eyeL[0])/.032
    noise=gf(rs.standard_normal((S,S)),1.2); noise/=noise.std(); blot=gf(rs.standard_normal((S,S)),14); blot/=blot.std()
    col=np.ones((S,S,3))*(1+.012*noise+.022*blot)[...,None]
    def g(c,sx,sy): return np.exp(-(((pos[...,0]-c[0])/sx)**2+((pos[...,1]-c[1])/sy)**2))*(pos[...,2]>headc[2])
    lm=(lips>.5)&mask
    if lm.any(): mouth=np.array([0,pos[lm][:,1].mean(),mouth[2]])
    nosey=(eyeL[1]+mouth[1])/2-.002
    red=.10*(g((eyeL[0]*1.35,nosey),.022*esc,.018*esc)+g((-eyeL[0]*1.35,nosey),.022*esc,.018*esc))+.10*g((0,nosey),.013*esc,.012*esc)+.12*ears
    col*=1-red[...,None]*np.array([.0,.55,.5])
    lipc=np.array([.78,.46,.46]) if not fem else np.array([.80,.36,.38]); col=col*(1-.8*lips[...,None])+lipc*(.8*lips)[...,None]
    lipline=np.exp(-((pos[...,1]-mouth[1])/.0018)**2)*(np.abs(pos[...,0])<.024*esc)*(pos[...,2]>headc[2]+.05); col*=1-.35*gf(lipline,.8)[...,None]
    if fem and spec['age']>.38: col*=1-(lids*.16)[...,None]*np.array([.8,1,.9])
    else: col*=1-(lids*.08)[...,None]
    # sockets, brows
    for e,s in((eyeL,1),(eyeR,-1)):
        col*=1-.16*np.exp(-(((pos[...,0]-e[0])/(.019*esc))**2+((pos[...,1]-e[1]-.001)/(.010*esc))**2))[...,None]*(pos[...,2]>headc[2])[...,None]
        bx=(pos[...,0]-e[0])*s/(.0215*esc); by=pos[...,1]-(e[1]+.0185*esc*(1 if fem else .93)+.0035*esc*(1-(bx-.25)**2)); th=.0026*esc*(1-.45*np.clip(bx,0,1))*(1.0 if fem else 1.45)
        brow=np.clip(1.25-np.abs(by)/th,0,1)*np.clip((1.12-np.abs(bx))*5,0,1)*(pos[...,2]>headc[2])
        st=.75+.25*np.clip(noise,-1,1); bc=np.array([.30,.24,.2]) if spec['age']<.85 else np.array([.72,.7,.68]); k=(gf(brow,.8)*.85*st)[...,None]; k=np.clip(k,0,.9); col=col*(1-k)+bc*k
    bd=spec.get('beard',0.12 if (not fem and spec['age']>.42) else 0)
    if bd:
        jaw=np.clip((mouth[1]+.016-pos[...,1])/.02,0,1)*np.clip((pos[...,1]-(mouth[1]-.075))/.02,0,1)*np.clip((pos[...,2]-(headc[2]+.0))/.03,0,1); must=np.exp(-((pos[...,1]-mouth[1]-.012)/.007)**2)*(np.abs(pos[...,0])<.032)*(pos[...,2]>headc[2]+.04)
        jw=np.clip(gf(np.maximum(jaw,must),2)*(1-lips*1.4),0,1)*(bd if bd<.5 else .8); st=np.clip(.75+.35*noise,.2,1.2); k=np.clip(jw*st,0,.9)[...,None]; col=col*(1-k)+np.array([.33,.27,.24])*k
    if spec['age']>.8:
        def wr(y,x0,x1,w=.0012,amp=.25):
            return amp*np.exp(-((pos[...,1]-y)/w)**2)*((pos[...,0]>x0)&(pos[...,0]<x1))*(pos[...,2]>headc[2]+.03)
        wk=sum(wr(eyeL[1]+.035+.011*i,-.035,.035) for i in range(3))
        for s in(-1,1):
            dx=(pos[...,0]*s-.018-(nosey-pos[...,1])*.42); wk=wk+.3*np.exp(-(dx/.0022)**2)*((pos[...,1]<nosey+.004)&(pos[...,1]>mouth[1]-.012))*(pos[...,2]>headc[2]+.03); wk=wk+wr(eyeL[1]-.017,min(s*.018,s*.044),max(s*.018,s*.044),.0014,.22)
        col*=1-gf(wk,.9)[...,None]*np.array([.8,1,1])
    # simple cavity AO from geometry concavity: eyes/nostril/neck
    col*=(1-.35*np.clip((neckY+.035-pos[...,1])/.09,0,1)*(pos[...,2]>headc[2]-.02)*.5)[...,None]
    clothes,calpha=paint_clothes(spec,idx)
    atlas=clothes.copy(); alpha=calpha.copy()
    sl=(slice(hy_0,hy_1),slice(hx0,hx1)); atlas[sl]=col[sl]*.97; alpha[sl]=1-.55*lips[sl]
    # misc
    def fill(R,c,a=1): atlas[R[1]:R[3],R[0]:R[2]]=c; alpha[R[1]:R[3],R[0]:R[2]]=a
    hs=gf(rs.standard_normal((256,128)),(16,.8)); hs/=hs.std(); hs2=gf(rs.standard_normal((256,128)),(30,4)); hs2/=hs2.std()
    curly=spec['hair'] in('afro','buzz')
    if curly: hs=gf(rs.standard_normal((256,128)),1.6); hs/=hs.std(); hs2=gf(rs.standard_normal((256,128)),5); hs2/=hs2.std()
    fill(R_HAIR,np.repeat(np.clip(.86+.10*hs+.07*hs2,.35,1.1)[...,None],3,2)); fill(R_SHOE,.9); fill(R_WHITE,1,0); fill(R_LASH,.97)
    atlas[R_LASH[1]+64:R_LASH[3],R_LASH[0]:R_LASH[0]+64]=.06; alpha[R_LASH[1]+64:R_LASH[3],R_LASH[0]:R_LASH[0]+64]=0
    yy,xx=np.mgrid[0:128,0:128]; rr=np.hypot(xx-64,yy-64)/64; ang=np.arctan2(yy-64,xx-64)
    iris=[np.array(c) for c in([.28,.42,.5],[.2,.13,.08],[.24,.36,.24],[.3,.19,.1])][(idx*3+1)%4 if 'caucasian' in spec['race'] and len(spec['race'])==1 else 1]
    ey=np.ones((128,128,3))*np.array([.93,.91,.89])*(1-.18*np.clip(rr-.5,0,1))[...,None]; im=(rr<.42); ey[im]=(iris*(.75+.35*np.sin(ang*23)[...,None]*.3+.5*(1-rr/.42)[...,None]*.3))[im]; ey[(rr>.37)&(rr<.43)]*=.45; ey[rr<.19]=.02; hl=(np.hypot(xx-52,yy-50)<8); ey[hl]=1.0
    ey=np.dstack([gf(ey[...,k],.9) for k in range(3)]); fill(R_EYE,ey,0)
    # ---------------- eyes + lashes
    for s,e in(('l',eyeL),('r',eyeR)):
        fs=[f[1] for f in F if f[0]==f'helper-{s}-eye']; ids3,F3=reindex(V,fs); P=V[ids3]; rad=(P[:,0].max()-P[:,0].min())/2; cc=P.mean(0)
        q=(P-cc)/rad; front=q[:,2]; uvp=uvr(R_EYE,np.clip(.5+.5*q[:,0],.02,.98),np.clip(.5+.5*q[:,1],.02,.98)); o=mkobj('eye',P,F3,uvp); parts.append((o,5,.5,0))
        for n in((1,) if fem else ()):
            fs=[f[1] for f in F if f[0]==f'helper-{s}-eyelashes-{n}']; ids3,F3=reindex(V,fs); o=mkobj('lash',V[ids3],F3,np.repeat(uvr(R_LASH,np.array([.25]),np.array([.25])),len(ids3),0)); parts.append((o,5,.4,0))
    # ---------------- garments from tights
    tg=[f[1] for f in F if f[0]=='helper-tights']; tids,TF=reindex(V,tg); P0=V[tids]; tw=W[tids]; taw=tw[:,armI].sum(1); tlw=tw[:,legI].sum(1)
    hem=pelY-.02-.045*(height/1.75) if spec['top'] not in('suit','hoodie','bomber','cardigan') else pelY-.10*(height/1.75)
    if spec['top']=='dress' : hem=pelY+.06
    fit=spec.get('fit',.010)
    def garment(sel,smooth,off,cuts,part,uvf,name,thick=.007,flare=None):
        fs=[f for k,f in enumerate(TF) if sel[k]]; idg,FG=reindex(P0,fs); P=P0[idg].copy(); orig=idg
        bset=np.zeros(len(P),bool); P=smoothverts(P,FG,smooth); N=vnormals(P,FG)
        shrink=np.linalg.norm(P0[idg]-P,axis=1,keepdims=True); d=((P0[idg]-P)*N).sum(1,keepdims=True); P=P+N*(off+np.maximum(d,0)*.6)
        if flare is not None: P=flare(P,N,orig)
        V2,F2=P,FG
        for mk,pt,no in cuts: V2,F2=bisect(V2,F2,mk(V2,F2),pt,no)
        o=mkobj(name,V2,F2)
        def sol(o): m=o.modifiers.new('s','SOLIDIFY'); m.thickness=thick; m.offset=-1; m.use_rim=True; m.use_rim_only=True
        apply_mod(o,sol); me=o.data
        l=me.uv_layers[0] if me.uv_layers else me.uv_layers.new(name='uv'); vv=np.array([v.co[:] for v in me.vertices]); vv=np.stack([vv[:,0],vv[:,2],-vv[:,1]],1); nn=np.array([v.normal[:] for v in me.vertices]); nz=-nn[:,1]
        uvs=uvf(vv)
        for poly in me.polygons:
            fz=np.mean([nz[i] for i in poly.vertices]); w=0 if fz>=0 else 1
            for li in poly.loop_indices: l.data[li].uv=uvs[w][me.loops[li].vertex_index]
            poly.use_smooth=True
        return o
    def topuv(P):
        u=(P[:,0]/shX+3)/6; v=((P[:,1]-pelY)/(neckY-pelY)+.5)/1.75; return uvr(R_TF,np.clip(u,.01,.99),np.clip(v,.01,.99)),uvr(R_TB,np.clip(1-u,.01,.99),np.clip(v,.01,.99))
    def botuv(P):
        u=(P[:,0]/hipX+2.6)/5.2; v=P[:,1]/pelY/1.2; return uvr(R_BF,np.clip(u,.01,.99),np.clip(v,.01,.99)),uvr(R_BB,np.clip(1-u,.01,.99),np.clip(v,.01,.99))
    fc=[P0[f].mean(0) for f in TF]; fa=[taw[f].mean() for f in TF]; fl=[tlw[f].mean() for f in TF]
    apT=armparam(P0); lpT=legparam(P0)
    neckcut=neckY+.022 if spec['top'] in('suit','shirt','vest','polo','hoodie','bomber','cardigan') else neckY+.002
    tsel=[(fa[k]>.5 and apT[f].mean()<sleeve+.25) or (fa[k]<=.5 and c[1]>hem-.1 and c[1]<neckcut+.06) for k,(f,c) in enumerate(zip(TF,fc))]
    cuts=[(lambda V,F:[True]*len(F) if True else 0,(0,hem,0),(0,-1,0))]
    armx=abs(j('upperarm_l')[0])
    cuts=[(lambda V2,F2:[abs(V2[f].mean(0)[0])<armx+.07 and V2[f].mean(0)[1]<pelY+.25 for f in F2],(0,hem,0),(0,-1,0)),
          (lambda V2,F2:[V2[f].mean(0)[1]>neckY-.2 for f in F2],(0,neckcut,j('neck_01')[2]),(0,.93,.37 if spec['top'] not in('hoodie','cardigan') else .2))]
    for s in('l','r'):
        a,b,c=j('upperarm_'+s),j('lowerarm_'+s),j('hand_'+s)
        pt,no=(a+(b-a)*sleeve,(b-a)) if sleeve<1 else (b+(c-b)*(sleeve-1),(c-b)); no=no/np.linalg.norm(no); sg=1 if s=='l' else -1
        lo=max(sleeve-.5,.25)
        cuts.append((lambda V2,F2,sg=sg,lo=lo:[(V2[f].mean(0)[0]*sg>armx+.03) and armparam(V2[f].mean(0)[None])[0]>lo for f in F2],tuple(pt),tuple(no)))
    def topflare(P,N,orig):
        w=taw[orig]; t=apT[orig]
        k=np.clip((t-.2)/.5,0,1)*(w>.5)*(sleeve<1)*.012; P=P+N*k[:,None]
        if spec['top'] in('suit','bomber','hoodie','cardigan','blouse'): 
            m=(w<.5)*np.clip((pelY+.12-P[:,1])/.2,0,1)*.014; P=P+N*m[:,None]
        return P
    o=garment(tsel,7 if not fem else 4,fit+.004,cuts,1,topuv,'top',flare=topflare); parts.append((o,1,.28,.08))
    # bottoms
    if spec['bot'] in('skirt','longskirt'):
        sk=[f[1] for f in F if f[0]=='helper-skirt']; sids,SF=reindex(V,sk); PS=V[sids].copy(); N=vnormals(PS,SF); PS=smoothverts(PS,SF,2)+N*.012
        ln=pelY*.52 if spec['bot']=='skirt' else pelY*.24
        wais=pelY+.085; rel=np.clip((wais-PS[:,1])/(wais-ln),0,1); 
        if spec['bot']=='longskirt': pass
        c0=PS.mean(0); az=np.arctan2(PS[:,0],PS[:,2]); rad=1+rel*(.10+.05*np.cos(az*9)); PS[:,0]*=rad; PS[:,2]=(PS[:,2]-c0[2])*rad+c0[2]
        V2,F2=bisect(PS,SF,[True]*len(SF),(0,ln,0),(0,-1,0)); V2,F2=bisect(V2,F2,[True]*len(F2),(0,wais+.02,0),(0,1,0)); o=mkobj('skirt',V2,F2)
        def sol(o): m=o.modifiers.new('s','SOLIDIFY'); m.thickness=.006; m.use_rim=True; m.use_rim_only=True
        apply_mod(o,sol); me=o.data; l=me.uv_layers.new(name='uv') if not me.uv_layers else me.uv_layers[0]; vv=np.array([v.co[:] for v in me.vertices]); vv=np.stack([vv[:,0],vv[:,2],-vv[:,1]],1); uvs=botuv(vv)
        for poly in me.polygons:
            fz=-poly.normal[1]
            for li in poly.loop_indices: l.data[li].uv=uvs[0 if fz>=0 else 1][me.loops[li].vertex_index]
            poly.use_smooth=True
        parts.append((o,1 if spec['top']=='dress' else 2,.3,.12))
    else:
        ln=spec['bot']=='shorts' and .72 or 1.95; wais=pelY+.075
        bsel=[(fl[k]>.5 and lpT[f].mean()<ln+.2) or (fa[k]<.3 and c[1]<wais+.08 and fl[k]<=.5) for k,(f,c) in enumerate(zip(TF,fc))]
        cuts=[(lambda V2,F2:[V2[f].mean(0)[1]>pelY-.05 for f in F2],(0,wais,0),(0,1,0))]
        for s in('l','r'):
            a,b,c=j('thigh_'+s),j('calf_'+s),j('foot_'+s); pt,no=(a+(b-a)*ln,(b-a)) if ln<1 else (b+(c-b)*(ln-1),c-b); no=no/np.linalg.norm(no); sg=1 if s=='l' else -1
            cuts.append((lambda V2,F2,sg=sg:[V2[f].mean(0)[0]*sg>0 and V2[f].mean(0)[1]<pelY*.75 for f in F2],tuple(pt),tuple(no)))
        def bf(P,N,orig):
            t=lpT[orig]; w=tlw[orig]>.5; k=w*(np.clip((t-.5)/.5,0,1)*.008+np.clip((t-1.2)/.7,0,1)*.016); return P+N*k[:,None]
        o=garment(bsel,3,.006,cuts,2,botuv,'bottom',flare=bf); parts.append((o,2,.28,.1))
    # shoes
    ssel=[tw[f][:,[Bi['foot_l'],Bi['ball_l'],Bi['foot_r'],Bi['ball_r']]].sum(1).mean()>.35 or P0[f].mean(0)[1]<.1 for f in TF]
    fs=[f for k,f in enumerate(TF) if ssel[k]]; idg,FG=reindex(P0,fs); P=smoothverts(P0[idg].copy(),FG,2); N=vnormals(P,FG); P=P+N*.011; P[:,1]=np.where(P[:,1]<.028,np.maximum(P[:,1]-.012,0),P[:,1])
    o=mkobj('shoe',P,FG,uvr(R_SHOE,np.full(len(P),.5),np.full(len(P),.5))); 
    # sole: colour lower verts white via eye-white? use R_WHITE for sneakers
    me=o.data
    if spec['bot'] in('jeans','shorts','chino'):
        for poly in me.polygons:
            if np.mean([me.vertices[i].co[2] for i in poly.vertices])<.03:
                for li in poly.loop_indices: me.uv_layers[0].data[li].uv=white
    decimate(o,.8); parts.append((o,3,.3,.12))
    # ---------------- hair
    top=height; hj=j('head'); hc=np.array([0,eyeL[1]+.035*esc,hj[2]+.01]); hs_=spec['hair']
    def hairline(az): # elevation threshold (rad) by |azimuth| from front
        a=np.abs(az); pts=[(0,.53),(.5,.52),(.9,.38),(1.25,.10),(1.5,-.06),(1.75,-.02),(2.1,-.42),(2.6,-.62),(3.2,-.66)]
        if not fem: pts=[(0,.55),(.45,.57),(.75,.49),(1.0,.26),(1.25,.02),(1.45,-.12),(1.7,.05),(2.1,-.4),(2.6,-.6),(3.2,-.62)]
        return np.interp(a,[p[0] for p in pts],[p[1] for p in pts])
    d=V[:13380]-hc; az=np.arctan2(d[:,0],d[:,2]); el=np.arctan2(d[:,1],np.hypot(d[:,0],d[:,2])); inh=el-hairline(az)+.035*np.sin(az*17+idx)+.025*np.sin(az*41)
    earw=sample(mhmask('ears'),VT[[0]])  # placeholder
    scF=[]
    earmask={}
    for f,t in headF:
        if inh[f].mean()>0 and V[f].mean(0)[1]>neckY+.02 and sample(mhmask('ears'),VT[t]).mean()<.5: scF.append(f)
    def scalp(off_fn,dec,name='hair',smooth=2):
        idh,FH=reindex(V,scF); P=smoothverts(V[idh].copy(),FH,smooth); N=vnormals(P,FH); q=V[idh]-hc; a=np.arctan2(q[:,0],q[:,2]); e=np.arctan2(q[:,1],np.hypot(q[:,0],q[:,2])); edge=np.clip(inh[idh]/.22,0,1)
        P=P+N*(off_fn(P,a,e,edge))[:,None]
        uv=uvr(R_HAIR,(a/np.pi*2.0%1.0)*.96+.02,np.clip((e+.8)/2.4,.02,.98)); o=mkobj(name,P,FH,uv)
        def sol(o): m=o.modifiers.new('s','SOLIDIFY'); m.thickness=.012; m.offset=-1; m.use_rim_only=True
        apply_mod(o,sol); decimate(o,dec); return o
    nzf=lambda P,k,s: .5*np.sin(P[:,0]*k+s)+.5*np.sin(P[:,2]*k*1.3+s*2)+.4*np.sin(P[:,1]*k*.8+s)
    if hs_=='short': o=scalp(lambda P,a,e,ed:.004+.016*ed+.004*nzf(P,90,idx)+.012*ed*np.clip(e-.5,0,1),.4); parts.append((o,4,.25,.1))
    elif hs_=='buzz': o=scalp(lambda P,a,e,ed:.002+.004*ed,.3); parts.append((o,4,.25,.1))
    elif hs_=='side': o=scalp(lambda P,a,e,ed:.004+.014*ed+.022*ed*np.clip(e-.4,0,1)*(.6+.6*np.clip(P[:,0]/.07+.3,0,1))+.003*nzf(P,110,idx),.42); parts.append((o,4,.25,.1))
    elif hs_=='afro': o=scalp(lambda P,a,e,ed:.012+(.05 if fem else .035)*np.sqrt(ed)+.006*nzf(P,70,idx),.5,smooth=5); parts.append((o,4,.25,.1))
    elif hs_=='bald':
        keep=[f for f in scF if el[f].mean()<.45 and abs(az[f].mean())>1.0]; sv=scF[:]; scF[:]=keep; o=scalp(lambda P,a,e,ed:.003+.008*ed+.002*nzf(P,120,1),.4); parts.append((o,4,.3,.12))
    elif hs_=='cap':
        o=scalp(lambda P,a,e,ed:.004+.012*ed+.003*nzf(P,90,idx),.35); parts.append((o,4,.25,.1))
        idh,FH=reindex(V,[f for f in scF if el[f].mean()>.38]); P=smoothverts(V[idh].copy(),FH,8); P+=vnormals(P,FH)*.026; o=mkobj('cap',P,FH,uvr(R_SHOE,np.full(len(P),.5),np.full(len(P),.5))); decimate(o,.4); parts.append((o,6,.3,.12))
        fz=P[:,2].max(); yb=P[P[:,2]>fz-.03][:,1].min()+.004
        bv=[];n=9
        for k in range(n):
            t=(k/(n-1)-.5)*2; bv.append((t*.072,yb+.010-.012*t*t,fz-.035*t*t-.005)); 
        for k in range(n):
            t=(k/(n-1)-.5)*2; bv.append((t*.066,yb-.012-.016*t*t,fz+.075-.045*t*t))
        bfz=[[k,k+1,n+k+1,n+k] for k in range(n-1)]; o=mkobj('brim',np.array(bv),bfz,uvr(R_SHOE,np.full(2*n,.5),np.full(2*n,.5)))
        def sol(o): m=o.modifiers.new('s','SOLIDIFY'); m.thickness=.006
        apply_mod(o,sol); parts.append((o,6,.8,.5))
    if hs_ in('long','bob','pony','bun'):
        o=scalp(lambda P,a,e,ed:.004+.017*ed+.003*nzf(P,80,idx)-.004*np.exp(-(P[:,0]/.006)**2)*(e>.6),.42); parts.append((o,4,.25,.1))
    if hs_ in('long','bob'):
        # back curtain: swept sheet around head from ear to ear, falling with thickness
        L=.36*height/1.65 if hs_=='long' else .155*height/1.65; n=26;m=9; bv=[];uvs=[]
        # radius profile from actual scalp silhouette
        sidx=list({i for f in scF for i in f}); SP=V[sidx]-hc; saz=np.arctan2(SP[:,0],SP[:,2]); srad=np.hypot(SP[:,0],SP[:,2])
        y0=hc[1]+.012
        for r_ in range(m):
            t=r_/(m-1)
            for k in range(n):
                a=(k/(n-1)-.5)*2*(1.86-.34*t); A=np.pi+a; A=(A+np.pi)%(2*np.pi)-np.pi
                near=np.abs(np.angle(np.exp(1j*(saz-A))))<.28; R=(np.percentile(srad[near],88) if near.sum()>3 else .085)+.014
                y=y0-t*L; shoulder=np.clip((neckY+.03-y)/.08,0,1)
                edge_=np.clip((abs(a)-1.3)/.5,0,1); rr=R*(1+.05*np.sin(t*np.pi))-.012*edge_-.016*(1-t)*(t<.3)+.022*shoulder*(1-edge_)+.004*np.sin(k*2.1+t*3)
                if hs_=='bob': rr+=.012*np.sin(t*np.pi)-.022*max(t-.75,0)*4*.5
                zb=-.012
                bv.append((hc[0]+np.sin(A)*rr,y,hc[2]+zb+np.cos(A)*rr)); uvs.append(((k/(n-1)*2.3)%1*.96+.02,1-t*.95))
        fsx=[[r_*n+k,r_*n+k+1,(r_+1)*n+k+1,(r_+1)*n+k] for r_ in range(m-1) for k in range(n-1)]
        uvs=np.array(uvs); o=mkobj('curtain',np.array(bv),fsx,uvr(R_HAIR,uvs[:,0],uvs[:,1]))
        def sol(o): m=o.modifiers.new('s','SOLIDIFY'); m.thickness=.016; m.offset=-1; 
        apply_mod(o,sol); parts.append((o,4,.3,.12))
    def blob(c,rad,name,stretch=(1,1,1),n1=10,n2=14):
        bv=[];fsx=[];uvs=[]
        for i in range(n1+1):
            for k in range(n2):
                th=np.pi*i/n1; ph=2*np.pi*k/n2; bv.append((c[0]+rad*np.sin(th)*np.cos(ph)*stretch[0],c[1]+rad*np.cos(th)*stretch[1],c[2]+rad*np.sin(th)*np.sin(ph)*stretch[2])); uvs.append((k/n2,1-i/n1))
        for i in range(n1):
            for k in range(n2): fsx.append([i*n2+k,(i+1)*n2+k,(i+1)*n2+(k+1)%n2,i*n2+(k+1)%n2][::-1])
        uvs=np.array(uvs); return mkobj(name,np.array(bv),fsx,uvr(R_HAIR,uvs[:,0]*.96+.02,uvs[:,1]*.96+.02))
    sp=V[list({i for f in scF for i in f})]
    if hs_=='bun': parts.append((blob((0,hc[1]+.065,sp[:,2].min()-.012),.042,'bun'),4,.4,.2))
    if hs_=='pony':
        zb=sp[:,2].min(); pts=[(0,hc[1]+.055,zb-.006),(0,hc[1]+.05,zb-.045),(0,hc[1]-.02,zb-.065),(0,hc[1]-.1,zb-.06),(0,hc[1]-.19,zb-.045)]; rads=[.014,.026,.03,.024,.004]; n=10; bv=[];uvs=[]
        for i,(p,r_) in enumerate(zip(pts,rads)):
            for k in range(n): ph=2*np.pi*k/n; bv.append((p[0]+np.cos(ph)*r_,p[1]+(np.sin(ph)*r_ if i<2 else 0),p[2]+(np.sin(ph)*r_ if i>=2 else 0))); uvs.append((k/n*.96+.02,1-i/5))
        fsx=[[i*n+k,i*n+(k+1)%n,(i+1)*n+(k+1)%n,(i+1)*n+k] for i in range(4) for k in range(n)]; uvs=np.array(uvs); parts.append((mkobj('pony',np.array(bv),fsx,uvr(R_HAIR,uvs[:,0],uvs[:,1])),4,.5,.3))
    if spec.get('glasses'):
        bv=[];fsx=[]
        for e in(eyeL,eyeR):
            b0=len(bv); n=14
            for k in range(n):
                ph=2*np.pi*k/n
                for rr,dz in((.021,0),(.0185,0)): bv.append((e[0]+np.cos(ph)*rr*esc,e[1]-.002+np.sin(ph)*rr*.85*esc,e[2]+.021*esc))
            for k in range(n): a=b0+2*k; b=b0+2*((k+1)%n); fsx.append([a,b,b+1,a+1])
        b0=len(bv); br=[(-.011,.002),(.011,.002),(.011,-.001),(-.011,-.001)]
        for x,y in br: bv.append((x*esc,eyeL[1]+y,eyeL[2]+.024*esc))
        fsx.append([b0,b0+1,b0+2,b0+3])
        for s in(-1,1):
            b0=len(bv); x=s*(eyeL[0]+.02*esc)
            for xx_,yy_,zz in((x,.003,.02),(s*(.075*esc),.003,-.07),(s*(.075*esc),-.001,-.07),(x,-.001,.02)): bv.append((xx_,eyeL[1]+yy_,eyeL[2]+zz*esc))
            fsx.append([b0,b0+1,b0+2,b0+3])
        o=mkobj('glasses',np.array(bv),fsx,np.repeat(uvr(R_LASH,np.array([.25]),np.array([.25])),len(bv),0))
        def sol(o): m=o.modifiers.new('s','SOLIDIFY'); m.thickness=.002
        apply_mod(o,sol); parts.append((o,5,.5,0))
    # ---------------- AO bake per vertex on the joined LOD0
    data=[]
    for o,part,r1,r2 in parts:
        for p in o.data.polygons: p.use_smooth=True
        data.append(dict(o=o,part=part,r=(1,r1,r2,r2*.36)))
    fl_=bpy.data.meshes.new('fl'); 
    sc.cycles.samples=48
    w=bpy.data.worlds.new('w'); sc.world=w
    for dct in data:
        o=dct['o']; me=o.data
        if 'ao' not in me.color_attributes: me.color_attributes.new('ao','BYTE_COLOR','POINT')
        me.color_attributes.active_color=me.color_attributes['ao']
        m=bpy.data.materials.new('m'); me.materials.clear(); me.materials.append(m)
    w.light_settings.distance=.25
    for dct in data:
        o=dct['o']; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
        bpy.ops.object.bake(type='AO',target='VERTEX_COLORS')
    lods=[]
    for L in range(4):
        Ps=[];Ns=[];Us=[];Is=[];Pt=[];Aos=[];nv=0
        for dct in data:
            r=dct['r'][L]
            if r==0: continue
            o=dct['o']; V0,N0,T0,U0=arrays(o); ao0=np.array([c.color[0] for c in o.data.color_attributes['ao'].data])
            if L==0: V1,N1,T1,U1=V0,N0,T0,U0
            else:
                o2=o.copy(); o2.data=o.data.copy(); sc.collection.objects.link(o2); decimate(o2,r); V1,N1,T1,U1=arrays(o2); bpy.data.objects.remove(o2)
            if len(T1)==0: continue
            k=cKDTree(V0); _,nn=k.query(V1); ao=ao0[nn]
            # unify verts by (v,uv)
            key={}; P=[];N=[];U=[];A=[];I=[]
            for t,u in zip(T1,U1):
                for vi,uv in zip(t,u):
                    kk=(int(vi),round(float(uv[0]),4),round(float(uv[1]),4))
                    if kk not in key: key[kk]=len(P); P.append(V1[vi]);N.append(N1[vi]);U.append(uv);A.append(ao[vi])
                    I.append(key[kk])
            Ps+=P;Ns+=N;Us+=U;Aos+=A;Pt+=[dct['part']]*len(P);Is+=[i+nv for i in I];nv+=len(P)
        Ps=np.array(Ps);_,nn=tree_all.query(Ps)
        ww=W[:18002][nn].copy()
        pt=np.array(Pt); hb=Bi['head']
        rigid=(pt==4)|(pt==5)|(pt==6)
        ww[rigid]=0; ww[rigid,hb]=1
        if spec['hair']=='long':
            pass
        if spec['bot'] in('skirt','longskirt'):
            pass
        order=np.argsort(-ww,1)[:,:4]; wt=np.take_along_axis(ww,order,1); wt/=np.maximum(wt.sum(1,keepdims=True),1e-6)
        lods.append(dict(p=Ps.astype('<f4'),n=(np.array(Ns)*127).astype('i1'),u=np.array(Us).astype('<f4'),ao=(np.clip(np.array(Aos),0,1)*255).astype('u1'),part=pt.astype('u1'),bi=order.astype('u1'),bw=np.round(wt*255).astype('u1'),i=np.array(Is).astype('<u2')))
    # atlas out
    img=np.dstack([np.clip(atlas,0,1),np.clip(alpha,0,1)]); Image.fromarray((img[...,:3]*255).astype('u1')).save(f'{OUT}/{spec["id"]}.webp',quality=86); Image.fromarray((img[...,3]*255).astype('u1')).resize((512,512)).save(f'{OUT}/{spec["id"]}_m.webp',quality=80)
    blob_=b''; meta=dict(id=spec['id'],skin=spec['skin'],height=float(height),female=fem,child=spec['age']<.3,old=spec['age']>.8,joints=[[float(x) for x in J[b][0]] for b in H.BONES],tails={b:[float(x) for x in J[b][1]] for b in('head','hand_l','hand_r','fingers_l','fingers_r','foot_l','foot_r','ball_l','ball_r')},lods=[])
    for L in lods:
        e=dict(nv=len(L['p']),ni=len(L['i']),off={})
        for k in('p','u','i','n','ao','part','bi','bw'):
            while len(blob_)%4: blob_+=b'\0'
            e['off'][k]=len(blob_); blob_+=L[k].tobytes()
        meta['lods'].append(e)
    open(f'{OUT}/{spec["id"]}.bin','wb').write(blob_); print(spec['id'],'h=%.2f'%height,[len(l['i'])//3 for l in lods],len(blob_)//1024,'KB',flush=True)
    return meta
if __name__=='__main__':
    only=sys.argv[1:] ; mp=f'{OUT}/chars.json'
    metas={m['id']:m for m in (json.load(open(mp))['chars'] if os.path.exists(mp) else [])}
    for i,s in enumerate(CHARS):
        if only and s['id'] not in only: continue
        metas[s['id']]=build(s,i)
    json.dump(dict(bones=H.BONES,parent=H.PARENT,chars=[metas[s['id']] for s in CHARS if s['id'] in metas]),open(mp,'w'))
