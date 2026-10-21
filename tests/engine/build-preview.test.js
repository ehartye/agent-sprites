import { test, expect } from 'vitest';
import { animationSequence, createPreview } from '../../server/build/preview.js';
import { JSDOM } from 'jsdom';
test.each([
  ['forward',[2,3,4]], ['reverse',[4,3,2]], ['pingpong',[2,3,4,3]], ['pingpong_reverse',[4,3,2,3]],
])('preview honors %s animation direction', (direction, expected) => {
  expect(animationSequence({from:2,to:4,direction})).toEqual(expected);
});
test('preview safely embeds asset names containing script markup', () => {
  const html=createPreview({frames:[],meta:{frameTags:[]}},Buffer.from('png'),'</script><script>alert(1)</script>');
  expect(html.match(/<script>/g)).toHaveLength(1);
  expect(html).toContain('\\u003c/script>');
});

test('preview redraws static thumbnails when the browser restores a lost canvas', async () => {
  const drawn=[];
  const frame={filename:'idle',frame:{x:0,y:0,w:8,h:8},sourceSize:{w:8,h:8},spriteSourceSize:{x:0,y:0,w:8,h:8},duration:125};
  const html=createPreview({frames:[frame],meta:{frameTags:[]}},Buffer.from('png'),'test');
  const dom=new JSDOM(html,{url:'https://sprite.test',runScripts:'dangerously',beforeParse(window){
    window.matchMedia=()=>({matches:true});
    window.requestAnimationFrame=()=>0;
    window.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return {drawImage(...args){drawn.push({canvas,args})}}};
    window.Image=class { set src(_value){queueMicrotask(()=>this.onload())} };
  }});
  try {
    await new Promise(r=>setTimeout(r,0));
    expect(drawn.length).toBe(2);
    const thumbnail=dom.window.document.querySelector('.frames canvas');
    const first=drawn[0].args;
    thumbnail.dispatchEvent(new dom.window.Event('contextrestored'));
    expect(drawn.length).toBe(3);
    expect(drawn[2].canvas).toBe(thumbnail);
    expect(drawn[2].args).toEqual(first);
    thumbnail.dispatchEvent(new dom.window.Event('contextrestored'));
    expect(drawn.length).toBe(4); // Exactly one listener, even after redraw.
  } finally {dom.window.close()}
});

test('standalone preview honors mixed durations, ends a one-shot on its final frame, and can restart', async () => {
  const frames=[75,125,200].map((duration,i)=>({filename:`pose-${i}`,frame:{x:i,y:0,w:1,h:1},sourceSize:{w:1,h:1},spriteSourceSize:{x:0,y:0,w:1,h:1},duration}));
  let tick;
  const dom=new JSDOM(createPreview({frames,meta:{frameTags:[{name:'once',from:0,to:2,direction:'forward',loop:false}]}},Buffer.from('png'),'once'),{runScripts:'dangerously',beforeParse(window){
    window.matchMedia=()=>({matches:false});
    window.requestAnimationFrame=callback=>{tick=callback;return 0;};
    window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
    window.Image=class {set src(_value){queueMicrotask(()=>this.onload());}};
  }});
  try {
    await new Promise(resolve=>setTimeout(resolve,0));
    const read=()=>dom.window.document.getElementById('readout').textContent;
    const play=dom.window.document.getElementById('play');
    tick(100);tick(175);expect(read()).toContain('pose-1');
    tick(300);expect(read()).toContain('pose-2');
    tick(500);expect(read()).toContain('pose-2');expect(play.textContent).toBe('Play');
    tick(900);expect(read()).toContain('pose-2');
    play.click();expect(read()).toContain('pose-0');
    tick(975);expect(read()).toContain('pose-1');
    tick(50_000);expect(read()).toContain('pose-2');expect(play.textContent).toBe('Play');
  } finally {dom.window.close();}
});
