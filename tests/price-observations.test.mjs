import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {extractPrice} from '../scripts/refresh-farm-prices.mjs';

const lambUrl='https://sesuoleliuukis.lt/produktas/eriuko-kumpis-be-kaulo/';
const turkeyUrl='https://baltuoniu.kalakutai.lt/product/kalakutu-krutineliu-file-1kg/';
const pageLamb='<h1>Ėriuko kumpis (be kaulo)</h1><h2>31 € / Kg</h2><h2>Mūsų bestseleriai</h2><p>49 € / Kg</p>';
const pageTurkey='<h1>Kalakutų krūtinėlių file 1kg.</h1><p class="price"><del><span>€15.00</span></del><ins><span>€13.50</span></ins></p><p>€4.00 kitų prekių</p>';
test('Ūkininkų pagrindinių SKU vieša kaina nuskaitoma be rekomenduojamų prekių kainų',()=>{
 assert.deepEqual(extractPrice(pageLamb,lambUrl),{priceEur:31,unit:'kg',method:'Produkto puslapio EUR/kg'});
 assert.deepEqual(extractPrice(pageTurkey,turkeyUrl),{priceEur:13.5,unit:'kg',method:'WooCommerce pagrindinės prekės kaina'});
});
test('Kai puslapyje pirmiau yra antraštė ir susijusi prekė, kaina imama iš pagrindinės prekės',()=>{
 const page='<h1>Parduotuvė</h1><p class="price">€2.00</p>'
  +'<h1 class="product_title">Kalakutų krūtinėlių file 1kg.</h1>'
  +'<p class="price"><del>€15.00</del><ins>€13.50</ins></p>';
 assert.equal(extractPrice(page,turkeyUrl).priceEur,13.5);
});
test('Kitas SKU ar nepatikimas produkto pavadinimas negali turėti šios kainos',()=>{
 assert.throws(()=>extractPrice(pageLamb,'https://sesuoleliuukis.lt/produktas/sviezios-erienos-desreles/'),/Tik pažįstami/);
 assert.throws(()=>extractPrice(pageTurkey,lambUrl),/Nesutampa produkto pavadinimas/);
 assert.throws(()=>extractPrice('<h1>Kalakutų krūtinėlių file 1kg.</h1><p>€15</p>',turkeyUrl),/Nerasta vienareikšmė/);
});
test('Patvirtintos oficialaus puslapio kainos rodomos kaip orientacinės vienos savaitės kainos',async()=>{
 const js=await fs.readFile(new URL('../js/weekly-order.js',import.meta.url),'utf8');
 const sources=JSON.parse(await fs.readFile(new URL('../data/sourcing-links.json',import.meta.url),'utf8'));
 const menu=JSON.parse(await fs.readFile(new URL('../data/history/2026-11-09.json',import.meta.url),'utf8'));
 const catalog=JSON.parse(await fs.readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
 const rules=JSON.parse(await fs.readFile(new URL('../config/planavimo-taisykles.json',import.meta.url),'utf8'));
 const obs=JSON.parse(await fs.readFile(new URL('../data/price-observations.json',import.meta.url),'utf8'));
 const win={};vm.runInNewContext(js,{window:win,URL,Intl,Date,localStorage:{getItem(){return null}}});
 const plan=win.WeeklyShop.build(menu,sources,rules,catalog,obs);
 const lamb=plan.items.find(x=>x.id==='lamb');
 const turkey=plan.items.find(x=>x.id==='turkey');
 const beef=plan.items.find(x=>x.id==='beef');
 assert.equal(lamb.quote.unitPrice,31);assert.equal(lamb.estimatedCost,32.24);
 assert.equal(turkey.quote.unitPrice,15,'Iš anksto suplanuotai savaitei pasibaigusi akcija netaikoma');
 assert.equal(turkey.estimatedCost,15);
 assert.equal(beef.quote.unitPrice,8.45,'Seno katalogo pakuotės kaina vis tiek matoma kaip orientyras');
 assert.ok(plan.estimatedCount>=13);
 assert.ok(plan.estimatedGoodsEur>120);
 assert.equal(plan.grandTotalEur,null,'Be visų SKU ir pristatymo patikros neleidžiama tvirtinti galutinės kainos');
 const target={innerHTML:'',dataset:{},addEventListener(){}};
 vm.runInNewContext(js,{window:(globalThis?.undefined||{}),URL,Intl,Date,localStorage:{getItem(){return null}}});
 const doc={getElementById(id){return id==='weekly-output'?target:null}};
 const other={};vm.runInNewContext(js,{window:other,document:doc,URL,Intl,Date,localStorage:{getItem(){return null}}});
 other.WeeklyShop.render(plan);
 assert.match(target.innerHTML,/31,00/);
 assert.match(target.innerHTML,/32,24/);
 assert.match(target.innerHTML,/15,00/);
 assert.match(target.innerHTML,/Dalinė orientacinė prekių suma/);
});
