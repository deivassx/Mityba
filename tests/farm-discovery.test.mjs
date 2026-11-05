import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,weightGrams,wooPrice} from '../scripts/farm-discovery.mjs';
test('Atpazista fermų produktų grupes pagal pavadinimus',()=>{
 assert.equal(classify('Ekologiška smulkinta jautiena'),'beef');
 assert.equal(classify('Kalakutų krūtinėlės filė 600 g'),'turkey');
 assert.equal(classify('Vištienos filė'),'chicken');
 assert.equal(classify('Graikiniai riešutai'),null);
});
test('Atmeta nežinomas pakuotes, skaito tik EUR kainą',()=>{
 assert.equal(weightGrams('Kalakutų filė, 0,6 kg'),600);
 assert.equal(weightGrams('Filė, 500 g'),500);
 assert.equal(weightGrams('Filė, 0.6 - 0.8 kg'),null);
 assert.equal(wooPrice({price:'1999',currency_minor_unit:2,currency_code:'EUR'}),19.99);
 assert.equal(wooPrice({price:'1999',currency_minor_unit:2,currency_code:'USD'}),null);
});
