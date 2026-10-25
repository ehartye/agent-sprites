import {test,expect} from 'vitest';

test('focus order declares immutable semantic reveal targets without inventing painted nodes',async()=>{
  const {panel,button}=await import('../../server/build/ui-components.mjs');
  const order=['visible','off-page'];const tree=panel({id:'root',focus:{order,initialId:'off-page'},children:[button({id:'visible',label:'Go'})]});
  order.push('later');expect(tree.focus.order).toEqual(['visible','off-page']);expect(tree.children).toHaveLength(1);
  for(const invalid of [['visible','visible'],[null],'visible'])expect(()=>panel({id:'root',focus:{order:invalid}})).toThrow(/order|ID/i);
});
import {existsSync} from 'node:fs';
async function api(){const url=new URL('../../server/build/ui-components.mjs',import.meta.url);expect(existsSync(url),'portable component owner exists').toBe(true);return import(url.href);}

test('independent regions: constructors freeze relative hit and focus rectangles and reject malformed geometry',async()=>{
  const u=await api(),regions={hit:{x:-8,y:-8,width:44,height:31},focus:{x:-30,y:-10,width:80,height:30}};
  const control=u.button({id:'small-face',regions});regions.hit.width=99;
  expect(control.regions.hit.width).toBe(44);expect(Object.isFrozen(control.regions.focus)).toBe(true);
  for(const invalid of [{paint:{x:0,y:0,width:1,height:1}},{hit:{x:0,y:0,width:-1,height:1}},{focus:{x:NaN,y:0,width:1,height:1}},{hit:{x:0,y:0,width:Infinity,height:1}},{focus:{x:0,y:0,width:1}}])expect(()=>u.button({id:'bad',regions:invalid})).toThrow();
});

test('stock constructors copy and deeply freeze caller data; validate kinds, IDs, dimensions and authority',async()=>{
  const u=await api(); const props={id:'go',label:'Go',actionId:'travel',metadata:{'app:hint':{value:1}},layout:{minWidth:12}};
  const b=u.button(props);props.metadata['app:hint'].value=2;props.layout.minWidth=90;
  expect(b.metadata['app:hint'].value).toBe(1);expect(b.layout.minWidth).toBe(12);expect(Object.isFrozen(b.metadata['app:hint'])).toBe(true);expect(Object.isFrozen(props.layout)).toBe(false);
  expect(()=>u.node('unknown',{id:'bad'})).toThrow(/kind/i);
  expect(()=>u.button({id:'',label:'Go'})).toThrow(/id/i);
  for(const value of [-1,NaN,Infinity])expect(()=>u.panel({id:'p',layout:{width:value}})).toThrow();
  expect(()=>u.button({id:'b',label:'Go',onPress:()=>{}})).toThrow();
  expect(()=>u.button({id:'b',label:'Go',metadata:{hint:1}})).toThrow(/namespace/i);
  expect(()=>u.stack({id:'root',children:[b,b]})).toThrow(/duplicate/i);
});

test('every stock constructor yields a validated useful semantic node',async()=>{
  const u=await api();
  for(const kind of ['panel','header','card','text','button','actionBar','listRow','itemSlot','field','toggle','stepper','tabs','fold','pager','progress','meter','separator','icon','notice','tooltip','extension','stack','row','grid','absolute']){
    const props={id:kind};
    if(['text','header','button','notice','tooltip'].includes(kind))props.label='Visible';
    if(kind==='field')props.value='abc';
    if(['stepper','progress','meter'].includes(kind))Object.assign(props,{value:2,min:0,max:4,step:1});
    if(['toggle','fold'].includes(kind))props.value=false;
    if(kind==='tabs')Object.assign(props,{value:'a',options:[{id:'a',label:'A'},{id:'b',label:'B'}]});
    if(kind==='pager')Object.assign(props,{value:0,pageCount:3});
    if(kind==='icon')props.asset='item';
    if(kind==='extension')props.extensionId='app:chart';
    const n=u[kind](props);expect(n.kind).toBe(kind);expect(n.id).toBe(kind);expect(Object.isFrozen(n)).toBe(true);
  }
  expect(()=>u.stepper({id:'n',value:5,min:0,max:2})).toThrow();
  expect(()=>u.tabs({id:'t',value:'missing',options:[{id:'a',label:'A'}]})).toThrow();
});

test('families compose stock trees preserving semantic and visual order and explicit roles',async()=>{
  const u=await api();const actions=[{id:'yes',label:'Accept',actionId:'accept'},{id:'no',label:'Back',actionId:'back'}];
  const tree=u.confirmationFamily({id:'confirm',title:'Title',message:'Body',actions,visualOrder:['no','yes'],initialId:'no',defaultId:'yes',cancelId:'no'});
  const bar=tree.children.at(-1);expect(bar.kind).toBe('actionBar');expect(bar.children.map(n=>n.id)).toEqual(['yes','no']);expect(bar.visualOrder).toEqual(['no','yes']);
  expect(tree.focus).toEqual({initialId:'no',defaultId:'yes',cancelId:'no'});
  expect(u.menuFamily({id:'menu',title:'Menu',actions}).children.at(-1).children.map(n=>n.id)).toEqual(['yes','no']);
  expect(u.formFamily({id:'form',fields:[u.field({id:'name',value:'Ada'})],actions}).children[0].kind).toBe('field');
  expect(u.listFamily({id:'list',items:[u.listRow({id:'item',label:'Item'})],actions:[]}).children[0].id).toBe('item');
  expect(()=>u.confirmationFamily({id:'bad',actions,defaultId:'absent'})).toThrow(/focus|unknown/i);
  const nonfocus=u.confirmationFamily({id:'pointerOnly',actions:[{id:'tap',label:'Tap',actionId:'tap',focusable:false}],defaultId:'tap',cancelId:'tap'});expect(nonfocus.focus.defaultId).toBe('tap');
});

test('reading, notice and HUD families compose useful stock nodes with controlled state and immutable inputs',async()=>{
  const u=await api();const paragraphs=['A first paragraph','A second paragraph'];
  const reading=u.readingFamily({id:'read',title:'Reading',speaker:'Speaker',paragraphs,page:{value:1,pageCount:3},bodyLayout:{height:30,overflow:'scroll'},actions:[{id:'reply',label:'Reply',actionId:'reply'}],initialId:'read:page'});paragraphs[0]='Changed';
  expect(reading.children.map(n=>n.kind)).toEqual(['header','header','stack','pager','actionBar']);expect(reading.children[2].children[0].label).toBe('A first paragraph');expect(reading.children[2].layout.overflow).toBe('scroll');expect(reading.children[3].value).toBe(1);expect(reading.children.at(-1).children[0].actionId).toBe('reply');
  const notice=u.noticeFamily({id:'toast',message:'Saved',visible:false,announcementRole:'status',actions:[{id:'dismiss',label:'Close',actionId:'dismiss'}],cancelId:'dismiss'});expect(notice.kind).toBe('notice');expect(notice.role).toBe('status');expect(notice.hidden).toBe(true);expect(notice.children[0].label).toBe('Saved');expect(notice.focus.cancelId).toBe('dismiss');
  const hud=u.hudFamily({id:'hud',arrangement:'absolute',items:[u.meter({id:'energy',value:2,min:0,max:4,layout:{x:10,y:5,width:40,height:8}})]});expect(hud.kind).toBe('absolute');expect(hud.role).toBe('hud');expect(hud.focusable).toBe(false);expect(hud.children[0].value).toBe(2);
  expect(()=>u.readingFamily({id:'bad',paragraphs:[123]})).toThrow();expect(()=>u.noticeFamily({id:'bad',message:'Bad',announcementRole:'button'})).toThrow();expect(()=>u.hudFamily({id:'bad',arrangement:'unknown',items:[]})).toThrow();
});
test('flow contract: wrap is boolean, final capacity is finite nonnegative',async()=>{
  const u=await import('../../server/build/ui-components.mjs');
  expect(u.row({id:'r',layout:{wrap:true,rowGap:0}}).layout.wrap).toBe(true);
  expect(u.text({id:'t',label:'A',layout:{wrap:false}}).layout.wrap).toBe(false);
  expect(u.stack({id:'p',layout:{overflow:'paginate',lastPageHeight:0}}).layout.lastPageHeight).toBe(0);
  for(const wrap of [1,'false',null,{}])expect(()=>u.row({id:'r',layout:{wrap}})).toThrow(/wrap|boolean/i);
  for(const lastPageHeight of [-1,NaN,Infinity,'30',null])expect(()=>u.stack({id:'p',layout:{lastPageHeight}})).toThrow();
});
