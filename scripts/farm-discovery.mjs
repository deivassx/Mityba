import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu,'');
export function classify(name){
  const s=norm(name);
  if(/kalakut/.test(s))return 'turkey';
  if(/jautien|versien/.test(s))return 'beef';
  if(/vistien|visciuk|broiler/.test(s))return 'chicken';
  if(/samo|samas|zuv/.test(s))return 'catfish_or_other_fish';
  return null;
}
export function weightGrams(name){
  const s=String(name||'');
  if(/\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?\s*(kg|g)/i.test(s))return null;
  const m=s.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g)(?:\b|\s|$)/i);
  if(!m)return null;
  const grams=Number(m[1].replace(',','.'))*(m[2].toLowerCase()==='kg'?1000:1);
  return grams>0&&grams<=25000?grams:null;
}
export function wooPrice(prices){
  if(!prices || prices.currency_code!=='EUR' || prices.price==null)return null;
  const minor=Number(prices.currency_minor_unit);
  const value=Number(prices.price)/10**minor;
  return Number.isFinite(value)&&value>0&&minor>=0&&minor<=3?Math.round(value*100)/100:null;
}
async function read(url, type='text') {
  const r=await fetch(url,{signal:AbortSignal.timeout(9500),redirect:'manual',headers:{'User-Agent':'Mityba-Farm-Discovery/1.0'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  const ct=r.headers.get('content-type')||'';
  if(type==='json'&&!ct.includes('json'))throw Error('Ne JSON');
  const body=await r.text();
  if(body.length>650000)throw Error('Šaltinis per didelis');
  return type==='json'?JSON.parse(body):body;
}
function sameHost(url,root) {
 try{return new URL(url).hostname===new URL(root).hostname && new URL(url).protocol==='https:';}catch{return false;}
}
export async function discoverFarms(rules) {
 const suppliers=rules.shopping.supplierCandidates.filter(s=>s.name!=='Farmlio'&&s.name!=='Barbora'&&s.url?.startsWith('https://')&&!new URL(s.url).hostname.includes('facebook.com'));
 const farms=[];
 for (const f of suppliers) {
  const root=new URL(f.url).origin;
  const item={name:f.name,website:f.url,method:null,offers:[],notes:[]};
  try {
    const products=await read(root+'/wp-json/wc/store/products?per_page=100','json');
    if(!Array.isArray(products))throw Error('Nera WooCommerce katalogo');
    item.method='WooCommerce Store API';
    for(const p of products){
      const family=classify(p.name);
      if(!family || !sameHost(p.permalink,root))continue;
      item.offers.push({name:p.name,family,url:p.permalink,priceEur:wooPrice(p.prices),packGrams:weightGrams(p.name),available:p.is_in_stock===true,requiresManualReview:true});
    }
  } catch(e){
    item.notes.push('Viešas WooCommerce katalogas neprieinamas: '+String(e.message||e));
    for(const path of ['/product-sitemap.xml','/sitemap_index.xml','/wp-sitemap.xml']){
      try{
        const xml=await read(root+path);
        const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replaceAll('&amp;','&')).filter(u=>sameHost(u,root));
        const found=urls.map(url=>({url,family:classify(decodeURIComponent(new URL(url).pathname.replaceAll('-',' '))),name:null,priceEur:null,packGrams:null,requiresManualReview:true})).filter(x=>x.family);
        if(found.length){item.offers=found.slice(0,60);item.method='Viešos XML svetainės nuorodos';break;}
      } catch(_error){ /* Viešas sitemap gali neegzistuoti */ }
    }
  }
  if(!item.offers.length)item.notes.push('Nerasta tinkamų automatiškai perskaitomų mėsos/žuvies pasiūlymų. Tai nereiškia, kad ūkis neprekiauja.');
  farms.push(item);
 }
 return {checkedAt:new Date().toISOString(),notes:'Prekės tik informaciniai paieškos kandidatai; jų sudėtį, tikslų svorį, kainą, pristatymą, vienodumą receptui ir max 2 parduotuves dar būtina patikrinti. Šis failas nėra pirkimo krepšelis.',farms};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const rules=JSON.parse(await fs.readFile(new URL('../config/planavimo-taisykles.json',import.meta.url),'utf8'));
    const report=await discoverFarms(rules);
    await fs.writeFile(new URL('../data/farm-discovery-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
    for(const f of report.farms)console.log(f.name+': '+f.offers.length+' kandidatų, metodas '+(f.method||'nerastas'));
    if(process.env.GITHUB_STEP_SUMMARY){
      const lines=['### Kitų ūkių prekių atradimas','','Rasti nauji kandidatai savaime nėra patvirtintos prekės ar nauja parduotuvė krepšelyje.',''];
      for(const f of report.farms)lines.push('- '+f.name+': '+f.offers.length+' kandidatų ('+(f.method||'be rezultatų')+').');
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
    }
  }catch(e){console.log('::warning::Ūkių prekių atradimas nepavyko: '+e.message);}
}
