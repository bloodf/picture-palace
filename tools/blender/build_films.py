import bpy, math, random, os, sys, json, numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(HERE,'../../public/assets/films'); A=os.path.join(HERE,'../../public/assets')
ONLY=set(sys.argv[1:])
def reset(sky=(.05,.07,.12),st=1.0,spp=48,fog=0,fogcol=(1,1,1)):
    global sc
    bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=18 if fog else 28; sc.cycles.adaptive_threshold=.05; sc.cycles.use_denoising=True; sc.cycles.max_bounces=5; sc.cycles.volume_bounces=0
    sc.render.resolution_x=896; sc.render.resolution_y=408; sc.view_settings.view_transform='AgX'
    w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(*sky,1); w.node_tree.nodes['Background'].inputs[1].default_value=st
    if fog:
        m=bpy.data.materials.new('fog'); m.use_nodes=True; nt=m.node_tree; nt.nodes.remove(nt.nodes['Principled BSDF']); v=nt.nodes.new('ShaderNodeVolumeScatter'); v.inputs['Density'].default_value=fog; v.inputs['Anisotropy'].default_value=.5; v.inputs['Color'].default_value=(*fogcol,1); nt.links.new(v.outputs[0],nt.nodes['Material Output'].inputs['Volume'])
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,30,8)); o=bpy.context.object; o.scale=(90,90,26); o.data.materials.append(m)
def M(c,r=.6,metal=0,em=0,tex=None):
    m=bpy.data.materials.new('m'); m.use_nodes=True; b=m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value=(*c,1); b.inputs['Roughness'].default_value=r; b.inputs['Metallic'].default_value=metal
    if em: b.inputs['Emission Color'].default_value=(*c,1); b.inputs['Emission Strength'].default_value=em
    if tex:
        nt=m.node_tree; n=nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value=tex[0]; n.inputs['Detail'].default_value=8; r_=nt.nodes.new('ShaderNodeValToRGB'); r_.color_ramp.elements[0].color=(*c,1); r_.color_ramp.elements[1].color=(*tex[1],1); r_.color_ramp.elements[0].position=.35; r_.color_ramp.elements[1].position=.68; co=nt.nodes.new('ShaderNodeTexCoord'); nt.links.new(co.outputs['Object'],n.inputs[0]); nt.links.new(n.outputs[0],r_.inputs[0]); nt.links.new(r_.outputs[0],b.inputs['Base Color']); bp=nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value=.5; nt.links.new(n.outputs[0],bp.inputs['Height']); nt.links.new(bp.outputs[0],b.inputs['Normal'])
    return m
def put(o,m): o.data.materials.clear(); o.data.materials.append(m); return o
def box(x,y,z,sx,sy,sz,m,rz=0): bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z+sz/2),rotation=(0,0,rz)); o=bpy.context.object; o.scale=(sx,sy,sz); return put(o,m)
def sph(x,y,z,r,m,s=(1,1,1),sub=None): bpy.ops.mesh.primitive_uv_sphere_add(radius=r,location=(x,y,z),segments=48,ring_count=24); o=bpy.context.object; o.scale=s; bpy.ops.object.shade_smooth(); return put(o,m)
def cyl(x,y,z,r,h,m,rot=(0,0,0),r2=None,n=24): bpy.ops.mesh.primitive_cone_add(radius1=r,radius2=r if r2 is None else r2,depth=h,location=(x,y,z+h/2),rotation=rot,vertices=n); o=bpy.context.object; bpy.ops.object.shade_smooth(); return put(o,m)
def ground(m,size=400,z=0,disp=0,scale=.1,seed=0,y=0,sub=140):
    bpy.ops.mesh.primitive_grid_add(size=size,location=(0,y,z),x_subdivisions=sub,y_subdivisions=sub); o=bpy.context.object
    if disp:
        from mathutils import noise, Vector
        for v in o.data.vertices: v.co.z+=disp*(noise.fractal(Vector((v.co.x*scale+seed,v.co.y*scale,seed)),1.0,2.0,6))
        bpy.ops.object.shade_smooth()
    return put(o,m)
def terrain(m,f,size=200,n=180,y=0):
    bpy.ops.mesh.primitive_grid_add(size=size,location=(0,y,0),x_subdivisions=n,y_subdivisions=n); o=bpy.context.object
    for v in o.data.vertices: v.co.z=f(v.co.x,v.co.y+y)
    bpy.ops.object.shade_smooth(); return put(o,m)
def sun(e,rx,rz,c=(1,1,1),ang=.02): l=bpy.data.lights.new('s','SUN'); l.energy=e; l.color=c; l.angle=ang; o=bpy.data.objects.new('s',l); o.rotation_euler=(rx,0,rz); sc.collection.objects.link(o)
def pt(x,y,z,e,c=(1,1,1),r=.2): l=bpy.data.lights.new('p','POINT'); l.energy=e; l.color=c; l.shadow_soft_size=r; o=bpy.data.objects.new('p',l); o.location=(x,y,z); sc.collection.objects.link(o)
def spot(x,y,z,tx,ty,tz,e,c=(1,1,1),ang=.6,bl=.3):
    from mathutils import Vector
    l=bpy.data.lights.new('p','SPOT'); l.energy=e; l.color=c; l.spot_size=ang; l.spot_blend=bl; l.shadow_soft_size=.1; o=bpy.data.objects.new('p',l); o.location=(x,y,z); o.rotation_euler=Vector((tx-x,ty-y,tz-z)).to_track_quat('-Z','Y').to_euler(); sc.collection.objects.link(o)
def cam(x,y,z,tx,ty,tz,lens=35,fs=None,fd=None):
    from mathutils import Vector
    c=bpy.data.cameras.new('c'); c.lens=lens; o=bpy.data.objects.new('c',c); o.location=(x,y,z); o.rotation_euler=Vector((tx-x,ty-y,tz-z)).to_track_quat('-Z','Y').to_euler(); sc.collection.objects.link(o); sc.camera=o
    if fs: c.dof.use_dof=True; c.dof.aperture_fstop=fs; c.dof.focus_distance=fd or (Vector((tx-x,ty-y,tz-z)).length)
_cm=None
def person(cid,x,y,rz,m=None,arms=1,s=1,z=0):
    """character mesh with arms brought down, standing"""
    global _cm
    if _cm is None: _cm={c['id']:c for c in json.load(open(A+'/chars/chars.json'))['chars']}; 
    c=_cm[cid]; L=c['lods'][0]; b=open(f'{A}/chars/{cid}.bin','rb').read(); n=L['nv']; o=L['off']; P=np.frombuffer(b,'<f4',n*3,o['p']).reshape(-1,3).copy(); U=np.frombuffer(b,'<f4',n*2,o['u']).reshape(-1,2); I=np.frombuffer(b,'<u2',L['ni'],o['i']).reshape(-1,3); PT=np.frombuffer(b,'u1',n,o['part']); bi=np.frombuffer(b,'u1',n*4,o['bi']).reshape(-1,4); bw=np.frombuffer(b,'u1',n*4,o['bw']).reshape(-1,4)/255.
    J=c['joints']
    for sd,(b0,b1) in enumerate(((7,11),(12,16))):
        w=((bi>=b0)&(bi<b1))*bw; w=w.sum(1)[:,None]; piv=np.array(J[b0]); sg=1 if sd==0 else -1; ang=-sg*math.radians(38)*arms; cs,sn=math.cos(ang),math.sin(ang); d=P-piv; q=np.stack([d[:,0]*cs-d[:,1]*sn,d[:,0]*sn+d[:,1]*cs,d[:,2]],1)+piv; P=P*(1-w)+q*w
    me=bpy.data.meshes.new(cid); me.from_pydata([(p[0]*s,-p[2]*s,p[1]*s) for p in P],[],I.tolist()); l=me.uv_layers.new(name='uv')
    for lp in me.loops: l.data[lp.index].uv=U[lp.vertex_index]
    for p in me.polygons: p.use_smooth=True
    ob=bpy.data.objects.new(cid,me); ob.location=(x,y,z); ob.rotation_euler=(0,0,rz); sc.collection.objects.link(ob)
    if m: me.materials.append(m); return ob
    tint={0:tuple((int(c['skin'][i:i+2],16)/255)**2.2 for i in(1,3,5)),1:random.choice([(.3,.06,.05),(.08,.12,.3),(.5,.45,.35),(.05,.05,.06)]),2:(.05,.07,.14),3:(.06,.04,.03),4:(.05,.03,.02),5:(1,1,1),6:(.3,.05,.05)}
    ca=me.color_attributes.new('t','FLOAT_COLOR','POINT'); ca.data.foreach_set('color',np.array([[*tint[int(p)],1] for p in PT]).ravel())
    mt=bpy.data.materials.new(cid); mt.use_nodes=True; nt=mt.node_tree; bs=nt.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value=.6
    t=nt.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(f'{A}/chars/{cid}.webp'); vt=nt.nodes.new('ShaderNodeVertexColor'); vt.layer_name='t'; mx=nt.nodes.new('ShaderNodeMix'); mx.data_type='RGBA'; mx.blend_type='MULTIPLY'; mx.inputs[0].default_value=1; nt.links.new(t.outputs[0],mx.inputs[6]); nt.links.new(vt.outputs[0],mx.inputs[7]); nt.links.new(mx.outputs[2],bs.inputs['Base Color']); me.materials.append(mt); return ob
def car(x,y,rz,c,z=0):
    meta=json.load(open(A+'/props/props.json'))['car_red']; b=open(A+'/props/props.bin','rb').read()
    for p in meta['prims']:
        n=p['nv']; P=np.frombuffer(b,'<f4',n*3,p['p']).reshape(-1,3); I=np.frombuffer(b,'<u4',p['ni'],p['i']).reshape(-1,3); me=bpy.data.meshes.new('x'); me.from_pydata([(v[0],-v[2],v[1]) for v in P],[],I.tolist()); k=p['mat']
        me.materials.append(M(c,.2,.3) if k=='car_red' else M((1,.85,.6),.3,0,30) if k=='lamp' else M((1,.05,.03),.3,0,12) if k=='tail' else M((.02,.02,.03),.05) if k=='carglass' else M((.03,.03,.03),.6) if k!='chrome' else M((.7,.7,.7),.2,1))
        o=bpy.data.objects.new('x',me); o.location=(x,y,z); o.rotation_euler=(0,0,rz); sc.collection.objects.link(o)
def stars(n=500):
    m=M((1,1,1),.5,0,14); R=random.Random(2)
    for i in range(n):
        a=R.uniform(-1.2,1.2); e=R.uniform(-.7,.8); d=90; r=.03+.09*R.random()**5; bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=r,location=(math.sin(a)*d,math.cos(a)*d,math.sin(e)*d*.6)); put(bpy.context.object,m)
def city(R,y0,y1,wmax=40,em=6):
    for i in range(70):
        x=R.uniform(-wmax,wmax); y=R.uniform(y0,y1)
        if abs(x)<7 : continue
        h=R.uniform(8,34); w=R.uniform(4,8); box(x,y,0,w,w,h,M((.03,.03,.04),.4))
        c=R.choice([(1,.7,.35),(.5,.8,1),(1,.4,.6),(1,.85,.6)])
        for k in range(int(h*1.3)):
            bx_=x-w/2+R.random()*w; box(bx_,y-w/2-.02,R.uniform(1,h-1),R.uniform(.4,1.2),.02,.5,M(c,.5,0,em*R.random()))
def film(f): F[f.__name__]=f; return f
F={}
@film
def scifi1():
    reset((.001,.001,.004),1); stars(); ground(M((.08,.10,.14),.9,0,0,(.25,(.2,.16,.13))),300,-3,5,.05,3); sph(18,80,18,20,M((.35,.16,.08),.9,0,0,(.12,(.55,.35,.2)))); sph(-26,88,28,4,M((.4,.45,.5),.9,0,0,(.4,(.2,.22,.25)))); sun(4.5,1.15,.9,(1,.85,.7)); sun(.25,.5,-2,(.3,.5,1))
    met=M((.35,.37,.4),.35,.9); box(-5,24,3.5,5,9,1.2,met,.5); box(-5,24,4.6,2.4,6,.9,met,.5); cyl(-8,21,3.6,.7,5,met,(math.pi/2,0,.5)); cyl(-2,26,3.6,.7,5,met,(math.pi/2,0,.5)); pt(-6.5,20,4,900,(.3,.7,1)); person('m_athl',1.5,8,3.1,M((.02,.02,.025),.4),1,1,-1.8); cam(0,0,.4,1,30,6,30)
@film
def scifi2():
    reset((0,0,0),1,64,.02)
    for k in range(9):
        y=4+k*4; c=(.15,.7,1) if k%2 else (1,.2,.45); box(-3.2,y,0,.3,.5,4,M((.08,.08,.1),.3,.8)); box(3.2,y,0,.3,.5,4,M((.08,.08,.1),.3,.8)); box(0,y,4,6.7,.5,.3,M((.08,.08,.1),.3,.8)); box(-3.0,y,.3,.06,.1,3.4,M(c,.5,0,26)); box(3.0,y,.3,.06,.1,3.4,M(c,.5,0,26)); box(0,y,3.95,6,.1,.05,M(c,.5,0,20))
    ground(M((.03,.03,.04),.12,.3),60); box(-3.6,20,0,.1,60,4.5,M((.05,.05,.06),.4,.6)); box(3.6,20,0,.1,60,4.5,M((.05,.05,.06),.4,.6)); person('mgr_f',0,13,0,M((.01,.01,.012),.4)); spot(0,40,2.5,0,10,1.2,5000,(.6,.85,1),.7); cam(0,0,1.1,0,14,1.6,32)
@film
def horror1():
    reset((.01,.014,.03),1,64,.012,(.6,.75,1)); R=random.Random(5); ground(M((.02,.025,.02),.95,0,0,(2,(.04,.04,.03))),200,0,.7,.15); bk=M((.015,.012,.01),.9)
    for i in range(60):
        x=R.uniform(-26,26); y=R.uniform(8,50)
        if abs(x)<4.5 and y<40: continue
        cyl(x,y,-.5,R.uniform(.12,.3),R.uniform(8,14),bk,(R.uniform(-.06,.06),R.uniform(-.06,.06),0),.03,8)
        for k in range(6): z=R.uniform(2.5,8); a=R.random()*6.28; cyl(x+math.cos(a)*.9,y+math.sin(a)*.9,z,.05,2.2,bk,(math.sin(a)*1.0,math.cos(a)*1.0,0),.008,6)
    box(0,46,0,9,7,6,bk); 
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=7.5,depth=5,location=(0,46,8.5),rotation=(0,0,.785)); put(bpy.context.object,bk); box(3,44,6,1,1,5,bk)
    for x,z in((-2.8,3.6),(2.8,3.6)): box(x,42.4,z,1,.1,1.4,M((1,.45,.1),.5,0,18))
    spot(10,75,26,0,20,0,90000,(.55,.7,1),1.0); sph(13,88,27,3.4,M((.8,.9,1),.5,0,5)); person('f_old',.8,22,0,M((.004,.004,.006),.8)); cam(0,0,1.5,0,30,4.2,30)
@film
def horror2():
    reset((0,0,0),1,64,.05,(.8,.9,.85)); w=M((.12,.13,.10),.9,0,0,(1.5,(.05,.05,.04))); box(-1.8,12,0,.1,30,3,w); box(1.8,12,0,.1,30,3,w); box(0,12,3,3.7,30,.1,w); ground(M((.06,.05,.04),.3,0,0,(3,(.02,.02,.015))),40); box(0,24,0,1.3,.1,2.4,M((.9,1,.85),.5,0,8)); spot(0,25,1.6,0,6,.9,9000,(.8,1,.85),.9); pt(0,4,2.6,25,(.6,.8,.7),.4); person('girl',0,15,0,M((.006,.006,.007),.8)); cam(.3,0,1.3,0,20,1.2,26)
@film
def action1():
    reset((.004,.006,.015),1,56,.005); R=random.Random(4); city(R,14,80); ground(M((.02,.02,.025),.12,.1,0),200); car(-1.2,13,math.pi/2+.35+math.pi,(.5,.02,.02)); car(3.6,24,math.pi/2+math.pi,(.02,.05,.2)); sph(-6,34,3,3.2,M((1,.35,.05),.5,0,22)); sph(-4.4,33,4.8,2.2,M((1,.6,.15),.5,0,16)); sph(-7.6,34,5.4,1.8,M((1,.25,.03),.5,0,12)); pt(-6,30,4,26000,(1,.5,.15),1.5); pt(3,6,5,500,(.4,.6,1)); cam(1.2,0,.7,-.6,18,1.9,30)
@film
def action2():
    reset((.9,.5,.28),.6,48); sun(5,1.35,-.5,(1,.6,.3)); R=random.Random(8); ground(M((.45,.24,.12),.95,0,0,(.3,(.6,.36,.18))),300,0,1.2,.06)
    for i in range(14):
        x=R.choice([-1,1])*R.uniform(18,60); y=R.uniform(40,110); h=R.uniform(10,26); cyl(x,y,-1,R.uniform(5,10),h,M((.35,.13,.06),.95,0,0,(.25,(.55,.25,.12))),(0,0,R.random()*3),R.uniform(4,7),11)
    car(-2.5,15,math.pi/2+.2+math.pi,(.04,.04,.05),-.1); car(3,24,math.pi/2+math.pi-.15,(.35,.3,.1),0)
    for i in range(26): y=17+i*.9; sph(R.uniform(-5,5)+1,y,.8+R.random(),R.uniform(.6,1.8),M((.8,.55,.35),1)).visible_shadow=False
    cam(0,0,1.6,0,20,2.6,32)
@film
def romance1():
    reset((.55,.22,.25),.7,48); sun(3,1.5,0,(1,.45,.25)); m=M((.12,.07,.09),.06); ground(m,400,0,.12,1.2,1); sph(2,120,7,9,M((1,.45,.12),.5,0,7)); box(0,10,.12,9,3.2,.12,M((.02,.012,.01),.8)); person('m_young',-.35,9.4,1.2,M((.008,.005,.006),.7),1,1,.24); person('f_young',.35,9.4,-1.25,M((.008,.005,.006),.7),1,1,.24)
    for i in range(9): sph(-30+i*8,130,18+(i%3)*3,6,M((.9,.35,.3),.9),(2.2,.5,.22))
    cam(0,0,1.5,0,20,2.0,42)
@film
def romance2():
    reset((.01,.008,.012),1,64); R=random.Random(3)
    for i in range(120): sph(R.uniform(-14,14),R.uniform(14,32),R.uniform(-1,9),.12,M(R.choice([(1,.6,.25),(1,.35,.3),(1,.8,.5),(.5,.6,1)]),.5,0,60))
    person('f_latina',.42,4.1,-.45); person('m_asian',-.42,4.1,.5); pt(-2,1.5,3,120,(1,.75,.5),.5); pt(2.5,5.5,2.6,160,(1,.5,.35),.3); cam(0,0,1.5,0,4.1,1.36,60,1.4,4)
@film
def western():
    reset((.35,.55,.9),.9,40); sun(4.5,.95,.8,(1,.85,.65)); R=random.Random(2)
    def f(x,y):
        from mathutils import noise,Vector
        n=noise.fractal(Vector((x*.02,y*.02,2)),1,2,5); t=max(0,min(1,(n-.05)*9)); return t*16+noise.fractal(Vector((x*.1,y*.1,5)),1,2,5)*.9-1 if y>28 else noise.fractal(Vector((x*.1,y*.1,5)),1,2,5)*.6-1
    terrain(M((.42,.17,.08),.95,0,0,(.5,(.62,.33,.17))),f,240,220,110)
    for i in range(8):
        x=R.uniform(-14,14);y=R.uniform(12,30); g=M((.08,.16,.06),.8); cyl(x,y,-1,.28,3.2,g,r2=.24); sph(x,y,2.2,.24,g); cyl(x+.5,y,.3,.18,1.2,g); cyl(x-.5,y,.0,.18,1.5,g)
    person('m_heavy',1.5,8,2.6,M((.02,.014,.01),.8),1,1,-.8); cam(0,0,.9,.5,30,5,30)
@film
def fantasy1():
    reset((.5,.6,.85),.8,48,.004,(1,.9,.8)); sun(4.2,1.2,.9,(1,.78,.5))
    def f(x,y):
        from mathutils import noise,Vector
        d=math.hypot(x-4,y-60); return noise.fractal(Vector((x*.03,y*.03,7)),1,2,6)*7+max(0,26-d*.95)-4
    terrain(M((.08,.14,.06),.95,0,0,(.3,(.3,.27,.24))),f,200,200,80); st=M((.5,.47,.42),.9,0,0,(1.5,(.38,.35,.32))); rf=M((.1,.16,.3),.6)
    for x,y,r,h in((4,60,3,16),(0,58,1.8,20),(8.5,60,1.8,18),(4,64,2,25),(-3,62,1.5,13),(11,63,1.4,12),(2,56,1.2,12)): cyl(x,y,18,r,h,st); cyl(x,y,18+h,r*1.35,r*2.8,rf,r2=0)
    box(4,57,17,11,1.4,7,st); cam(-8,0,9,4,60,24,40); person('boy',-7.2,5.5,2.7,M((.02,.015,.012),.8),1,1,7.0)
@film
def fantasy2():
    reset((.002,.004,.01),1,64,.01,(.6,.8,1)); R=random.Random(6); rk=M((.03,.03,.05),.7,0,0,(1,(.07,.06,.09))); ground(rk,60,0,.7,.3)
    for i in range(60):
        a=R.uniform(0,6.28); d=R.uniform(11,20)
        if abs(a-4.71)<.75: continue
        cyl(math.cos(a)*d,14+math.sin(a)*d,-1,R.uniform(1,2.6),R.uniform(6,18),rk,(R.uniform(-.2,.2),R.uniform(-.2,.2),0),.2,7)
    for i in range(40):
        x=R.uniform(-8,8);y=R.uniform(7,24)
        if abs(x)<1.4: continue
        c=R.choice([(.1,.6,1),(.6,.15,1),(.1,1,.7)]); h=R.uniform(.6,3); cyl(x,y,-.2,h*.14,h,M(c,.1,0,9),(R.uniform(-.4,.4),R.uniform(-.4,.4),0),0,6)
    pt(0,16,3,2600,(.4,.7,1)); pt(-4,9,3,700,(.7,.3,1)); pt(4,9,3,700,(.2,.8,.8)); person('f_teen',0,10,2.9,M((.01,.01,.015),.6),1,1,.1); cam(0,0,1.5,0,14,2.4,30)
@film
def anim1():
    reset((.35,.65,1),1,40); sun(4,.7,.5,(1,.95,.85),.1); ground(M((.25,.62,.16),.8),300,0,2.0,.05,4); R=random.Random(9)
    for i in range(22): x=R.uniform(-24,24);y=R.uniform(18,48); cyl(x,y,0,.3,2,M((.35,.18,.08),.8)); sph(x,y,3.2,1.6,M(R.choice([(.9,.35,.5),(.2,.7,.3),(1,.7,.2)]),.7)); sph(x+.8,y,2.6,1,M((.3,.75,.3),.7))
    for x,c in((-1.7,(1,.55,.1)),(1.5,(.2,.5,1))):
        z=.25; sph(x,8,z+.9,.85,M(c,.35),(1,.9,1.05)); 
        for s in(-.3,.3): sph(x+s,7.28,z+1.25,.27,M((1,1,1),.1)); sph(x+s,7.05,z+1.26,.12,M((.02,.02,.02),.05)); sph(x+s*1.1,8,z+.0,.26,M(c,.4),(1,1.3,.6)); cyl(x+s*1.4,8,z+1.7,.05,.5,M(c,.4)); sph(x+s*1.4,8,z+2.25,.13,M((1,.9,.2),.3))
        sph(x,7.2,z+.82,.25,M((.25,.03,.05),.3),(1.2,.5,.5))
    for i in range(6): sph(-18+i*8,55,16+(i%2)*3,3,M((1,1,1),1),(1.8,.8,.6))
    cam(0,0,1.8,0,8,1.5,32)
@film
def anim2():
    reset((.95,.55,.65),.9,40); sun(3,.8,-.6,(1,.9,.7),.1); R=random.Random(4)
    for i in range(16): sph(R.uniform(-22,22),R.uniform(22,50),R.uniform(-7,4),R.uniform(2,4),M((1,.9,.92),1),(1.8,1,.6))
    box(0,12,1.2,2.4,2.2,1.8,M((.95,.8,.35),.6)); 
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=2.2,depth=1.3,location=(0,12,3.6),rotation=(0,0,.785)); put(bpy.context.object,M((.2,.45,.75),.6)); box(-.5,10.88,1.2,.55,.06,1.1,M((.6,.15,.1),.5)); box(.55,10.88,1.9,.6,.06,.6,M((.6,.85,1),.2,0,1)); 
    for i in range(46):
        a=R.random()*6.28;r=R.random()**.5*2.0; sph(math.cos(a)*r,12+math.sin(a)*r*.7,6.6+R.uniform(-1.1,1.4)*(1-r/3),.42,M(R.choice([(1,.15,.2),(1,.8,.1),(.1,.6,1),(.3,.9,.3),(.8,.2,.9),(1,.5,.1)]),.15),(1,1,1.15)); cyl(math.cos(a)*r*.3,12,4.2,.012,2.2,M((1,1,1),.5))
    cam(-2.5,0,2.6,0,12,4.6,34)
@film
def drama1():
    reset((.02,.022,.03),1,64,.03); w=M((.28,.26,.22),.95); box(0,9,0,12,.2,4,w); box(-5,5,0,.2,12,1,w); box(-5,5,3.0,.2,12,1,w); box(-5,1.2,1,.2,4,2.2,w); box(-5,8.2,1,.2,3.5,2.2,w); ground(M((.16,.09,.05),.35,0,0,(1,(.1,.06,.03))),30); spot(-13,4.8,4.5,2,6,.3,60000,(1,.85,.62),.5); pt(3,2,3,60,(.5,.6,1),1); box(1.2,6,0,.6,.6,.5,M((.1,.05,.03),.5)); box(1.2,6.3,.5,.6,.08,.7,M((.1,.05,.03),.5)); person('mgr_f',.2,5.6,.9); cam(2.6,0,1.5,.2,6,1.25,38)
@film
def drama2():
    reset((.42,.46,.52),1,40,.006); R=random.Random(1); ground(M((.26,.22,.10),.95,0,0,(1.5,(.36,.31,.16))),300,0,1.0,.05); cyl(9,40,-.5,.5,9,M((.04,.035,.03),.9),r2=.2)
    for i in range(60): a=R.random()*6.28; e=R.uniform(-.2,1.4); cyl(9+math.cos(a)*1.3,40+math.sin(a)*1.3,5+e*2.4,.09,4,M((.04,.035,.03),.9),(math.sin(a)*.9,math.cos(a)*.9,0),.01,6)
    for i in range(2600): x=R.uniform(-14,14);y=R.uniform(4,30); cyl(x,y,0,.015,R.uniform(.4,.9),M((.4,.34,.15),.9),(R.uniform(-.3,.3),R.uniform(-.3,.3),0),.002,3) if i<700 else 0
    person('m_young',-2,11,2.8,M((.03,.03,.04),.8),1,1,.1); cam(0,0,1.6,1,20,2.4,38)
@film
def comedy1():
    reset((.3,.3,.3),.6,48); box(0,7,0,14,.2,5,M((.95,.62,.25),.9)); ground(M((.5,.3,.18),.4),40); box(0,5.6,.2,4,1.2,.6,M((.1,.55,.5),.8)); box(0,6.2,.5,4,.35,1.1,M((.1,.55,.5),.8))
    for s in(-2,2): box(s,5.6,.2,.4,1.3,.9,M((.1,.55,.5),.8))
    for i,(x,c) in enumerate(((-2.6,(.8,.2,.2)),(-1.2,(.2,.3,.8)),(2.4,(.9,.8,.2)))): box(x,6.88,2.4,.9,.05,1.1,M(c,.5)); 
    cyl(3.4,5.8,0,.06,2.2,M((.7,.6,.3),.3,.8)); cyl(3.4,5.8,2.1,.5,.6,M((1,.9,.6),.5,0,4),r2=.3); pt(3.4,5.2,2.2,120,(1,.8,.5),.4); pt(-3,1,4,500,(1,.95,.9),1.5); person('m_heavy',-.9,4.6,.3); person('f_heavy',.3,4.7,-.2); person('m_teen',1.5,4.6,-.5); person('boy',-2.1,4.5,.4); cam(0,-.6,1.6,0,5,1.15,34)
@film
def comedy2():
    reset((.35,.65,1),1,40); sun(4.5,.6,.5,(1,.95,.85)); ground(M((.82,.68,.45),.95,0,0,(2,(.9,.76,.52))),200,0,.25,.2); box(0,60,-.1,300,70,.3,M((.05,.38,.5),.08)); cyl(-2,8,0,.05,2.6,M((.9,.9,.9),.3)); 
    for k in range(8):
        pass
    cyl(-2,8,2.3,1.8,.7,M((.9,.15,.12),.7),r2=.02,n=8); sph(2.2,7.2,.45,.45,M((1,.8,.1),.4)); person('m_old',-.6,7.4,.2); person('f_young',.5,7.6,-.3); person('m_athl',1.4,9,-.5); cam(0,0,1.4,0,8,1.25,35)
@film
def thriller1():
    reset((.003,.005,.008),1,64,.02,(.8,.9,1)); w=M((.05,.045,.045),.7,0,0,(1,(.09,.08,.075))); box(-4,18,0,1,40,14,w); box(4,18,0,1,40,14,w); ground(M((.015,.016,.018),.06,.2,0),80); cyl(-2.6,14,0,.07,4.6,M((.02,.02,.02),.5)); sph(-2.2,14,4.5,.18,M((1,.75,.4),.5,0,60)); spot(-2.2,14,4.4,-1.5,14,0,2600,(1,.75,.4),1.3); spot(0,46,7,0,16,0,7000,(.4,.6,1),.5); person('mgr_m',.7,17,0,M((.006,.006,.008),.5)); box(3.4,11,2.6,.1,1.6,.6,M((1,.1,.15),.5,0,12)); R=random.Random(2)
    for i in range(240): cyl(R.uniform(-3.5,3.5),R.uniform(5,22),R.uniform(0,6),.004,R.uniform(.25,.6),M((.7,.8,1),.2,0,.9),(.06,0,0),n=3)
    cam(0,0,1.0,0,18,2.4,32)
@film
def thriller2():
    reset((.004,.005,.007),1,64,.03); box(0,8,0,12,.1,4,M((.1,.1,.11),.9)); 
    for k in range(16): box(-3.8,3+.0,1+.14*k,.02,4,.07,M((.02,.02,.02),.7))
    spot(-12,3,4,2,7.5,1.2,26000,(.6,.75,1),.45); box(.4,5.2,0,2.4,1,.78,M((.06,.03,.02),.4)); cyl(1.2,5,.78,.02,.4,M((.5,.4,.1),.3,.9)); cyl(1.2,5,1.15,.2,.16,M((.05,.25,.12),.4),r2=.1); spot(1.2,5,1.2,1.0,4.9,.7,120,(1,.8,.5),1.6); person('m_asian',-.2,6.4,.2); cam(-1.4,0,1.35,0,6,1.25,40)
@film
def doc1():
    reset((.0,.06,.12),1,64,.035,(.35,.75,1)); sun(9,.25,.4,(.6,.9,1)); ground(M((.3,.3,.22),.95,0,0,(.5,(.16,.2,.2))),120,-4,2.2,.1); R=random.Random(3)
    for i in range(60):
        x=R.uniform(-8,8);y=R.uniform(9,26);z=R.uniform(-1.5,5); sph(x,y,z,.22,M(R.choice([(1,.5,.1),(.9,.8,.2),(.3,.5,.9)]),.4),(2.0,.5,.9)); cyl(x-.42,y,z-.14,.18,.28,M((1,.6,.15),.5),(0,1.57,0),.02,4)
    sph(3,22,4,2.4,M((.08,.13,.17),.5),(2.6,.7,.75)); cyl(-3.6,22,3.6,.9,2.6,M((.08,.13,.17),.5),(0,-1.4,0),.05,4)
    for i in range(26): x=R.uniform(-12,12);y=R.uniform(7,22); sph(x,y,-3.2,R.uniform(.3,.9),M(R.choice([(.8,.2,.3),(.9,.5,.2),(.5,.2,.6)]),.8),(1,1,.8))
    cam(0,0,.6,0,20,2,28)
@film
def doc2():
    reset((.4,.6,.95),1,40,.001); sun(4.5,1.05,-.9,(1,.85,.7))
    def f(x,y):
        from mathutils import noise,Vector
        n=noise.hetero_terrain(Vector((x*.014,y*.014,3.1)),.95,2.1,7,.6); return (n*13-16)*min(1,max(.05,(y-16)/50))
    terrain(M((.5,.52,.56),.85,0,0,(.25,(.9,.92,.96))),f,260,260,130); cam(0,-4,13,0,60,13,30); cyl(1.4,7,6,3,5.4,M((.85,.87,.9),.9),r2=2.2,n=9); person('m_athl',1.4,7,2.9,M((.4,.04,.02),.8),1,1,11.4)
@film
def musical1():
    reset((.002,.001,.002),1,64,.03,(1,.9,.9)); ground(M((.12,.06,.03),.12),60)
    for k in range(46): x=-9+k*.4; cyl(x,16+.25*math.sin(k*1.9),0,.28,9,M((.35,.01,.02),.7))
    for i,(x,c) in enumerate(((-5,(1,.3,.5)),(-2,(1,.8,.4)),(2,(.4,.6,1)),(5,(.8,.3,1)))): spot(x*1.5,12,9,x*.35,9.5,0,12000,c,.3)
    for i,c in enumerate(('f_latina','m_athl','f_black','m_young','f_asian')): person(c,(i-2)*1.35,9.6+abs(i-2)*.5,(2-i)*.1)
    pt(0,4,4,500,(1,.8,.7),1)
    for k in range(21): sph(-8+k*.8,6.4,.08,.09,M((1,.8,.45),.5,0,25))
    cam(0,0,1.1,0,10,2.1,30)
for n,f in F.items():
    if (ONLY and n not in ONLY) or (not ONLY and os.path.exists(f'{OUT}/{n}.webp')): continue
    f(); sc.render.image_settings.file_format='WEBP'; sc.render.image_settings.quality=84; sc.render.filepath=f'{OUT}/{n}.webp'; bpy.ops.render.render(write_still=True); print('rendered',n,flush=True)
