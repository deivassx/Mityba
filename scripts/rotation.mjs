// 48 receptų iš 8 baltymų grupių; 8 savaičių kintantis valgiaraštis.
const SCHEDULE=[[["kalakutiena","eriena"],["lasisa","jautiena"]],[["vistiena","kiauliena"],["menke","samas"]],[["eriena","vistiena"],["jautiena","menke"]],[["kiauliena","kalakutiena"],["samas","lasisa"]],[["vistiena","eriena"],["menke","lasisa"]],[["kalakutiena","kiauliena"],["jautiena","samas"]],[["kiauliena","vistiena"],["lasisa","samas"]],[["eriena","kalakutiena"],["menke","jautiena"]]];
const ANCHOR=Date.parse('2026-11-09T00:00:00Z'),WEEK=7*86400000;
const assert=(c,m)=>{if(!c)throw Error(m)};
export function selectWeeklyRecipes(bases,bank,weekStart){
 assert(/^\d{4}-\d{2}-\d{2}$/.test(weekStart),'Neteisinga savaitės data');
 const n=(Date.parse(weekStart+'T00:00:00Z')-ANCHOR)/WEEK;
 assert(Number.isInteger(n),'Savaitė turi prasidėti pirmadienį');
 const index=((n%8)+8)%8,[l,d]=SCHEDULE[index],names=[...l,...d],originals=new Map(bases.map(x=>[x.id,x]));
 const recipes=names.map(g=>{
   const base=originals.get(g),variants=bank.variants?.[g];
   assert(base&&Array.isArray(variants)&&[3,7].includes(variants.length),'Trūksta grupės receptų: '+g);
   const previous=SCHEDULE.slice(0,index).flat(2).filter(x=>x===g).length;
   const options=[base,...variants];
   return options[(Math.floor(n/8)*4+previous)%options.length];
 });
 const chosen=Object.fromEntries(names.map((g,i)=>[g,recipes[i]]));
 assert(new Set(recipes.map(x=>x.id)).size===4,'Pasikartojantys receptai');
 return {recipes,pairs:[[chosen[l[0]].id,chosen[d[0]].id],[chosen[l[1]].id,chosen[d[1]].id]],weekIndex:n};
}
