"""Turn the cut-out poses into real vector SVGs.

Each pose is reduced to its few flat ink colours (k-means), each colour is traced on its own as a
crisp shape (vtracer, binary mode), and the layers are stacked: cream silhouette first, then the
colour layers, black linework on top. The drawing is unchanged; only its format changes.

Usage: python3 scripts/vectorize-poses.py <apps/extension dir> [preview dir]
Needs: pip install vtracer pillow numpy  (cairosvg optional, for previews)
"""
import re, sys, os
import numpy as np
from PIL import Image, ImageFilter
import vtracer

root = sys.argv[1]
preview = sys.argv[2] if len(sys.argv) > 2 else None
SCALE = 4
POSES = ['peek', 'peek-face', 'think', 'laptop', 'idea', 'getaway', 'magnify', 'notepad', 'sleep', 'box']
CREAM = np.array([247, 242, 230])


def kmeans(px, k, iters=20):
    rng = np.random.default_rng(1)
    c = px[rng.choice(len(px), k, replace=False)].astype(float)
    for _ in range(iters):
        lab = ((px[:, None, :] - c[None]) ** 2).sum(-1).argmin(1)
        for i in range(k):
            m = lab == i
            if m.any(): c[i] = px[m].mean(0)
    return c


def trace(mask, tmp):
    Image.fromarray(np.where(mask, 0, 255).astype('uint8')).save(tmp)
    out = tmp + '.svg'
    vtracer.convert_image_to_svg_py(tmp, out, colormode='binary', mode='spline', filter_speckle=6,
                                    corner_threshold=60, length_threshold=4.0, splice_threshold=45, path_precision=1)
    svg = open(out).read()
    os.remove(tmp); os.remove(out)
    return re.findall(r'<path d="([^"]+)"[^>]*transform="translate\(([-\d.]+),([-\d.]+)\)"', svg) or [(d, '0', '0') for d in re.findall(r'<path d="([^"]+)"', svg)]


for name in POSES:
    src = Image.open(f'{root}/public/poses/{name}.png').convert('RGBA')
    w, h = src.size
    big = src.resize((w * SCALE, h * SCALE), Image.LANCZOS)
    a = np.asarray(big).astype(float)
    alpha = a[..., 3] > 110
    rgb = a[..., :3]
    # Fixed ink palette, so every pose shares exactly the same colours as the brand.
    pal = {'#141414': (20, 20, 20), '#f5c84c': (245, 200, 76), 'cream': tuple(CREAM)}
    if name == 'box': pal['#dcab6b'] = (220, 171, 107)       # only the box is brown
    if name == 'notepad': pal['#e9643a'] = (233, 100, 58)    # only the notepad has the red tick
    names = list(pal); cols = np.array([pal[n] for n in names], float)
    lab = ((rgb[..., None, :] - cols[None, None]) ** 2).sum(-1).argmin(-1)
    # Silhouette: everything drawn, with enclosed gaps filled so coats never show holes.
    sil = np.asarray(Image.fromarray((alpha * 255).astype('uint8')).filter(ImageFilter.MedianFilter(5))) > 127
    from PIL import ImageDraw
    m = Image.fromarray((sil * 255).astype('uint8')).filter(ImageFilter.MaxFilter(9))
    pad = Image.new('L', (m.width + 2, m.height + 2), 0); pad.paste(m, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    sil = sil | (np.asarray(pad)[1:-1, 1:-1] == 0)
    layers = [('#%02x%02x%02x' % tuple(CREAM), sil)]
    for n in [c for c in ['#dcab6b', '#f5c84c', '#e9643a', '#141414'] if c in pal]:
        mm = (lab == names.index(n)) & alpha
        if mm.sum() < 40: continue
        mm = np.asarray(Image.fromarray((mm * 255).astype('uint8')).filter(ImageFilter.MedianFilter(3))) > 127
        layers.append((n, mm))
    parts = []
    for fill, m in layers:
        for d, tx, ty in trace(m, f'/tmp/_pp_{name}.png'):
            t = f' transform="translate({tx},{ty})"' if (tx, ty) != ('0', '0') else ''
            parts.append(f'<path fill="{fill}" d="{d}"{t}/>')
    W, H = w * SCALE, h * SCALE
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{w}" height="{h}">' + ''.join(parts) + '</svg>'
    path = f'{root}/public/poses/{name}.svg'
    open(path, 'w').write(svg)
    print(name, f'{len(svg)//1024}KB', len(parts), 'paths', 'colours', [l[0] for l in layers])
    if preview:
        import cairosvg
        cairosvg.svg2png(bytestring=svg.encode(), write_to=f'{preview}/{name}.png', output_width=w * 3, background_color='#3459e4')
