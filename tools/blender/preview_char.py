import bpy,sys,json,numpy as np,os
A=os.path.join(os.path.dirname(__file__),'../../public/assets/chars'); meta={m['id']:m for m in json.load(open(A+'/chars.json'))['chars']}
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=24; sc.cycles.use_denoising=True
TINT={1:(.55,.2,.18),2:(.2,.26,.4),3:(.25,.2,.18),4:(.12,.07,.04),6:(.6,.15,.12)}
def hexc(h): return tuple((int(h[i:i+2],16)/255)**2.2 for i in(1,3,5))
from PIL import Image
x=0; ids=sys.argv[2].split(','); LOD=int(sys.argv[3]) if len(sys.argv)>3 else 0
for cid in ids:
    m=meta[cid]; L=m['lods'][LOD]; b=open(f'{A}/{cid}.bin','rb').read(); n=L['nv']; o=L['off']
    P=np.frombuffer(b,'<f4',n*3,o['p']).reshape(-1,3);U=np.frombuffer(b,'<f4',n*2,o['u']).reshape(-1,2);I=np.frombuffer(b,'<u2',L['ni'],o['i']).reshape(-1,3);PT=np.frombuffer(b,'u1',n,o['part']);AO=np.frombuffer(b,'u1',n,o['ao'])/255.
    tint={**TINT,0:hexc(m['skin']),5:(1,1,1)}
    me=bpy.data.meshes.new(cid); me.from_pydata([(p[0]+x,-p[2],p[1]) for p in P],[],I.tolist()); l=me.uv_layers.new(name='uv')
    for lp in me.loops: l.data[lp.index].uv=U[lp.vertex_index]
    ca=me.color_attributes.new('t','FLOAT_COLOR','POINT'); ca.data.foreach_set('color',np.array([[*(np.array(tint[int(p)])),1] for p in PT]).ravel())
    ca=me.color_attributes.new('ao','FLOAT_COLOR','POINT'); ca.data.foreach_set('color',np.array([[a,a,a,1] for a in AO]).ravel())
    for p in me.polygons: p.use_smooth=True
    ob=bpy.data.objects.new(cid,me); sc.collection.objects.link(ob)
    mt=bpy.data.materials.new(cid); mt.use_nodes=True; nt=mt.node_tree; bs=nt.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value=.65
    def tex(f,cs):
        t=nt.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(os.path.abspath(f'{A}/{f}')); t.image.colorspace_settings.name=cs; return t
    c=tex(cid+'.webp','sRGB'); k=tex(cid+'_m.webp','Non-Color'); vt=nt.nodes.new('ShaderNodeVertexColor'); vt.layer_name='t'
    mx=nt.nodes.new('ShaderNodeMix'); mx.data_type='RGBA'; mx.blend_type='MULTIPLY'; nt.links.new(k.outputs[0],mx.inputs[0]); nt.links.new(c.outputs[0],mx.inputs[6]); nt.links.new(vt.outputs[0],mx.inputs[7]); nt.links.new(mx.outputs[2],bs.inputs['Base Color'])
    me.materials.append(mt); x+=1.15
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera=cam
close=len(sys.argv)>4
if close: cam.location=((x-1.15)/2,-2.2,1.62); cam.rotation_euler=(np.pi/2,0,0); cam.data.type='ORTHO'; cam.data.ortho_scale=max(x-.6,.45); sc.render.resolution_y=420
else: cam.location=((x-1.15)/2,-8,1.0); cam.rotation_euler=(np.pi/2,0,0); cam.data.type='ORTHO'; cam.data.ortho_scale=x+.1; sc.render.resolution_y=560
if close and sys.argv[4]=='face': cam.data.ortho_scale=.42; cam.location=((x-1.15)/2,-2,meta[ids[0]]['height']-.14); sc.render.resolution_x=480; sc.render.resolution_y=480
else: sc.render.resolution_x=1500
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(.5,.53,.6,1); w.node_tree.nodes['Background'].inputs[1].default_value=.6
s=bpy.data.objects.new('s',bpy.data.lights.new('s','SUN')); s.data.energy=2.4; s.data.angle=.2; s.rotation_euler=(.8,.3,.4); sc.collection.objects.link(s)
sc.view_settings.view_transform='AgX'; sc.render.filepath=sys.argv[1]; bpy.ops.render.render(write_still=True)
