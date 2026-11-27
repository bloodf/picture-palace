"""Colour grade: stretch contrast, warm the highlights, add saturation. Idempotent via a marker file."""
import glob,os,numpy as np,sys
from PIL import Image
D=os.path.join(os.path.dirname(__file__),'../public/assets/films/'); mk=D+'.graded'; done=set(open(mk).read().split()) if os.path.exists(mk) else set()
for f in sorted(glob.glob(D+'*.webp')):
    n=os.path.basename(f)
    if n in done: continue
    a=np.asarray(Image.open(f).convert('RGB')).astype(float)/255; lo,hi=np.percentile(a,0.6),np.percentile(a,99.5); a=np.clip((a-lo)/(hi-lo+1e-6),0,1)
    m=a.mean(); g=np.clip(np.log(.36 if m<.36 else .5)/np.log(max(m,.02)),.55,1.25); a=a**g
    l=a.mean(2,keepdims=True); a=np.clip(l+(a-l)*1.5,0,1); a=a*.82+.18*(a*a*(3-2*a)); a=np.clip(a+np.array([.012,.0,-.012])*(l-.4),0,1)
    Image.fromarray((a*255).astype('u1')).save(f,quality=86); done.add(n)
open(mk,'w').write('\n'.join(sorted(done)))
