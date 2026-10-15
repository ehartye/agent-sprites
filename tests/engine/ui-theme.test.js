import {test,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {normalizeBitmapFont} from '../../server/build/ui-runtime.mjs';
export function font(){return normalizeBitmapFont({report:{kind:'font',fallback:'?',lineHeight:8,tones:{cream:{}},glyphs:{'?':{advance:5,frames:{cream:'q'},bounds:{left:0,top:0,right:3,bottom:5}},' ':{advance:3},A:{advance:7,frames:{cream:'a'},bounds:{left:0,top:0,right:5,bottom:5}},i:{advance:2,frames:{cream:'i'},bounds:{left:0,top:0,right:0,bottom:5}}}},atlas:{frames:{q:{frame:{x:0,y:0,w:4,h:6}},a:{frame:{x:4,y:0,w:6,h:6}},i:{frame:{x:10,y:0,w:1,h:6}}}}});}
async function api(){const url=new URL('../../server/build/ui-theme.mjs',import.meta.url);expect(existsSync(url),'portable theme owner exists').toBe(true);return import(url.href);}
export function themeInput(){return {version:1,id:'app:theme',fonts:{body:{font:font(),policy:{spaces:'terminal'}}},skins:{paper:{frame:{x:0,y:0,width:12,height:12},insets:{left:2,right:2,top:2,bottom:2},padding:{left:3,right:3,top:2,bottom:2},minWidth:4,minHeight:4,center:'omit',tile:true,trim:{x:1,y:1,width:10,height:10},caps:{start:2,end:3,period:4}}},roles:{body:{font:'body',tone:'cream'},button:{font:'body',tone:'cream',alternatives:[{kind:'skin',id:'missing'},{kind:'skin',id:'paper'}]},primary:'button'},geometry:{gap:2,padding:0,minTarget:10}};}

test('themes resolve explicit aliases and alternatives, retaining hollow trim cap and font policies',async()=>{
  const {defineTheme,resolveThemeRole}=await api();const input=themeInput();const theme=defineTheme(input);input.skins.paper.caps.start=9;
  const role=resolveThemeRole(theme,'primary');expect(role.appearance.kind).toBe('skin');expect(role.appearance.id).toBe('paper');expect(role.appearance.skin.center).toBe('omit');expect(role.appearance.skin.caps.start).toBe(2);expect(role.appearance.skin.trim.width).toBe(10);expect(theme.fonts.body.policy.spaces).toBe('terminal');expect(Object.isFrozen(role)).toBe(true);
  expect(()=>resolveThemeRole(theme,'unknown')).toThrow(/role/i);
});

test('themes reject authority, missing required assets, alias cycles and invalid geometry',async()=>{
  const {defineTheme}=await api();
  for(const edit of [i=>i.version=2,i=>i.roles.body.enabled=true,i=>i.roles.body.defaultId='yes',i=>i.roles.primary='primary',i=>i.roles.body.font='absent',i=>i.skins.paper.insets.left=-1,i=>i.skins.paper.frame.width=0,i=>i.skins.paper.insets.top=.5,i=>i.geometry.gap=Infinity,i=>i.roles.button.alternatives=[{kind:'skin',id:'absent'}]]){
    const input=themeInput();edit(input);expect(()=>defineTheme(input)).toThrow();
  }
  const i=themeInput();i.roles.button.alternatives=[{kind:'flat',color:'#112233'}];expect(defineTheme(i).roles.button.appearance).toEqual({kind:'flat',color:'#112233'});
});

test('authored glyph tint is inherited and validated independently of skin and feedback colors',async()=>{
  const {defineTheme}=await api(),input=themeInput();input.roles.button.glyphTint='#e8837a';
  const theme=defineTheme(input);expect(theme.roles.primary.glyphTint).toBe('#e8837a');
  expect(theme.roles.primary.appearance.id).toBe('paper');expect(theme.roles.body.glyphTint).toBeUndefined();
  for(const invalid of [0xe8837a,'red','#fff','#gggggg',null]){
    const i=themeInput();i.roles.button.glyphTint=invalid;expect(()=>defineTheme(i)).toThrow(/glyphTint/);
  }
  const i=themeInput();i.roles.plain={glyphTint:'#e8837a'};expect(()=>defineTheme(i)).toThrow(/font/);
});

test('authored caret width is inherited, copied and requires a positive finite local dimension',async()=>{
  const {defineTheme}=await api(),input=themeInput();input.roles.body.caretWidth=1;
  input.roles.field={extends:'body'};const theme=defineTheme(input);input.roles.body.caretWidth=2;
  expect(theme.roles.field.caretWidth).toBe(1);
  for(const width of [0,-1,Infinity,NaN,'1',null]){
    const invalid=themeInput();invalid.roles.body.caretWidth=width;
    expect(()=>defineTheme(invalid)).toThrow(/caretWidth|finite/);
  }
});
