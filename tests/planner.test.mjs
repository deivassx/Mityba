import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validate,extractOffer} from '../scripts/planner.mjs';
const sample=JSON.parse(await fs.readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
function fixture() {
  const m=structuredClone(sample);
  m.sessions=[{servings:{kalakutiena:3,samas:3}},{servings:{vistiena:4,jautiena:4}}];
  for(const p of m.products) {p.priceEur=2;p.verification={url:p.url,checkedAt:new Date().toISOString()};}
  return m;
}
test('7 dienos, 14 sočių porcijų, kalorijos, baltymai ir daržovės',()=>validate(fixture()));
test('atmeta per daug kalorijų',()=>{const m=fixture();m.recipes[0].ingredients.oil=200;assert.throws(()=>validate(m),/Netinka/);});
test('atmeta trūkstamą kainą, seną patikrą ir neteisingą URL',()=>{
  for(const change of [p=>p.priceEur=null,p=>p.verification.checkedAt='2020-01-01',p=>p.verification.url='https://example.com']) {
    const m=fixture();change(m.products[0]);assert.throws(()=>validate(m));
  }
});
test('atmeta nepadengtas porcijas ir trūkstamus produktus',()=>{
  let m=fixture();m.sessions[0].servings.samas=2;assert.throws(()=>validate(m));
  m=fixture();m.products=m.products.slice(1);assert.throws(()=>validate(m));
});
const html=offer=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Prekė',offers:offer})}</script>`;
const offer={'@type':'Offer',price:'3.49',priceCurrency:'EUR',availability:'https://schema.org/InStock'};
test('kaina imama tik iš konkretaus prieinamo produkto pasiūlymo',()=>{
  assert.equal(extractOffer(html(offer),'https://shop.test/product').price,3.49);
  for(const bad of [{...offer,priceCurrency:'USD'},{...offer,availability:'https://schema.org/OutOfStock'},{...offer,price:0},{...offer,url:'/other'}]) assert.throws(()=>extractOffer(html(bad),'https://shop.test/product'));
  assert.throws(()=>extractOffer('<p>Akcija 3.49 EUR</p>','https://shop.test/product'));
});
test('Barbora: tik pagrindinė prekė, tik aktyvus pasiūlymas',()=>{
  const p={id:'123',list:'Prekės kortelė',status:'active',title:'Filė, 500 g',price:3.49,comparative_unit:'kg',comparative_unit_price:6.98};
  const page=p=>`data-b-for-cart='${JSON.stringify(p).replaceAll('"','&quot;')}' data-cnstrc-product-detail data-cnstrc-item-id="123"`;
  assert.equal(extractOffer(page(p),'https://barbora.lt/produktai/file').packAmount,0.5);
  assert.throws(()=>extractOffer(page({...p,status:'inactive'}),'https://barbora.lt/produktai/file'));
  assert.throws(()=>extractOffer(page({...p,list:'Rekomendacijos'}),'https://barbora.lt/produktai/file'));
});
