// Loads each atlas fixture with Phaser's Aseprite loader, creates the tag
// animations and records what Phaser built. Result lands on window.atlasProbe.
window.atlasProbe=(async()=>{
  const names=['directions','blink'];
  const base=name=>`/examples/atlas-fixtures/${name}/${name}`;
  // Same directions atlas with every tag's `loop` flipped (absent counts as true).
  const flipped=await (await fetch(`${base('directions')}.atlas.json`)).json();
  for(const tag of flipped.meta.frameTags)tag.loop=tag.loop===false;
  return new Promise((resolve,reject)=>{
    class ProbeScene extends Phaser.Scene {
      preload(){
        this.load.on('loaderror',file=>reject(Error(`Load failed: ${file.url}`)));
        for(const name of names)this.load.aseprite(name,`${base(name)}.png`,`${base(name)}.atlas.json`);
        this.load.aseprite('directions-loop-flipped',`${base('directions')}.png`,flipped);
      }
      create(){
        try{
          const result={phaser:Phaser.VERSION,fixtures:{}};
          for(const name of [...names,'directions-loop-flipped']){
            const created=this.anims.createFromAseprite(name);
            const frameNames=this.textures.get(name).getFrameNames();
            const tags=created.map(anim=>({
              key:anim.key,
              repeat:anim.repeat,
              yoyo:anim.yoyo,
              repeatDelay:anim.repeatDelay,
              showBeforeDelay:anim.showBeforeDelay,
              duration:anim.duration,
              frames:anim.frames.map(f=>({key:f.textureFrame,index:frameNames.indexOf(String(f.textureFrame)),duration:f.duration})),
            }));
            result.fixtures[name]={frameNames,tags};
          }
          const alias=name=>{const frame=this.textures.getFrame('blink',name);return frame?{width:frame.width,height:frame.height}:null;};
          result.blinkAliases={open:alias('open'),closed:alias('closed')};
          resolve(result);
        }catch(error){reject(error);}
      }
    }
    window.atlasGame=new Phaser.Game({type:Phaser.CANVAS,width:64,height:64,banner:false,audio:{noAudio:true},scene:ProbeScene});
  });
})();
