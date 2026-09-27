import {FONT_GLYPHS} from './ui-font.js';

// Authored four-column, six-row lettering for secondary UI at integer 2x.
// Punctuation and symbols retain their recognizable five-column source masks.
const rows={
  A:'6 9 9 f 9 9',B:'e 9 e 9 9 e',C:'7 8 8 8 8 7',D:'e 9 9 9 9 e',E:'f 8 e 8 8 f',F:'f 8 e 8 8 8',G:'7 8 8 b 9 7',H:'9 9 f 9 9 9',I:'e 4 4 4 4 e',J:'7 2 2 2 a 4',K:'9 a c a 9 9',L:'8 8 8 8 8 f',M:'9 f f 9 9 9',N:'9 d d b b 9',O:'6 9 9 9 9 6',P:'e 9 9 e 8 8',Q:'6 9 9 9 b 7',R:'e 9 9 e a 9',S:'7 8 6 1 1 e',T:'e 4 4 4 4 4',U:'9 9 9 9 9 6',V:'9 9 9 9 6 6',W:'9 9 9 f f 9',X:'9 9 6 6 9 9',Y:'a a 4 4 4 4',Z:'f 1 2 4 8 f',
  a:'0 0 7 9 b 5',b:'8 8 e 9 9 e',c:'0 0 7 8 8 7',d:'1 1 7 9 9 7',e:'0 0 6 b c 7',f:'3 4 e 4 4 4',g:'0 0 7 9 7 1 e',h:'8 8 e 9 9 9',i:'4 0 c 4 4 e',j:'2 0 6 2 2 a 4',k:'8 8 9 a c a',l:'c 4 4 4 4 e',m:'0 0 f f 9 9',n:'0 0 e 9 9 9',o:'0 0 6 9 9 6',p:'0 0 e 9 e 8 8',q:'0 0 7 9 7 1 1',r:'0 0 b c 8 8',s:'0 0 7 c 3 e',t:'4 4 e 4 4 3',u:'0 0 9 9 9 7',v:'0 0 9 9 6 6',w:'0 0 9 9 f 6',x:'0 0 9 6 6 9',y:'0 0 9 9 7 1 e',z:'0 0 f 2 4 f',
  0:'6 9 b d 9 6',1:'4 c 4 4 4 e',2:'6 9 1 2 4 f',3:'e 1 6 1 9 6',4:'2 6 a f 2 2',5:'f 8 e 1 9 6',6:'7 8 e 9 9 6',7:'f 1 2 4 4 4',8:'6 9 6 9 9 6',9:'6 9 9 7 1 e',
};
const glyphs={...FONT_GLYPHS,...Object.fromEntries(Object.entries(rows).map(([char,pattern])=>[char,{rows:pattern.split(' ').map(x=>parseInt(x,16)<<1),top:2}]))};
for(const [char,base,accent] of [['é','e',[2,4]],['è','e',[8,4]],['ê','e',[4,10]],['ë','e',[10]],['á','a',[2,4]],['à','a',[8,4]],['ä','a',[10]],['ö','o',[10]],['ü','u',[10]],['ñ','n',[9,22]],['É','E',[2,4]],['Á','A',[2,4]],['Ö','O',[10]],['Ü','U',[10]]])glyphs[char]={rows:[...accent,...Array(2-accent.length).fill(0),...glyphs[base].rows],top:0};
glyphs['ç']={rows:[...glyphs.c.rows,4,8],top:2};
export const COMPACT_GLYPHS=Object.freeze(glyphs);
