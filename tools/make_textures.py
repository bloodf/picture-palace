"""Procedural, tileable PBR texture set. Writes <name>_c (albedo), _n (normal), _r (AO/rough/metal) webp."""
import numpy as np, os, sys
from PIL import Image, ImageDraw, ImageFilter
OUT=os.path.join(os.path.dirname(__file__),'../public/assets/tex')
rng=np.random.default_rng(7)
def noise(n,beta=1.6,lo=1,seed=0,aniso=(1,1)):
    r=np.random.default_rng(seed)
    f=np.fft.fft2(r.standard_normal((n,n)))
    fy=np.fft.fftfreq(n)*n; fx=np.fft.fftfreq(n)*n
    k=np.sqrt((fx[None,:]*aniso[0])**2+(fy[:,None]*aniso[1])**2); k[0,0]=1
    a=1/np.power(k,beta); a[k<lo]=0; a[0,0]=0
    x=np.real(np.fft.ifft2(f*a)); x-=x.min(); x/=x.max(); return x
def norm(x): x=x-x.min(); return x/(x.max()+1e-9)
def gauss(x,s):
    n=x.shape[0]; f=np.fft.fftfreq(n)
    g=np.exp(-2*(np.pi*s)**2*(f[None,:]**2+f[:,None]**2)); return np.real(np.fft.ifft2(np.fft.fft2(x)*g))
def worley(n,c,seed=0,jit=0.9):
    r=np.random.default_rng(seed); g=(np.stack(np.meshgrid(np.arange(c),np.arange(c)),-1)+0.5+(r.random((c,c,2))-.5)*jit)/c
    y,x=np.mgrid[0:n,0:n]/n; d1=np.full((n,n),9.);d2=d1.copy();idm=np.zeros((n,n),int)
    for i in range(c):
        for j in range(c):
            dx=np.abs(x-g[i,j,0]);dx=np.minimum(dx,1-dx);dy=np.abs(y-g[i,j,1]);dy=np.minimum(dy,1-dy)
            d=np.hypot(dx,dy)*c; m=d<d1; d2=np.where(m,d1,np.minimum(d2,d)); idm=np.where(m,i*c+j,idm); d1=np.where(m,d,d1)
    return d1,d2,idm
def rgb(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)])/255.
def mix(a,b,t): t=np.asarray(t)[...,None] if np.ndim(t)==2 else t; return a*(1-t)+b*t
def save(name,c,h=None,rough=0.7,metal=0.0,ao=None,ns=2.0,q=84):
    n=c.shape[0]
    Image.fromarray((np.clip(c,0,1)*255).astype('uint8')).save(f'{OUT}/{name}_c.webp',quality=q)
    if h is not None:
        dx=(np.roll(h,-1,1)-np.roll(h,1,1))*ns*n/512*4; dy=(np.roll(h,-1,0)-np.roll(h,1,0))*ns*n/512*4
        v=np.dstack([-dx,dy,np.ones_like(h)]); v/=np.linalg.norm(v,axis=2,keepdims=True)
        Image.fromarray(((v*.5+.5)*255).astype('uint8')).save(f'{OUT}/{name}_n.webp',quality=88)
    r=np.broadcast_to(rough,(n,n)); m=np.broadcast_to(metal,(n,n)); a=np.broadcast_to(1.0 if ao is None else ao,(n,n))
    Image.fromarray((np.clip(np.dstack([a,r,m]),0,1)*255).astype('uint8')).save(f'{OUT}/{name}_r.webp',quality=80)
    print(name,end=' ',flush=True)
def draw(n,fn,ss=2):
    im=Image.new('RGB',(n*ss,n*ss)); d=ImageDraw.Draw(im); fn(d,n*ss); return np.asarray(im.resize((n,n),Image.LANCZOS))/255.
def fibre(n,seed): # carpet pile
    a=noise(n,0.15,20,seed); b=noise(n,0.9,6,seed+1); return norm(a*.75+b*.25)
# ---------- carpets
def scallop(d,s,cols,nx=4):
    bg,c1,c2,c3=cols; d.rectangle([0,0,s,s],fill=bg); w=s/nx; r=w/2; row=r*0.5
    import math
    rows=int(round(s/row))
    for j in range(-2,rows+3):
        y=j*row; off=(j%2)*w/2
        for i in range(-1,nx+2):
            x=i*w+off
            def circ(rr,f): d.ellipse([x-rr,y-rr,x+rr,y+rr],fill=f)
            circ(r,c3); circ(r*.955,bg); circ(r*.80,c2); circ(r*.74,bg)
            for k in range(13):
                a=math.pi*(k+.5)/13+math.pi
                x1=x+math.cos(a)*r*.70; y1=y+math.sin(a)*r*.70
                d.line([x,y,x1,y1],fill=c1,width=max(2,int(s*.0045)))
            circ(r*.34,c3); circ(r*.29,c1); circ(r*.16,bg)
def carpet(name,base,seed,worn=0.0,n=1024):
    f=fibre(n,seed); w=norm(noise(n,1.5,1,seed+9))
    c=base*(0.62+0.55*f[...,None]); c=c*(0.9+0.16*w[...,None])
    if worn>0:
        g=rgb('#6d6258'); st=np.clip((w-.5)*2.4,0,1); c=mix(c,np.broadcast_to(c.mean(2,keepdims=True)*.7+g*.22,c.shape),worn); c=mix(c,c*.66,st*worn)
    save(name,c,f,rough=0.94+0.05*f-0.1*worn*w,ns=1.2)
H=lambda s:tuple(int(x*255) for x in rgb(s))
deco=draw(1024,lambda d,s:scallop(d,s,(H('#4d0f1c'),H('#c8862f'),H('#12555a'),H('#e2b25a'))))
deco=(deco+np.roll(deco,1,0))/2
carpet('carpet_deco',deco,11); carpet('carpet_worn',deco,12,worn=.62)
def grand(d,s):
    scallop(d,s,(H('#0e2b3a'),H('#d99a3e'),H('#7d1730'),H('#f0c978')),2)
carpet('carpet_grand',draw(1024,grand),13)
def neon(d,s):
    import math; r=np.random.default_rng(4); d.rectangle([0,0,s,s],fill=(9,8,20)); cols=[H(c) for c in('#ff3ea5','#25e0ff','#ffe22e','#7b4dff','#39ff88','#ff7a1a')]
    for i in range(190):
        x,y=r.random(2)*s; c=cols[r.integers(6)]; k=r.integers(6); z=s*(.012+.03*r.random()); a=r.random()*6.28
        for ox in(-s,0,s):
            for oy in(-s,0,s):
                X,Y=x+ox,y+oy
                if X<-s*.1 or X>s*1.1 or Y<-s*.1 or Y>s*1.1: continue
                w=max(3,int(s*.006))
                if k==0: d.ellipse([X-z,Y-z,X+z,Y+z],outline=c,width=w)
                elif k==1: d.polygon([(X+z*math.cos(a+t*2.094),Y+z*math.sin(a+t*2.094)) for t in range(3)],outline=c,width=w)
                elif k==2:
                    pts=[(X+math.cos(a)*t*z*.6-math.sin(a)*(z*.5*(1 if t%2 else -1)),Y+math.sin(a)*t*z*.6+math.cos(a)*(z*.5*(1 if t%2 else -1))) for t in range(-3,4)]; d.line(pts,fill=c,width=w,joint='curve')
                elif k==3: d.ellipse([X-z*.3,Y-z*.3,X+z*.3,Y+z*.3],fill=c)
                elif k==4: d.line([X-z*math.cos(a),Y-z*math.sin(a),X+z*math.cos(a),Y+z*math.sin(a)],fill=c,width=w)
                else:
                    pts=[(X+math.cos(a+t*.45)*z*.17*t*.6,Y+math.sin(a+t*.45)*z*.17*t*.6) for t in range(14)]; d.line(pts,fill=c,width=w,joint='curve')
carpet('carpet_neon',draw(1024,neon),15)
n=512; f=fibre(n,21); fl=norm(noise(n,.4,30,22)); base=np.broadcast_to(rgb('#3c0f18'),(n,n,3)); base=mix(base,rgb('#9a5a24'),np.clip((fl-.72)*8,0,1)); base=mix(base,rgb('#123b41'),np.clip((.27-fl)*8,0,1))
save('carpet_aud',base*(.55+.65*f[...,None]),f,rough=.95,ns=1.3)
# ---------- stone
n=1024
def marble(base,vein,seed,n=1024,s=1.0):
    w=noise(n,1.9,1,seed); t=noise(n,1.7,2,seed+1); v=1-np.abs(np.sin((w*5+t*2.5)*np.pi)); v=np.power(np.clip(v,0,1),10)
    v2=np.power(np.clip(1-np.abs(np.sin((noise(n,1.8,2,seed+5)*9)*np.pi)),0,1),18)*.5
    c=mix(np.broadcast_to(rgb(base),(n,n,3)),rgb(vein),np.clip((v+v2)*s,0,1)); return c*(.93+.12*noise(n,1.4,3,seed+3)[...,None])
a=marble('#d9cdb8','#8d7658',31,s=.55); b=marble('#1e2a27','#7f9a86',35,s=.6); cc=marble('#5a1820','#c9906d',39,s=.45)
y,x=np.mgrid[0:n,0:n]/n; 
u=(x*2)%1; v=(y*2)%1; ck=((np.floor(x*2)+np.floor(y*2))%2).astype(float)
dia=(np.abs(((x*2+.5)%1)-.5)+np.abs(((y*2+.5)%1)-.5)); 
c=mix(a,np.roll(a,333,0),ck); sd=(np.minimum(dia,9)<.2).astype(float)
dd=np.minimum(np.minimum(u,1-u),np.minimum(v,1-v)); corner=(np.minimum(u,1-u)+np.minimum(v,1-v))
cm=gauss((corner<.3).astype(float),1.0); c=mix(c,b,cm)
gr=np.maximum((np.abs(corner-.3)<.008).astype(float),((dd<.005)&(corner>.3)).astype(float)); gr=gauss(gr,.7)
c=mix(c,rgb('#8a7b62')*.8,np.clip(gr,0,1)); pol=noise(n,1.5,2,44)
save('floor_marble',c,-gr*.5+.02*pol,rough=.16+.16*pol+.4*gr,ns=.5)
c2=mix(c,c*rgb('#9b8b72')*1.15,.65*norm(noise(n,1.5,1,45))); c2=mix(c2,rgb('#4a3f33'),np.clip((noise(n,1.3,2,46)-.6)*2.2,0,.6))
save('floor_worn',c2,-gr*.7+.1*noise(n,1.0,6,47),rough=.5+.3*pol,ns=.7)
d1,d2,idm=worley(1024,30,3); chips=(d2-d1>.18)&(np.random.default_rng(5).random(900)[idm]>.28)
cols=np.array([rgb(h) for h in('#b8563c','#e9ddc6','#2f4a47','#d6a24e','#7a6a58','#f4ecdc')])[np.random.default_rng(6).integers(0,6,900)][idm]
c=mix(np.broadcast_to(rgb('#d8cfbd'),(1024,1024,3)),cols,gauss(chips.astype(float),.8)); save('floor_terrazzo',c*(.95+.08*noise(1024,1.2,3,8)[...,None]),None,rough=.28+.1*noise(1024,1,4,2))
# ---------- tiles
n=512; y,x=np.mgrid[0:n,0:n]/n
row=np.floor(y*8); ux=((x*4+.5*(row%2))%1); vy=(y*8)%1; e=np.minimum(np.minimum(ux,1-ux)*2,np.minimum(vy,1-vy)); h=np.clip((e-.04)/.1,0,1); tid=(row*7+np.floor(x*4+.5*(row%2))%4).astype(int)
tv=np.random.default_rng(2).random(99)[tid]; c=mix(np.broadcast_to(rgb('#8d8880'),(n,n,3)),np.broadcast_to(rgb('#e6e4da'),(n,n,3))*(.93+.09*tv[...,None]),np.clip((e-.03)/.03,0,1))
save('tile_subway',c,h*.25+.015*noise(n,1.3,3,3),rough=.14+.6*(1-np.clip((e-.03)/.03,0,1)),ns=1.0)
c=mix(np.broadcast_to(rgb('#2b3a38'),(n,n,3)),np.broadcast_to(rgb('#1f5f5c'),(n,n,3))*(.85+.25*tv[...,None]),np.clip((e-.03)/.03,0,1)); save('tile_teal',c,h*.25,rough=.14+.6*(1-np.clip((e-.03)/.03,0,1)),ns=1.0)
k=8; hx=1/k; s3=np.sqrt(3); ny=9
def hexd(x,y):
    best=np.full(x.shape,9.);sec=best.copy();ids=np.zeros(x.shape,int)
    for j in range(-1,ny+1):
        for i in range(-1,k+1):
            cx=(i+.5*(j%2))*hx; cy=(j+.5)/ny; d=np.hypot(x-cx,(y-cy)*(ny/(k*2/s3))*1.0); m=d<best; sec=np.where(m,best,np.minimum(sec,d)); ids=np.where(m,(j%ny)*k+(i%k),ids); best=np.where(m,d,best)
    return best,sec,ids
b1,b2,ids=hexd(x,y); e=(b2-b1)/hx; m=np.clip((e-.08)/.06,0,1); dark=(ids%8==3)&((ids//8)%3==1)
c=mix(np.broadcast_to(rgb('#77736a'),(n,n,3)),np.where(dark[...,None],rgb('#26312f'),rgb('#dad7cc'))*(.92+.1*np.random.default_rng(1).random(99)[ids][...,None]),m)
save('tile_hex',c,m*.3,rough=.3+.5*(1-m),ns=1.0)
# ---------- wood
def wood(name,c1,c2,seed,n=1024,planks=0,rough=.38):
    y,x=np.mgrid[0:n,0:n]/n; w=noise(n,1.8,1,seed,(1,.12)); fine=noise(n,.7,8,seed+1,(.12,.01)) if False else noise(n,.8,10,seed+1,(1,.06))
    rings=np.abs(np.sin((w*7+.25*noise(n,1.5,2,seed+2,(1,.2)))*np.pi)); t=np.clip(.55*rings+.5*fine,0,1); off=np.zeros((n,n)); gap=np.zeros((n,n))
    if planks:
        p=np.floor(x*planks); r=np.random.default_rng(seed).random(planks); t=np.stack([np.roll(t[:,i],int(r[int(p[0,i])]*n)) for i in range(n)],1); off=(r[p.astype(int)]-.5)*.35; ux=(x*planks)%1; gap=(np.minimum(ux,1-ux)<.012).astype(float)
        ey=(y*2+r[p.astype(int)])%1; gap=np.maximum(gap,(np.minimum(ey,1-ey)<.002).astype(float))
    c=mix(np.broadcast_to(rgb(c1),(n,n,3)),rgb(c2),t)*(1+off[...,None]); c*=1-.75*gap[...,None]
    save(name,c,fine*.12-gap*.6,rough=rough+.2*fine+.3*gap,ns=.9)
wood('wood_walnut','#6b4426','#2c1810',51,rough=.32); wood('wood_oak','#b98d57','#8a5f33',55,planks=6,rough=.42); wood('wood_dark','#3a2318','#180d08',58,planks=5,rough=.36)
# ---------- walls & fabric
n=512
pl=noise(n,1.1,4,61); save('plaster',np.broadcast_to(rgb('#e8e0d0'),(n,n,3))*(.94+.08*pl[...,None]),pl*.3,rough=.88,ns=.8)
save('white',np.broadcast_to(rgb('#efebe2'),(n,n,3))*(.97+.04*pl[...,None]),pl*.1,rough=.6,ns=.3)
def damask(name,bg,fg,seed,rough_d=.35):
    n=1024
    def pat(d,s):
        import math; d.rectangle([0,0,s,s],fill=(0,0,0)); W=(255,255,255); w=int(s*.006)
        for ox,oy in((0,0),(.5,.5)):
            for tx in(-1,0,1):
                for ty in(-1,0,1):
                    X=(ox+.25+tx)*s; Y=(oy+.25+ty)*s
                    if abs(X-s/2)>s or abs(Y-s/2)>s: continue
                    # stepped deco fountain
                    for i in range(6):
                        r=s*(.2-.028*i); d.arc([X-r*.62,Y-r*1.05,X+r*.62,Y+r*1.05],180,360,fill=W,width=w)
                    for i in range(-4,5): d.line([X+i*s*.012,Y+s*.2-abs(i)*s*.018,X+i*s*.026,Y],fill=W,width=w)
                    d.polygon([(X,Y-s*.24),(X+s*.018,Y-s*.21),(X,Y-s*.17),(X-s*.018,Y-s*.21)],fill=W); d.ellipse([X-s*.012,Y+s*.2,X+s*.012,Y+s*.224],fill=W)
                    for sgn in(-1,1):
                        for i in range(3): r=s*(.05+.022*i); d.arc([X+sgn*s*.125-r,Y+s*.06-r,X+sgn*s*.125+r,Y+s*.06+r],0 if sgn>0 else 90,90 if sgn>0 else 180,fill=W,width=w)
    m=draw(n,pat)[...,0]; wv=noise(n,.2,60,seed); c=mix(np.broadcast_to(rgb(bg),(n,n,3)),rgb(fg),m*.85)*(.9+.16*wv[...,None]); save(name,c,m*.15+wv*.06,rough=.85-rough_d*m,metal=0,ns=.7)
damask('wall_damask','#7a1f2b','#c98a3c',63); damask('wall_worn','#7d6452','#9a7f5f',64,.1); damask('wall_teal','#12474c','#d0a04a',65)
wv=np.sin(np.arange(n)/n*np.pi*2*64)[None,:]*.5+.5; wv2=np.sin(np.arange(n)/n*np.pi*2*64)[:,None]*.5+.5; chk=(np.floor(np.arange(n)/8)[None,:]+np.floor(np.arange(n)/8)[:,None])%2
fab=norm(np.where(chk>0,np.broadcast_to(wv,(n,n)),np.broadcast_to(wv2,(n,n)))+.6*noise(n,.3,20,66)); save('fabric',np.broadcast_to(rgb('#ffffff'),(n,n,3))*(.62+.38*fab[...,None]),fab*.25,rough=.93,ns=.8)
vel=noise(n,.5,10,67); vf=noise(n,1.2,3,68); save('velvet',np.ones((n,n,3))*(.72+.16*vel+.16*vf)[...,None],vel*.25,rough=.9,ns=.6)
d1,d2,_=worley(n,26,69); le=np.clip((d2-d1)*3,0,1); save('leather',np.ones((n,n,3))*(.8+.2*le)[...,None],le*.3,rough=.42+.2*(1-le),ns=1.0)
br=noise(n,.35,12,70,(.05,1)); save('brushed',np.ones((n,n,3))*(.86+.14*br)[...,None],br*.08,rough=.22+.2*br,metal=1.,ns=.5)
# acoustic wall: vertical ribs + fabric
y,x=np.mgrid[0:n,0:n]/n; rib=np.abs(((x*8)%1)-.5)*2; rr=np.clip((.9-rib)/.12,0,1); save('acoustic',np.broadcast_to(rgb('#ffffff'),(n,n,3))*((.35+.65*rr)*(.75+.25*fab))[...,None],rr*.5+fab*.05,rough=.95,ao=.4+.6*rr,ns=1.2)
# pressed tin deco ceiling
u=(x*2)%1-.5; v=(y*2)%1-.5; r=np.hypot(u,v); bx=np.maximum(np.abs(u),np.abs(v)); h=.5*np.clip((.47-bx)/.02,0,1)-.25*np.clip((.41-bx)/.02,0,1)+.3*np.clip((.28-r)/.03,0,1)*(0.6+.4*np.cos(np.arctan2(v,u)*16)); h=gauss(h,1.2)
save('ceiling_tin',np.broadcast_to(rgb('#e4d6bb'),(n,n,3))*(.9+.1*norm(h)[...,None]),h,rough=.5,ao=.6+.4*norm(h),ns=1.6)
u=(x*2)%1; v=(y*2)%1; e=np.minimum(np.minimum(u,1-u),np.minimum(v,1-v)); hole=noise(n,.2,40,71); save('ceiling_tile',np.broadcast_to(rgb('#d9d4c8'),(n,n,3))*(.9+.1*hole[...,None])*(1-.35*(e<.02))[...,None],np.clip(e/.04,0,1)*.3+hole*.15,rough=.95,ns=1.0)
# ---------- exterior
n=1024; y,x=np.mgrid[0:n,0:n]/n; g=noise(n,.6,10,81); g2=noise(n,1.6,1,82); u=(x*2)%1; v=(y*2)%1; e=np.minimum(np.minimum(u,1-u),np.minimum(v,1-v)); j=np.clip(e/.008,0,1)
save('sidewalk',np.broadcast_to(rgb('#8f8a80'),(n,n,3))*((.75+.25*g)*(.85+.25*g2)*(.45+.55*j))[...,None],g*.15+j*.4,rough=.85-.25*np.clip((.4-g2)*2,0,1),ns=1.0)
ag=worley(n,90,83)[0]; save('asphalt',np.broadcast_to(rgb('#33343a'),(n,n,3))*((.7+.4*(1-np.clip(ag,0,1)))*(.85+.3*g2))[...,None],(1-np.clip(ag,0,1))*.4,rough=.5+.4*g2,ns=1.2)
row=np.floor(y*16); ux=(x*8+.5*(row%2))%1; vy=(y*16)%1; e=np.minimum(np.minimum(ux,1-ux)*2,np.minimum(vy,1-vy)); m=np.clip((e-.08)/.05,0,1); bid=((row%16)*8+np.floor(x*8+.5*(row%2))%8).astype(int); bv=np.random.default_rng(3).random(200)[bid]
save('brick',mix(np.broadcast_to(rgb('#8e857a'),(n,n,3)),mix(np.broadcast_to(rgb('#7a3426'),(n,n,3)),rgb('#4d2018'),bv),m)*(.8+.3*g[...,None]),m*.4+g*.2,rough=.9,ns=1.2)
row=np.floor(y*6); ux=(x*3+.5*(row%2))%1; vy=(y*6)%1; e=np.minimum(np.minimum(ux,1-ux)*2,np.minimum(vy,1-vy)); m=np.clip((e-.015)/.02,0,1)
save('facade',mix(np.broadcast_to(rgb('#7d7263'),(n,n,3)),np.broadcast_to(rgb('#e3d6bd'),(n,n,3))*(.92+.1*g2[...,None]),m),m*.4+g*.05,rough=.32+.2*g2,ns=1.0)
save('concrete',np.broadcast_to(rgb('#77756f'),(n,n,3))*((.8+.2*g)*(.85+.25*g2))[...,None],g*.12,rough=.8,ns=.8)
# popcorn
n=512; d1,d2,idm=worley(n,13,91,1.0); puff=np.clip(1-d1*1.15,0,1)**.5; q=norm(noise(n,.9,6,92)); hh=puff+.35*q*puff
c=mix(np.broadcast_to(rgb('#8a5a12'),(n,n,3)),rgb('#fff2c4'),np.clip(puff*1.2,0,1)); c=mix(c,rgb('#f2b830'),np.clip((q-.5)*1.6,0,.7)); save('popcorn',c*(.6+.45*norm(hh))[...,None],hh*.6,rough=.8,ao=.4+.6*puff,ns=1.6)
# grime mask (tileable, greyscale) and window-lit city facade
n=512; gm=norm(noise(n,1.35,2,95)); sp=norm(noise(n,.7,8,96)); Image.fromarray((np.clip(gm*.7+sp*.5-.1,0,1)*255).astype('uint8')).save(f'{OUT}/grime.webp',quality=85)
r=np.random.default_rng(12); im=Image.new('RGB',(1024,1024),(38,33,36)); em=Image.new('RGB',(1024,1024),(0,0,0)); d=ImageDraw.Draw(im); d2_=ImageDraw.Draw(em)
for j in range(8):
    d.rectangle([0,j*128+118,1024,j*128+128],fill=(58,52,50))
    for i in range(10):
        X=i*102+20; Y=j*128+22; d.rectangle([X-6,Y-6,X+68,Y+88],fill=(66,58,54)); d.rectangle([X,Y,X+62,Y+82],fill=(24,30,40)); d.line([X+31,Y,X+31,Y+82],fill=(60,54,50),width=4); d.line([X,Y+40,X+62,Y+40],fill=(60,54,50),width=4)
        if r.random()<.42:
            t=r.random(); col=tuple(int(v) for v in (255*(.6+.4*t),255*(.42+.4*t),255*(.2+.5*t*r.random()))); d2_.rectangle([X,Y,X+62,Y+82],fill=col); d2_.rectangle([X,Y,X+62,Y+int(r.random()*50)],fill=tuple(int(v*.45) for v in col)); d2_.line([X+31,Y,X+31,Y+82],fill=(10,8,8),width=4); d2_.line([X,Y+40,X+62,Y+40],fill=(10,8,8),width=4)
im.filter(ImageFilter.GaussianBlur(.8)).save(f'{OUT}/city_c.webp',quality=82); em.filter(ImageFilter.GaussianBlur(1.2)).save(f'{OUT}/city_e.webp',quality=82)
# soft blob shadow
y,x=np.mgrid[0:128,0:128]/127*2-1; b=np.clip(1-np.hypot(x,y),0,1)**1.6; Image.fromarray(np.dstack([np.zeros((128,128,3)),b*255]).astype('uint8')).save(f'{OUT}/blob.png')
print()
