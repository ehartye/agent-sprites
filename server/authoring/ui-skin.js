const panels=['panel_dark','panel_light','button_normal','button_hover','button_pressed','button_disabled','button_focus','slot_normal','slot_selected','tooltip','keycap','checkbox_off','checkbox_on','divider','scrim','progress_track','progress_fill'];
const icons={
  leaf:['000001110','000111110','001111100','011111000','011110000','001010000','000100000','001000000','010000000'],
  book:['111101111','100111001','101111101','100111001','101111101','100111001','111101111'],
  bag:['0011100','0100010','1111111','1000001','1010101','1000001','1111111'],
  settings:['0011100','1011101','1111111','1100011','1101011','1100011','1111111','1011101','0011100'],
  help:['01110','10001','00001','00010','00100','00000','00100'],
  up:['0001000','0011100','0111110','1101011','0001000','0001000','0001000'],
  down:['0001000','0001000','0001000','1101011','0111110','0011100','0001000'],
  left:['0001000','0011000','0110000','1111111','0110000','0011000','0001000'],
  right:['0001000','0001100','0000110','1111111','0000110','0001100','0001000'],
  close:['1000001','0100010','0010100','0001000','0010100','0100010','1000001'],
  sun:['0001000','0101010','0011100','1111111','0011100','0101010','0001000'],
  star:['0001000','0001000','0011100','1111111','0011100','0001000','0001000'],
};
export function skinDefinitions(){return [...panels,...Object.keys(icons).flatMap(n=>[`icon_${n}`,`icon_${n}_ink`])].map(alias=>({alias,metrics:{insets:{left:alias==='scrim'?0:4,right:alias==='scrim'?0:4,top:alias==='scrim'?0:4,bottom:alias==='scrim'?0:4},padding:{left:6,right:6,top:5,bottom:5},minWidth:12,minHeight:12,...(alias.startsWith('icon_')?{icon:true}:{}),...(alias==='scrim'?{tile:true}:{}),...(alias.startsWith('progress_')?{content:{x:0,y:11,w:24,h:2}}:{})}}));}
export function drawSkin(alias,rect,c){
  if(alias.startsWith('icon_')){const pattern=icons[alias.slice(5).replace(/_ink$/,'')],left=Math.floor((24-pattern[0].length)/2),top=Math.floor((24-pattern.length)/2);for(let y=0;y<pattern.length;y++)for(let x=0;x<pattern[y].length;x++)if(pattern[y][x]==='1')rect(left+x,top+y,1,1,alias.endsWith('_ink')?c.ink:c.cream);return;}
  if(alias.startsWith('progress_')){rect(0,11,24,2,alias==='progress_track'?c.ink:c.moss);if(alias==='progress_fill')rect(0,11,24,1,c.gold);return;}
  if(alias==='scrim'){for(let y=0;y<24;y++)for(let x=y%2;x<24;x+=2)rect(x,y,1,1,c.shadow);return;}
  if(alias==='divider'){rect(0,11,24,1,c.edge);rect(0,12,24,1,c.shadow);return;}
  const light=alias==='panel_light'||alias==='keycap',disabled=alias==='button_disabled',selected=alias==='slot_selected'||alias==='button_focus',pressed=alias==='button_pressed';
  const fill=light?c.light:disabled?c.ink:pressed?c.ink:alias==='button_hover'?c.edge:c.deep,border=selected?c.gold:disabled?c.deep:light?c.ink:c.edge;
  rect(2,0,20,24,c.shadow);rect(0,2,24,20,c.shadow);rect(2,1,20,21,border);rect(1,2,22,19,border);rect(3,2,18,19,fill);rect(2,3,20,17,fill);
  rect(4,2,16,1,disabled?c.deep:pressed?c.shadow:light?c.cream:selected?c.gold:c.muted);rect(3,20,18,1,light?c.edge:c.ink);
  if(selected){rect(1,4,1,15,c.gold);rect(22,4,1,15,c.gold);}
  if(alias==='slot_normal'||alias==='slot_selected'){rect(5,5,14,14,c.ink);rect(6,6,12,1,c.shadow);}
  if(alias.startsWith('checkbox')){rect(6,6,12,12,c.ink);rect(7,7,10,10,c.light);if(alias==='checkbox_on'){rect(8,11,2,3,c.ink);rect(10,13,2,2,c.ink);rect(12,9,2,4,c.ink);rect(14,7,2,3,c.ink);}}
}
