/* Vienintelės produkto nuorodos kainos, o ne krepšelio / pristatymo patvirtinimas. */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const SOURCE=new URL('../data/sourcing-links.json',import.meta.url);
const OUTPUT=new URL('../data/price-observations.json',import.meta.url);
const KNOWN_FARMS={
  'sesuoleliuukis.lt':{productSlug:'eriuko-kumpis-be-kaulo',unit:'kg',expected:/Ėriuko kumpis/i},
  'baltuoniu.kalakutai.lt':{productSlug:'kalakutu-krutineliu-file-1kg',unit:'kg',expected:/Kalakutų krūtinėlių fil[eė]/i}
};
const good=n=>Number.isFinite(n)&&n>0&&n<1000;
const price=s=>{const value=Number(String(s||'').replace(',','.'));return good(value)?Math.round(value*100)/100:null};
const text=html=>String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&euro;|&#8364;/gi,'€').replace(/\s+/g,' ');
const euroPrice=s=>{const m=String(s).match(/(?:€\s*(\d{1,4}(?:[.,]\d{1,2})?)|(\d{1,4}(?:[.,]\d{1,2})?)\s*€)/i);return price(m?.[1]||m?.[2]);};

export function extractPrice(html,url){
  const u=new URL(url),farm=KNOWN_FARMS[u.hostname];
  if(!farm||!u.pathname.includes(farm.productSlug))throw Error('Tik pažįstami konkretaus produkto URL');
  const title=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if(!title||!farm.expected.test(text(title[1])))throw Error('Nesutampa pagrindinis produkto pavadinimas');
  if(u.hostname==='sesuoleliuukis.lt'){
    // Oficialus pardavėjas nurodo €/kg ir galutinę sumą nustato pagal tikrą svorį.
    const region=text(html.slice(title.index,title.index+9000));
    const match=region.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|EUR)\s*\/\s*kg\b/i);
    const value=price(match?.[1]);
    if(!value)throw Error('Pagrindinėje ėrienos kortelėje nerasta EUR/kg');
    return {priceEur:value,unit:'kg',method:'Produkto puslapio EUR/kg'};
  }
  if(u.hostname==='baltuoniu.kalakutai.lt'){
    // Pirmiausia pagrindinės prekės WooCommerce kaina, o ne šoninės rekomendacijos.
    const p=html.match(/<p\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    if(p){
      const sale=p[1].match(/<ins\b[^>]*>([\s\S]*?)<\/ins>/i);
      const value=euroPrice(text(sale?.[1]||p[1]));
      if(value)return {priceEur:value,unit:'kg',method:'WooCommerce pagrindinės prekės kaina'};
    }
    const jsonld=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    let found=[];
    function walk(x){
      if(!x||typeof x!=='object')return;
      if([x['@type']].flat().includes('Product')&&farm.expected.test(x.name||'')){
        for(const offer of [x.offers].flat().filter(Boolean)){
          if(offer.priceCurrency==='EUR'&&offer['@type']==='Offer'){
            const v=price(offer.price);if(v)found.push(v);
          }
        }
      }
      for(const v of Object.values(x))if(typeof v==='object')Array.isArray(v)?v.forEach(walk):walk(v);
    }
    for(const match of jsonld)try{walk(JSON.parse(match[1]))}catch{}
    found=[...new Set(found)];
    if(found.length===1)return {priceEur:found[0],unit:'kg',method:'schema.org Product/Offer'};
    throw Error('Nerasta vienareikšmė pagrindinės kalakutienos kaina');
  }
  throw Error('Nepalaikoma parduotuvė');
}

export async function updatePriceObservations(fetcher=fetch,now=new Date()){
  const src=JSON.parse(await fs.readFile(SOURCE,'utf8'));
  let previous={updatedAt:null,offers:[]};
  try{previous=JSON.parse(await fs.readFile(OUTPUT,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
  const map=new Map((previous.offers||[]).filter(o=>typeof o.url==='string').map(o=>[o.url,o]));
  const candidates=Object.values(src.products).flatMap(x=>(x.farmers||[]))
    .filter(x=>x.kind==='farmer_product'&&x.url&&KNOWN_FARMS[new URL(x.url).hostname]);
  for(const item of candidates){
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      let response;
      try{response=await fetcher(item.url,{redirect:'follow',signal:controller.signal,
        headers:{'User-Agent':'Mityba-price-reader/1.0 (+https://github.com/deivassx/Mityba)'}})}
      finally{clearTimeout(timer)}
      if(!response.ok||new URL(response.url).hostname!==new URL(item.url).hostname)throw Error('Parduotuvės HTTP klaida / kitoks domenas: '+response.status);
      const html=await response.text();
      if(html.length>1600000)throw Error('Per didelis HTML');
      const extracted=extractPrice(html,item.url);
      map.set(item.url,{url:item.url,name:item.name,priceEur:extracted.priceEur,unit:extracted.unit,
        observedAt:now.toISOString(),method:extracted.method,availabilityVerified:false,
        note:'Viešai matyta prekės kaina; tikrą galutinę sumą, atsargas ir pristatymą reikia patikrinti.'});
      console.log('Atnaujinta: '+item.name+' '+extracted.priceEur+' EUR/'+extracted.unit);
    }catch(e){console.log('::warning::Kainos atnaujinti nepavyko '+item.name+': '+String(e.message||e))}
  }
  const output={schemaVersion:1,updatedAt:now.toISOString(),offers:[...map.values()]};
  await fs.writeFile(OUTPUT,JSON.stringify(output,null,2)+'\n');
  return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  updatePriceObservations().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
}
