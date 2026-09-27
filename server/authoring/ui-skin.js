const messagePanels=['message','speech','specimen','specimen_mount','specimen_label','note','notification','warning','scrim_solid'];
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
export function skinDefinitions(){return [...panels,...messagePanels,...Object.keys(icons).flatMap(n=>[`icon_${n}`,`icon_${n}_ink`])].map(alias=>({alias,metrics:{insets:{left:alias==='scrim'?0:4,right:alias==='scrim'?0:4,top:alias==='scrim'?0:4,bottom:alias==='scrim'?0:4},padding:{left:6,right:6,top:5,bottom:5},minWidth:12,minHeight:12,...(alias.startsWith('icon_')?{icon:true}:{}),...(alias==='scrim'?{tile:true}:{}),...(messagePanels.includes(alias)?{insets:{left:6,right:6,top:6,bottom:6},padding:{left:12,right:12,top:12,bottom:12},minWidth:24,minHeight:24,textTone:['note','specimen_label'].includes(alias)?'ink':'cream',...(alias==='scrim_solid'?{insets:{left:0,right:0,top:0,bottom:0},padding:{left:0,right:0,top:0,bottom:0},minWidth:1,minHeight:1,opacity:0.48}:{} )}:{}),...(alias.startsWith('progress_')?{content:{x:0,y:11,w:24,h:2}}:{})}}));}
export function drawSkin(alias,rect,c){
  // Message families share the font palette while preserving historical skins.
  // Insets keep every corner/label notch fixed when the center is stretched.
  const {orbitalInk:ink,instrumentTeal:teal,wornCopper:copper,seedGold:gold,mint,paper}=c;
  if(alias==='scrim_solid'){rect(0,0,24,24,ink);return;}
  if(messagePanels.includes(alias)){
    const note=alias==='note',mount=alias==='specimen_mount',label=alias==='specimen_label',fill=note?paper:label?mint:mount?c.specimenWell:ink;
    const accent=note?copper:alias==='specimen'?gold:alias==='warning'?copper:teal;
    rect(1,1,22,22,c.shadow);rect(0,0,24,22,accent);rect(1,1,22,20,fill);
    if(label){rect(0,0,24,22,mint);rect(0,0,4,3,ink);rect(20,19,4,3,ink);rect(5,2,14,1,teal);}
    else if(alias==='speech'){rect(1,1,2,20,teal);rect(3,1,18,1,mint);rect(21,18,2,3,copper);}
    else if(alias==='specimen'){rect(0,0,6,3,gold);rect(18,0,6,3,gold);rect(0,18,3,4,gold);rect(21,18,3,4,gold);}
    else if(mount){rect(2,2,4,1,mint);rect(2,2,1,4,mint);rect(18,18,4,1,teal);rect(21,18,1,3,teal);}
    else if(note){rect(1,1,2,20,copper);rect(4,1,18,1,c.cream);rect(19,18,3,3,c.light);}
    else if(alias==='notification'||alias==='warning'){rect(0,0,3,22,accent);rect(4,1,18,1,teal);}
    else rect(2,1,20,1,teal);
    return;
  }
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
