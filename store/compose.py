# store/compose.py — turns raw captures into Chrome Web Store assets (run: python3 -I store/compose.py)
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
R = os.path.join(os.path.dirname(__file__), 'raw'); A = os.path.join(os.path.dirname(__file__), 'assets')
F = lambda s, w='Bold': ImageFont.truetype(f'/usr/share/fonts/opentype/inter/InterDisplay-{w}.otf', s)
INK=(27,25,23); CREAM=(246,242,234); MUT=(143,136,122); ACC=(226,112,79); SAGE=(111,207,151)

def band(im, title, sub):
    d = ImageDraw.Draw(im); d.rectangle([0,0,im.width,96], fill=(15,14,12))
    d.rounded_rectangle([24,30,60,66], radius=10, fill=ACC); d.rounded_rectangle([31,50,53,56], radius=3, fill=(255,255,255)); d.rounded_rectangle([31,50,45,56], radius=3, fill=(255,230,220))
    d.text((74,22), title, font=F(28,'Bold'), fill=(243,238,228)); d.text((74,58), sub, font=F(16,'Medium'), fill=(190,183,170))
    d.text((im.width-24, 48), 'Wiggleroom · free', font=F(14,'SemiBold'), fill=(143,136,122), anchor='rm')

def shot(src, out, title, sub):
    im = Image.new('RGB', (1280,800), (15,14,12)); page = Image.open(os.path.join(R, src)).convert('RGB').resize((1280,710), Image.LANCZOS)
    im.paste(page, (0,96)); band(im, title, sub); im.save(os.path.join(A, out), optimize=True)

shot('1-bar.png','screenshot-1.png','Know how much Claude you\'ve got left','5-hour window, weekly cap, this chat\'s weight and messages left, right under the message box')
shot('2-details.png','screenshot-2.png','Why you hit limits, and your weekly pace','Breakdown by source, learned messages-left, burn per day and when you\'d hit the cap')
shot('6-fresh.png','screenshot-3.png','Start fresh without starting over','One click builds a summary of the goal, decisions and latest code and drops it into a new chat')
shot('4-backup.png','screenshot-5.png','Back up every chat on your computer','HTML, Markdown, JSON, every artifact version, code and files. Incremental folder mode')

# popup composite: usage + actions side by side
im = Image.new('RGB', (1280,800), (15,14,12)); d = ImageDraw.Draw(im)
for cx,cy,r,col in [(300,500,520,(226,112,79)),(1100,200,420,(111,207,151))]:
    blob = Image.new('RGBA',(1280,800),(0,0,0,0)); bd = ImageDraw.Draw(blob)
    for i in range(r,0,-8): bd.ellipse([cx-i,cy-i,cx+i,cy+i], fill=col+(int(40*(1-i/r)),))
    im.paste(blob,(0,0),blob)
d = ImageDraw.Draw(im)
d.text((56,120),'One popup.',font=F(54,'ExtraBold'),fill=(243,238,228)); d.text((56,180),'Everything in it.',font=F(54,'ExtraBold'),fill=ACC)
for i,t in enumerate(['Usage, pace and resets from any tab','Start fresh, carry to ChatGPT / Gemini / Grok','Back up this chat, all chats, Claude Code','Prompts and settings, no new windows']):
    d.ellipse([58,276+i*38,70,288+i*38], fill=SAGE); d.text((84,266+i*38), t, font=F(19,'Medium'), fill=(200,193,180))
for k,(src,x) in enumerate([('popup-usage.png',560),('popup-actions.png',930)]):
    p = Image.open(os.path.join(R,src)).convert('RGB'); p = p.resize((int(p.width*0.42), int(p.height*0.42)), Image.LANCZOS)
    sh = Image.new('RGBA',(p.width+60,p.height+60),(0,0,0,0)); ImageDraw.Draw(sh).rounded_rectangle([30,40,p.width+30,p.height+40], radius=18, fill=(0,0,0,160)); sh = sh.filter(ImageFilter.GaussianBlur(18)); im.paste(sh,(x-30,100-30),sh)
    mask = Image.new('L', p.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0,0,p.width-1,p.height-1], radius=14, fill=255); im.paste(p,(x,100),mask)
im.save(os.path.join(A,'screenshot-4.png'), optimize=True)

# small promo tile 440x280
t = Image.new('RGB',(440,280),(15,14,12)); d = ImageDraw.Draw(t)
d.rounded_rectangle([28,28,74,74], radius=12, fill=ACC); d.rounded_rectangle([38,54,66,61], radius=3, fill=(255,255,255))
d.text((88,32),'Wiggleroom',font=F(30,'ExtraBold'),fill=(243,238,228)); d.text((28,100),'Know how much',font=F(34,'Bold'),fill=(243,238,228)); d.text((28,138),'Claude you\'ve got left.',font=F(34,'Bold'),fill=ACC)
d.text((28,196),'Live meter · alerts · local backup · handoff',font=F(15,'Medium'),fill=(190,183,170)); d.text((28,220),'Free for everyone · nothing leaves your computer',font=F(15,'Medium'),fill=(143,136,122))
d.rounded_rectangle([28,250,412,258], radius=4, fill=(45,42,36)); d.rounded_rectangle([28,250,250,258], radius=4, fill=SAGE)
t.save(os.path.join(A,'promo-small-440x280.png'), optimize=True)

# marquee 1400x560
m = Image.new('RGB',(1400,560),(15,14,12)); d = ImageDraw.Draw(m)
for cx,cy,r,col in [(200,560,560,(226,112,79)),(1300,0,460,(111,207,151))]:
    blob = Image.new('RGBA',(1400,560),(0,0,0,0)); bd = ImageDraw.Draw(blob)
    for i in range(r,0,-8): bd.ellipse([cx-i,cy-i,cx+i,cy+i], fill=col+(int(44*(1-i/r)),))
    m.paste(blob,(0,0),blob)
d = ImageDraw.Draw(m)
d.rounded_rectangle([70,70,122,122], radius=14, fill=ACC); d.rounded_rectangle([82,100,112,108], radius=4, fill=(255,255,255))
d.text((138,76),'Wiggleroom',font=F(34,'ExtraBold'),fill=(243,238,228))
d.text((70,170),'Know how much',font=F(64,'ExtraBold'),fill=(243,238,228)); d.text((70,240),'Claude you\'ve got left.',font=F(64,'ExtraBold'),fill=ACC)
d.text((70,340),'A live meter under Claude\'s message box, alerts before the wall,',font=F(22,'Medium'),fill=(200,193,180)); d.text((70,372),'a local backup of every chat, and one-click handoff. Free for everyone.',font=F(22,'Medium'),fill=(200,193,180))
bar = Image.open(os.path.join(R,'1-bar.png')).convert('RGB')
# crop the composer + bar region (2x capture): roughly x 560..2040, y 1060..1380
crop = bar.crop((560,980,2040,1300)).resize((740,160), Image.LANCZOS)
mask = Image.new('L', crop.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0,0,crop.width-1,crop.height-1], radius=16, fill=255)
sh = Image.new('RGBA',(crop.width+80,crop.height+80),(0,0,0,0)); ImageDraw.Draw(sh).rounded_rectangle([40,50,crop.width+40,crop.height+50], radius=16, fill=(0,0,0,170)); sh = sh.filter(ImageFilter.GaussianBlur(22)); m.paste(sh,(600-40,410-40),sh)
m.paste(crop,(600,410),mask)
m.save(os.path.join(A,'promo-marquee-1400x560.png'), optimize=True)
print(sorted(os.listdir(A)))
