import bpy, json, os, sys, math, numpy as np, time
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(HERE,'../../public/assets/shell'); os.makedirs(OUT,exist_ok=True)
P=json.load(open(HERE+'/plan.json')); SPP=int(os.environ.get('SPP','96')); SCALE=float(os.environ.get('LMSCALE','1')); ONLY=set(os.environ.get('ROOMS','').split(','))-{''}
T=.15
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'
sc.cycles.max_bounces=6; sc.cycles.diffuse_bounces=5; sc.cycles.use_fast_gi=False
ROOM={r['id']:r for r in P['rooms']}; AUD={a['id']:a for a in P['auds']}
ALB={'floor_lobby':(.62,.55,.46),'floor_runner':(.22,.10,.08),'wall_wains':(.16,.09,.05),'wall_upper':(.36,.10,.09),'ceiling_lobby':(.75,.68,.56),'trim_gold':(.55,.38,.16),'trim_cream':(.72,.64,.52),'trim_wood':(.14,.08,.05),
'floor_prom':(.2,.08,.08),'wall_prom':(.10,.24,.26),'ceiling_prom':(.7,.64,.54),'floor_aud':(.09,.03,.035),'wall_aud':(.17,.05,.05),'wall_aud_dado':(.07,.05,.045),'ceiling_aud':(.05,.045,.05),'screen_wall':(.015,.015,.015),'drape':(.28,.03,.04),
'floor_wc':(.66,.64,.58),'wall_wc':(.72,.7,.66),'wall_wc_band':(.08,.25,.24),'ceiling_tile':(.7,.68,.64),'floor_office':(.42,.28,.16),'wall_office':(.24,.30,.26),'floor_booth':(.3,.3,.29),'wall_booth':(.24,.23,.23),
'floor_food':(.68,.6,.52),'wall_food_low':(.08,.25,.24),'wall_food':(.72,.62,.46),'ceiling_food':(.35,.24,.15),'floor_vip':(.12,.07,.05),'carpet_vip':(.08,.14,.18),'wall_vip':(.07,.2,.22),'floor_arcade':(.05,.05,.1),'wall_arcade':(.07,.06,.14),'ceiling_dark':(.04,.04,.05),
'sidewalk':(.36,.35,.33),'road':(.08,.08,.09),'facade':(.66,.58,.46),'facade_dark':(.10,.14,.15),'brick':(.3,.13,.09),'lamp':(.9,.8,.6),'lamp_cool':(.8,.9,1),'neon_a':(.8,.3,.5),'neon_b':(.2,.8,.9),'metal':(.4,.4,.42),'black':(.02,.02,.02),'step_led':(.9,.6,.3),'mirror':(.6,.6,.6),'seat':(.25,.03,.04),'counter':(.3,.14,.08)}
mats={}
def mat(n):
    if n not in mats:
        m=bpy.data.materials.new(n); m.use_nodes=True; b=m.node_tree.nodes.get('Principled BSDF'); c=ALB.get(n,(.5,.5,.5)); b.inputs['Base Color'].default_value=(*c,1); b.inputs['Roughness'].default_value=1; b.inputs['Specular IOR Level'].default_value=0; mats[n]=m
    return mats[n]
class Room:
    def __init__(s,id): s.id=id; s.charts=[]; s.tv=[]; s.tf=[]; s.tm=[]; s.tu=[]
    # ----- lightmapped planar surface: origin o, unit axes u,v, normal = u x v (three coords); quads (u0,v0,u1,v1,mat)
    def surf(s,o,u,v,quads):
        o,u,v=map(lambda a:np.array(a,float),(o,u,v)); 
        if quads: s.charts.append((o,u,v,quads))
    def floor(s,x0,x1,z0,z1,y,m,holes=()): # up facing; holes [(x0,x1,z0,z1,mat|None)]
        xs=sorted({x0,x1,*[h[0] for h in holes],*[h[1] for h in holes]}); zs=sorted({z0,z1,*[h[2] for h in holes],*[h[3] for h in holes]}); q=[]
        for a,b in zip(xs,xs[1:]):
            for c,d in zip(zs,zs[1:]):
                cx,cz=(a+b)/2,(c+d)/2; mm=m
                for h in holes:
                    if h[0]<cx<h[1] and h[2]<cz<h[3]: mm=h[4]
                if mm and x0<=cx<=x1 and z0<=cz<=z1: q.append((a-x0,z1-d,b-x0,z1-c,mm))
        s.surf((x0,y,z1),(1,0,0),(0,0,-1),q)
    def ceil(s,x0,x1,z0,z1,y,m,holes=()):
        xs=sorted({x0,x1,*[h[0] for h in holes],*[h[1] for h in holes]}); zs=sorted({z0,z1,*[h[2] for h in holes],*[h[3] for h in holes]}); q=[]
        for a,b in zip(xs,xs[1:]):
            for c,d in zip(zs,zs[1:]):
                cx,cz=(a+b)/2,(c+d)/2
                if any(h[0]<cx<h[1] and h[2]<cz<h[3] for h in holes): continue
                q.append((a-x0,c-z0,b-x0,d-z0,m))
        s.surf((x0,y,z0),(1,0,0),(0,0,1),q)
    def wall(s,A,B,y0,y1,bands,ops=()):
        """A->B with the room on the left when looking from A to B seen from above?  normal = u x up"""
        A=np.array(A,float);B=np.array(B,float); L=np.linalg.norm(B-A); d=(B-A)/L; u=np.array([d[0],0,d[1]]); v=np.array([0,1,0])
        ts=sorted({0,L,*[np.clip(o[0],0,L) for o in ops],*[np.clip(o[1],0,L) for o in ops]}); ys=sorted({y0,y1,*[b[0] for b in bands if y0<b[0]<y1],*[np.clip(o[2],y0,y1) for o in ops],*[np.clip(o[3],y0,y1) for o in ops]}); q=[]
        for a,b in zip(ts,ts[1:]):
            for c,e in zip(ys,ys[1:]):
                if b-a<1e-4 or e-c<1e-4: continue
                ct,cy=(a+b)/2,(c+e)/2
                if any(o[0]<ct<o[1] and o[2]<cy<o[3] for o in ops): continue
                m=[bd[1] for bd in bands if cy<bd[0]][0] if any(cy<bd[0] for bd in bands) else bands[-1][1]
                q.append((a,c-y0,b,e-y0,m))
        s.surf((A[0],y0,A[1]),u,v,q)
    # ----- vertex-lit trim
    def quad(s,p,m,uv=None):
        b=len(s.tv); s.tv+= [tuple(x) for x in p]; s.tf.append([b,b+1,b+2,b+3]); s.tm.append(m)
        if uv is None:
            a,b_,c=np.array(p[0]),np.array(p[1]),np.array(p[3]); lu=np.linalg.norm(b_-a); lv=np.linalg.norm(c-a); uv=[(0,0),(lu,0),(lu,lv),(0,lv)]
        s.tu.append(uv)
    def rectg(s,o,u,v,m,step=1.2):
        o,u,v=map(lambda a:np.array(a,float),(o,u,v)); nu=max(1,int(np.ceil(np.linalg.norm(u)/step))); nv=max(1,int(np.ceil(np.linalg.norm(v)/step)))
        for i in range(nu):
            for j in range(nv):
                a=o+u*i/nu+v*j/nv; s.quad([a,a+u/nu,a+u/nu+v/nv,a+v/nv],m)
    def box(s,x0,x1,y0,y1,z0,z1,m,skip='',step=1.2):
        if 'x-' not in skip: s.rectg((x0,y0,z0),(0,0,z1-z0),(0,y1-y0,0),m,step)
        if 'x+' not in skip: s.rectg((x1,y0,z1),(0,0,z0-z1),(0,y1-y0,0),m,step)
        if 'z+' not in skip: s.rectg((x0,y0,z1),(x1-x0,0,0),(0,y1-y0,0),m,step)
        if 'z-' not in skip: s.rectg((x1,y0,z0),(x0-x1,0,0),(0,y1-y0,0),m,step)
        if 'y+' not in skip: s.rectg((x0,y1,z1),(x1-x0,0,0),(0,0,z0-z1),m,step)
        if 'y-' not in skip: s.rectg((x0,y0,z0),(x1-x0,0,0),(0,0,z1-z0),m,step)
    def bar(s,A,B,prof,m,step=1.5):
        """sweep profile [(out,y)...] along wall A->B (room side = left normal n)"""
        A=np.array(A,float);B=np.array(B,float);L=np.linalg.norm(B-A);d=(B-A)/L;n=np.array([-d[1],d[0]]); n=-n if False else n
        k=max(1,int(np.ceil(L/step)))
        for i in range(k):
            a=A+d*L*i/k;b=A+d*L*(i+1)/k
            for (o0,y0),(o1,y1) in zip(prof,prof[1:]):
                s.quad([(a[0]+n[0]*o0,y0,a[1]+n[1]*o0),(b[0]+n[0]*o0,y0,b[1]+n[1]*o0),(b[0]+n[0]*o1,y1,b[1]+n[1]*o1),(a[0]+n[0]*o1,y1,a[1]+n[1]*o1)],m)
    def cyl(s,c,r,y0,y1,m,n=14,cap=True,r2=None):
        r2=r if r2 is None else r2
        for k in range(n):
            a=2*math.pi*k/n;b=2*math.pi*(k+1)/n
            s.quad([(c[0]+r*math.cos(b),y0,c[1]+r*math.sin(b)),(c[0]+r*math.cos(a),y0,c[1]+r*math.sin(a)),(c[0]+r2*math.cos(a),y1,c[1]+r2*math.sin(a)),(c[0]+r2*math.cos(b),y1,c[1]+r2*math.sin(b))],m)
            if cap:
                s.quad([(c[0],y1,c[1]),(c[0]+r2*math.cos(b),y1,c[1]+r2*math.sin(b)),(c[0]+r2*math.cos(a),y1,c[1]+r2*math.sin(a)),(c[0],y1,c[1])],m)
                s.quad([(c[0],y0,c[1]),(c[0]+r*math.cos(a),y0,c[1]+r*math.sin(a)),(c[0]+r*math.cos(b),y0,c[1]+r*math.sin(b)),(c[0],y0,c[1])],m)
# normals: for wall A->B , u=(dx,0,dz), v=up, normal=u x v = (dx,0,dz)x(0,1,0) = (-dz,0,dx). bar's n=(-dz,dx) matches.
# walking a room clockwise seen with +z down: west wall goes (x0,z0)->... pick so normal points inward:
def inner_walls(rect):
    x0,x1,z0,z1=rect['x0']+T,rect['x1']-T,rect['z0']+T,rect['z1']-T
    # n=(-dz,dx): north wall (z0) inward n=(0,+1): d=(1,0)
    return {'N':((x0,z0),(x1,z0)),'E':((x1,z0),(x1,z1)),'S':((x1,z1),(x0,z1)),'W':((x0,z1),(x0,z0))}
def door_ops(rect,side):
    out=[]
    for d in P['doors']:
        if side in 'NS' and d['axis']=='z' and abs(d['at']-rect['z0' if side=='N' else 'z1'])<1e-6 and d['from']>=rect['x0']-.01 and d['to']<=rect['x1']+.01:
            out.append((d['from']-rect['x0']-T,d['to']-rect['x0']-T,d) if side=='N' else (rect['x1']-T-d['to'],rect['x1']-T-d['from'],d))
        if side in 'EW' and d['axis']=='x' and abs(d['at']-rect['x1' if side=='E' else 'x0'])<1e-6 and d['from']>=rect['z0']-.01 and d['to']<=rect['z1']+.01:
            out.append((d['from']-rect['z0']-T,d['to']-rect['z0']-T,d) if side=='E' else (rect['z1']-T-d['to'],rect['z1']-T-d['from'],d))
    return out
def wallgen(R,rect,H,bands,jamb='trim_wood',casing='trim_wood',extra_ops=None,sides='NESW',base='trim_wood',crown=None,y0=0):
    W=inner_walls(rect)
    for sd in sides:
        A,B=W[sd]; dops=door_ops(rect,sd); ops=[(a,b,y0-.01,d['height']) for a,b,d in dops]+list((extra_ops or {}).get(sd,[]))
        R.wall(A,B,y0,H,bands,ops)
        A_=np.array(A);B_=np.array(B);L=np.linalg.norm(B_-A_);d_=(B_-A_)/L; n=np.array([-d_[1],d_[0]])
        def seg(y_limit):
            cuts=[0.0]; 
            for o in sorted(ops):
                if o[2]<y_limit<o[3] or o[2]<.02: cuts+=[o[0],o[1]]
            cuts.append(L); return [(cuts[i],cuts[i+1]) for i in range(0,len(cuts),2) if cuts[i+1]-cuts[i]>.05]
        if base:
            for a,b in seg(.1): R.bar(A_+d_*a,A_+d_*b,[(.0,y0),(.025,y0),(.025,y0+.14),(.012,y0+.17),(0,y0+.17)],base)
        if crown:
            for a,b in [(0,L)]: R.bar(A_+d_*a,A_+d_*b,[(0,H-.34),(.03,H-.34),(.05,H-.26),(.12,H-.2),(.14,H-.12),(.22,H-.05),(.22,H-.001)],crown)
        for a,b,d in dops:
            h=d['height']; pa=A_+d_*a; pb=A_+d_*b; o=-n*T
            # reveals
            R.quad([(pa[0],y0,pa[1]),(pa[0]+o[0],y0,pa[1]+o[1]),(pa[0]+o[0],h,pa[1]+o[1]),(pa[0],h,pa[1])],jamb); R.quad([(pb[0]+o[0],y0,pb[1]+o[1]),(pb[0],y0,pb[1]),(pb[0],h,pb[1]),(pb[0]+o[0],h,pb[1]+o[1])],jamb)
            R.quad([(pa[0]+o[0],h,pa[1]+o[1]),(pb[0]+o[0],h,pb[1]+o[1]),(pb[0],h,pb[1]),(pa[0],h,pa[1])],jamb)
            w_=.16 if d['style'] in('arch','portal') else .09; dep=.05
            def cb(p,q,y_0,y_1):
                c=np.array([p+n*0,q+n*0,p+n*dep,q+n*dep]); x0,x1=c[:,0].min(),c[:,0].max(); z0,z1=c[:,1].min(),c[:,1].max(); R.box(x0,x1,y_0,y_1,z0,z1,casing if d['style']!='portal' else 'trim_gold')
            cb(pa-d_*w_,pa,y0,h+w_); cb(pb,pb+d_*w_,y0,h+w_); cb(pa,pb,h,h+w_)
            if d['style']=='portal':
                cb(pa-d_*(w_+.1),pa-d_*w_,y0,h+.34); cb(pb+d_*w_,pb+d_*(w_+.1),y0,h+.34); cb(pa-d_*w_,pb+d_*w_,h+w_,h+.28)
lights={1:[],2:[],3:[]}
def area(g,loc,size,energy,col=(1,1,1),dir=(0,-1,0),sizey=None,spread=math.pi):
    l=bpy.data.lights.new('l','AREA'); l.shape='RECTANGLE'; l.size=size; l.size_y=sizey or size; l.energy=energy; l.color=col; l.spread=spread
    o=bpy.data.objects.new('L',l); sc.collection.objects.link(o); o.location=(loc[0],-loc[2],loc[1])
    from mathutils import Vector
    o.rotation_euler=Vector((dir[0],-dir[2],dir[1])).to_track_quat('-Z','Y').to_euler(); lights[g].append(o)
def point(g,loc,energy,r=.08):
    l=bpy.data.lights.new('l','POINT'); l.energy=energy; l.shadow_soft_size=r; o=bpy.data.objects.new('L',l); sc.collection.objects.link(o); o.location=(loc[0],-loc[2],loc[1]); lights[g].append(o)
rooms=[]; sconces=[]
def sconce(R,x,y,z,n,energy=9,g=1,style=0):
    """deco fan sconce on a wall with normal n (x,z)"""
    t=np.array([-n[1],n[0]]); c=np.array([x,z])
    for k in range(5):
        w=.05; off=(k-2)*.062; hh=.34-.055*abs(k-2)
        p=c+t*off+np.array(n)*.03; q=p+np.array(n)*(.10-.018*abs(k-2))
        a=p-t*w/2;b=p+t*w/2;cc=q+t*w/2;d=q-t*w/2
        xs=[a[0],b[0],cc[0],d[0]];zs=[a[1],b[1],cc[1],d[1]]; R.box(min(xs),max(xs),y,y+hh,min(zs),max(zs),'lamp' if k%2==0 else 'trim_gold')
    p=c+np.array(n)*.02; xs=[*(p-t*.18),*(p+t*.18+np.array(n)*.12)]; R.box(min(xs[0],xs[2]),max(xs[0],xs[2]),y-.06,y,min(xs[1],xs[3]),max(xs[1],xs[3]),'trim_gold')
    point(g,(x+n[0]*.22,y+.35,z+n[1]*.22),energy,.06); sconces.append([x,y,z,n[0],n[1]])
def pilaster(R,x,z,n,w,y0,y1,m='trim_cream',cap='trim_gold'):
    t=np.array([-n[1],n[0]]);n=np.array(n); c=np.array([x,z])
    def b(hw,dep,ya,yb,mm):
        pts=np.array([c-t*hw,c+t*hw+n*dep]); R.box(pts[:,0].min(),pts[:,0].max(),ya,yb,pts[:,1].min(),pts[:,1].max(),mm,step=.9)
    b(w/2,.10,y0,y0+.3,cap); b(w/2-.03,.07,y0+.3,y1-.5,m)
    for k in range(-2,3): b_=k*w*.17; pts=np.array([c+t*(b_-.022)+n*.07,c+t*(b_+.022)+n*.095]); R.box(pts[:,0].min(),pts[:,0].max(),y0+.45,y1-.62,pts[:,1].min(),pts[:,1].max(),m,step=.9)
    b(w/2+.02,.10,y1-.5,y1-.42,cap); b(w/2-.01,.12,y1-.42,y1-.3,m); b(w/2+.05,.15,y1-.3,y1-.2,cap); b(w/2+.02,.12,y1-.2,y1,m)
# ================================================================= LOBBY
def lobby():
    R=Room('lobby'); r=ROOM['lobby']['rect']; H=5.6; x0,x1,z0,z1=-15+T,15-T,0+T,18-T
    R.floor(x0,x1,z0,z1,0,'floor_lobby',[(-4.6,4.6,5.0,16.6,'floor_runner')])
    rec=(-8,8,4.5,15); R.ceil(x0,x1,z0,z1,H,'ceiling_lobby',[rec]); R.ceil(rec[0],rec[1],rec[2],rec[3],H+.9,'ceiling_lobby')
    for A,B in(((rec[0],rec[2]),(rec[1],rec[2])),((rec[1],rec[2]),(rec[1],rec[3])),((rec[1],rec[3]),(rec[0],rec[3])),((rec[0],rec[3]),(rec[0],rec[2]))):
        R.wall(A,B,H,H+.9,[(H+.9,'trim_cream')]); R.bar(A,B,[(0,H-.08),(.25,H-.08),(.25,H+.12),(.18,H+.12),(.18,H+.02),(0,H+.02)],'trim_gold')
    win=[(15-T-12,15-T-6.6,.7,4.3),(6.6+15-T,12+15-T,.7,4.3)]
    tr=[(15-T-5,15-T-2.5,2.75,4.3),(15-T-1.25,15-T+1.25,2.75,4.3),(15-T+2.5,15-T+5,2.75,4.3)]
    wallgen(R,r,H,[(1.15,'wall_wains'),(H,'wall_upper')],casing='trim_gold',jamb='trim_wood',extra_ops={'S':win+tr},crown='trim_cream')
    for sd,(A,B) in inner_walls(r).items():
        A=np.array(A);B=np.array(B);L=np.linalg.norm(B-A);d=(B-A)/L
        ops=sorted([(a,b) for a,b,_ in door_ops(r,sd)]+([(w[0],w[1]) for w in win] if sd=='S' else [])); c=[0]
        for a,b in ops: c+=[a-.18,b+.18]
        c.append(L)
        for i in range(0,len(c),2):
            if c[i+1]-c[i]>.1: R.bar(A+d*c[i],A+d*c[i+1],[(0,1.13),(.03,1.14),(.045,1.18),(.03,1.22),(0,1.23)],'trim_gold')
    for z in(3.2,): pass
    for x in(-14.2,-7.2,7.2,14.2): pilaster(R,x,z0,(0,1),.7,0,H-.34)
    for z in(1.4,7.2,11.4,15.2): pilaster(R,x0,z,(1,0),.6,0,H-.34) if z!=7.2 or True else 0
    for z in(1.4,4.1,13.9,16.6): pilaster(R,x1,z,(-1,0),.6,0,H-.34)
    for x in(-13.2,-5.8,-1.9,1.9,5.8,13.2): pilaster(R,x,z1,(0,-1),.55,0,H-.34)
    # sunburst above the concession
    for k in range(-9,10):
        a=math.pi/2-k*math.pi/20; L=2.1 if k%2==0 else 1.55; c=np.array([0,3.05]); dirv=np.array([math.cos(a),math.sin(a)]); nrm=np.array([-dirv[1],dirv[0]])
        p=[c+dirv*.75-nrm*.03,c+dirv*.75+nrm*.03,c+dirv*L+nrm*.09,c+dirv*L-nrm*.09]
        R.quad([(q[0],q[1],z0+.06+.02*(k%2)) for q in p][::-1],'trim_gold' if k%2==0 else 'trim_cream')
    for k in range(24):
        a,b=math.pi*k/24,math.pi*(k+1)/24
        for r0,r1,m,zz in((.0,.68,'neon_a',.07),(.68,.76,'trim_gold',.09)): R.quad([(math.cos(a)*r0,3.05+math.sin(a)*r0,z0+zz),(math.cos(a)*r1,3.05+math.sin(a)*r1,z0+zz),(math.cos(b)*r1,3.05+math.sin(b)*r1,z0+zz),(math.cos(b)*r0,3.05+math.sin(b)*r0,z0+zz)],m)
    # chandelier: tiered deco glass drum
    for (rad,ya,yb,m) in((1.5,4.75,5.0,'lamp'),(1.56,5.0,5.06,'trim_gold'),(1.56,4.7,4.75,'trim_gold'),(1.05,4.38,4.66,'lamp'),(1.1,4.33,4.38,'trim_gold'),(.6,4.05,4.29,'lamp'),(.64,4.0,4.05,'trim_gold'),(.05,5.06,6.5,'trim_gold'),(.3,6.4,6.5,'trim_gold')): R.cyl((0,9.75),rad,ya,yb,m,n=28)
    area(1,(0,3.95,9.75),3.0,430); area(1,(0,5.2,9.75),3,240,dir=(0,1,0))
    for x in(-11,-5.5,5.5,11):
        for z in(2.2,16.2): R.cyl((x,z),.16,H-.02,H-.004,'lamp',n=12); area(1,(x,H-.05,z),.3,75)
    for z in(6,9.5,13):
        for x in(-11.5,11.5): R.cyl((x,z),.16,H-.02,H-.004,'lamp',n=12); area(1,(x,H-.05,z),.3,70)
    for A,dx,dz in(((0,H+.15,rec[2]+.12),16,0.1),((0,H+.15,rec[3]-.12),16,.1)): area(1,A,15.5,60,dir=(0,1,0),sizey=.1)
    for A in((rec[0]+.12,H+.15,9.75),(rec[1]-.12,H+.15,9.75)): area(1,A,.1,50,dir=(0,1,0),sizey=10)
    for z in(1.4,11.4,15.2): sconce(R,x0+.11,2.5,z,(1,0),10)
    for z in(1.4,4.1,13.9,16.6): sconce(R,x1-.11,2.5,z,(-1,0),10)
    area(2,(-9.3,2.5,18.1),5.2,330,dir=(0,-.15,-1),sizey=3.5); area(2,(9.3,2.5,18.1),5.2,330,dir=(0,-.15,-1),sizey=3.5); area(2,(0,2.3,18.1),9.5,500,dir=(0,-.12,-1),sizey=4)
    area(3,(0,3.4,.5),4.5,85,dir=(0,-.35,1),sizey=1.0); area(3,(0,1.0,3.45),11.5,40,dir=(0,-.6,1),sizey=.1); area(3,(-11,2.4,13.5),4.5,30,dir=(1,-.4,0),sizey=.3)
    return R
# ================================================================= PROMENADE
def promenade():
    R=Room('promenade'); r=ROOM['promenade']['rect']; H=4.2; x0,x1,z0,z1=-46+T,42-T,-6+T,0-T
    xs=[-46+T]+[x for x in range(-40,42,8)]+[42-T]
    for a,b in zip(xs,xs[1:]): R.floor(a,b,z0,z1,0,'floor_prom'); R.ceil(a,b,z0,z1,H,'ceiling_prom')
    wallgen(R,r,H,[(1.1,'wall_wains'),(H,'wall_prom')],casing='trim_gold',jamb='trim_wood',crown='trim_cream')
    for A,B in inner_walls(r).values():
        A=np.array(A);B=np.array(B);L=np.linalg.norm(B-A);d=(B-A)/L; sd=[k for k,v in inner_walls(r).items() if np.allclose(v[0],A)][0]; c=[0]
        for a,b,_ in sorted(door_ops(r,sd),key=lambda t:t[0]): c+=[a-.3,b+.3]
        c.append(L)
        for i in range(0,len(c),2):
            if c[i+1]-c[i]>.1: R.bar(A+d*c[i],A+d*c[i+1],[(0,1.08),(.03,1.09),(.045,1.13),(.03,1.17),(0,1.18)],'trim_gold')
    for a in P['auds']:
        cx=a['cx']
        for x in(cx-5.0,cx+5.0): pilaster(R,x,z0,(0,1),.5,0,H-.34); sconce(R,x,2.1,z0+.11,(0,1),8)
        # illuminated house number plate above booth door
        R.box(cx-1.3,cx+1.3,2.62,3.55,z0,z0+.10,'trim_gold'); R.box(cx-1.22,cx+1.22,2.70,3.47,z0+.10,z0+.12,'lamp'); area(3,(cx,3.0,z0+.2),2.4,16,dir=(0,-.4,1),sizey=.7)
    for x in(-44,-31,-20.75,-14.2,-6,0,6,14.2,26.5,29,35.5,41): sconce(R,x,2.1,z1,(0,-1),8)
    for x in range(-43,42,6):
        R.cyl((x,-3),.42,H-.10,H-.005,'trim_gold',n=20); R.cyl((x,-3),.36,H-.13,H-.10,'lamp',n=20); area(1,(x,H-.15,-3),.6,95)
    for x in(-46+.3,42-.3): area(3,(x,2,-3),2,18,dir=(1 if x<0 else -1,0,0))
    return R
# ================================================================= AUDITORIUMS
def auditorium(a):
    R=Room(f"aud{a['id']}"); r=a['rect']; b=a['booth']; H=a['height']; x0,x1,z0,z1=r['x0']+T,r['x1']-T,r['z0']+T,-6-T; cx=a['cx']; rows=a['rows']; low=-P['rowDrop']*(rows-1)
    fz=P['firstRow']; hv=[(b['x0']-T,b['x1']+T,b['z0']-T,z1,None)]
    R.floor(x0,x1,fz,z1,0,'floor_aud',hv)
    for k in range(rows):
        za=fz-k*P['rowPitch']; zb=za-P['rowPitch'] if k<rows-1 else z0; y=-P['rowDrop']*k
        R.floor(x0,x1,zb,za,y,'floor_aud')
        if k>0: # riser faces the screen (-z)
            R.surf((x1,y,za),(-1,0,0),(0,1,0),[(0,0,x1-x0,P['rowDrop'],'floor_aud')])
            half=a['cols']*.65/2+.1
            for (xa,xb) in((x0,cx-half),(cx+half,x1)): R.box(xa,xb,y+P['rowDrop']-.016,y+P['rowDrop']+.004,za-.012,za+.012,'step_led',step=1.0)
    R.ceil(x0,x1,z0,z1,H,'ceiling_aud',[(b['x0']-T,b['x1']+T,b['z0']-T,z1)] if False else [])
    bands=[(.9,'wall_aud_dado'),(H,'wall_aud')]
    W=inner_walls(r)
    for sd in 'NESW':
        A,B=W[sd]; ops=[]
        if sd=='S':
            for ta,tb,d in door_ops(r,'S'):
                if not d['id'].startswith('booth'): ops.append((ta,tb,-.01,d['height']))
            ops.append((r['x1']-T-(b['x1']+T),r['x1']-T-(b['x0']-T),-5,H+1))
            R.wall(A,B,0,H,bands,ops)
            for ta,tb,d in door_ops(r,'S'):
                if d['id'].startswith('booth'): continue
                h=d['height']; X0,X1=d['from'],d['to']
                R.quad([(X1,0,z1),(X1,0,z1+T),(X1,h,z1+T),(X1,h,z1)],'trim_wood'); R.quad([(X0,0,z1+T),(X0,0,z1),(X0,h,z1),(X0,h,z1+T)],'trim_wood'); R.quad([(X1,h,z1+T),(X0,h,z1+T),(X0,h,z1),(X1,h,z1)],'trim_wood')
                R.box(X0-.1,X0,0,h+.1,z1-.04,z1,'trim_wood'); R.box(X1,X1+.1,0,h+.1,z1-.04,z1,'trim_wood'); R.box(X0,X1,h,h+.1,z1-.04,z1,'trim_wood')
                R.box((X0+X1)/2-.32,(X0+X1)/2+.32,h+.22,h+.46,z1-.06,z1,'neon_b'); area(3,((X0+X1)/2,h+.3,z1-.12),.6,2.2,dir=(0,-.4,-1),sizey=.2)
        elif sd=='N': R.wall(A,B,low,H,[(H,'screen_wall')])
        else: R.wall(A,B,low,H,bands)
    # booth box walls seen from the house, with projection port
    bx0,bx1,bz=b['x0']-T,b['x1']+T,b['z0']-T
    R.wall((bx0,bz),(bx0,z1),0,H,bands) if False else None
    R.wall((bx0,z1),(bx0,bz),0,H,bands) if False else None
    # normal n=(-dz,dx): west face of booth must point -x: d=(0,1) ; east face +x: d=(0,-1); front face -z: d=(-1,0)
    R.wall((bx0,bz),(bx0,z1),0,H,bands); R.wall((bx1,z1),(bx1,bz),0,H,bands); R.wall((bx1,bz),(bx0,bz),0,H,bands,[(bx1-cx-.55,bx1-cx+.55,2.05,2.6)])
    R.box(cx-.62,cx+.62,1.98,2.05,bz-.05,bz,'trim_gold'); R.box(cx-.62,cx+.62,2.6,2.67,bz-.05,bz,'trim_gold'); R.box(cx-.62,cx-.55,2.05,2.6,bz-.05,bz,'trim_gold'); R.box(cx+.55,cx+.62,2.05,2.6,bz-.05,bz,'trim_gold')
    for yy in(2.05,2.6): pass
    # side pilasters + sconces
    n=max(3,int((z1-z0-4)/3.6)); 
    for k in range(n):
        z=-10.2-k*((-10.2-(z0+4.2))/(n-1)); fy=0
        kk=math.floor((fz-z)/P['rowPitch']); fy=-P['rowDrop']*min(max(kk,0),rows-1)
        for sx,nx in((x0,1),(x1,-1)):
            R.box(min(sx,sx+nx*.12),max(sx,sx+nx*.12),fy,H-.3,z-.28,z+.28,'drape',step=.8); R.box(min(sx,sx+nx*.15),max(sx,sx+nx*.15),H-.42,H-.3,z-.33,z+.33,'trim_gold'); sconce(R,sx+nx*.12,fy+1.95,z,(nx,0),5.5)
    for sx,nx in((x0,1),(x1,-1)): R.box(min(sx,sx+nx*.08),max(sx,sx+nx*.08),H-.3,H-.05,z0,z1,'trim_cream',step=2)
    # screen surround
    sw,sh,sy=a['screenW'],a['screenH'],a['screenY']; zf=z0+.35
    for (xa,xb,ya,yb) in((cx-sw/2-.25,cx-sw/2,sy-.25,sy+sh+.25),(cx+sw/2,cx+sw/2+.25,sy-.25,sy+sh+.25),(cx-sw/2,cx+sw/2,sy-.25,sy),(cx-sw/2,cx+sw/2,sy+sh,sy+sh+.25)): R.box(xa,xb,ya,yb,z0,zf+.03,'black',step=2)
    R.box(x0,x1,low,low+.55,z0,z0+1.3,'wall_aud_dado',step=1.0); R.box(x0,x1,low+.5,low+.56,z0+1.3,z0+1.34,'trim_gold',step=1.0)
    # drapes
    def drape(xa,xb,y0_,y1_,zc,amp=.11,wl=.42):
        m=max(8,int(abs(xb-xa)/.07)); ys=np.linspace(y0_,y1_,5)
        pts=[(xa+(xb-xa)*i/m,zc+amp*math.sin((xa+(xb-xa)*i/m)*2*math.pi/wl)+.03*math.sin(i*1.7)) for i in range(m+1)]
        for i in range(m):
            for c,d in zip(ys,ys[1:]):
                p,q=pts[i],pts[i+1]; R.quad([(p[0],c,p[1]),(q[0],c,q[1]),(q[0],d,q[1]),(p[0],d,p[1])],'drape',[(p[0],c),(q[0],c),(q[0],d),(p[0],d)])
    top=min(sy+sh+.9,H-.1)
    drape(x0+.02,cx-sw/2-.05,low+.56,top,zf+.15); drape(cx+sw/2+.05,x1-.02,low+.56,top,zf+.15); drape(x0+.02,x1-.02,sy+sh+.12,top,zf+.3,.09,.5); R.box(x0,x1,top-.02,top+.16,zf,zf+.5,'trim_gold',step=1.5)
    # ceiling downlights
    for ix in(-1,0,1):
        for iz in range(3):
            x=cx+ix*(x1-x0)*.3; z=-8.5+(z0+5+8.5)*iz/2; R.cyl((x,z),.14,H-.02,H-.004,'lamp',n=10)
            if not(bx0<x<bx1 and z>bz): area(1,(x,H-.05,z),.28,55,spread=2.4)
            else: area(1,(x,H-.05,z),.28,20,spread=2.4)
    R.cyl((cx-2.6,(z0-10)/2),.1,H-.02,H,'black',n=8)
    area(2,(cx,sy+sh/2,zf+.06),sw,10.5*sw*sh,dir=(0,0,1),sizey=sh)
    for k in range(1,rows):
        z=fz-k*P['rowPitch']-.05; y=-P['rowDrop']*k+P['rowDrop']-.05; half=a['cols']*.65/2+.1
        for xa,xb in((x0,cx-half),(cx+half,x1)): area(3,((xa+xb)/2,y,z),xb-xa-.2,1.5,dir=(0,-.8,-.5),sizey=.03)
    # seats as bounce blockers
    for k in range(rows):
        zb=fz-k*P['rowPitch']; y=-P['rowDrop']*k; half=a['cols']*.65/2
        BL.box(cx-half,cx+half,y+.3,y+.5,zb-.82,zb-.2,'seat',step=9); BL.box(cx-half,cx+half,y+.4,y+1.0,zb-.24,zb-.12,'seat',step=9)
    return R
def booth(a):
    R=Room(f"booth{a['id']}"); b=a['booth']; H=3.2; cx=a['cx']; x0,x1,z0,z1=b['x0']+T,b['x1']-T,b['z0']+T,b['z1']-T
    R.floor(x0,x1,z0,z1,0,'floor_booth'); R.ceil(x0,x1,z0,z1,H,'wall_booth')
    L=x1-x0
    wallgen(R,b,H,[(1.0,'wall_booth'),(H,'wall_booth')],casing='metal',jamb='metal',base='black',extra_ops={'N':[(cx-x0-.55,cx-x0+.55,2.05,2.6)]})
    for yy,(ya,yb) in enumerate(((2.05,2.05),(2.6,2.6))): pass
    z=z0; zz=b['z0']-T
    R.quad([(cx-.55,2.05,z),(cx+.55,2.05,z),(cx+.55,2.05,zz),(cx-.55,2.05,zz)],'black'); R.quad([(cx-.55,2.6,zz),(cx+.55,2.6,zz),(cx+.55,2.6,z),(cx-.55,2.6,z)],'black'); R.quad([(cx-.55,2.05,zz),(cx-.55,2.6,zz),(cx-.55,2.6,z),(cx-.55,2.05,z)][::-1],'black'); R.quad([(cx+.55,2.05,z),(cx+.55,2.6,z),(cx+.55,2.6,zz),(cx+.55,2.05,zz)][::-1],'black')
    R.box(cx-.9,cx+.9,H-.08,H-.02,-7.2,-7.0,'lamp_cool'); area(1,(cx,H-.1,-7.1),1.6,45,sizey=.2); area(3,(x0+.15,2.4,-7.5),.3,8,dir=(1,-.3,0))
    for k in range(3): R.box(x0,x0+.35,.5+.6*k,.53+.6*k,-8.6,-6.6,'metal')
    for k in range(9): zc=-8.5+.22*k; R.cyl((x0+.18,zc),.14,.53+.6*(k%3),.57+.6*(k%3),'metal',n=12)
    return R
# ================================================================= RESTROOMS / OFFICE / FOOD / VIP / ARCADE
def restroom(rid):
    R=Room(rid); ro=ROOM[rid]; r=ro['rect']; H=ro['height']; x0,x1,z0,z1=r['x0']+T,r['x1']-T,T,8-T
    R.floor(x0,x1,z0,z1,0,'floor_wc'); R.ceil(x0,x1,z0,z1,H,'ceiling_tile')
    wallgen(R,r,H,[(1.5,'wall_wc'),(1.72,'wall_wc_band'),(H,'wall_wc')],casing='trim_wood',jamb='trim_wood',base='wall_wc_band')
    for s_ in P['solids']:
        if s_['tag']=='stall' and s_['x0']>=r['x0'] and s_['x1']<=r['x1']: R.box(s_['x0'],s_['x1'],.18,2.0,s_['z0'],s_['z1'],'trim_wood',step=.6)
    xs=sorted(s_['x0'] for s_ in P['solids'] if s_['tag']=='stall' and s_['x0']>=r['x0'] and s_['x1']<=r['x1'])
    R.box(xs[0],xs[-1]+.06,2.0,2.08,6.2,6.28,'metal')
    R.box(x0,x0+.6,.78,.88,2.3,5.5,'floor_lobby',step=.6); R.box(x0,x0+.55,.3,.78,2.35,5.45,'trim_wood',step=.6)
    R.box(x0,x0+.03,1.15,2.2,2.35,5.45,'trim_gold',step=.8); R.rectg((x0+.035,1.2,5.4),(0,0,-3.0),(0,.95,0),'mirror',.8)
    R.box(x0,x0+.12,2.3,2.42,2.6,5.2,'lamp_cool'); area(1,(x0+.25,2.3,3.9),.12,35,dir=(.7,-.7,0),sizey=2.6)
    cx=(x0+x1)/2
    for z in(2.2,5.6): R.box(cx-.6,cx+.6,H-.03,H-.005,z-.3,z+.3,'lamp_cool'); area(1,(cx,H-.06,z),1.1,80,sizey=.6)
    return R
def office():
    R=Room('office'); r=ROOM['office']['rect']; H=3.4; x0,x1,z0,z1=r['x0']+T,r['x1']-T,8+T,18-T
    R.floor(x0,x1,z0,z1,0,'floor_office',[(-24.4,-20,12.2,16.8,'carpet_vip')]); R.ceil(x0,x1,z0,z1,H,'ceiling_prom'); wallgen(R,r,H,[(1.0,'wall_wains'),(H,'wall_office')],casing='trim_wood',crown='trim_cream')
    W=inner_walls(r)
    for A,B in W.values(): pass
    for x in(-23,-18): R.cyl((x,13),.34,H-.09,H-.01,'lamp',n=18); area(1,(x,H-.12,13),.5,95)
    sconce(R,x0,2.0,16.4,(1,0),5); area(2,(-20.5,2.2,18.0),3,60,dir=(0,-.1,-1),sizey=1.6); return R
def foodcourt():
    R=Room('foodcourt'); r=ROOM['foodcourt']['rect']; H=4.6; x0,x1,z0,z1=15+T,30-T,T,18-T
    R.floor(x0,x1,z0,z1,0,'floor_food'); R.ceil(x0,x1,z0,z1,H,'ceiling_food'); win=[(30-T-28,30-T-22.5,.7,3.8),(30-T-21,30-T-16.2,.7,3.8)]
    wallgen(R,r,H,[(1.2,'wall_food_low'),(H,'wall_food')],casing='trim_gold',extra_ops={'S':win},crown='trim_wood')
    for z in range(1,18): R.box(x0,x1,H-.22,H-.08,z-.05,z+.05,'trim_wood',step=2.5)
    for x in(18,22.5,26.5):
        for z in(3,9,15): R.cyl((x,z),.01,3.2,H,'black',n=6,cap=False); R.cyl((x,z),.34,3.0,3.2,'trim_gold',n=18,r2=.12); R.cyl((x,z),.3,2.98,3.0,'lamp',n=18); area(1,(x,2.95,z),.5,95)
    area(2,(22,2.3,18.1),11,520,dir=(0,-.15,-1),sizey=3); area(3,(29.6,2.6,9),.3,60,dir=(-1,-.3,0),sizey=11); return R
def vip():
    R=Room('vip'); r=ROOM['vip']['rect']; H=4; x0,x1,z0,z1=30+T,42-T,8+T,18-T
    R.floor(x0,x1,z0,z1,0,'floor_vip',[(31.5,39,10,16.8,'carpet_vip')]); R.ceil(x0,x1,z0,z1,H,'ceiling_lobby'); wallgen(R,r,H,[(1.2,'wall_wains'),(H,'wall_vip')],casing='trim_gold',crown='trim_gold')
    for x in(33,38): R.cyl((x,13.2),.6,H-.5,H-.3,'lamp',n=22); R.cyl((x,13.2),.64,H-.54,H-.5,'trim_gold',n=22); R.cyl((x,13.2),.03,H-.3,H,'trim_gold',n=8); area(1,(x,H-.56,13.2),.9,70)
    for z in(9.6,12,14.6,17): sconce(R,x1,2.0,z,(-1,0),6)
    for x in(32,35,38): sconce(R,x,2.0,z1,(0,-1),6)
    area(3,(41.6,1.7,11.7),.2,30,dir=(-1,.1,0),sizey=4.6); return R
def arcade():
    R=Room('arcade'); r=ROOM['arcade']['rect']; H=4.2; x0,x1,z0,z1=-46+T,-26-T,T,14-T
    R.floor(x0,x1,z0,z1,0,'floor_arcade'); R.ceil(x0,x1,z0,z1,H,'ceiling_dark'); wallgen(R,r,H,[(1.0,'wall_arcade'),(H,'wall_arcade')],casing='neon_a',base='black')
    for y,m in((3.3,'neon_a'),(3.55,'neon_b')):
        for A,B in inner_walls(r).values(): R.bar(A,B,[(0,y),(.04,y),(.04,y+.05),(0,y+.05)],m)
    for x in(-42,-36,-30):
        for z in(3.5,10.5): R.cyl((x,z),.14,H-.02,H-.004,'lamp',n=12); area(1,(x,H-.06,z),.3,60)
    area(3,(-36,3.4,z0+.2),19,80,dir=(0,-.3,1),sizey=.2); area(3,(-36,3.4,z1-.2),19,80,dir=(0,-.3,-1),sizey=.2); area(3,(x0+.2,3.4,7),.2,50,dir=(1,-.3,0),sizey=13); area(3,(x1-.2,3.4,7),.2,50,dir=(-1,-.3,0),sizey=13); return R
# ================================================================= STREET
def street():
    R=Room('street'); 
    for a,b in((-50,-26),(-26,-2),(-2,22),(22,46)): R.floor(a,b,18+T,23,0,'sidewalk'); R.floor(a,b,23.15,33,-.14,'road')
    R.floor(-50,-26-T,14+T,18+T,0,'sidewalk'); R.floor(42+T,46,8,18+T,0,'sidewalk')
    R.box(-50,46,-.14,0,23,23.15,'sidewalk',step=4)
    zf=18+T; H=9.2
    ops=[(-5+15,-2.5+15,-.01,4.3),(-1.25+15,1.25+15,-.01,4.3),(2.5+15,5+15,-.01,4.3),(3,8.4,.7,4.3),(21.6,27,.7,4.3)]
    R.wall((-15,zf),(15,zf),0,H,[(.7,'facade_dark'),(4.6,'facade'),(H,'facade')],ops)
    for x in(-15,-13.2,13.2,15): R.box(x-.3,x+.3,0,H+.5,zf,zf+.22,'facade_dark',step=1.2)
    for k,x in enumerate(np.linspace(-12.3,12.3,19)):
        if abs(x)<2.2: continue
        R.box(x-.11,x+.11,5.6,H-.2+.5*(1-abs(x)/13),zf,zf+.14,'facade',step=1.2)
    R.box(-15.2,15.2,H,H+.35,zf-.3,zf+.3,'facade_dark',step=2); R.box(-15.3,15.3,5.35,5.55,zf,zf+.2,'trim_gold',step=2)
    for hw,h0,h1,dp in((2.4,H,H+1.6,.34),(1.7,H+1.6,H+3.0,.3),(1.0,H+3.0,H+4.2,.26)): R.box(-hw,hw,h0,h1,zf-.5,zf+dp,'facade',step=1)
    R.box(-2.2,2.2,5.5,H+1.4,zf,zf+.3,'facade_dark',step=1.2)
    # reveals for doors & windows
    for a,b,y0,y1 in((-5,-2.5,0,4.3),(-1.25,1.25,0,4.3),(2.5,5,0,4.3),(-12,-6.6,.7,4.3),(6.6,12,.7,4.3)):
        R.quad([(a,y0,zf),(a,y0,zf-T),(a,y1,zf-T),(a,y1,zf)][::-1],'trim_gold'); R.quad([(b,y0,zf-T),(b,y0,zf),(b,y1,zf),(b,y1,zf-T)][::-1],'trim_gold'); R.quad([(a,y1,zf),(a,y1,zf-T),(b,y1,zf-T),(b,y1,zf)],'trim_gold'); R.quad([(a,y0,zf),(b,y0,zf),(b,y0,zf-T),(a,y0,zf-T)],'trim_gold')
        for m_ in np.linspace(a,b,2+int((b-a)/1.8))[0:]: R.box(m_-.035,m_+.035,y0,y1,zf-.12,zf-.02,'trim_gold')
        for yy in((y0+.02,) if y0>0 else ())+(y1-.06,)+((2.6,) if y0==0 else ()): R.box(a,b,yy,yy+.1 if y0==0 and yy==2.6 else yy+.05,zf-.12,zf-.02,'trim_gold')
    # side wings
    for xa,xb,z,h in((-26,-15,18,5.6),(15,30,18,5.6),(30,42,18,5.0),(-46,-26,14,5.2)):
        o=[(1,6.2,.7,3.8),(8.4-.9,13.8,.7,3.8)] if xa==15 else []
        o=[(16.2-15,21-15,.7,3.8),(22.5-15,28-15,.7,3.8)] if xa==15 else []
        R.wall((xa,z+T),(xb,z+T),0,h,[(.8,'facade_dark'),(h,'brick')],o); R.box(xa,xb,h,h+.25,z-.2,z+T+.12,'facade',step=3); R.box(xa,xb,.8,.9,z+T,z+T+.06,'facade',step=3)
        for x in np.arange(xa+1.2,xb,3.6):
            if not any(xa+q[0]-.5<x<xa+q[1]+.5 for q in o): R.box(x-.25,x+.25,.9,h,z+T,z+T+.12,'brick',step=1.5)
    R.wall((-26-T,18+T),(-26-T,14),0,5.6,[(5.6,'brick')]); R.wall((42+T,18+T),(42+T,8),0,5,[(5,'brick')])
    for (xa,xb) in((16.2,21),(22.5,28)):
        for m_ in np.linspace(xa,xb,4): R.box(m_-.035,m_+.035,.7,3.8,zf-.12,zf-.02,'trim_gold')
    # marquee canopy
    my=4.55
    R.box(-8,8,my,my+1.35,zf,21.4,'facade_dark',step=1.2,skip=''); R.box(-8.12,8.12,my-.06,my+.06,zf,21.52,'trim_gold',step=1.2); R.box(-8.12,8.12,my+1.32,my+1.46,zf,21.52,'trim_gold',step=1.2)
    for i in range(17):
        for j in range(3): R.cyl((-7.5+i*.9375,18.8+j*.95),.09,my-.13,my-.06,'lamp',n=8)
    R.box(-.75,.75,5.9,13.2,21.0,21.35,'facade_dark',step=1.2) if False else None
    area(3,(0,my-.14,19.9),15,330,sizey=2.8); area(3,(0,5.3,21.6),15,120,dir=(0,-.3,1),sizey=1.2)
    for x in(-40,-20,20,38): point(3,(x,5.2,22.6),220,.2); R.cyl((x,22.6),.07,0,5.0,'black',n=10); R.cyl((x,22.6),.16,0,.5,'black',n=10); R.cyl((x,22.6),.24,5.0,5.5,'lamp',n=12,r2=.16); R.cyl((x,22.6),.27,5.5,5.6,'black',n=12,r2=.08)
    return R
BL=Room('blockers')
builders=[street,lobby,promenade,office,foodcourt,vip,arcade]+[lambda i=i:restroom(i) for i in('wcW','wcM','wcW2','wcM2')]+[lambda a=a:auditorium(a) for a in P['auds']]+[lambda a=a:booth(a) for a in P['auds']]
rooms=[b() for b in builders]
for s_ in P['solids']:
    if s_['tag'] in('concession-counter','concession-back','boxoffice','food-counter','food-back','desk','shelves','sofa','vip-bar'): BL.box(s_['x0'],s_['x1'],0,s_['h'],s_['z0'],s_['z1'],'counter',step=9)
RES={'lobby':1536,'street':1024,'promenade':1024,'office':512,'vip':512,'foodcourt':768,'arcade':768}
def pack(charts,size,pad=3):
    rects=[(max(q[2] for q in c[3]),max(q[3] for q in c[3]),i) for i,c in enumerate(charts)]
    lo,hi=1,400.
    def tryp(d):
        pos={}; items=sorted(rects,key=lambda r:-min(r[0],r[1]) if False else -max(r[1] if r[1]<=r[0] else r[0],0)); x=pad;y=pad;rowh=0
        for w,h,i in items:
            rot=h>w; W,Hh=(h,w) if rot else (w,h); pw=int(math.ceil(W*d))+2*pad; ph=int(math.ceil(Hh*d))+2*pad
            if pw>size: return None
            if x+pw>size: x=0;y+=rowh;rowh=0
            if y+ph>size: return None
            pos[i]=(x+pad,y+pad,rot); x+=pw; rowh=max(rowh,ph)
        return pos
    for _ in range(26):
        mid=(lo+hi)/2
        if tryp(mid): lo=mid
        else: hi=mid
    return lo,tryp(lo)
def B(p): return (p[0],-p[2],p[1])
def mkmesh(name,verts,faces,matn,uv,uv2=None):
    me=bpy.data.meshes.new(name); me.from_pydata([B(v) for v in verts],[],faces); names=sorted(set(matn)); 
    for n in names: me.materials.append(mat(n))
    me.polygons.foreach_set('material_index',[names.index(m) for m in matn]); l=me.uv_layers.new(name='uv'); l.data.foreach_set('uv',np.array(uv,float).ravel())
    if uv2 is not None: l2=me.uv_layers.new(name='lm'); l2.data.foreach_set('uv',np.array(uv2,float).ravel()); me.uv_layers.active=l2
    me.update(); o=bpy.data.objects.new(name,me); sc.collection.objects.link(o); return o
info=[]
for R in rooms:
    size=int((RES.get(R.id,1024 if R.id.startswith('aud') else 384))*SCALE); R.size=size
    d,pos=pack(R.charts,size); R.density=d; V=[];F=[];M=[];U=[];L=[]
    for i,(o,u,v,qs) in enumerate(R.charts):
        px,py,rot=pos[i]
        for a,b,c,e,m in qs:
            k=len(V); cs=[(a,b),(c,b),(c,e),(a,e)]
            V+=[o+u*p+v*q for p,q in cs]; F.append([k,k+1,k+2,k+3]); M.append(m)
            n=np.cross(u,v)
            if abs(n[1])>.5: U+=[((o+u*p+v*q)[0],-(o+u*p+v*q)[2]) for p,q in cs]
            else: U+=[((o+u*p+v*q)@np.abs(u),(o+u*p+v*q)[1]) for p,q in cs]
            L+=[((px+(q if rot else p)*d)/size,(py+(p if rot else q)*d)/size) for p,q in cs]
    R.obj=mkmesh('room_'+R.id,V,F,M,U,L); R.V,R.F,R.M,R.U,R.L=V,F,M,U,L
    R.tobj=mkmesh('trim_'+R.id,R.tv,R.tf,R.tm,[x for q in R.tu for x in q]) if R.tv else None
    print(R.id,'charts',len(R.charts),'density %.0f px/m'%d,'trim quads',len(R.tf),flush=True)
blk=mkmesh('blk',BL.tv,BL.tf,BL.tm,[x for q in BL.tu for x in q])
# probe grid (one vertex per 0.5 m nav cell, one metre above the floor)
W_=P['world']; nx=int((W_['x1']-W_['x0'])*2); nz=int((W_['z1']-W_['z0'])*2)
def floorY(x,z):
    if z>P['firstRow']: return 0
    for a in P['auds']:
        r=a['rect']
        if r['x0']<=x<r['x1'] and z>=r['z0']-.5: return -P['rowDrop']*min(max(math.floor((P['firstRow']-z)/P['rowPitch']),0),a['rows']-1)
    return 0
pv=[];pf=[]
for j in range(nz):
    for i in range(nx): x=W_['x0']+.25+.5*i; z=W_['z0']+.25+.5*j; pv.append(B((x,floorY(x,z)+1.12,z)))
for j in range(nz-1):
    for i in range(nx-1): a=j*nx+i; pf.append([a+nx,a+nx+1,a+1,a])
pm=bpy.data.meshes.new('probe'); pm.from_pydata(pv,[],pf); pm.materials.append(mat('white_probe'))
for p in pm.polygons: p.use_smooth=True
pm.update(); pm.normals_split_custom_set_from_vertices([(0,0,1)]*len(pv)); probe=bpy.data.objects.new('probe',pm); sc.collection.objects.link(probe)
for at in('visible_diffuse','visible_glossy','visible_transmission','visible_volume_scatter','visible_shadow','visible_camera'): setattr(probe,at,False)
# world sky for exterior daylight
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; bg=w.node_tree.nodes['Background']; bg.inputs[0].default_value=(.75,.85,1,1)
sun=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN')); sun.data.energy=2.2; sun.data.angle=.06; sun.rotation_euler=(math.radians(48),math.radians(18),math.radians(20)); sc.collection.objects.link(sun); lights[2].append(sun)
def set_group(g):
    for k,ls in lights.items():
        for o in ls: o.hide_render=(k!=g)
    bg.inputs[1].default_value=.9 if g==2 else 0
def select(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
bk=sc.render.bake; bk.use_pass_direct=True; bk.use_pass_indirect=True; bk.use_pass_color=False; bk.margin=6
from scipy.ndimage import gaussian_filter as gf, median_filter, distance_transform_edt as edt
import pyoidn
def bake_lm(R,g):
    img=bpy.data.images.new('b',R.size,R.size,float_buffer=True); 
    for m in R.obj.data.materials:
        nt=m.node_tree; n=nt.nodes.get('bk') or nt.nodes.new('ShaderNodeTexImage'); n.name='bk'; n.image=img; nt.nodes.active=n
    R.obj.data.uv_layers.active=R.obj.data.uv_layers['lm']; sc.cycles.samples=SPP; select(R.obj); bpy.ops.object.bake(type='DIFFUSE')
    a=np.empty(R.size*R.size*4,'f4'); img.pixels.foreach_get(a); bpy.data.images.remove(img); a=a.reshape(R.size,R.size,4)[...,:3]; return a@np.array([.25,.6,.15])
def bake_v(o,spp):
    me=o.data; ca=me.color_attributes.get('c') or me.color_attributes.new('c','FLOAT_COLOR','POINT'); me.color_attributes.active_color=ca; sc.cycles.samples=spp; select(o); bpy.ops.object.bake(type='DIFFUSE',target='VERTEX_COLORS')
    a=np.empty(len(me.vertices)*4,'f4'); me.color_attributes['c'].data.foreach_get('color',a); return a.reshape(-1,4)[:,:3]@np.array([.25,.6,.15])
def groups_for(i):
    if i.startswith('booth'): return (1,3)
    if i.startswith('wc'): return (1,)
    if i in('promenade','arcade','vip'): return (1,3) if i!='promenade' else (1,2,3)
    return (1,2,3)
from PIL import Image
import struct
meta=dict(rooms=[],sconces=sconces); blob=b''
old={}
mp=OUT+'/shell.json'
t0=time.time()
def put(arr):
    global blob
    while len(blob)%4: blob+=b'\0'
    o=len(blob); blob+=arr.tobytes(); return o
LMAX={1:6.0,2:6.0,3:3.0}
for R in rooms:
    skip=ONLY and R.id not in ONLY
    lm=np.zeros((R.size,R.size,3)); tv=np.zeros((len(R.tv),3))
    if not skip:
        for g in groups_for(R.id):
            set_group(g); a=bake_lm(R,g); a=np.nan_to_num(a).astype('f4'); a=np.minimum(a,median_filter(a,5)*2.5+.02); hole=a<=0; fi=edt(hole,return_distances=False,return_indices=True); a=np.where(hole,a[fi[0],fi[1]],a); d3=pyoidn.denoise(np.ascontiguousarray(np.repeat(a[...,None],3,2).astype('f4')),hdr=True,filter_type='RTLightmap')[...,0]; lm[...,g-1]=np.maximum(d3,0)
            if R.tobj: tv[:,g-1]=np.nan_to_num(bake_v(R.tobj,72))
        enc=np.sqrt(np.clip(lm/np.array([LMAX[1],LMAX[2],LMAX[3]]),0,1)); dn=np.random.default_rng(1).random(enc.shape)-.5
        Image.fromarray((np.clip(enc*255+dn,0,255)+.5).astype('u1')[::-1]).save(f'{OUT}/lm_{R.id}.webp',quality=92,method=6)
    e=dict(id=R.id,prims=[],trim=[])
    V=np.array(R.V,'<f4'); U=np.array(R.U,'<f4'); L=np.array(R.L,'<f4')
    N=np.zeros_like(V)
    for f in R.F: N[f]=np.cross(V[f[1]]-V[f[0]],V[f[3]]-V[f[0]])
    N/=np.linalg.norm(N,axis=1,keepdims=True)
    for m in sorted(set(R.M)):
        fs=[f for f,x in zip(R.F,R.M) if x==m]; ids=np.array(fs).ravel(); idx=np.array([[4*k,4*k+1,4*k+2,4*k,4*k+2,4*k+3] for k in range(len(fs))]).ravel()
        e['prims'].append(dict(mat=m,nv=len(ids),ni=len(idx),p=put(V[ids]),n=put(N[ids].astype('<f4')),u=put(U[ids]),l=put(L[ids]),i=put(idx.astype('<u4'))))
    if R.tv:
        V=np.array(R.tv,'<f4'); U=np.array([x for q in R.tu for x in q],'<f4'); N=np.zeros_like(V)
        for f in R.tf: 
            n=np.cross(V[f[1]]-V[f[0]],V[f[2]]-V[f[0]]); n2=np.cross(V[f[2]]-V[f[0]],V[f[3]]-V[f[0]]); N[f]=n+n2
        N/=np.maximum(np.linalg.norm(N,axis=1,keepdims=True),1e-9)
        C=np.sqrt(np.clip(tv/np.array([LMAX[1],LMAX[2],LMAX[3]]),0,1)); C=(C*255).astype('u1')
        for m in sorted(set(R.tm)):
            fs=[f for f,x in zip(R.tf,R.tm) if x==m]; ids=np.array(fs).ravel(); idx=np.array([[4*k,4*k+1,4*k+2,4*k,4*k+2,4*k+3] for k in range(len(fs))]).ravel()
            c=np.concatenate([C[ids],np.full((len(ids),1),255,'u1')],1)
            e['trim'].append(dict(mat=m,nv=len(ids),ni=len(idx),p=put(V[ids]),n=put(N[ids].astype('<f4')),u=put(U[ids]),c=put(c),i=put(idx.astype('<u4'))))
    meta['rooms'].append(e); print(R.id,'done %.0fs'%(time.time()-t0),'lm max',lm.max((0,1)).round(2),'mean',lm.mean((0,1)).round(3),flush=True)
if not ONLY:
    pr=np.zeros((nx*nz,3)); blk.hide_render=True
    for g in(1,2,3): set_group(g); pr[:,g-1]=np.nan_to_num(bake_v(probe,256))
    pr=pr.reshape(nz,nx,3); enc=np.sqrt(np.clip(pr/np.array([LMAX[1],LMAX[2],LMAX[3]]),0,1)); Image.fromarray((enc*255+.5).astype('u1')).save(f'{OUT}/probe.png'); print('probe',pr.max((0,1)),pr.mean((0,1)))
    meta['probe']=dict(nx=nx,nz=nz)
meta['lmax']=[LMAX[1],LMAX[2],LMAX[3]]
open(OUT+'/shell.bin','wb').write(blob); json.dump(meta,open(mp,'w')); print('total %.0fs'%(time.time()-t0),len(blob)//1024,'KB')
