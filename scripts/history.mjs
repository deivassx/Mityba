import fs from 'node:fs/promises';
import path from 'node:path';

export async function archiveMenu(menu, directory='data/history') {
  const week=menu.meta.weekStart;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Array.isArray(menu.days) || menu.days.length!==7) throw Error('Netinkamas archyvuojamas meniu');
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,week+'.json'),JSON.stringify(menu,null,2)+'\n');
  const entries=[];
  for(const file of await fs.readdir(directory)) {
    if(!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
    const saved=JSON.parse(await fs.readFile(path.join(directory,file),'utf8'));
    entries.push({weekStart:saved.meta.weekStart,weekEnd:saved.days.at(-1).date,generatedAt:saved.meta.generatedAt,isExample:saved.meta.isExample===true,isPlanningSeries:saved.meta.isPlanningSeries===true,recipes:saved.recipes.map(r=>r.title),photo:saved.recipes[0]?.photo});
  }
  entries.sort((a,b)=>b.weekStart.localeCompare(a.weekStart));
  await fs.writeFile(path.join(directory,'index.json'),JSON.stringify(entries,null,2)+'\n');
  return entries;
}
