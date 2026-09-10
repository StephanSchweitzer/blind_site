# -*- coding: utf-8 -*-
"""Convert the ECA Word guide into per-section Markdown + extracted images."""
import os, re, sys, zipfile, shutil
import xml.etree.ElementTree as ET

SRC = r"C:\Users\pc\IdeaProjects\blind_site\user_guide\Mode d'emploi Arbre Rose.docx"
OUT_MD  = sys.argv[1]
OUT_IMG = sys.argv[2]

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
def w(t): return f'{{{W}}}{t}'

z = zipfile.ZipFile(SRC)

# rId -> media filename
rels = ET.fromstring(z.read('word/_rels/document.xml.rels'))
rel_target = {}
for rel in rels:
    rel_target[rel.get('Id')] = rel.get('Target')

doc = ET.fromstring(z.read('word/document.xml'))
body = doc.find(w('body'))

def run_pieces(run):
    """Yield ('text', s) / ('img', rid) in document order for one run."""
    out = []
    bold = run.find(f'{w("rPr")}/{w("b")}') is not None
    for el in run.iter():
        tag = el.tag
        if tag == w('t'):
            out.append(('text', el.text or '', bold))
        elif tag == w('br'):
            out.append(('text', '\n', False))
        elif tag == f'{{{A}}}blip':
            rid = el.get(f'{{{R}}}embed')
            if rid: out.append(('img', rid, False))
    return out

def para_info(p):
    """Return (text_markdown, [rids], max_font_size, is_list)."""
    parts, rids, maxsz = [], [], 0
    for sz in p.iter(w('sz')):
        try: maxsz = max(maxsz, int(sz.get(w('val'))))
        except (TypeError, ValueError): pass
    is_list = p.find(f'{w("pPr")}/{w("numPr")}') is not None
    for run in p.iter(w('r')):
        for kind, val, bold in run_pieces(run):
            if kind == 'img':
                rids.append(val)
            elif val:
                parts.append(('**%s**' % val) if (bold and val.strip()) else val)
    txt = ''.join(parts)
    txt = re.sub(r'\*\*\s*\*\*', '', txt)      # empty bold
    txt = re.sub(r'\*\*(\s+)', r'\1**', txt)   # bold starting with space
    return txt.strip(), rids, maxsz, is_list

# ---- walk the body in order --------------------------------------------
blocks = []   # ('h1'|'h2'|'p'|'li'|'img', payload)
for child in body:
    if child.tag == w('p'):
        txt, rids, maxsz, is_list = para_info(child)
        if maxsz >= 32 and txt:
            blocks.append(('h1', txt.strip('*').strip()))
        elif txt:
            m = re.match(r'^[*]*SOUS[ -]?SECTION[ ]*:?[ ]*(.*?)[*]*$', txt, re.I)
            if m:
                label = m.group(1).strip(' :*').strip()
                blocks.append(('h2', label.capitalize() if label.isupper() else label))
            elif is_list:
                blocks.append(('li', txt))
            else:
                blocks.append(('p', txt))
        for rid in rids:
            blocks.append(('img', rid))
    elif child.tag == w('tbl'):
        blocks.append(('p', '<!-- TODO: tableau converti à la main -->'))

# ---- split into sections -----------------------------------------------
sections, cur = [], None
for kind, payload in blocks:
    if kind == 'h1':
        cur = {'title': payload, 'blocks': []}
        sections.append(cur)
    else:
        if cur is None:
            cur = {'title': 'Introduction', 'blocks': []}
            sections.append(cur)
        cur['blocks'].append((kind, payload))

def slug(s):
    s = s.lower()
    for a_, b_ in [('à','a'),('â','a'),('é','e'),('è','e'),('ê','e'),('ë','e'),
                   ('î','i'),('ï','i'),('ô','o'),('ö','o'),('û','u'),('ù','u'),
                   ('ü','u'),('ç','c'),("'",'-'),('’','-')]:
        s = s.replace(a_, b_)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s

os.makedirs(OUT_MD, exist_ok=True)
os.makedirs(OUT_IMG, exist_ok=True)

manifest = []
for idx, sec in enumerate(sections, 1):
    sl = slug(sec['title'])
    lines = ['---', 'title: %s' % sec['title'], 'slug: %s' % sl,
             'order: %d' % idx, '---', '', '# %s' % sec['title'], '']
    img_n, n_img, n_par = 0, 0, 0
    for kind, payload in sec['blocks']:
        if kind == 'h2':
            lines += ['', '## %s' % payload, '']
        elif kind == 'p':
            lines += [payload, '']; n_par += 1
        elif kind == 'li':
            lines += ['- %s' % payload]
        elif kind == 'img':
            target = rel_target.get(payload)
            if not target: continue
            src = 'word/' + target.replace(chr(92), chr(47)).lstrip('/')
            if src not in z.namelist(): continue
            img_n += 1; n_img += 1
            ext = os.path.splitext(src)[1] or '.png'
            name = '%s-%02d%s' % (sl, img_n, ext)
            with z.open(src) as fsrc, open(os.path.join(OUT_IMG, name), 'wb') as fdst:
                shutil.copyfileobj(fsrc, fdst)
            lines += ['', '![%s - capture %d](/admin/aide/images/%s)' % (sec['title'], img_n, name), '']
    md = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip() + '\n'
    path = os.path.join(OUT_MD, '%02d-%s.md' % (idx, sl))
    open(path, 'w', encoding='utf-8').write(md)
    manifest.append((path, sec['title'], n_par, n_img, len(md)))

print('%-34s %-24s %5s %5s %7s' % ('FILE', 'TITLE', 'PARA', 'IMG', 'CHARS'))
for p, t, a_, b_, c in manifest:
    print('%-34s %-24s %5d %5d %7d' % (os.path.basename(p), t[:24], a_, b_, c))
print('\ntotal sections: %d  images: %d' % (len(manifest), sum(x[3] for x in manifest)))
