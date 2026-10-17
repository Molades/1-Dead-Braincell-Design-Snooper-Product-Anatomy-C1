"""Cut the onboarding poses out of public/detective-poses.png with a transparent outside.
The drawing is unchanged; only the paper colour around the figure becomes transparent."""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, sys
# Usage: python3 scripts/cut-poses.py <apps/extension dir> [preview.png]
root=sys.argv[1]; preview=sys.argv[2] if len(sys.argv) > 2 else None
im=np.asarray(Image.open(f'{root}/public/detective-poses.png').convert('RGB')).astype(float)
bg=np.array([250,245,235.])
rects={'peek':(340,120,620,268),'think':(1215,295,1510,515),'laptop':(1205,50,1512,282),'idea':(380,545,615,740),'getaway':(1205,525,1512,742),
       'magnify':(20,40,300,278),'notepad':(925,295,1200,515),'sleep':(350,760,630,965),'box':(915,540,1205,740)}
closed={'think','laptop','idea','magnify','notepad'}
sheet=Image.new('RGBA',(len(rects)*320,260),(52,91,228,255))
for i,(k,(x0,y0,x1,y1)) in enumerate(rects.items()):
    c=im[y0:y1,x0:x1]
    a=np.clip(((bg-c)/bg).max(axis=2)*1.8,0,1)
    rows=np.where((a>0.5).any(axis=1))[0]; bottom=rows.max()+1
    c=c[:bottom]; a=a[:bottom]; h,w=c.shape[:2]
    # Seal the gaps between halftone dots so the fill treats dotted shading as an edge.
    m=Image.fromarray(((a>=0.35)*255).astype('uint8')).filter(ImageFilter.MaxFilter(7)).point(lambda v:255-v)
    pad=Image.new('L',(w+2,h+2),255); pad.paste(m,(1,1))
    # Coats run off the drawing's baseline: wall the bottom so the fill cannot get inside them.
    if k in closed: ImageDraw.Draw(pad).line([(0,h),(w+1,h)],fill=0)
    ImageDraw.floodfill(pad,(0,0),128)
    ext=(np.asarray(pad)[1:h+1,1:-1]==128)
    # Undo the sealing: shrink the inside back by the same amount so no cream rim is left.
    inside=Image.fromarray(((~ext)*255).astype('uint8')).filter(ImageFilter.MinFilter(7))
    ext=np.asarray(inside)==0
    # Nothing left of a row's first ink or right of its last ink can be inside the figure.
    ink=a>0.5
    for y in range(h):
        xs=np.where(ink[y])[0]
        if len(xs)==0: ext[y]=True
        else: ext[y,:xs.min()]=True; ext[y,xs.max()+1:]=True
    alpha=np.where(ext,a,1.0); alpha[alpha<0.04]=0
    safe=np.where(alpha>0,alpha,1)[...,None]
    col=np.where(ext[...,None],(c-(1-alpha)[...,None]*bg)/safe,c)
    out=np.zeros((h,w,4)); out[...,:3]=np.clip(col,0,255); out[...,3]=alpha*255
    img=Image.fromarray(out.astype('uint8'),'RGBA')
    bb=img.getchannel('A').point(lambda v:255 if v>25 else 0).getbbox(); img=img.crop(bb)
    img.save(f'{root}/public/poses/{k}.png',optimize=True); print(k,img.size)
    sheet.paste(img,(i*320,0),img)
if preview: sheet.save(preview)
