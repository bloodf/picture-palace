import bpy,sys,json,numpy as np,os,hashlib
A=os.path.join(os.path.dirname(__file__),'../../public/assets/props'); meta=json.load(open(A+'/props.json')); b=open(A+'/props.bin','rb').read()
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=16; sc.cycles.use_denoising=True
def col(n):
    for k,c in dict(brass=(.6,.4,.15),chrome=(.6,.6,.62),red=(.5,.04,.04),black=(.02,.02,.02),wood=(.2,.1,.05),glass=(.6,.8,.85),cream=(.8,.74,.6),yellow=(.8,.55,.08),leaf=(.08,.25,.06),lamp=(1,.8,.5),paper=(.8,.8,.76),porcelain=(.85,.85,.83),iron=(.08,.08,.09),plastic_dark=(.05,.05,.055),seat=(.4,.05,.06),velvet_teal=(.03,.25,.27),leather=(.06,.04,.035),marble_light=(.8,.76,.7),popcorn=(.9,.75,.4),screen=(.1,.3,.5)).items():
        if k in n: return c
    h=hashlib.md5(n.encode()).digest(); return (h[0]/400+.1,h[1]/400+.1,h[2]/400+.1)
names=[n for n in meta if not n.startswith(('con_','food_','lit','held','vip_bar','boxoffice'))]; N=11; mats={}
for i,nm in enumerate(names):
    x=(i%N)*2.6; y=-(i//N)*3.0
    for p in meta[nm]['prims']:
        n=p['nv']; P=np.frombuffer(b,'<f4',n*3,p['p']).reshape(-1,3); I=np.frombuffer(b,'<u4',p['ni'],p['i']).reshape(-1,3); s=min(1,2.3/max(meta[nm]['max'][k]-meta[nm]['min'][k] for k in range(3)))
        me=bpy.data.meshes.new('x'); me.from_pydata([(v[0]*s+x,-v[2]*s+y,v[1]*s) for v in P],[],I.tolist()); m=p['mat']
        if m not in mats: mats[m]=bpy.data.materials.new(m); mats[m].use_nodes=True; mats[m].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*col(m),1); mats[m].node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=.25 if m.startswith('glass') else 1
        me.materials.append(mats[m]); o=bpy.data.objects.new('x',me); sc.collection.objects.link(o)
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=30; rows=(len(names)+N-1)//N
from math import radians
cam.rotation_euler=(radians(55),0,radians(18)); cx,cy=(N-1)*1.3,-(rows-1)*1.5; 
from mathutils import Vector; d=cam.rotation_euler.to_matrix()@Vector((0,0,1)); cam.location=Vector((cx,cy,.6))+d*40
sc.render.resolution_x=1700; sc.render.resolution_y=1000
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(.5,.53,.6,1); w.node_tree.nodes['Background'].inputs[1].default_value=.7
s=bpy.data.objects.new('s',bpy.data.lights.new('s','SUN')); s.data.energy=2.5; s.data.angle=.2; s.rotation_euler=(.6,.3,.4); sc.collection.objects.link(s); sc.render.filepath=sys.argv[1]; bpy.ops.render.render(write_still=True)
