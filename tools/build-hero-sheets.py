import sys
from PIL import Image, ImageEnhance
src, out = sys.argv[1], sys.argv[2]
FW, FH, X0, Y0 = 80, 96, 24, 20
CLASSES = {
 'vanguard':  [('clothes',None),('steel_armor',None),('male_head1',None),('longsword',None),('shield',None)],
 'arcanist':  [('clothes',(0.55,0.7,1.25)),('male_head2',None),('greatstaff',None)],
 'healer':    [('clothes',(1.35,1.25,0.95)),('male_head3',None),('rod',None),('buckler',None)],
 'ranger':    [('clothes',(0.8,1.05,0.75)),('leather_armor',None),('male_head2',None),('longbow',None)],
 'rogue':     [('clothes',(0.7,0.7,0.75)),('leather_armor',(0.8,0.8,0.85)),('male_head3',None),('dagger',None)],
 'barbarian': [('clothes',(1.1,0.85,0.7)),('leather_armor',(1.15,0.9,0.75)),('male_head1',None),('greatsword',None)],
 'warlock':   [('clothes',(0.95,0.55,1.15)),('male_head1',None),('wand',None)],
}
cache={}
def layer(n,tint):
    im=cache.get(n) or Image.open(f'{src}/{n}.png').convert('RGBA'); cache[n]=im
    if not tint: return im
    r,g,b,a=im.split()
    r=r.point(lambda v:min(255,int(v*tint[0]))); g=g.point(lambda v:min(255,int(v*tint[1]))); b=b.point(lambda v:min(255,int(v*tint[2])))
    return Image.merge('RGBA',(r,g,b,a))
import os
for cls,ls in CLASSES.items():
    base=Image.new('RGBA',(4096,1024))
    for n,t in ls: base.alpha_composite(layer(n,t))
    sheet=Image.new('RGBA',(32*FW,8*FH))
    for r in range(8):
        for c in range(32):
            sheet.paste(base.crop((c*128+X0,r*128+Y0,c*128+X0+FW,r*128+Y0+FH)),(c*FW,r*FH))
    p=f'{out}/hero_{cls}.webp'
    sheet.save(p,'WEBP',quality=90,alpha_quality=100,method=6)
    print(cls,os.path.getsize(p)//1024,'KB')
