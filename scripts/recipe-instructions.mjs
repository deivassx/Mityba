// Vienos skardos receptų instrukcijos: visi ir tik ingredients sąraše esantys produktai.
export const name={
  "turkey": "kalakutienos filė",
  "chicken": "vištienos filė",
  "beef": "maltos jautienos",
  "beef_steak": "jautienos nugarinės",
  "beef_strips": "jautienos juostelių",
  "beef_roast": "jautienos mentės",
  "catfish": "šamo filė",
  "lamb": "ėrienos kumpio",
  "pork_tenderloin": "kiaulienos išpjovos",
  "salmon": "lašišos filė",
  "cod": "menkės filė",
  "potato": "bulvių",
  "sweetpotato": "saldžiųjų bulvių",
  "carrot": "morkų",
  "beet": "burokėlių",
  "cabbage": "kopūstų",
  "pepper": "paprikų",
  "mushroom": "pievagrybių",
  "tomato": "pomidorų",
  "onion": "svogūnų",
  "broccoli": "brokolių",
  "oil": "alyvuogių aliejaus",
  "yogurt": "graikiško jogurto",
  "cottage": "grūdėtos varškės",
  "walnut": "graikinių riešutų",
  "sauerkraut": "raugintų kopūstų",
  "cheese": "kietojo sūrio",
  "feta": "fetos"
};
const proteins=["turkey","chicken","beef","beef_steak","beef_strips","beef_roast","catfish","lamb","pork_tenderloin","salmon","cod"];
const roots=["potato","sweetpotato","carrot","beet","cabbage"];
const soft=["pepper","mushroom","tomato","onion","broccoli"];
const prep={
  "potato": "skiltelėmis (iki 1,5 cm)",
  "sweetpotato": "kubeliais (iki 1,5 cm)",
  "carrot": "plonais griežinėliais",
  "beet": "smulkiais kubeliais (apie 1 cm)",
  "cabbage": "juostelėmis",
  "pepper": "juostelėmis",
  "mushroom": "puselėmis",
  "tomato": "skiltelėmis",
  "onion": "pusžiedžiais",
  "broccoli": "nedideliais žiedynais"
};
export function buildInstructions(r){
 const ing=r.ingredients, keys=Object.keys(ing), m=proteins.filter(k=>ing[k]>0);
 if(m.length!==1)throw Error("Reikia vieno baltymo: "+r.id);
 for(const k of keys)if(!name[k])throw Error("Nėra ingrediento aprašo: "+r.id+" "+k);
 const p=m[0],q=k=>`${ing[k]} g ${name[k]}`,vegA=roots.filter(k=>ing[k]>0),vegB=soft.filter(k=>ing[k]>0);
 const chopping=ks=>ks.map(k=>`${q(k)} ${k==="broccoli"?"padalyk":"supjaustyk"} ${prep[k]}`).join(", ");
 const oil=ing.oil?`${q("oil")} tolygiai paskirstyk ant kepamų daržovių.`:"";
 const out=[`Vienai porcijai pasiruošk: ${keys.map(q).join(", ")}. Gaminant 3–4 porcijas, kiekvieną kiekį padaugink iš porcijų skaičiaus. Jokių papildomų maisto produktų nenaudok.`];
 if(p==="beef_roast"){
   out.push(`Orkaitę įkaitink iki 160 °C. ${q(p)} palik vientisu gabalu, įdėk į gilią skardą ir sandariai uždenk folija. Kepk savo sultyse apie 2,5–3,5 val., kol mėsa lengvai skyla šakute.`);
   if(vegA.length)out.push(`Likus apie 40–45 min. iki mėsos kepimo pabaigos, ${chopping(vegA)} ir sudėk prie mėsos į tą pačią skardą. ${oil} Vėl uždenk ir kepk iki daržovės suminkštės.`);
   if(vegB.length)out.push(`Likus 15–20 min. iki kepimo pabaigos, ${chopping(vegB)} ir sudėk į tą pačią skardą. Patiekiant mėsą pjaustyk skersai skaidulų.`);
 }else{
   out.push(vegA.length?`Įkaitink orkaitę iki 200 °C. ${chopping(vegA)} ir paskleisk vienu sluoksniu ant vienos didelės skardos. ${oil} Kepk 15–20 min., kad pradėtų minkštėti.`:`Įkaitink orkaitę iki 200 °C ir pasiruošk vieną didelę skardą. ${oil} Toliau laikykis tikslios kepimo sekos.`);
   if(vegB.length)out.push(`${vegA.length?"Prie apkeptų daržovių":"Pirmiausia ant skardos"} ${chopping(vegB)} ir išdėliok vienu sluoksniu. ${vegA.length?"Pridėk pagrindinį ingredientą ir kepk kartu.":"Kepk 10–12 min., tada pridėk pagrindinį ingredientą."}`);
   if(p==="turkey"||p==="chicken")out.push(`${q(p)} supjaustyk 2–3 cm gabaliukais. Sudėk į laisvą tos pačios skardos dalį ir kepk apie 18–25 min., kol viduje bus bent 74 °C.`);
   else if(["catfish","salmon","cod"].includes(p))out.push(`${q(p)} į laisvą tos pačios skardos dalį dėk tik paskutinėms maždaug 12–20 min. Kepk iki 63 °C filė centre.${p==="cod"?" Menkę tikrink anksčiau, kad neišsausėtų.":""}`);
   else if(p==="beef")out.push(`Iš ${q(p)} suformuok ${r.id.includes("burger")?"plokščius paplotėlius":"vienodo dydžio kotletukus"}. ${ing.cheese&&r.id.includes("kotletukai")?`Į kotletų vidų įspausk ${q("cheese")}, tvirtai užspausk kraštus. `:""}Dėk į laisvą tos pačios skardos dalį ir kepk apie 18–25 min., kol centre bus bent 71 °C.`);
   else if(p==="beef_steak")out.push(`${q(p)} kepk vientisu kepsniu laisvoje skardos dalyje apie 10–18 min., atsižvelgdamas į storį. Išimk pasiekus bent 63 °C ir palik 3 min. pailsėti.`);
   else if(p==="beef_strips")out.push(`${q(p)} vienu sluoksniu paskleisk laisvoje skardos dalyje. Kepk apie 12–18 min. pagal storį iki bent 63 °C ir palik 3 min. pailsėti.`);
   else if(p==="lamb")out.push(`${q(p)} supjaustyk 3 cm gabaliukais, paskleisk skardos laisvoje dalyje ir kepk apie 18–25 min. iki bent 63 °C viduje. Palik 3 min. pailsėti.`);
   else if(p==="pork_tenderloin")out.push(`${q(p)} supjaustyk 2–3 cm medalionais, dėk laisvoje skardos dalyje ir kepk apie 15–22 min. iki bent 63 °C viduje. Palik 3 min. pailsėti.`);
 }
 if(ing.cheese&&!(p==="beef"&&r.id.includes("kotletukai")))out.push(`Likus 3–5 min. iki kepimo pabaigos, užberk ${q("cheese")} ir kaitink, kol išsilydys.`);
 if(ing.feta)out.push(`Išėmus skardą iš orkaitės ant patiekalo užtrupink ${q("feta")}; fetos papildomai nekepti nereikia.`);
 const cold=["yogurt","cottage","sauerkraut","walnut"].filter(k=>ing[k]>0);
 if(cold.length)out.push(`Patiekiant nekaitintus, atskirai pridėk ${cold.map(q).join(", ")}.${ing.yogurt?" Jogurtą naudok kaip vieno ingrediento padažą.":""}${ing.walnut?" Graikinius riešutus paskleisk ant patiekalo.":""}`);
 out.push("Jei 3–4 porcijų produktai netelpa vienu sluoksniu, kepk keliais etapais ta pačia skarda. Gatavą maistą per 2 val. atvėsink, tolesnių dienų porcijas užšaldyk ir atitirpink šaldytuve.");
 return out;
}
