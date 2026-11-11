import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {nextWeekStart,assertTargetWeek} from '../scripts/planner.mjs';

test('trečiadienio generavimas aktyvuoja archyvo savaitę, išlaiko istoriją ir juodraščio būseną',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mityba-publish-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.cp(new URL('../data/',import.meta.url),path.join(dir,'data'),{recursive:true});
  const read=async p=>JSON.parse(await fs.readFile(path.join(dir,p),'utf8'));
  const before=await read('data/menu.json');
  const target=await read('data/history/2026-11-16.json');
  const planner=new URL('../scripts/planner.mjs',import.meta.url).href;
  const run=()=>execFileSync(process.execPath,['--input-type=module','-e',`import {generate} from ${JSON.stringify(planner)}; await generate(new Date('2026-11-11T17:00:00Z'));`],{cwd:dir});
  run();
  assert.deepEqual(await read('data/menu.json'),target);
  assert.deepEqual(await read('data/history/'+before.meta.weekStart+'.json'),before);
  assert.equal((await read('data/menu.json')).meta.purchaseReady,false);
  run();
  assert.deepEqual(await read('data/menu.json'),target);
  assert.equal((await read('data/history/index.json')).length,9);
});

test('tikslinė savaitė ir pasenusio aktyvaus meniu atmetimas',()=>{
  assert.equal(nextWeekStart(new Date('2026-11-11T17:00:00Z')),'2026-11-16');
  assert.equal(nextWeekStart(new Date('2026-11-15T22:30:00Z')),'2026-11-23');
  assert.throws(()=>assertTargetWeek({meta:{weekStart:'2026-11-09'}},'2026-11-16'),/tikslinės savaitės/);
});

test('pradinis puslapis renkasi aktyvuotą būsimą savaitę, o ne einamąją iš istorijos',async()=>{
  const source=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function preferredWeek()'),source.indexOf('async function loadJson'));
  const context=vm.createContext({Intl,Date,latestMenu:{meta:{weekStart:'2026-11-16'}},historyEntries:[{weekStart:'2026-11-09',weekEnd:'2026-11-15'}]});
  assert.equal(vm.runInContext(fn+'; preferredWeek()',context),'2026-11-16');
});
