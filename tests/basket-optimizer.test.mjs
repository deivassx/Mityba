import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {optimizeBasket} from '../scripts/basket-optimizer.mjs';
const rules=JSON.parse(await fs.readFile(new URL('../config/planavimo-taisykles.json',import.meta.url),'utf8'));
const checkedAt=new Date().toISOString();
const st=(id,delivery)=>({id,name:id,deliveryFeeEur:delivery,packingFeeEur:0,feesVerified:true});
const of=(id,store,price,weight=1000)=>({id,store,url:'https://'+(store==='barbora'?'barbora.lt':store==='farmlio'?'farmlio.lt':'sesuoleliuukis.lt')+'/produktas/'+id+'-'+price,priceEur:price,packGrams:weight,nutritionallyEquivalentReviewed:true,verification:{url:'https://'+(store==='barbora'?'barbora.lt':store==='farmlio'?'farmlio.lt':'sesuoleliuukis.lt')+'/produktas/'+id+'-'+price,checkedAt}});
const menu={
  recipes:[{id:'a',ingredients:{beef:900,broccoli:1100,oil:100}}],
  days:[{lunch:'a',dinner:'a'}],
  stores:[]
};
test('Lygina 3 ūkius ir pasirenka mažiausią galutinį 2-parduotuvių krepšelį',()=>{
 const offers=[
  of('beef','farmlio',15),of('beef','sesuoleliu',10),
  of('broccoli','farmlio',9),of('broccoli','barbora',1),
  of('oil','sesuoleliu',2),of('oil','barbora',2)
 ];
 const a=optimizeBasket(menu,rules,{stores:[st('farmlio',5),st('sesuoleliu',6),st('barbora',3)],offers});
 assert.equal(a.ok,true);
 assert.ok(a.stores.length<=2);
 assert.ok(a.chosen.some(p=>p.id==='beef'&&p.store==='sesuoleliu'));
 assert.ok(a.totalEur>0);
});
test('Neleidžia 3 parduotuvių net jeigu tai būtų pigiau',()=>{
 const offers=[of('beef','farmlio',2),of('broccoli','barbora',1),of('oil','sesuoleliu',1)];
 const a=optimizeBasket(menu,rules,{stores:[st('farmlio',1),st('sesuoleliu',1),st('barbora',1)],offers});
 assert.equal(a.ok,false);
 assert.match(a.reason,/1–2/);
});
test('Draudžiama jautiena iš Barbora; vištiena tik nesant ūkio alternatyvos',()=>{
 const offers=[of('beef','barbora',1),of('broccoli','barbora',1),of('oil','barbora',1)];
 assert.deepEqual(optimizeBasket(menu,rules,{stores:[st('barbora',2)],offers}).missing,['beef']);
 const chickenMenu={recipes:[{id:'a',ingredients:{chicken:1000}}],days:[{lunch:'a',dinner:'a'}]};
 const farmers=[of('chicken','farmlio',9),of('chicken','barbora',1)];
 let x=optimizeBasket(chickenMenu,rules,{stores:[st('farmlio',1),st('barbora',0)],offers:farmers});
 assert.equal(x.chosen[0].store,'farmlio');
 x=optimizeBasket(chickenMenu,rules,{stores:[st('barbora',0)],offers:[farmers[1]]});
 assert.equal(x.chosen[0].store,'barbora');
});
test('Atmeta nepatikrintus, senus, nežinomo pristatymo ir skirtingų receptų produktus',()=>{
 const offers=[of('beef','sesuoleliu',10),of('broccoli','barbora',1),of('oil','barbora',2)];
 offers[0].verification.checkedAt='2022-01-01';
 assert.ok(!optimizeBasket(menu,rules,{stores:[st('sesuoleliu',1),st('barbora',1)],offers}).ok);
 offers[0].verification.checkedAt=checkedAt;
 offers[0].nutritionallyEquivalentReviewed=false;
 assert.ok(!optimizeBasket(menu,rules,{stores:[st('sesuoleliu',1),st('barbora',1)],offers}).ok);
 offers[0].nutritionallyEquivalentReviewed=true;
 assert.ok(!optimizeBasket(menu,rules,{stores:[{id:'sesuoleliu',deliveryFeeEur:null},st('barbora',1)],offers}).ok);
});
