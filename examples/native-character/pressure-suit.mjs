import {costumeTemplate} from './costume-template.mjs';

const ramp=(outline,shadow,base,highlight)=>({outline,shadow,base,highlight});
const ink='#26333f';
const trim=ramp(ink,'#976b49','#dda362','#f4d29a');
const boots=ramp(ink,'#3a4f5b','#607d84','#9eafb0');
export const SUIT_STYLES={
  field:{label:'Field suit',description:'A soft expedition suit with a clear bubble helmet and a compact life-support pack.',details:['Cream helmet / teal pressure fabric','Forward-only profile visor','Soft gloves, sealed boots, compact backpack'],
    shell:ramp(ink,'#859c97','#c3d1bd','#f3ebcb'),cloth:ramp(ink,'#315d64','#598b88','#95b9a6')},
  service:{label:'Service shell',description:'An angular maintenance shell for hull repairs, with a side visor, hard chest plate, and service pack.',details:['Ivory armor / dark joint fabric','Flat forward visor and solid rear helmet','Orange chest controls and reinforced work boots'],
    shell:ramp(ink,'#829097','#c3cbd0','#eff0db'),cloth:ramp(ink,'#3b485c','#616e80','#9caeb8')},
  retro:{label:'Retro ribbed',description:'A copper pressure suit with an ivory helmet, ribbed chest panels, and twin life-support cylinders.',details:['Copper pressure fabric / brass hardware','Rounded helmet and broad collar ring','Ribbed chest and twin rear cylinders'],
    shell:ramp(ink,'#a48c72','#dbccaa','#fff0ca'),cloth:ramp(ink,'#835747','#ba7a54','#e7b47a')},
};
const motif=(name,directions,anchor,x,y,rows,extra={})=>({name,directions,anchor,x,y,rows,...extra});

export function pressureSuitProfile(character,style){
  const suit=SUIT_STYLES[style];
  if(!suit)throw Error(`Unknown pressure suit: ${style}`);
  const child=character.kind==='child';
  const retained=(character.motifs??[]).filter(m=>m.part==='head'||['moth-neck','optics','display-front','display-profile','rear-casing','rear-head','silver-temples','tracks'].includes(m.name)||m.name.startsWith('lower-hand'));
  const identity=retained.map(m=>m.name.startsWith('lower-hand')?{...m,colors:{...m.colors,t:suit.cloth.base,l:suit.shell.highlight}}:structuredClone(m));
  const materials={...character.materials,cloth:suit.cloth,trim:suit.shell,trousers:suit.cloth,shoes:boots};
  const colors={...character.colors,o:ink,C:suit.shell.base,H:suit.shell.highlight,S:suit.shell.shadow,T:suit.cloth.base,D:suit.cloth.shadow,G:trim.base,V:'#82caca',W:'#d6f5e4'};
  const front=style==='service'?
    ['..oooooooooo..','.oCHHHHHHHHCo.','oCCCCCCCCCCCCo','oCSooooooooSCo','oCoW........oo','oCo.........Vo','oCo.........Vo','oCo.........Vo','oCo.........Vo','oCo.........Vo','oCo.........oo','oCSooooooooSCo','.oCCCCCCCCCCo.','..ooCCCCCCoo..','....oooooo....']:
    ['....oooooo....','..ooCHHHHCoo..','.oCHHHHHHHHCo.','oCH........HCo','oCV.W......VCo','oCV........VCo','oSV........VSo','oSV........VSo','oSV........VSo','oSV........VSo','oSV........VSo','.oSV......VSo.','..oSVVVVVVSo..','...oCCCCCCo...','....oooooo....'];
  // In profile, the rear two-thirds are opaque casing. Glass is only forward
  // of x=8; the front-facing oval is never reused for a side view.
  const right=style==='service'?
    ['..oooooooooo..','.oCHHHHHHHHCo.','oCCCCCCCCCCCCo','oCCCCCCooooooo','oCSSCCoW.....o','oCSSCCo......V','oCSSCCo......V','oCSSCCo......V','oCSSCCo......V','oCSSCCo......V','oCSSCCo......o','oCCCCCCooooooo','.oCCCCCCCCCCo.','..ooCCCCCCoo..','....oooooo....']:
    ['....oooooo....','..ooCHHHHCoo..','.oCHHHHHHHHCo.','oCCCCCCo...HCo','oCCCCCCoW...Vo','oCSSCCCo....Vo','oCSSCCCo....Vo','oCSSCCCo....Vo','oCSSCCCo....Vo','oCSSCCCo....Vo','oCCCCCCo....Vo','.oCCCCCCo..Vo.','..oCCCCCCVVo..','...oCCCCCCo...','....oooooo....'];
  const back=style==='service'?
    ['..oooooooooo..','.oCHHHHHHHHCo.','oCCCCCCCCCCCCo','oCCSSSSSSSSCCo','oCCSCCCCCCSCCo','oCCSCCCCCCSCCo','oCCSoSSSSoSCCo','oCCSoSSSSoSCCo','oCCSCCCCCCSCCo','oCCSCCCCCCSCCo','oCCSSSSSSSSCCo','oCCCCCCCCCCCCo','.oCCCCCCCCCCo.','..ooCCCCCCoo..','....oooooo....']:
    ['....oooooo....','..ooCHHHHCoo..','.oCHHHHHHHHCo.','oCCCCCCCCCCCCo','oCCSSSSSSSSCCo','oCCSCCCCCCSCCo','oCCSCCCCCCSCCo','oCCSCSSSSCSCCo','oCCSCSSSSCSCCo','oCCSCCCCCCSCCo','oCCSSSSSSSSCCo','.oCCCCCCCCCCo.','..oCCCCCCCCo..','...oCCCCCCo...','....oooooo....'];
  for(const helmet of [front,right,back])helmet[14]='....oCCCCo....';
  const torso=child?['oCCCCo','oCGVCo','oCDDCo','oooooo']:['oCCCCo','oCGVCo','oCCCCo','oCDDCo','oCCCCo','oooooo'];
  const gear=[
    motif('pressure-chest',['front'],'shoulder',5,0,torso),
    motif('pressure-side-seam',['right'],'shoulder',8,0,child?['Co','To','Co','oo']:['Co','To','To','Co','To','oo']),
    motif('pressure-collar',['front','back'],'shoulder',4,-1,['oCCCCCCo','ooSSSSoo']),
    motif('pressure-collar',['right'],'shoulder',5,-1,['oCCCCCo','oSSSSSo']),
    motif('life-support',['back'],'shoulder',4,0,child?['ooCCCCoo','oCCSSCCo','oCGSSGCo','oCCSSCCo','oooooooo']:['ooCCCCoo','oCCSSCCo','oCGSSGCo','oCCSSCCo','oCCSSCCo','oCCSSCCo','oooooooo']),
    motif('life-support',['right'],'shoulder',1,0,child?['oooo','oCCo','oGCo','oooo']:['oooo','oCCo','oGCo','oCCo','oCCo','oooo'],{layer:'behind'}),
    motif('helmet-front',['front'],'head',1,-2,front,{coverHands:true}),
    motif('helmet-profile',['right'],'head',1,-2,right,{coverHands:true}),
    motif('helmet-rear',['back'],'head',1,-2,back,{coverHands:true}),
  ];
  if(style==='retro'){
    // Replace the flat chest and backpack with ribbed panels and paired tanks.
    gear.find(m=>m.name==='pressure-chest').rows=child?['oCGGCo','oSDDSo','oCGGCo','oooooo']:['oCGGCo','oSDDSo','oCGGCo','oSDDSo','oCGGCo','oooooo'];
    gear.find(m=>m.name==='life-support'&&m.directions.includes('back')).rows=child?['.oo..oo.','oHCooHCo','oCSooCSo','.oo..oo.']:['.oo..oo.','oHCooHCo','oCSooCSo','oCSooCSo','oCSooCSo','.oo..oo.'];
  }
  if(style==='service')gear.unshift(motif('service-shoulders',['front','back'],'shoulder',2,0,['oCCo....oCCo','oooo....oooo'],{layer:'behind'}));
  return {...character,id:`${character.id}-${style}`,outfit:'jacket',materials,colors,motifs:[...identity,...gear]};
}

export function pressureSuitTemplate(character,style){
  const profile=pressureSuitProfile(character,style),ops=costumeTemplate(profile),suit=SUIT_STYLES[style];
  const bodyMaterial=character.bodyMaterial??'skin';
  for(const frame of ops.filter(o=>o.command==='name')){
    const head=new Set(ops.filter(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name==='head').flatMap(o=>o.shapes));
    for(const role of ['outline','shadow','base','highlight']){
      const group=ops.find(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name===`${bodyMaterial}-${role}`);
      if(!group)continue;
      const sealed=group.shapes.filter(name=>!head.has(name)),names=new Set(sealed);
      for(const p of ops.filter(o=>o.command==='draw'&&o.cell===frame.cell&&names.has(o.name)))p.color=suit.cloth[role];
      group.shapes=group.shapes.filter(name=>head.has(name));
      if(sealed.length)ops.push({command:'shape-group',sub:'create',cell:frame.cell,name:`pressure-fabric-${role}`,shapes:sealed});
    }
  }
  return ops.filter(o=>o.command!=='shape-group'||o.shapes.length);
}
