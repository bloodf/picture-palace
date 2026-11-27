import bpy, bmesh, json, os, sys, math, numpy as np, random
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(HERE,'../../public/assets/props'); os.makedirs(OUT,exist_ok=True)
LOW=bool(os.environ.get('LOW'))
ONLY=set(sys.argv[1:])
sc=None; OBJ=[]
def reset():
    global sc,OBJ
    bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=40; OBJ=[]
    w=bpy.data.worlds.new('w'); sc.world=w; w.light_settings.distance=.6
def add(me,mt,at=(0,0,0),rot=(0,0,0),smooth=True):
    """mesh is in three space (y up); at/rot in three space (euler xyz radians)"""
    from mathutils import Euler, Matrix, Vector
    M=Matrix.Translation(at)@Euler(rot,'XYZ').to_matrix().to_4x4(); me.transform(M)
    me.transform(Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1))))
    o=bpy.data.objects.new('o',me); sc.collection.objects.link(o); o['m']=mt; OBJ.append(o)
    for p in me.polygons: p.use_smooth=smooth
    return o
def bmmesh(bm): me=bpy.data.meshes.new('m'); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(me); bm.free(); return me
def bx(w,h,d,at,mt,b=.012,seg=2,rot=(0,0,0),taper=None):
    """box centred in x,z, base at y=at.y"""
    bm=bmesh.new(); bmesh.ops.create_cube(bm,size=1)
    for v in bm.verts:
        t=1
        if taper and v.co.y>0: t=taper
        v.co.x*=w*t; v.co.z*=d*t; v.co.y=(v.co.y+.5)*h
    b=min(b,min(w,h,d)*.48)
    if LOW: b=0
    if b>0: bmesh.ops.bevel(bm,geom=list(bm.edges),offset=b,segments=seg,profile=.6,affect='EDGES',clamp_overlap=True)
    return add(bmmesh(bm),mt,at,rot)
def cyl(r,h,at,mt,n=20,r2=None,axis='y',b=0,rot=(0,0,0),cap=True):
    if LOW: n=max(5,min(n,9 if r<.3 else 12)); b=0
    r2=r if r2 is None else r2; bm=bmesh.new(); lo=[bm.verts.new((r*math.cos(2*math.pi*k/n),0,r*math.sin(2*math.pi*k/n))) for k in range(n)]; hi=[bm.verts.new((r2*math.cos(2*math.pi*k/n),h,r2*math.sin(2*math.pi*k/n))) for k in range(n)]
    for k in range(n): bm.faces.new([lo[k],lo[(k+1)%n],hi[(k+1)%n],hi[k]])
    if cap: bm.faces.new(lo); bm.faces.new(hi[::-1])
    if b: 
        es=[e for e in bm.edges if abs(e.verts[0].co.y-e.verts[1].co.y)<1e-6]; bmesh.ops.bevel(bm,geom=es,offset=b,segments=2,profile=.6,affect='EDGES')
    R={'y':(0,0,0),'x':(0,0,-math.pi/2),'z':(math.pi/2,0,0)}[axis]
    if axis!='y':
        from mathutils import Euler; bmesh.ops.transform(bm,matrix=Euler(R,'XYZ').to_matrix().to_4x4(),verts=bm.verts)
    return add(bmmesh(bm),mt,at,rot)
def lathe(prof,at,mt,n=28,rot=(0,0,0),sx=1,sz=1):
    if LOW:
        n=min(n,9)
        if len(prof)>6: prof=[p for i,p in enumerate(prof) if i in(0,len(prof)-1) or i%2==0]
    bm=bmesh.new(); rings=[]
    for r,y in prof: rings.append([bm.verts.new((max(r,1e-4)*math.cos(2*math.pi*k/n)*sx,y,max(r,1e-4)*math.sin(2*math.pi*k/n)*sz)) for k in range(n)])
    for a,b in zip(rings,rings[1:]):
        for k in range(n): bm.faces.new([a[k],a[(k+1)%n],b[(k+1)%n],b[k]])
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=2e-4); return add(bmmesh(bm),mt,at,rot)
def tube(path,r,mt,n=8,at=(0,0,0),closed=False):
    if LOW:
        n=3
        if len(path)>8 and not isinstance(r,(list,tuple)): path=[p for i,p in enumerate(path) if i%3==0 or i==len(path)-1]
    path=[np.array(p,float) for p in path]; bm=bmesh.new(); rings=[]
    for i,p in enumerate(path):
        a=path[max(i-1,0)];b=path[min(i+1,len(path)-1)]; t=b-a; t/=np.linalg.norm(t)+1e-9; u=np.cross(t,[0,1,0]); 
        if np.linalg.norm(u)<.1: u=np.cross(t,[1,0,0])
        u/=np.linalg.norm(u); v=np.cross(u,t); rr=r[i] if isinstance(r,(list,tuple)) else r
        rings.append([bm.verts.new(p+(u*math.cos(2*math.pi*k/n)+v*math.sin(2*math.pi*k/n))*rr) for k in range(n)])
    for a,b in zip(rings,rings[1:]):
        for k in range(n): bm.faces.new([a[k],a[(k+1)%n],b[(k+1)%n],b[k]])
    bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1]); return add(bmmesh(bm),mt,at)
def prism(poly,d,at,mt,rot=(0,0,0),b=0,axis='z'):
    """extrude a 2D polygon (x,y) by depth d along z (centred)"""
    bm=bmesh.new(); A=[bm.verts.new((x,y,-d/2)) for x,y in poly]; B=[bm.verts.new((x,y,d/2)) for x,y in poly]; n=len(poly); bm.faces.new(A); bm.faces.new(B[::-1])
    for k in range(n): bm.faces.new([A[k],B[k],B[(k+1)%n],A[(k+1)%n]])
    if b and not LOW: bmesh.ops.bevel(bm,geom=list(bm.edges),offset=b,segments=2,affect='EDGES')
    if axis=='x': bmesh.ops.transform(bm,matrix=__import__('mathutils').Euler((0,-math.pi/2,0)).to_matrix().to_4x4(),verts=bm.verts)  # profile (x->z)
    return add(bmmesh(bm),mt,at,rot,smooth=bool(b))
def sph(r,at,mt,s=(1,1,1),u=18,v=12):
    if LOW: u,v=(4,3) if r<.05 else (7,5)
    bm=bmesh.new(); bmesh.ops.create_uvsphere(bm,u_segments=u,v_segments=v,radius=r)
    for x in bm.verts: x.co.x*=s[0]; x.co.y*=s[1]; x.co.z*=s[2]
    return add(bmmesh(bm),mt,at)
def cushion(w,h,d,at,mt,rot=(0,0,0),puff=.35):
    bm=bmesh.new(); bmesh.ops.create_cube(bm,size=1); bmesh.ops.subdivide_edges(bm,edges=bm.edges,cuts=1 if LOW else 3,use_grid_fill=True)
    for v in bm.verts:
        x,y,z=v.co*2; k=lambda a,b:1-puff*.28*(a*a+b*b)/2
        v.co.x=x*.5*w*k(y,z); v.co.y=(y*.5*(1-puff*.35*(x*x+z*z)/2))*h+h/2; v.co.z=z*.5*d*k(x,y)
    if not LOW: bmesh.ops.bevel(bm,geom=[e for e in bm.edges if e.calc_face_angle(0)>.8],offset=min(w,h,d)*.16,segments=2,affect='EDGES')
    return add(bmmesh(bm),mt,at,rot)
def plane(w,h,at,mt,rot=(0,0,0)):
    """uv-mapped quad facing +z, base centre at `at`"""
    bm=bmesh.new(); v=[bm.verts.new(p) for p in((-w/2,0,0),(w/2,0,0),(w/2,h,0),(-w/2,h,0))]; f=bm.faces.new(v); me=bpy.data.meshes.new('q'); bm.to_mesh(me); bm.free(); l=me.uv_layers.new(name='uv')
    for i,c in enumerate(((0,0),(1,0),(1,1),(0,1))): l.data[i].uv=c
    o=add(me,mt,at,rot,False); o['planar']=1; return o
def leafsheet(pts_l,pts_r,mt):
    bm=bmesh.new(); a=[bm.verts.new(p) for p in pts_l]; b=[bm.verts.new(p) for p in pts_r]
    for i in range(len(a)-1): bm.faces.new([a[i],b[i],b[i+1],a[i+1]])
    o=add(bmmesh(bm),mt); return o
R=random.Random(3)
PROPS={}
def prop(f): PROPS[f.__name__]=f; return f
# ===== seats (front faces +z; placed rotated to face the screen)
@prop
def seat_old():
    cushion(.5,.13,.46,(0,.40,.05),'seat_fabric',puff=.5); o=cushion(.5,.13,.56,(0,.0,0),'seat_fabric',puff=.4); 
    from mathutils import Matrix; o.data.transform(Matrix.Translation((0,.22,.48))@Matrix.Rotation(math.radians(-78),4,'X'))
    bx(.52,.6,.04,(0,.46,-.275),'wood',.012,rot=(-.18,0,0)); 
    for s in(-1,1): bx(.05,.55,.42,(s*.295,.06,0),'iron',.015); bx(.07,.045,.44,(s*.295,.61,.02),'wood',.02); bx(.09,.05,.3,(s*.295,0,0),'iron',.01)
@prop
def seat_std():
    cushion(.52,.17,.5,(0,.37,.06),'seat_fabric',puff=.55)
    from mathutils import Matrix; o=cushion(.54,.16,.66,(0,0,0),'seat_fabric',puff=.5); o.data.transform(Matrix.Translation((0,.24,.50))@Matrix.Rotation(math.radians(-76),4,'X'))
    o=cushion(.4,.09,.16,(0,0,0),'seat_fabric',puff=.6); o.data.transform(Matrix.Translation((0,.235,1.0))@Matrix.Rotation(math.radians(-76),4,'X'))
    bx(.5,.5,.06,(0,.40,-.30),'plastic_dark',.02,rot=(-.22,0,0)); bx(.44,.32,.4,(0,.06,-.02),'plastic_dark',.03)
    for s in(-1,1): bx(.07,.5,.36,(s*.3,.06,0),'plastic_dark',.02); bx(.085,.06,.5,(s*.3,.56,.03),'leather_dark',.025); cyl(.048,.07,(s*.3,.565,.30),'plastic_dark',16); cyl(.04,.02,(s*.3,.62,.30),'black',14)
@prop
def seat_recl():
    cushion(.54,.22,.56,(0,.33,.08),'seat_leather',puff=.6); cushion(.5,.12,.3,(0,.26,.44),'seat_leather',puff=.5,rot=(.5,0,0))
    from mathutils import Matrix
    for i,(yy,hh) in enumerate(((.50,.26),(.74,.26),(.98,.24))): o=cushion(.54,hh,.2,(0,0,0),'seat_leather',puff=.65); o.data.transform(Matrix.Translation((0,.20+.07*i,yy))@Matrix.Rotation(math.radians(14),4,'X'))
    bx(.56,.78,.08,(0,.38,-.32),'plastic_dark',.03,rot=(-.25,0,0)); bx(.54,.3,.6,(0,.05,0),'plastic_dark',.03)
    for s in(-1,1): bx(.1,.58,.62,(s*.29,.05,.03),'seat_leather',.035); cyl(.05,.03,(s*.29,.62,.24),'chrome',16); bx(.03,.012,.08,(s*.29,.632,.08),'lamp_cool',.004)
@prop
def seat_lo():
    bx(.52,.16,.48,(0,.36,.06),'seat_fabric',0); bx(.52,.6,.12,(0,.44,-.26),'seat_fabric',0,rot=(-.2,0,0)); bx(.62,.5,.34,(0,.06,0),'plastic_dark',0)
# ===== concession
@prop
def con_counter():
    bx(12,.1,.74,(0,0,-.02),'black',.01); bx(12,.92,.7,(0,.1,0),'wood_panel',.01); bx(12.1,.06,.86,(0,1.04,0),'marble_dark',.02)
    for k in range(-7,8): bx(.05,.84,.03,(k*.78,.13,.36),'brass',.008)
    
    for k in range(14):
        x=-5.46+.78*k+.39*0+.0
        for i in range(3): bx(.5-.14*i,.5-.14*i,.015,(x+.39-.39+.0+.39,.3+.07*i,.355+.012*i),'brass' if i==1 else 'enamel_red',.004) if k<13 else None
    bx(12,.035,.03,(0,.98,.36),'lamp',.005); bx(12,.05,.05,(0,.08,.37),'brass',.01)
    for x in(-3,0,3):
        bx(1.15,.34,.44,(x,1.1,.12),'glass',.006); bx(1.19,.02,.48,(x,1.44,.12),'brass',.006); 
        for j in range(2):
            for i in range(5): bx(.18,.1,.1,(x-.42+.21*i,1.11+.15*j,.1+.05*j),['candy_a','candy_b','candy_c','candy_d','candy_e'][(i+j*2)%5],.012)
            bx(1.1,.008,.36,(x,1.1+.15*j+.14,.1),'glass',0)
@prop
def con_back():
    bx(12,.9,.66,(0,0,0),'wood_panel',.01); bx(12.05,.05,.72,(0,.9,0),'marble_dark',.015)
    for k in range(-7,7): bx(.76,.7,.02,(k*.8+.4,.1,.34),'wood',.01); bx(.14,.02,.03,(k*.8+.4,.68,.36),'brass',.006)
    for y in(1.95,): bx(12,.04,.34,(0,y,-.14),'wood',.01); bx(12,.02,.03,(0,y-.02,.02),'lamp',.004)
@prop
def menu_board():
    bx(2.5,.95,.1,(0,0,0),'brass',.02); bx(2.4,.85,.02,(0,.05,.05),'black',.005); plane(2.36,.81,(0,.07,.064),'screen_menu')
@prop
def popcorn_machine():
    bx(.92,.14,.62,(0,0,0),'enamel_red',.025); bx(.86,.06,.56,(0,.14,0),'chrome',.01)
    for sx in(-1,1):
        for sz in(-1,1): bx(.035,.82,.035,(sx*.41,.18,sz*.26),'chrome',.008)
    bx(.82,.78,.012,(0,.2,.255),'glass',0); bx(.82,.78,.012,(0,.2,-.255),'glass',0); bx(.012,.78,.5,(.405,.2,0),'glass',0); bx(.012,.78,.5,(-.405,.2,0),'glass',0)
    lathe([(0,.0),(.40,.0),(.385,.1),(.30,.22),(.18,.29),(0,.33)],(0,.2,0),'popcorn',22,sz=.62,sx=.98)
    lathe([(0,0),(.13,.0),(.17,.05),(.17,.17),(.15,.19),(0,.2)],(0,.62,-.02),'chrome',24); cyl(.012,.2,(0,.8,-.02),'chrome',8); bx(.26,.02,.04,(.22,.7,-.02),'chrome',.005)
    bx(.98,.10,.68,(0,1.0,0),'enamel_red',.03); prism([(-.46,0),(.46,0),(.40,.14),(.22,.24),(0,.28),(-.22,.24),(-.40,.14)],.06,(0,1.1,.26),'enamel_red',b=.01); prism([(-.40,.015),(.40,.015),(.35,.12),(.2,.2),(0,.235),(-.2,.2),(-.35,.12)],.01,(0,1.1,.296),'enamel_cream'); bx(.62,.09,.62,(0,1.1,-.02),'enamel_red',.03); bx(.8,.02,.5,(0,.985,0),'lamp',.004)
    for k in range(-5,6): sph(.016,(k*.085,1.05,.345),'lamp',u=8,v=6)
@prop
def soda_fountain():
    bx(.95,.08,.62,(0,0,0),'chrome',.02); bx(.95,.62,.36,(0,.08,-.13),'enamel_red',.04); bx(.98,.2,.5,(0,.66,-.06),'chrome',.05); plane(.86,.14,(0,.69,.192),'screen_soda')
    for k in range(6): x=-.375+.15*k; bx(.1,.16,.03,(x,.42,.06),['candy_a','candy_c','candy_b','candy_d','candy_e','candy_a'][k],.01); bx(.05,.12,.07,(x,.32,.08),'plastic_dark',.012); cyl(.016,.05,(x,.27,.1),'black',8)
    bx(.86,.015,.26,(0,.085,.14),'iron',.004); 
    for k in range(3):
        for i in range(4): cyl(.045,.05,(-.3+.3*k,.74+.13+.03*i,-.1),'paper_white',14,r2=.05)
@prop
def hotdog_roller():
    bx(.8,.16,.5,(0,0,0),'chrome',.02); 
    for k in range(7): cyl(.016,.7,(-.35,.19,-.19+.06*k),'chrome',10,axis='x')
    for k in range(6):
        for i in range(3): cyl(.022,.17,(-.3+.22*i,.215,-.16+.06*k),'sausage',10,axis='x',b=.008)
    bx(.8,.012,.5,(0,.5,0),'glass',0); bx(.8,.3,.012,(0,.2,-.24),'glass',0)
    for s in(-1,1): bx(.012,.32,.5,(s*.4,.18,0),'chrome',.004)
    plane(.7,.1,(0,.03,.252),'screen_soda')
@prop
def nacho_warmer():
    bx(.55,.1,.5,(0,0,0),'enamel_yellow',.02); bx(.5,.5,.44,(0,.1,0),'glass',.01); bx(.56,.14,.52,(0,.6,0),'enamel_yellow',.03); lathe([(0,0),(.22,0),(.2,.12),(.1,.22),(0,.25)],(0,.11,0),'nacho',14,sz=.8); bx(.46,.012,.4,(0,.59,0),'lamp',0)
    cyl(.09,.24,(.42,0,0),'chrome',18); cyl(.095,.05,(.42,.24,0),'enamel_yellow',18); cyl(.012,.1,(.42,.29,0),'chrome',8)
@prop
def pretzel_case():
    bx(.5,.12,.5,(0,0,0),'wood',.02); bx(.46,.66,.46,(0,.12,0),'glass',.01); bx(.52,.12,.52,(0,.78,0),'brass',.03); cyl(.01,.66,(0,.12,0),'chrome',8)
    for j in range(3):
        for k in range(4):
            a=k*math.pi/2+j*.4; c=(math.cos(a)*.13,.27+.18*j,math.sin(a)*.13); P=[]
            for t in np.linspace(0,2*math.pi,18): P.append((c[0]+.06*math.sin(t)*math.cos(a+1.57),c[1]+.06*math.cos(t)*(1-.25*math.cos(2*t)),c[2]+.06*math.sin(t)*math.sin(a+1.57)))
            tube(P,.013,'pretzel',6)
@prop
def coffee_machine():
    bx(.75,.1,.55,(0,0,0),'chrome',.02); bx(.75,.3,.3,(0,.1,-.11),'chrome',.03); bx(.78,.16,.52,(0,.38,0),'enamel_cream',.05)
    for s in(-1,0,1): cyl(.045,.07,(s*.22,.31,.1),'chrome',16); bx(.03,.02,.16,(s*.22,.31,.2),'plastic_dark',.008); cyl(.035,.07,(s*.22,.11,.12),'paper_white',14,r2=.042)
    for k in range(4): cyl(.008,.04,(-.26+.17*k,.44,.265),'brass',8,axis='z')
    for i in range(5):
        for j in range(2): cyl(.035,.055,(-.28+.13*i,.54,-.12+.12*j),'paper_white',12,r2=.04)
@prop
def icecream_freezer():
    bx(1.0,.78,.62,(0,0,0),'enamel_cream',.03); bx(1.04,.05,.66,(0,.78,0),'chrome',.015); bx(.94,.24,.5,(0,.83,-.03),'glass',.01); bx(1.0,.02,.3,(0,1.07,-.12),'chrome',.006); plane(.9,.5,(0,.14,.312),'screen_ice')
    for i in range(4):
        for j in range(2): cyl(.1,.03,(-.34+.225*i,.8,-.1+.22*j),['candy_c','ice_pink','ice_choc','enamel_cream','ice_mint','ice_pink','candy_d','ice_choc'][i+4*j],16)
@prop
def slush_machine():
    bx(.7,.3,.45,(0,0,0),'plastic_dark',.03)
    for s,c in((-1,'slush_blue'),(0,'slush_red'),(1,'slush_green')): bx(.2,.42,.34,(s*.22,.3,0),'glass',.02); bx(.18,.34,.3,(s*.22,.31,0),c,.02); bx(.21,.06,.36,(s*.22,.72,0),'plastic_dark',.02); bx(.03,.08,.05,(s*.22,.2,.24),c,.01)
@prop
def candy_rack():
    bx(.8,.06,.36,(0,0,0),'brass',.01)
    for j in range(4):
        bx(.8,.015,.24,(0,.06+.26*j,-.02),'glass',0); bx(.8,.02,.02,(0,.06+.26*j,.1),'brass',.004)
        for i in range(6): bx(.1,.18,.05,(-.33+.132*i,.08+.26*j,.02),['candy_a','candy_b','candy_c','candy_d','candy_e'][(i*2+j)%5],.01,rot=(-.08,0,0))
    for s in(-1,1): bx(.02,1.06,.3,(s*.4,.03,0),'brass',.005)
@prop
def register():
    bx(.36,.07,.36,(0,0,0),'plastic_dark',.015); bx(.34,.24,.03,(0,.14,.04),'plastic_dark',.012,rot=(.35,0,0)); plane(.3,.2,(0,.165,.03),'screen_pos',rot=(-.35,math.pi,0)); cyl(.02,.1,(0,.06,.02),'plastic_dark',10); bx(.12,.02,.17,(.26,0,-.06),'plastic_dark',.008); bx(.1,.05,.14,(-.25,0,.04),'plastic_dark',.01)
# ===== box office
@prop
def boxoffice():
    # counter runs along x here (5 m) and is rotated in place; front faces +z
    bx(5.0,.1,.74,(0,0,0),'black',.01); bx(5.0,.96,.7,(0,.1,0),'wood_panel',.01); bx(5.1,.06,.9,(0,1.06,0),'marble_dark',.02)
    for k in range(-3,4): bx(.06,.9,.03,(k*.78,.13,.36),'brass',.008)
    for k in(-2.45,0,2.45): bx(.1,1.5,.1,(k,1.12,.2),'brass',.015)
    bx(5.1,.42,.5,(0,2.55,.1),'wood_panel',.03); bx(5.2,.06,.58,(0,2.95,.1),'brass',.02); bx(5.2,.06,.58,(0,2.5,.1),'brass',.02); plane(4.7,.34,(0,2.59,.356),'screen_boxoffice')
    for x in(-1.22,1.22): bx(2.3,1.06,.02,(x,1.42,.2),'glass',0); bx(.5,.02,.14,(x,1.12,.28),'brass',.005)
    bx(.1,1.5,.62,(-2.5,1.1,-.05),'wood',.02); bx(.1,1.5,.62,(2.5,1.1,-.05),'wood',.02); bx(5,.02,.3,(0,2.49,.05),'lamp',.004)
@prop
def kiosk():
    bx(.62,.08,.5,(0,0,0),'iron',.02); prism([(-.2,0),(.2,0),(.16,1.0),(.0,1.52),(-.2,1.52)],.56,(0,.08,0),'enamel_red',b=.02,axis='x'); bx(.62,.14,.4,(0,1.58,-.05),'brass',.04)
    plane(.44,.6,(0,.93,.165),'screen_kiosk',rot=(-.31,0,0)); bx(.2,.02,.06,(0,.72,.2),'black',.005); bx(.14,.1,.05,(.17,.6,.2),'plastic_dark',.01)
# ===== lobby furniture
@prop
def bench():
    cushion(1.5,.16,.5,(0,.34,0),'velvet_red',puff=.35); bx(1.46,.08,.46,(0,.28,0),'wood',.02)
    for sx in(-1,1):
        for sz in(-1,1): cyl(.035,.28,(sx*.62,0,sz*.16),'brass',12,r2=.025)
@prop
def sofa_round():
    lathe([(0,0),(.9,0),(.92,.06),(.92,.1),(.86,.12)],(0,0,0),'wood',36); lathe([(.84,.12),(.95,.2),(.97,.36),(.9,.44),(.45,.46),(.38,.46)],(0,0,0),'velvet_red',36); lathe([(.42,.42),(.46,.6),(.40,.95),(.30,1.04),(0,1.06)],(0,0,0),'velvet_red',36)
    for k in range(10): a=k*math.pi/5; sph(.02,(math.cos(a)*.435,.74,math.sin(a)*.435),'brass',u=8,v=6)
    lathe([(.12,1.04),(.16,1.1),(.1,1.2),(.2,1.38),(.22,1.42),(.19,1.42)],(0,0,0),'brass',20)
    for k in range(16):
        a=k*.8; L=.5+.2*R.random(); pl=[];pr=[]
        for t in np.linspace(0,1,6): r=.05+L*t*.8; y=1.4+.55*t-.55*t*t*1.3; w=.06*math.sin(math.pi*min(t+.12,1)); c=np.array([math.cos(a)*r,y,math.sin(a)*r]); s=np.array([-math.sin(a),0,math.cos(a)])*w; pl.append(c-s);pr.append(c+s)
        leafsheet(pl,pr,'leaf')
@prop
def plant_palm():
    lathe([(0,0),(.2,0),(.24,.06),(.27,.3),(.3,.42),(.28,.46),(.25,.44),(0,.42)],(0,0,0),'brass',24); cyl(.24,.02,(0,.41,0),'soil',18)
    for s in range(3):
        a0=s*2.1; b=(math.cos(a0)*.05,.42,math.sin(a0)*.05); tube([b,(b[0]*2,.9,b[2]*2),(b[0]*3,1.25+.15*s,b[2]*3)],[.025,.02,.014],'bark',7); top=np.array([b[0]*3,1.25+.15*s,b[2]*3])
        for k in range(9):
            a=k*.7+s; L=.65+.2*R.random(); e=.5+.5*R.random()
            for side in(-1,1):
                pl=[];pr=[]
                for t in np.linspace(0,1,7):
                    c=top+np.array([math.cos(a)*L*t,e*.5*t-.75*t*t*.9,math.sin(a)*L*t]); s_=np.array([-math.sin(a),-.35,math.cos(a)])*side*.085*math.sin(math.pi*min(t*.9+.1,1)); s_[1]=-.35*.085*math.sin(math.pi*min(t*.9+.1,1)); pl.append(c);pr.append(c+s_)
                leafsheet(pl if side>0 else pr,pr if side>0 else pl,'leaf')
@prop
def plant_fern():
    lathe([(0,0),(.2,0),(.18,.1),(.26,.5),(.3,.56),(.26,.56),(.24,.5),(0,.48)],(0,0,0),'enamel_cream',22); cyl(.24,.02,(0,.48,0),'soil',18)
    for k in range(34):
        a=k*2.4; L=.35+.25*R.random(); e=.5+.5*R.random(); pl=[];pr=[]
        for t in np.linspace(0,1,6): c=np.array([math.cos(a)*L*t,.5+e*.6*t-.6*t*t,math.sin(a)*L*t]); s_=np.array([-math.sin(a),0,math.cos(a)])*.045*math.sin(math.pi*min(t*.85+.15,1)); pl.append(c-s_);pr.append(c+s_)
        leafsheet(pl,pr,'leaf')
@prop
def trash_bin():
    lathe([(0,0),(.2,0),(.21,.03),(.2,.06),(.2,.62),(.21,.66),(.21,.7)],(0,0,0),'enamel_red',24); lathe([(.21,.7),(.215,.72),(.2,.78),(.12,.86),(0,.88)],(0,0,0),'brass',24); bx(.2,.12,.06,(0,.68,.17),'black',.01)
    for k in range(12): a=k*math.pi/6; bx(.02,.52,.012,(math.cos(a)*.203,.08,math.sin(a)*.203),'brass',.004,rot=(0,-a+math.pi/2,0))
@prop
def stanchion():
    for s in(-1,1): lathe([(0,0),(.15,0),(.155,.02),(.1,.045),(.025,.06),(.022,.9),(.04,.92),(.04,.95),(.03,.99),(0,1.01)],(s*.75,0,0),'brass',18)
    tube([(-.75+1.5*t,.9-.32*math.sin(math.pi*t),0) for t in np.linspace(0,1,15)],.022,'velvet_red',8)
@prop
def standee():
    bx(1.15,1.9,.03,(0,.02,0),'paper_white',.004,rot=(-.06,0,0)); plane(1.1,1.84,(0,.05,.012),'screen_poster',rot=(-.06,0,0)); bx(.9,.04,.5,(0,0,-.1),'paper_white',.01)
@prop
def poster_case():
    bx(.86,1.3,.08,(0,0,0),'brass',.02); bx(.78,1.22,.02,(0,.04,.035),'black',.004); plane(.74,1.1,(0,.1,.05),'screen_poster'); bx(.74,.02,.03,(0,1.22,.04),'lamp',.004)
@prop
def podium():
    bx(.5,.06,.46,(0,0,0),'black',.01); prism([(-.2,.0),(.2,0),(.16,1.0),(.22,1.1),(-.22,1.22),(-.2,1.0)],.44,(0,.06,0),'wood_panel',b=.012,axis='x'); bx(.3,.3,.02,(0,.5,.2),'brass',.006)
@prop
def water_fountain():
    bx(.4,.8,.3,(0,0,-.02),'chrome',.03); lathe([(0,.02),(.14,.0),(.2,.04),(.21,.08),(.18,.07),(0,.05)],(0,.8,0),'chrome',22); tube([(.1,.86,-.06),(.1,.92,-.05),(.06,.94,0)],.012,'chrome')
@prop
def vending():
    bx(.95,1.85,.8,(0,.05,0),'enamel_red',.03); bx(.66,1.3,.03,(-.1,.45,.40),'glass',.005); bx(.64,1.28,.02,(-.1,.46,.33),'black',.004); bx(.9,.1,.03,(0,1.77,.4),'lamp',.01)
    for j in range(5):
        bx(.62,.012,.2,(-.1,.5+.24*j,.32),'chrome',0)
        for i in range(5): bx(.085,.16,.08,(-.34+.12*i,.51+.24*j,.36),['candy_a','candy_b','candy_c','candy_d','candy_e'][(i+j*3)%5],.012)
    bx(.12,.3,.02,(.34,.95,.405),'plastic_dark',.005); bx(.5,.14,.02,(-.1,.22,.405),'black',.005)
@prop
def photobooth():
    bx(1.7,2.0,.06,(0,.04,-.45),'enamel_cream',.01); bx(.8,2.0,.9,(-.5,.04,0),'enamel_cream',.03); bx(1.72,.28,.96,(0,2.02,0),'enamel_red',.05); plane(1.6,.2,(0,2.06,.486),'screen_photo'); bx(.06,2.0,.9,(.83,.04,0),'enamel_cream',.02); cyl(.17,.5,(.35,.04,-.05),'chrome',18); cyl(.19,.05,(.35,.54,-.05),'velvet_red',18,b=.01)
    for k in range(9): bx(.05,1.2,.05,(.0+.085*k,.8,.42+.015*(k%2)),'velvet_red',.02)
    plane(.5,.8,(-.5,.9,.456),'screen_poster')
def cabinet(col,w=.68):
    prism([(.0,0),(.62,0),(.62,.82),(.74,.92),(.52,1.06),(.44,1.5),(.58,1.6),(.58,1.84),(.0,1.84)],w,(0,.0,-.4),col,b=.008,axis='x')
@prop
def arcade_a():
    cabinet('cab_blue'); 
    plane(.52,.42,(0,1.08,.12),'screen_game1',rot=(-.18,0,0)); plane(.62,.2,(0,1.62,.186),'screen_marquee1'); 
    bx(.6,.03,.2,(0,.93,.24),'black',.008,rot=(.45,0,0)); 
    for x in(-.16,.12): cyl(.008,.08,(x,.96,.24),'chrome',8); sph(.024,(x,1.04,.24),'enamel_red',u=10,v=8)
    for k in range(3): cyl(.016,.02,(.0+.06*k+.16,.96-.01*k,.23),['candy_c','candy_a','candy_b'][k],10)
    bx(.18,.26,.01,(0,.35,.226),'iron',.004); 
    for s in(-1,1): bx(.012,1.8,.03,(s*.345,.02,.2),'neon_pink',.004)
@prop
def arcade_b():
    cabinet('cab_black'); plane(.52,.42,(0,1.08,.12),'screen_game2',rot=(-.18,0,0)); plane(.62,.2,(0,1.62,.186),'screen_marquee2'); bx(.6,.03,.2,(0,.93,.24),'iron',.008,rot=(.45,0,0))
    for x in(-.14,.14): cyl(.008,.08,(x,.96,.24),'chrome',8); sph(.024,(x,1.04,.24),'candy_c',u=10,v=8)
    bx(.18,.26,.01,(0,.35,.226),'chrome',.004)
    for s in(-1,1): bx(.012,1.8,.03,(s*.345,.02,.2),'neon_cyan',.004)
@prop
def arcade_racer():
    bx(.85,.14,1.7,(0,0,.1),'cab_black',.03); bx(.8,1.0,.5,(0,.14,-.45),'enamel_red',.05); bx(.86,.75,.3,(0,1.0,-.5),'cab_black',.04); plane(.72,.5,(0,1.1,-.335),'screen_game3',rot=(-.08,0,0)); bx(.9,.24,.34,(0,1.74,-.5),'enamel_red',.04); plane(.8,.18,(0,1.77,-.325),'screen_marquee3')
    tube([(.15*math.cos(t),.88+.15*math.sin(t),-.1+.03*math.sin(t)) for t in np.linspace(0,2*math.pi,20)],.018,'black',8); bx(.26,.03,.03,(0,.87,-.11),'black',.008); cyl(.025,.14,(0,.88,-.25),'black',10,axis='z')
    cushion(.5,.2,.5,(0,.2,.55),'leather_dark'); cushion(.5,.62,.18,(0,.36,.82),'leather_dark',rot=(-.15,0,0))
@prop
def claw():
    bx(.9,.8,.85,(0,0,0),'enamel_yellow',.03); bx(.84,.95,.8,(0,.8,0),'glass',.01); bx(.92,.3,.87,(0,1.75,0),'enamel_yellow',.04); plane(.8,.22,(0,1.79,.442),'screen_marquee1')
    for k in range(26): sph(.085,(R.uniform(-.32,.32),.86+R.random()*.18,R.uniform(-.3,.3)),['candy_a','candy_b','candy_c','candy_d','candy_e'][k%5],u=10,v=8)
    cyl(.01,.35,(0,1.4,0),'chrome',6); 
    for k in range(3): a=k*2.09; tube([(0,1.4,0),(.07*math.cos(a),1.34,.07*math.sin(a)),(.03*math.cos(a),1.26,.03*math.sin(a))],.008,'chrome',6)
    bx(.3,.18,.02,(-.2,.2,.43),'black',.01); bx(.5,.06,.14,(.1,.82,.46),'plastic_dark',.02)
@prop
def pinball():
    for sx in(-1,1):
        for sz in(-1,1): cyl(.025,.75,(sx*.26,0,sz*.5),'chrome',10)
    bx(.62,.24,1.25,(0,.74,.0),'cab_blue',.015,rot=(.1,0,0)); bx(.58,.01,1.15,(0,.99,.0),'screen_pin',.0,rot=(.1,0,0)); bx(.66,.62,.2,(0,1.06,-.56),'cab_blue',.015); plane(.58,.52,(0,1.11,-.455),'screen_marquee2')
@prop
def jukebox():
    lathe([(0,0),(.42,0),(.42,.9),(.40,1.1),(.32,1.32),(.18,1.44),(0,1.48)],(0,0,0),'wood',24,sz=.62)
    for r in(.36,.30): tube([(-r,.25,.27)]+[(r*math.cos(t),1.0+r*math.sin(t),.27-.02) for t in np.linspace(math.pi,0,14)]+[(r,.25,.27)],.028,'neon_pink' if r>.33 else 'neon_yellow',8)
    plane(.46,.3,(0,.82,.275),'screen_game1'); bx(.5,.4,.04,(0,.28,.24),'chrome',.02)
@prop
def statue():
    bx(.6,.5,.6,(0,0,0),'marble_dark',.02); bx(.66,.06,.66,(0,.5,0),'brass',.02); lathe([(0,0),(.13,0),(.14,.05),(.09,.1),(.07,.3),(.1,.55),(.13,.75),(.16,.92),(.14,1.0),(.06,1.05),(.05,1.1),(.085,1.18),(.08,1.28),(0,1.33)],(0,.56,0),'brass',24,sz=.75); lathe([(0,0),(.24,0),(.24,.03),(0,.03)],(0,1.98,0),'brass',24,rot=(math.pi/2,0,0))
    for s in(-1,1): tube([(s*.14,1.5,0),(s*.26,1.72,.03),(s*.16,1.98,.03)],.035,'brass',8)
@prop
def reel_sculpture():
    bx(.7,.2,.4,(0,0,0),'marble_dark',.02); 
    for zz in(-.1,.1): lathe([(.62,0),(.66,.01),(.66,.03),(.62,.04)],(0,.95,zz),'chrome',40,rot=(math.pi/2,0,0)); lathe([(0,0),(.14,0),(.14,.04),(0,.04)],(0,.95,zz),'chrome',24,rot=(math.pi/2,0,0))
    for zz in(-.1,.1):
        for k in range(5): a=k*2*math.pi/5; bx(.1,.52,.02,(math.cos(a+math.pi/2)*.12,.95+math.sin(a+math.pi/2)*.12,zz-.02),'chrome',.006,rot=(0,0,a))
    lathe([(.2,0),(.5,0),(.5,.2),(.2,.2)],(0,.95,.1),'black',40,rot=(math.pi/2,0,0)); 
@prop
def projector_display():
    bx(.6,.6,.6,(0,0,0),'wood_panel',.02); bx(.3,.4,.6,(0,.75,0),'iron',.03); cyl(.05,.2,(0,.95,.3),'brass',16,axis='z'); 
    for y,z in((1.35,-.1),(.75,-.35)): lathe([(0,0),(.26,0),(.26,.04),(0,.04)],(.17,y,z),'iron',28,rot=(0,0,-math.pi/2))
    for s in(-1,1): tube([(s*.1,.6,s*.05),(s*.15,.75,0)],.03,'iron')
@prop
def piano():
    prism([(-.75,0),(.75,0),(.75,.6),(.6,1.0),(.2,1.15),(-.1,1.6),(-.5,1.75),(-.75,1.6)],.3,(0,.8,-.6),'lacquer',rot=(math.pi/2,0,0),b=.01); bx(1.4,.06,.26,(0,.72,.72),'lacquer',.01); bx(1.24,.03,.14,(0,.78,.74),'paper_white',.004)
    for k in range(36):
        if k%7 not in(2,6): bx(.014,.025,.08,(-.6+.0345*k,.8,.71),'black',.002)
    for x,z in((-.6,.5),(.6,.5),(-.3,-.7)): cyl(.05,.66,(x,0,z),'lacquer',12,r2=.07)
    cushion(.7,.1,.35,(0,.42,1.25),'leather_dark'); 
    for s in(-1,1): bx(.05,.42,.3,(s*.28,0,1.25),'lacquer',.01)
@prop
def fountain():
    lathe([(0,0),(1.0,0),(1.05,.08),(1.0,.4),(1.06,.45),(1.02,.5),(.92,.46),(.9,.3),(0,.28)],(0,0,0),'marble_light',40); cyl(.91,.01,(0,.4,0),'water',36); lathe([(.14,.3),(.1,.6),(.16,.85),(.45,.95),(.5,1.0),(.42,1.0),(.1,.94),(0,.94)],(0,0,0),'marble_light',28); cyl(.42,.008,(0,.985,0),'water',28); lathe([(.07,.95),(.06,1.3),(.1,1.36),(0,1.42)],(0,0,0),'brass',16)
    for k in range(8): a=k*math.pi/4; tube([(math.cos(a)*(.05+.55*t),1.38+.35*t-1.35*t*t,math.sin(a)*(.05+.55*t)) for t in np.linspace(0,1,9)],.008,'water',6)
@prop
def table_set():
    lathe([(0,0),(.3,0),(.3,.02),(.05,.05),(.04,.7),(.1,.72)],(0,0,0),'iron',20); cyl(.42,.035,(0,.72,0),'marble_light',28,b=.01)
    for k in range(4):
        a=k*math.pi/2+math.pi/4; c=np.array([math.cos(a)*.68,0,math.sin(a)*.68]); cyl(.19,.05,(c[0],.44,c[2]),'velvet_red',18,b=.015)
        for j in range(4): b=j*math.pi/2+a+math.pi/4; cyl(.014,.44,(c[0]+math.cos(b)*.14,0,c[2]+math.sin(b)*.14),'brass',8)
        tube([(c[0]+.21*math.cos(a+t),.5+.34*math.cos(t*.9),c[2]+.21*math.sin(a+t)) for t in np.linspace(-1.2,1.2,9)],.016,'brass',8)
@prop
def lounge_chair():
    cushion(.62,.2,.6,(0,.26,.04),'velvet_teal',puff=.5); cushion(.66,.6,.18,(0,.34,-.28),'velvet_teal',rot=(-.2,0,0))
    for s in(-1,1): cushion(.14,.36,.6,(s*.36,.26,0),'velvet_teal')
    for sx in(-1,1):
        for sz in(-1,1): cyl(.025,.26,(sx*.28,0,sz*.22),'brass',10,r2=.018)
@prop
def bar_stool():
    lathe([(0,0),(.2,0),(.2,.02),(.03,.05),(.025,.7),(.08,.72)],(0,0,0),'brass',18); cyl(.19,.08,(0,.72,0),'velvet_teal',20,b=.025); lathe([(.14,.28),(.155,.28),(.155,.3),(.14,.3)],(0,0,0),'brass',20)
@prop
def vip_bar():
    bx(5,1.04,.66,(0,0,0),'wood_panel',.02); bx(5.1,.06,.82,(0,1.04,.02),'marble_dark',.02); bx(5,.03,.03,(0,.98,.35),'lamp',.005)
    for k in range(-6,7): bx(.04,.9,.02,(k*.4,.06,.34),'brass',.006)
    for y in(1.3,1.65,2.0):
        bx(4.8,.03,.24,(0,y,-.75),'glass',0); bx(4.8,.012,.02,(0,y+.03,-.64),'lamp',0)
        for k in range(26):
            h=.2+.08*R.random(); lathe([(0,0),(.035,0),(.036,h*.6),(.014,h*.78),(.014,h),(0,h)],(-2.2+.18*k,y+.03,-.75),['bottle_green','bottle_amber','bottle_clear','bottle_red'][R.randrange(4)],10)
# ===== restroom
@prop
def toilet():
    lathe([(0,0),(.12,0),(.11,.12),(.13,.2),(.19,.34),(.2,.4),(.17,.4),(.12,.3),(0,.24)],(0,0,.06),'porcelain',24,sz=1.25); lathe([(.115,.0),(.2,0),(.205,.015),(.2,.03),(.115,.03),(.115,0)],(0,.4,.06),'porcelain',24,sz=1.25); bx(.4,.36,.18,(0,.4,-.24),'porcelain',.04); bx(.42,.04,.2,(0,.76,-.24),'porcelain',.015); bx(.2,.4,.2,(0,0,-.2),'porcelain',.04); cyl(.02,.01,(0,.8,-.24),'chrome',12)
@prop
def urinal():
    lathe([(0,0),(.1,.02),(.17,.2),(.19,.5),(.19,.62),(.16,.62),(.15,.5),(.12,.25),(0,.15)],(0,.5,.02),'porcelain',22,sz=.8); bx(.36,.34,.1,(0,1.02,-.1),'porcelain',.04); bx(.32,.6,.08,(0,.55,-.1),'porcelain',.03); cyl(.018,.2,(0,1.36,-.1),'chrome',10)
@prop
def sink():
    lathe([(.22,.03),(.225,.045),(.2,.05),(.17,.0),(.1,-.07),(0,-.08)],(0,.86,0),'porcelain',26); tube([(0,.88,-.26),(0,1.04,-.26),(0,1.1,-.2),(0,1.08,-.1),(0,1.04,-.08)],.016,'chrome',8); 
    for s in(-1,1): cyl(.02,.06,(s*.09,.88,-.26),'chrome',10); bx(.06,.015,.02,(s*.09,.94,-.26),'chrome',.005)
    bx(.1,.18,.08,(.3,1.0,-.3),'enamel_cream',.02)
# ===== projection booth
@prop
def projector_35():
    bx(.5,.8,.7,(0,0,-.1),'iron',.03); bx(.42,.55,.75,(0,.85,-.05),'enamel_green',.04); bx(.46,.5,.5,(0,.95,.6),'enamel_green',.06); cyl(.09,.28,(0,1.2,-.5),'brass',24,axis='z',r2=.07) ; cyl(.06,.2,(0,1.2,-.7),'black',20,axis='z'); bx(.1,.5,.12,(.0,1.4,.1),'iron',.02)
    for y,z in((1.85,.1),(.62,.3)):
        lathe([(0,0),(.34,0),(.34,.012),(0,.012)],(.26,y,z),'iron',32,rot=(0,0,-math.pi/2)); lathe([(0,0),(.34,0),(.34,.012),(0,.012)],(.36,y,z),'iron',32,rot=(0,0,-math.pi/2)); lathe([(.08,0),(.28,0),(.28,.08),(.08,.08)],(.27,y,z),'filmstock',32,rot=(0,0,-math.pi/2))
    cyl(.1,.9,(0,1.45,.7),'chrome',18); bx(.2,.12,.02,(.2,1.1,.86),'brass',.006); cyl(.03,.03,(-.22,1.1,.1),'enamel_red',12,axis='x'); plane(.1,.1,(.214,1.05,-.1),'lamp',rot=(0,math.pi/2,0))
@prop
def projector_dig():
    bx(.7,.85,.9,(0,0,0),'plastic_dark',.03); bx(.82,.55,1.2,(0,.9,-.02),'metal_grey',.05); cyl(.16,.14,(0,1.2,-.66),'black',28,axis='z'); cyl(.12,.1,(0,1.2,-.74),'lens',28,axis='z'); bx(.3,.2,.02,(.414,1.05,.1),'black',.005,rot=(0,math.pi/2,0)); plane(.24,.15,(.43,1.08,.1),'screen_pos',rot=(0,math.pi/2,0)); bx(.6,.012,.3,(0,1.45,.2),'black',0); cyl(.12,.7,(0,1.45,.35),'chrome',18); 
    for k in range(6): bx(.02,.3,.01,(-.25+.1*k,1.02,.585),'black',0)
@prop
def projector_laser():
    bx(.8,.8,1.0,(0,0,0),'plastic_dark',.03); bx(.95,.62,1.4,(0,.85,-.05),'paper_white',.08); bx(.97,.05,1.2,(0,1.1,-.05),'neon_cyan',.01); cyl(.2,.16,(0,1.2,-.78),'black',30,axis='z'); cyl(.15,.1,(0,1.2,-.88),'lens',30,axis='z'); bx(.6,1.8,.5,(1.0,0,.2),'plastic_dark',.02); 
    for k in range(8): bx(.5,.03,.01,(1.0,.25+.19*k,.46),'neon_cyan' if k%3==0 else 'metal_grey',.002)
@prop
def rack():
    bx(.6,1.9,.6,(0,0,0),'plastic_dark',.02)
    for k in range(8): bx(.5,.14,.02,(0,.2+.2*k,.3),'metal_grey',.006); bx(.02,.02,.01,(.18,.26+.2*k,.315),'neon_green',.002); bx(.02,.02,.01,(.13,.26+.2*k,.315),'neon_cyan',.002)
@prop
def speaker():
    bx(.42,.62,.3,(0,0,0),'black',.02,rot=(.2,0,0)); cyl(.14,.02,(0,.2,.16),'iron',20,axis='z'); cyl(.05,.02,(0,.46,.2),'iron',14,axis='z')
# ===== office
@prop
def desk():
    bx(2.2,.05,1.0,(0,.73,0),'wood',.015); 
    for s in(-1,1): bx(.5,.7,.9,(s*.8,.03,0),'wood_panel',.012); 
    for s in(-1,1):
        for k in range(3): bx(.42,.18,.02,(s*.8,.1+.21*k,-.455),'wood',.008); bx(.1,.02,.02,(s*.8,.18+.21*k,-.47),'brass',.005)
    bx(.62,.38,.03,(-.3,.95,.1),'plastic_dark',.01); plane(.58,.34,(-.3,.97,.083),'screen_pos',rot=(0,math.pi,0)); cyl(.02,.2,(-.3,.78,.12),'plastic_dark',10); bx(.3,.015,.2,(-.3,.78,.12),'plastic_dark',.006); bx(.42,.02,.14,(-.3,.78,-.22),'plastic_dark',.006)
    lathe([(0,0),(.1,0),(.1,.02),(.015,.03),(.015,.3)],(.75,.78,.1),'brass',18); prism([(-.2,0),(.2,0),(.14,.12),(-.14,.12)],.2,(.75,1.06,.1),'glass_green',b=.02); 
    for k in range(3): bx(.22,.02,.3,(.3+.02*k,.78+.022*k,-.1),'paper_white',.002,rot=(0,.1*k,0))
@prop
def office_chair():
    cushion(.5,.12,.5,(0,.44,0),'leather_dark'); cushion(.48,.62,.12,(0,.54,-.25),'leather_dark',rot=(-.15,0,0)); cyl(.03,.36,(0,.08,0),'chrome',10)
    for k in range(5): a=k*2*math.pi/5; tube([(0,.1,0),(math.cos(a)*.28,.06,math.sin(a)*.28)],.02,'chrome'); sph(.03,(math.cos(a)*.28,.03,math.sin(a)*.28),'black',u=8,v=6)
@prop
def shelves():
    bx(3.0,2.1,.04,(0,0,-.26),'wood',.005)
    for k in range(5): bx(3.0,.03,.5,(0,.05+.5*k,0),'wood',.006)
    for x in(-1.5,-.5,.5,1.5): bx(.03,2.1,.5,(x,0,0),'wood',.006)
    for j in range(4):
        for b in range(3):
            x=-1.44+b*1.0
            while x<-1.44+b*1.0+.86:
                w=.03+.04*R.random(); h=.24+.16*R.random(); 
                if R.random()<.82 and (not LOW or R.random()<.5): bx(w*(2 if LOW else 1),h,.3,(x+w/2,.08+.5*j,.05),['book_a','book_b','book_c','book_d'][R.randrange(4)],0)
                x+=w+.004
@prop
def sofa():
    cushion(2.1,.22,.8,(0,.22,.05),'velvet_teal',puff=.2); cushion(2.1,.6,.22,(0,.3,-.33),'velvet_teal',puff=.2,rot=(-.12,0,0)); bx(2.1,.2,.78,(0,.06,0),'wood',.02)
    for s in(-1,1): cushion(.22,.45,.85,(s*1.05,.18,0),'velvet_teal',puff=.3)
# ===== food hall
@prop
def food_counter():
    bx(11.5,.1,.74,(0,0,-.02),'black',.01); bx(11.5,.9,.7,(0,.1,0),'tile_teal',.01); bx(11.6,.06,.86,(0,1.0,0),'marble_light',.02); bx(11.5,.03,.03,(0,.96,.36),'lamp',.005)
    for x in(-3.8,0,3.8): bx(1.6,.36,.02,(x,1.06,.3),'glass',0)
@prop
def food_back():
    bx(12.4,.9,.7,(0,0,0),'metal_grey',.01); bx(12.4,.04,.74,(0,.9,0),'chrome',.01); bx(12.4,.5,.5,(0,2.1,-.08),'chrome',.03)
    for x in(-4,-3.2): bx(.7,.6,.6,(x,.94,0),'chrome',.03); bx(.56,.3,.02,(x,1.08,.31),'lamp',.01)
    bx(1.4,.7,.66,(3.8,.94,0),'brick_prop',.02); bx(.8,.34,.05,(3.8,1.0,.32),'black',.05); bx(.7,.1,.03,(3.8,1.02,.33),'lamp',.03)
    bx(1.2,.12,.56,(0,.94,0),'iron',.01); 
    for k in range(6): cyl(.06,.02,(-.45+.18*k,1.06,.1),'sausage',14)
# ===== street
def car(col,h=.62,roof=((-1.0,.0),(-.62,.56),(.62,.58),(1.22,.0))):
    prism([(-2.2,.28),(2.15,.28),(2.25,.5),(2.15,.78),(1.25,.9),(-1.15,.92),(-2.1,.82),(-2.28,.6)],1.78,(0,0,0),col,b=.07)
    prism([(-1.25,.88),(-.72,1.38),(.55,1.42),(1.22,.88)],1.5,(0,0,0),'carglass',b=.06); prism([(-.74,1.36),(.56,1.40),(.5,1.47),(-.62,1.46)],1.44,(0,0,0),col,b=.03)
    for x in(-1.2,-.06,1.2):
        for z in(-.76,.76): tube([(x*1.0,.9,z),(x*.56,1.40,z*.93)],.03,col,6)
    for x in(-1.4,1.38):
        for z in(-.82,.82): cyl(.33,.22,(x,.33,z-.11),'tyre',24,axis='z',b=.03); cyl(.2,.24,(x,.33,z-.12),'chrome',18,axis='z')
    for z in(-.62,.62): bx(.08,.12,.36,(2.2,.58,z),'lamp',.02); bx(.08,.12,.36,(-2.24,.62,z),'tail',.02)
    bx(.1,.16,1.2,(2.26,.32,0),'plastic_dark',.03); bx(.1,.16,1.4,(-2.28,.34,0),'plastic_dark',.03)
@prop
def car_red(): car('car_red')
@prop
def car_blue(): car('car_blue')
@prop
def taxi(): car('car_yellow'); bx(.3,.14,.6,(0,1.46,0),'lamp',.03)
@prop
def tree():
    tube([(0,0,0),(.03,.9,.02),(-.04,1.8,0),(.05,2.8,.05)],[.11,.09,.075,.04],'bark',9); bx(1.1,.04,1.1,(0,.0,0),'iron',.01)
    for k in range(6): a=k*1.05; tube([(0,1.7+.2*k,0),(math.cos(a)*.5,2.3+.22*k,math.sin(a)*.5)],[.04,.015],'bark',6)
    for k in range(230):
        a=R.random()*6.28; t=R.random()**.5; y=2.1+2.2*R.random(); rr=1.15*t*math.sqrt(max(0.05,1-((y-3.2)/1.3)**2)); c=np.array([math.cos(a)*rr,y,math.sin(a)*rr]); u=np.array([R.uniform(-1,1),R.uniform(-.5,.5),R.uniform(-1,1)]); u/=np.linalg.norm(u); v=np.cross(u,[R.uniform(-1,1),1,R.uniform(-1,1)]); v/=np.linalg.norm(v); s=.17
        leafsheet([c-u*s-v*s*.6,c+u*s-v*s*.2],[c-u*s*.4+v*s*.8,c+u*s*1.1+v*s*.5],'leaf_tree')
@prop
def hydrant(): lathe([(0,0),(.15,0),(.15,.05),(.1,.08),(.1,.5),(.13,.52),(.12,.6),(.06,.68),(0,.7)],(0,0,0),'enamel_red',18); cyl(.05,.34,(-.17,.38,0),'enamel_red',12,axis='x')
@prop
def newsbox(): bx(.45,.9,.42,(0,.15,0),'cab_blue',.03); bx(.36,.34,.02,(0,.6,.21),'glass',0); plane(.33,.3,(0,.62,.2),'screen_poster'); bx(.4,.15,.36,(0,0,0),'iron',.01)
@prop
def hoarding():
    # 1 m wide plywood panel, tiled along a blocked doorway, 3 m tall
    bx(.98,2.9,.05,(0,.02,0),'plywood',.006); bx(1.0,.12,.07,(0,0,0),'iron',.01); plane(.9,1.0,(0,1.1,.03),'screen_hoard')
# ===== litter & tools
@prop
def lit_popcorn():
    for k in range(22): a=R.random()*6.28; r=.2*R.random()**.6; sph(.017,(math.cos(a)*r,.012,math.sin(a)*r),'popcorn',(1,.8,1),u=6,v=5)
@prop
def lit_cup(): cyl(.035,.13,(0,.04,0),'stripe_red',14,r2=.047,axis='x'); cyl(.008,.2,(.1,.05,0),'candy_a',6,axis='x')
@prop
def lit_bucket():
    cyl(.07,.17,(-.05,.085,0),'stripe_red',16,r2=.1,axis='x',cap=False)
    for k in range(14): sph(.017,(.15+.14*R.random(),.014,R.uniform(-.12,.12)),'popcorn',u=6,v=5)
@prop
def lit_wrapper(): bx(.14,.008,.08,(0,.003,0),'candy_a',.002,rot=(.05,.4,.08)); bx(.1,.006,.07,(.1,.003,.08),'paper_white',.002,rot=(.1,1.2,-.06))
@prop
def wet_sign(): prism([(-.16,0),(.16,0),(.12,.62),(-.12,.62)],.012,(0,0,.11),'enamel_yellow',rot=(-.18,0,0)); prism([(-.16,0),(.16,0),(.12,.62),(-.12,.62)],.012,(0,0,-.11),'enamel_yellow',rot=(.18,0,0))
@prop
def mop_bucket():
    prism([(-.2,0),(.2,0),(.26,.36),(-.26,.36)],.34,(0,.08,0),'enamel_yellow',b=.02); bx(.2,.14,.26,(.1,.42,0),'enamel_yellow',.02); cyl(.2,.005,(0,.4,0),'water',18)
    for sx in(-1,1):
        for sz in(-1,1): sph(.035,(sx*.15,.04,sz*.12),'black',u=8,v=6)
@prop
def toolbox(): bx(.46,.2,.22,(0,0,0),'enamel_red',.015); prism([(-.22,0),(.22,0),(.16,.07),(-.16,.07)],.2,(0,.2,0),'enamel_red',b=.01); tube([(-.1,.27,0),(-.1,.33,0),(.1,.33,0),(.1,.27,0)],.012,'black')
@prop
def ladder():
    for s in(-1,1): tube([(s*.22,0,.35),(s*.16,1.8,0)],.022,'enamel_yellow'); tube([(s*.22,0,-.35),(s*.16,1.8,0)],.018,'iron')
    for k in range(6): t=(k+1)/7; bx(.4-.08*t,.02,.07,(0,1.8*t,.35*(1-t)),'enamel_yellow',.005)
# ---- held props, in hand space (origin at hand, y up, z forward)
@prop
def held_popcorn():
    cyl(.062,.17,(0,-.09,.06),'stripe_red',16,r2=.09,cap=False); lathe([(0,.0),(.088,0),(.07,.035),(.03,.055),(0,.06)],(0,.07,.06),'popcorn',14)
@prop
def held_cup(): cyl(.032,.14,(0,-.07,.05),'stripe_red',14,r2=.043); cyl(.045,.012,(0,.07,.05),'paper_white',14); cyl(.005,.1,(.01,.08,.05),'candy_a',6)
@prop
def held_mop(): cyl(.013,1.35,(0,-.75,.16),'wood',8,rot=(.25,0,0)); cyl(.12,.08,(0,-.86,.14),'paper_white',14,r2=.05)
@prop
def held_phone(): bx(.07,.14,.01,(0,-.02,.04),'black',.008,rot=(-.5,0,0)); plane(.06,.12,(0,-.01,.047),'lamp_cool',rot=(-.5+math.pi,0,0))
@prop
def held_wrench(): bx(.025,.2,.012,(0,-.05,.05),'chrome',.004); bx(.06,.05,.014,(0,.14,.05),'chrome',.01)
@prop
def held_clipboard(): bx(.22,.3,.012,(0,-.06,.1),'wood',.006,rot=(-.9,0,0)); plane(.2,.26,(0,-.02,.112),'paper_white',rot=(-.9,0,0))
# -------------------------------------------------------------------------------------------------
MULTI={'screen_pos','screen_menu'}
def finish(name):
    bymat={}
    for o in OBJ:
        me=o.data
        if not me.uv_layers or not o.get('planar'):
            l=me.uv_layers[0] if me.uv_layers else me.uv_layers.new(name='uv')
            for p in me.polygons:
                n=p.normal; ax=max(range(3),key=lambda i:abs(n[i]))
                for li in p.loop_indices:
                    c=me.vertices[me.loops[li].vertex_index].co; l.data[li].uv=((c.y,c.z) if ax==0 else (c.x,c.z) if ax==1 else (c.x,c.y))
        m=bpy.data.materials.get('M') or bpy.data.materials.new('M'); me.materials.clear(); me.materials.append(m)
        bymat.setdefault(o['m'],[]).append(o)
    glassy=('glass','water','lens','slush_blue','slush_red','slush_green')
    for k,os_ in bymat.items():
        for o in os_: o.hide_render=k.startswith('glass') or k=='water'
    prims=[]
    for k,os_ in sorted(bymat.items()):
        bpy.ops.object.select_all(action='DESELECT')
        for o in os_: o.hide_render=False; o.select_set(True)
        bpy.context.view_layer.objects.active=os_[0]
        if len(os_)>1: bpy.ops.object.join()
        o=bpy.context.view_layer.objects.active; me=o.data; 
        o.hide_render=k.startswith('glass') or k=='water'
        prims.append((k,o))
    res=[]
    for k,o in prims:
        me=o.data; ca=me.color_attributes.new('ao','BYTE_COLOR','POINT'); me.color_attributes.active_color=ca
        hid=o.hide_render; ao=None
        if not hid:
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o; bpy.ops.object.bake(type='AO',target='VERTEX_COLORS'); ao=np.array([c.color[0] for c in me.color_attributes['ao'].data])
        else: ao=np.ones(len(me.vertices))
        if len(me.uv_layers)==0: me.uv_layers.new(name='uv')
        me.calc_loop_triangles(); uv=np.array([l.uv[:] for l in me.uv_layers[0].data]); P=[];N=[];U=[];A=[];I=[];key={}
        cn=[tuple(c.vector) for c in me.corner_normals]
        # hard edges: split normals by angle
        for t in me.loop_triangles:
            p=me.polygons[t.polygon_index]
            for li,vi in zip(t.loops,t.vertices):
                n=p.normal if not p.use_smooth else me.vertices[vi].normal
                if p.use_smooth and n.dot(p.normal)<.5: n=p.normal
                c=me.vertices[vi].co; kk=(vi,round(uv[li][0],3),round(uv[li][1],3),round(n[0],1),round(n[1],1),round(n[2],1))
                if kk not in key: key[kk]=len(P); P.append((c[0],c[2],-c[1])); N.append((n[0],n[2],-n[1])); U.append(tuple(uv[li])); A.append(ao[vi])
                I.append(key[kk])
        res.append((k,np.array(P,'<f4'),np.array(N,'<f4'),np.array(U,'<f4'),(np.clip(np.array(A),0,1)*255).astype('u1'),np.array(I,'<u4')))
    return res
blob=b''; meta={}
mp=OUT+'/props.json'
def put(a):
    global blob
    while len(blob)%4: blob+=b'\0'
    o=len(blob); blob+=a.tobytes(); return o
tot=0
for name,f in PROPS.items():
    reset(); f(); res=finish(name); e=[]; allp=np.concatenate([r[1] for r in res])
    for k,p,n,u,a,i in res:
        nn=np.concatenate([np.round(n*127),np.zeros((len(n),1))],1).astype('i1')
        e.append(dict(mat=k,nv=len(p),ni=len(i),p=put(p),n=put(nn),u=put(u),a=put(a),i=put(i)))
    tris=sum(x['ni'] for x in e)//3; tot+=tris
    meta[name]=dict(prims=e,min=[float(x) for x in allp.min(0)],max=[float(x) for x in allp.max(0)],tris=tris); print(name,tris,[round(float(x),2) for x in allp.max(0)-allp.min(0)],flush=True)
if not ONLY: open(OUT+('/props_lo.bin' if LOW else '/props.bin'),'wb').write(blob); json.dump(meta,open(OUT+('/props_lo.json' if LOW else '/props.json'),'w'))
print(len(meta),'props',tot,'tris',len(blob)//1024,'KB')
