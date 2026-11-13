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

test('composed snapshots reuse validated immutable children while rechecking whole-tree authority',async()=>{
  const u=await api(),leaf=u.button({id:'go',label:'Go',actionId:'app:go'}),branch=u.panel({id:'branch',children:[leaf]});
  const root=u.panel({id:'root',children:[branch]});
  expect(root.children[0]).toBe(branch);expect(root.children[0].children[0]).toBe(leaf);
  expect(()=>u.panel({id:'duplicate',children:[branch,leaf]})).toThrow(/Duplicate/);
  expect(()=>u.panel({id:'focus',children:[branch],focus:{defaultId:'absent'}})).toThrow(/focus ID/);
  const forged=Object.freeze({...leaf,enabled:'yes'});expect(()=>u.panel({id:'raw',children:[forged]})).toThrow(/boolean/);
  const {snapshotUiData}=await import('../../server/build/ui-theme.mjs');
  const certified=snapshotUiData({...leaf,enabled:'yes'});expect(()=>u.validateUiTree(certified)).toThrow(/boolean/);
});

test('HUD families retain certified children without retaining mutable caller metadata',async()=>{
  const u=await api(),leaf=u.text({id:'label',label:'Ready'}),items=[leaf],layout={width:100,height:40};
  const tree=u.hudFamily({id:'hud',arrangement:'absolute',items,layout});
  expect(tree.children[0]).toBe(leaf);items.length=0;layout.width=200;
  expect(tree.children).toHaveLength(1);expect(tree.layout.width).toBe(100);
  expect(Object.isFrozen(items)).toBe(false);expect(Object.isFrozen(layout)).toBe(false);
  expect(()=>u.hudFamily({id:'duplicate',items:[leaf,leaf]})).toThrow(/Duplicate/);
});


test('mixed raw and certified trees reuse only semantic certificates and capture Proxy wrappers',async()=>{
 const u=await api(),known=u.button({id:'known',label:'Go',actionId:'app:go'}),other=u.text({id:'wrapped',label:'Raw wrapper'});let descriptors=0;
 const proxy=new Proxy(other,{getOwnPropertyDescriptor(target,key){descriptors++;return Reflect.getOwnPropertyDescriptor(target,key);}});
 const result=u.validateUiTree({kind:'panel',id:'mixed-root',layout:{},children:[known,proxy],focus:{defaultId:'known'}});
 expect(result.children[0]).toBe(known);expect(result.children[1]).not.toBe(other);expect(descriptors).toBeGreaterThan(0);expect(Object.isFrozen(result.children[1])).toBe(true);
 let reads=0;const accessor=Object.defineProperty({...other},'label',{enumerable:true,get(){reads++;return 'changed';}});expect(()=>u.validateUiTree(accessor)).toThrow();expect(reads).toBe(0);
 expect(()=>u.validateUiTree({kind:'panel',id:'dup-mixed',children:[known,known]})).toThrow(/Duplicate/);
 expect(()=>u.validateUiTree({kind:'panel',id:'focus-mixed',children:[known],focus:{defaultId:'absent'}})).toThrow(/focus/);
});


test('semantic certificates cover immutable subtrees without redundant semantic writes',async()=>{
 const u=await api(),leaf=u.text({id:'cert-leaf',label:'A'}),root=u.panel({id:'cert-root',children:[leaf]}),original=WeakSet.prototype.add;let writes=0,leafWrites=0,value;
 WeakSet.prototype.add=function(v){writes++;if(v===leaf)leafWrites++;return original.call(this,v);};
 try{value=u.validateUiTree(root);}finally{WeakSet.prototype.add=original;}
 expect(value).toBe(root);expect(value.children[0]).toBe(leaf);expect(writes).toBe(0);
 writes=leafWrites=0;WeakSet.prototype.add=function(v){writes++;if(v===leaf)leafWrites++;return original.call(this,v);};
 try{value=u.validateUiTree({kind:'panel',id:'cert-new-root',children:[leaf]});}finally{WeakSet.prototype.add=original;}
 expect(value.children[0]).toBe(leaf);expect(writes).toBeGreaterThan(0);expect(leafWrites).toBe(0);expect(u.validateUiTree(value)).toBe(value);
});

test('a failed descendant semantic mark never stamps its ancestor certificate',async()=>{
 const u=await api(),original=WeakSet.prototype.add;let semanticSet,parentMarks=0;
 WeakSet.prototype.add=function(v){if(v?.id==='cert-mark-probe'&&v.kind==='text')semanticSet=this;return original.call(this,v);};
 try{u.text({id:'cert-mark-probe',label:'Marker'});}finally{WeakSet.prototype.add=original;}
 expect(semanticSet).toBeTruthy();const raw={kind:'panel',id:'cert-parent',children:[{kind:'text',id:'cert-child',label:'A'}]};
 WeakSet.prototype.add=function(v){if(this===semanticSet&&v.id==='cert-parent')parentMarks++;if(this===semanticSet&&v.id==='cert-child')throw Error('controlled semantic mark failure');return original.call(this,v);};
 try{expect(()=>u.validateUiTree(raw)).toThrow(/controlled semantic mark failure/);}finally{WeakSet.prototype.add=original;}
 expect(parentMarks).toBe(0);const recovered=u.validateUiTree(raw);expect(u.validateUiTree(recovered)).toBe(recovered);
});
