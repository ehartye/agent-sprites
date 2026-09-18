/** Runs both in Node tests and embedded in the standalone review page. */
export function animationSequence(tag) {
  const forward = Array.from({ length: tag.to - tag.from + 1 }, (_, i) => tag.from + i);
  const order = (tag.direction === 'reverse' || tag.direction === 'pingpong_reverse') ? forward.reverse() : forward;
  return (tag.direction === 'pingpong' || tag.direction === 'pingpong_reverse')
    ? order.concat(order.slice(1, -1).reverse()) : order;
}

export function createPreview(atlas, png, name) {
  const data = JSON.stringify({ atlas, image: `data:image/png;base64,${png.toString('base64')}`, name }).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sprite review</title>
<style>
:root{color-scheme:light;--ink:#253b45;--paper:#e8edf0;--line:#aabcc5;--accent:#075b82;--stage:#898989}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px 'Trebuchet MS',sans-serif}
main{max-width:1060px;margin:36px auto;padding:0 24px}header{display:flex;align-items:baseline;justify-content:space-between;gap:20px;border-bottom:2px solid var(--ink)}
h1{font:600 clamp(28px,5vw,44px) Georgia,serif;margin:0 0 20px}header p{font:13px Consolas,monospace}section{margin:24px 0}
.controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap}label{display:grid;gap:6px;font-size:13px}button,select{font:inherit;padding:9px 14px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:4px;cursor:pointer}
button:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:3px}button[aria-pressed=true]{background:var(--accent);color:white}
.stage{display:flex;align-items:center;justify-content:center;background:var(--stage);min-height:360px;border:1px solid #666;overflow:auto}
canvas{image-rendering:pixelated;max-width:100%;object-fit:contain}.readout{font:14px Consolas,monospace;margin:12px 0}
.frames{display:flex;gap:8px;overflow:auto;padding:4px 0 16px}.frames button{flex:none;padding:8px;display:grid;gap:6px;justify-items:center;font:12px Consolas,monospace}.frames canvas{background:var(--stage)}
footer{border-top:1px solid var(--line);padding:16px 0;font-size:13px}@media(max-width:600px){main{margin:20px auto;padding:0 14px}header{display:block}.stage{min-height:280px}}
</style>
<main><header><h1 id="name"></h1><p>SPRITE REVIEW</p></header>
<section class="controls"><label>Animation<select id="tags"></select></label><button id="play" aria-pressed="false">Pause</button><button id="step">Next frame</button><label>Zoom<select id="zoom"><option>2</option><option selected>4</option><option>8</option><option>12</option></select></label></section>
<section><div class="stage"><canvas id="stage" aria-label="Current animation frame"></canvas></div><p class="readout" id="readout"></p><div class="frames" id="frames" aria-label="Animation frames"></div></section>
<footer>Structural checks passed. Inspect the silhouette, facing, contact line, and timing through a full loop.</footer></main>
<script>
const data=${data};
const animationSequence=${animationSequence.toString()};
const atlas=data.atlas, image=new Image(), tags=document.getElementById('tags'), stage=document.getElementById('stage'), play=document.getElementById('play');
const strip=document.getElementById('frames'), zoom=document.getElementById('zoom'), readout=document.getElementById('readout');
document.getElementById('name').textContent=data.name;document.title=data.name+' — sprite review';
const animations=atlas.meta.frameTags.length?atlas.meta.frameTags:[{name:'All frames',from:0,to:atlas.frames.length-1,direction:'forward'}];
for(const [i,tag] of animations.entries()){const option=document.createElement('option');option.value=i;option.textContent=tag.name;tags.append(option)}
let sequence=[],cursor=0,elapsed=0,last=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
const paintStates=new WeakMap();
function paint(canvas,frame,scale){if(!paintStates.has(canvas))canvas.addEventListener('contextrestored',()=>{const current=paintStates.get(canvas);paint(canvas,current.frame,current.scale)});paintStates.set(canvas,{frame,scale});const f=frame.frame;canvas.width=frame.sourceSize.w*scale;canvas.height=frame.sourceSize.h*scale;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(image,f.x,f.y,f.w,f.h,frame.spriteSourceSize.x*scale,frame.spriteSourceSize.y*scale,f.w*scale,f.h*scale)}
function show(){const index=sequence[cursor],frame=atlas.frames[index];paint(stage,frame,Number(zoom.value));readout.textContent=(cursor+1)+' / '+sequence.length+' · '+frame.filename+' · '+frame.duration+' ms';[...strip.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===cursor)))}
function syncPlay(){play.textContent=playing?'Pause':'Play';play.setAttribute('aria-pressed',String(playing))}
function select(){sequence=animationSequence(animations[Number(tags.value)]);cursor=0;elapsed=0;strip.replaceChildren();for(const [i,index] of sequence.entries()){const b=document.createElement('button'),c=document.createElement('canvas'),label=document.createElement('span');paint(c,atlas.frames[index],2);label.textContent=atlas.frames[index].filename;b.append(c,label);b.onclick=()=>{cursor=i;elapsed=0;playing=false;syncPlay();show()};strip.append(b)}show()}
tags.onchange=select;zoom.onchange=show;play.onclick=()=>{playing=!playing;elapsed=0;syncPlay()};document.getElementById('step').onclick=()=>{playing=false;cursor=(cursor+1)%sequence.length;elapsed=0;syncPlay();show()};
function tick(now){if(last&&playing){elapsed+=Math.min(now-last,1000);while(elapsed>=atlas.frames[sequence[cursor]].duration){elapsed-=atlas.frames[sequence[cursor]].duration;cursor=(cursor+1)%sequence.length;show()}}last=now;requestAnimationFrame(tick)}
image.onload=()=>{select();syncPlay();requestAnimationFrame(tick)};image.src=data.image;
</script></html>`;
}
