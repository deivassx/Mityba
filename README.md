# Mityba · automatinis savaitės planas

Svetainė: https://deivassx.github.io/Mityba/

## Nuolatinės taisyklės (prieš kiekvieną generavimą)

**Visos nuostatos laikomos GitHub saugykloje, ne ChatGPT atmintyje.**

- [`AGENTS.md`](AGENTS.md) – instrukcijos Codex ir AI agentams: kiekvieną darbą pradėti nuo taisyklių perskaitymo.
- [`config/planavimo-taisykles.json`](config/planavimo-taisykles.json) – vienas redaguojamas taisyklių šaltinis: mityba, produktai, tiekėjai, prioritetai ir kokybės patikra.
- `scripts/planner.mjs` kiekvieną kartą perskaito JSON ir vykdo automatiškai patikrinamas skaitines bei domenų taisykles. Kai kurie pirkinių optimizavimo pageidavimai dar įgyvendinti **tik kaip agento instrukcijos**.
- **Farmlio → tiesioginis ūkis:** kai produktas rastas Farmlio, prieš renkantis būtina paieškoti jo gamintojo oficialios parduotuvės ir palyginti *visą krepšelio kainą*, ne tik prekės kainą. Tiksli taisyklė ir naudotojo pateiktas Šešuolėlių ūkio pavyzdys saugomi `shopping.farmlioDirectProducerComparison`. Automatinis Node.js planuoklis kol kas šios paieškos nevykdo – tai Codex / AI agento nurodymas.

**Nauja apsipirkimo politika:** tiesioginiai ūkiai → Farmlio (su palyginimu) → Barbora tik daržovėms ir priedams, vištienai tik kai kitur nėra. Savaitės tikslas **100 EUR**, iki **110 EUR** tolerancija su visomis pakuotėmis ir pristatymu. `scripts/shopping-audit.mjs` per kiekvieną CI vykdymą suskaičiuoja numatomą krepšelį ir pažymi dabartinio katalogo neatitikimus, bet dar neieško alternatyvų internetu. Kad taisyklė būtų įvykdyta, turi būti pakeistos kataloge esančios kalakutienos ir jautienos nuorodos iš Barbora į patikrintus ūkius.

**Naujų ūkių prekių atradimas:** `scripts/farm-discovery.mjs` nemokamai skaito oficialių ūkių viešus WooCommerce katalogus / sitemaps, ištraukia preliminarius mėsos bei žuvies SKU kandidatus ir kainas, jei prieinamos. Patikros rezultatai pateikiami GitHub Actions santraukoje. Kol produktas neturi patikrintų sudėties, tikslaus svorio ir pristatymo duomenų, jis **negalimas automatinėje atrankoje**; reikia įtraukti į `data/offer-candidates.json` po peržiūros.
**Kelių ūkių SKU kainų palyginimas:** `data/offer-candidates.json` turi patikrintinas kitų ūkių ir parduotuvių produkto nuorodas. `scripts/compare-farms.mjs` kiekvieną kartą mėgina patikrinti aktualią kainą ir prieinamumą, o `scripts/basket-optimizer.mjs` globaliai išrenka pigiausią leistiną **1–2 parduotuvių krepšelį** (pakuotės + preliminarūs pristatymo mokesčiai). Nežinomų pristatymo mokesčių, neatitinkančio produkto, nepatvirtinto svorio ir išparduotų prekių nepasirenka. Jei ūkių pasiūlymų visoms recepto prekėms trūksta, planavimo workflow **nepaskelbia naujo netaisyklingo meniu**, palieka ankstesnį ir parodo trūkstamus SKU. Reikalinga toliau papildyti tikrų gamintojų prekių nuorodomis (ypač jautiena ir kalakutiena).
**Riba:** sistema nenaudoja mokamos interneto paieškos API ir pati neatranda naujų ūkių SKU URL iš viso interneto; ją gali papildyti Codex naudodamas agento instrukcijas.

Pakeitus JSON ir įkėlus į `main`, kita GitHub Actions užduotis naudos atnaujintas taisykles.
Saugykla vieša, todėl nekelkite privačių duomenų.

## Pašalintas tiekėjas

`Pilnas puodas` (`pilnaspuodas.lt`) pašalintas iš produktų paieškos, ūkio prekių nuorodų, meniu prioritetų, kandidatų krepšelio ir ūkių atradimo. Jei ūkininko SKU po pašalinimo nėra, rodoma, kad konkretus pasiūlymas nerastas. Paieška tęsiama kituose ūkiuose, „Farmlio“ ir, kai reikia, „Barbora“. Kainos ir likučiai tebelieka nepatvirtinti.

## Ūkininkų nuorodos tik į konkrečias prekes

Skiltyje `#pirkiniai`, grupėje **Mėsa ir žuvis**, ūkininko nuorodos nuo 2026-11-06 yra **tik SKU produktų puslapiai**, ne bendras ūkio pradinis puslapis. `data/sourcing-links.json` `farmers[]` turi nurodyti `kind` (`farmer_product`, `producer_product_reseller` arba `retailer_product`), konkretų produkto URL ir produkto pavadinimą.  `js/weekly-order.js` atmeta bendrus ūkių puslapius ir kategorijas – kai ūkininko SKU nerastas, rodo tekstą „Tiesioginės ūkininko prekės nuorodos nerasta“. Pavyzdys: Šešuolėlių ūkio ėriuko kumpis (`sesuoleliuukis.lt/produktas/...`). Tarpininkų nuorodos **nėra** tiesioginis užsakymas ūkyje. Nuorodos nepatvirtina kainos, atsargų, pakuotės ar pristatymo. Nei `Farmlio`, nei `Barbora` nuorodos automatiškai neįtraukiamos į patvirtintą vienos savaitės krepšelį; ribojimas iki 2 realių atsiskaitymo vietų lieka galioti.

## Barbora atsarginės produktų nuorodos

Kai nei tiesioginio ūkio puslapyje, nei „Farmlio“ nepavyksta patvirtinti konkretaus SKU ir jo kainos, vienos savaitės skiltyje papildomai rodomas **Barbora konkretus produkto pasiūlymas** (`data/sourcing-links.json` laukas `barbora`) arba aiškiai pažymėtas kategorijos puslapis. Pvz., `salmon` turi tiesioginę šviežios lašišos filė su oda 1 kg nuorodą. 2026-11-05 kategorijoje matyta **13,99 €/kg** – tai tik kainos pavyzdys, o ne garantuota šios minutės ar būsimos savaitės kaina. Pasiūlymai **nepridedami prie krepšelio automatiškai**, neįskaičiuojami į dalinę sumą ir nekeičia faktiškai pasirinktų parduotuvių skaičiaus (maks. dvi). Nėra automatinio svetainės prisijungimo prie Barbora ar realiojo laiko kainų patikros; naujus patvirtintus SKU/nuorodas turi papildyti planavimo agentas arba duomenų rinkimo procesas.

## Nuorodos, kai ūkyje nerasta kainos

`data/sourcing-links.json` saugo ūkininkų ir „Farmlio“ alternatyvias nuorodas. Jei nėra patvirtintos mėsos kainos, vienos savaitės lentelėje galima atidaryti abi svetaines ir rankiniu būdu palyginti jų pasiūlymus. Bendras „Farmlio“ katalogas nėra konkreti prekė, o išparduota smulkinta jautiena iš „Kinderio limuzinų“ negali būti automatiškai įtraukta į krepšelį. Nuorodos savaime neužsako ir nėra realiojo laiko kainos patikra; galutinis pasirinkimas vis dar iki 2 parduotuvių.

## Vienos savaitės pirkinių užsakymo planas

**Vienas pirkinių rodinys (2026-11-06):** ankstesnis „Preliminarus apsipirkimas“ su atskirais `Farmlio` / `Barbora` krepšeliais pašalintas; lieka tik `#pirkiniai` su dviem grupėmis – „Mėsa ir žuvis“ bei „Daržovės, pieno produktai ir priedai“. Visi ingredientai matomi **vieną kartą**. Savaitiniai gramai, pakuočių kiekiai, konkrečių produktų nuorodos ir vienas kopijavimo / pažymėjimo mechanizmas valdomi tik `js/weekly-order.js`. Tiekėjo išskleidžiamojo sąrašo nėra.

**Tiesioginės nuorodos be rinkiklio:** kiekvienam ingredientui rodomos konkrečių ūkininkų produktų nuorodos, tuomet `Farmlio` ir, kai reikia, `Barbora` alternatyvos. Senas katalogo tiekėjas automatiškai nepriskiriamas atsiskaitymo vietai. Netinkamas SKU (pvz., smulkinta vištiena vietoje filė), kategorija ar nepatvirtintas krūtinėlės kandidatas gali turėti informacinę nuorodą, bet nėra patvirtinta užsakoma prekė. Svetainėje **nėra „Pasirink tiekėją“ išskleidžiamojo sąrašo**; tik įsigijimo varnelės saugomos kiekvienai savaitei. Iki dviejų faktinių parduotuvių reikalavimas galioja vėliau sudaromam galutiniam patikrintam krepšeliui, o ne rodomų nuorodų skaičiui.

**Kainų nuoseklumas:** senos meniu katalogo kainos rodomos tik kaip **istorinės / nepatvirtintos**, jų neįtraukia į patvirtintų prekių sumą. Į dalinę sumą įtraukiama tik informacinio pagrindinio SKU nauja, dar galiojanti patikra. Svetainė nerodo pilnos galutinės krepšelio sumos, nes nėra patikrinto visų produktų atsiskaitymo ir pristatymo. Dabartiniai istoriniai `data/catalog.json` pristatymo mokesčiai **nėra** atnaujinta galutinio atsiskaitymo informacija.


Svetainės `#pirkiniai` skiltis skaičiuoja **tik pasirinktą 7 dienų meniu (14 valgių)**. Nereikia ir nekraunamas kitos savaitės meniu – galima paruošti net paskutinės suplanuotos savaitės užsakymo juodraštį. `js/weekly-order.js` suskaičiuoja visų produktų gramus ir apvalina perkamas pakuotes **tik vienai savaitei**. Mėsa ir žuvis rodomos atskiroje grupėje, daržovės, pieno produktai ir priedai – kitoje, tačiau abu skyriai priklauso tam pačiam vienos savaitės užsakymui.

**Griežtos ribos:** ne daugiau kaip **2 faktinės atsiskaitymo vietos per savaitę**, savaitinis biudžeto tikslas **100 €**, tolerancija iki **110 €** įskaičiavus pakuotes, pristatymą ir pakavimą. Ūkininkų ir `Barbora` atsarginės nuorodos savaime nėra pasirinktas tiekėjas, o nepatikrinta kaina neįtraukiama į skaičiavimą. Kol nėra patikrinto visų produktų pasiūlymo ir pristatymo, skiltis rodo tik informacinį poreikį ir dalinę patikrintų prekių sumą, **ne** paruoštą galutinį užsakymą.

Kiekvieną savaitę galima nukopijuoti tik jos pirkinių sąrašą, pažymėti įsigytas prekes ir atidaryti konkrečius ūkių SKU. Galutiniame užsakyme turi būti ne daugiau kaip du tiekėjai. Mėsos ar žuvies porcijas, skirtas savaitės pabaigai, galima laiku užšaldyti –18 °C. Svetainė prekių automatiškai **nenusiperka**.

## Prioritetinis meniu pagal ūkininkų mėsos ir žuvies produktus

`scripts/rotation.mjs` prieš parinkdamas receptus skaito `data/sourcing-links.json`. Pirmenybė suteikiama **tiksliai ūkininko produkto nuorodai**, paskui ūkininko prekei per tarpininką, paskui tiksliai `Farmlio` produkto nuorodai. Prekės kategorija, pradinis ūkininko puslapis, išparduotas pasiūlymas arba atsarginė `Barbora` nuoroda prioriteto nesuteikia. 8 savaitėse kiekvienas receptas unikalus, naudojamos visos 8 baltymų grupės, maistingumo ribos išsaugotos. **Kainos, likučiai, pristatymas ir 2 parduotuvių krepšelis lieka nepatvirtinti**, kol nėra naujų patikrintų SKU. Papildžius konkrečias ūkininkų prekes, būsimi automatiškai generuojami meniu joms suteiks aukštesnį prioritetą.

## 48 patiekalų įvairovė (atnaujinta 2026-11-05)

Bibliotekoje yra **48 unikalūs receptai** – po 8 kalakutienos, vištienos, šamo ir jautienos grupėse, po 4 ėrienos, kiaulienos išpjovos, lašišos ir menkės grupėse. Per pirmąsias 8 savaites **nei vienas tas pats receptas nepasikartoja** (4 per savaitę), vėlesniuose cikluose maišomi kiti deriniai. Jautiena neapsiriboja maltiniais: yra nugarinės kepsnys, juostelės, lėtai kepama mentė, rostbifas, burgerio paplotėliai ir sūriu užkepti kotletai. Yra kietojo sūrio bei fetos. Ir toliau galioja dvi gaminimo dienos, vienos skardos principas, daržovių ir maistingumo ribos.

**Papildomos grupės:** ėriena, kiaulienos išpjova, lašiša ir menkė; jų gaminių konkrečios kainos nepatikrintos. 

**Apsipirkimo būklė:** naujiems ingredientams (`cheese`, `feta`, `beef_steak`, `beef_strips`, `beef_roast`, `tomato`, `onion`, `cabbage`, `sauerkraut`) dar nėra patikrintų SKU kainų ir ūkio tiekimo, todėl planai lieka `purchaseReady=false` ir nepatvirtintų produktų krepšelyje nėra. `data/catalog.json` jų maistingumas – apytiksliai 100 g produktų įverčiai, ne gamintojų etikečių skaičiai. Griežta 2 parduotuvių riba išlieka.

## Tikslios instrukcijos pagal ingredientus

Visų 48 patiekalų gaminimo žingsniai perrašyti taip, kad būtų nurodyti *visi ir tik* recepte esantys ingredientai: tikslūs vienos porcijos gramai, paruošimas, kepimo seka, vidinė temperatūra, sūrio ir šaltų priedų pridėjimo laikas. Jei pavadinimas žadėjo recepto sąraše nesančią citriną arba česnaką, jis pakeistas. `scripts/recipe-instructions.mjs` yra vienintelis instrukcijų generavimo šaltinis; `validateRecipePreferences` bei `tests/recipe-instructions.test.mjs` tikrina tikslų ingredientų ir instrukcijų suderinamumą. Atlikus ingredientų pakeitimus, atnaujink ir jų tekstinę kopiją kiekvienoje savaitėje.

## Receptų gaminimas ir daržovių pirmenybės

Nuo šiol nauji receptai ruošiami **orkaitėje, vienoje didelėje skardoje vienam kepimui**, be papildomo kepimo keptuvėje. Per sekmadienio ir trečiadienio gaminimą ruošiami du skirtingi patiekalai; kiekvienam patiekalui gali reikėti atskiro skardos kepimo arba kelių etapų su ta pačia skarda, jeigu vienu sluoksniu 3–4 porcijos netelpa. Maisto saugai būtinas termometras.

Receptuose **nėra cukinijų ir artišokų**. Vienoje porcijoje bulvių ir batatų – ne daugiau kaip 200 g kiekvienų, brokolių – iki 150 g. Mėgstamiausios daržovės: paprikos, pievagrybiai, burokai, morkos, batatai, bulvės, pomidorai, agurkai, svogūnai, česnakai, kopūstai, rauginti produktai. Receptų katalogas išsaugo 48 skirtingus variantus; dar nerandamos kataloge daržovės gali būti įtrauktos tik pridėjus patikrintus produktų šaltinius.

`scripts/planner.mjs` tikrina šias naujų meniu taisykles prieš generavimą ir su `recipePreferencesApplied` žyma pakartotinai tikrina validuojant. **Ankstesnių savaičių archyvas neperrašomas**, todėl senose savaitėse dar gali matytis cukinijų ar daugiau brokolių.

## Automatinis ciklas

`.github/workflows/weekly-menu.yml` vykdomas trečiadieniais 06:17 UTC
(08:17 Lietuvos žiemą, 09:17 vasarą), po pakeitimų į `main` ir rankiniu būdu
per **Actions → Savaitės meniu ir GitHub Pages → Run workflow**.
GitHub grafikas gali vėluoti; po ilgo viešos saugyklos neaktyvumo gali būti išjungtas.

1. Testuojama planavimo ir kainų tikrinimo logika.
2. Iš `data/catalog.json` ir `data/recipe-library.json` sudaroma artimiausio būsimo pirmadienio savaitė.
   Bibliotekoje yra **48 skirtingi receptai** (8 baltymų grupės).
   Kiekvieną savaitę parenkami **4 receptai**: 2 pietums ir 2 vakarienei.
   Per 8 savaites parenkamos skirtingos baltymų grupės ir receptai; vienas receptas tame laikotarpyje nekartojamas.
   Taip pat kaitaliojama, kuri pora ruošiama sekmadienį, o kuri trečiadienį.
   Tai yra **receptų bibliotekos rotacija, ne generatyvinis AI** – veikia be mokamų API.
3. Tiesiogiai patikrinamos tik pasirinktiems receptams reikalingų prekių nuorodos, kainos ir pasirinktos iliustracijų nuotraukos.
   Barbora naudojami pagrindinės prekės duomenys, aktyvumo būsena, pakuotės
   ir vieneto kainos santykis. Farmlio – Product/Offer pasiūlymas EUR valiuta,
   InStock būsena ir peržiūrėtas prekės pavadinimas.
4. Tikrinama: 7 dienos, 2 valgiai po bent 600 kcal, iki 2100 kcal per dieną,
   bent 130 g baltymų ir 800 g nekrakmolingų daržovių per dieną,
   2–4 receptai, 1–2 parduotuvės ir dvi gaminimo sesijos visoms 14 porcijų.
5. Tik po visų patikrų pakeičiamas `data/menu.json`, atliekamas commit ir
   push į `main`. Nepatikrintos kainos niekada nepakeičiamos spėjimais.
6. Tame pačiame workflow publikuojama per GitHub Pages Actions, tada
   tikrinamas viešas HTML, JS, CSS ir tikslus meniu sutapimas.
   Atskiras push sukeltas workflow nereikalingas, pakanka GITHUB_TOKEN.

Nuotraukos – aiškiai pažymėtos patiekimo iliustracijos, ne tiksliai šių receptų
fotografijos. Maistingumas apskaičiuojamas pagal katalogo 100 g reikšmes ir
žalių ingredientų svorį; jis apytikslis. Pristatymo ir pakavimo mokesčiai –
atskiri orientaciniai dydžiai, ne patikrintos produkto kainos.

## GitHub nustatymai ir klaidos

GitHub Actions turi būti leidžiamas. **Settings → Pages → Source** turi būti
**GitHub Actions** (workflow mėgina įjungti Pages automatiškai). `main` apsauga
turi leisti workflow botui įkelti meniu pakeitimus. Mokamų API ir paslapčių nereikia.

Klaida sustabdo ciklą, matoma Actions vykdyme, jo santraukoje ir GitHub Issue
„Mitybos automatikos klaida“ su nuoroda į žurnalą. Pakartotinė klaida atnaujina
tą patį atvirą Issue. Pranešimai el. paštu priklauso nuo jūsų GitHub pranešimų
nustatymų: įjunkite šios saugyklos Actions ir Issues pranešimus.
Jei Issues išjungti, lieka Actions klaida ir santrauka.

Jei prekė dingsta, duomenų struktūra pasikeičia ar kaina nepasiekiama,
ankstesnis meniu nepakeičiamas. Pakeiskite katalogo prekę patikrinta alternatyva,
jos pakuotę ir maistingumą, tada paleiskite workflow iš naujo.
Po publikavimo patikros klaidos automatinio grąžinimo į ankstesnį leidimą nėra.

Trečiadienio ir rankinis paleidimas generuoja naują meniu. Įkeliant svetainės
pakeitimus per `push`, publikuojamas jau išsaugotas ir patikrintas meniu su istorija,
neužklausiant visų parduotuvių dar kartą. Laikinai nepasiekiami šaltiniai tikrinami
iki trijų kartų.

Pradėjus naują meniu, ūkių prekių pasiūlymai tikrinami atskirai per `compare-farms.mjs`; keičiant kodą `push` į `main` papildomai atliekamas pasiūlymų palyginimas ir į **Actions job summary** išvedama ataskaita net jeigu dabartiniams receptams dar trūksta patikrintų ūkininkų SKU. `schedule` paleidimo metu nesant leistino 1–2 parduotuvių krepšelio, naujas meniu negeneruojamas – ankstesnis paskelbtas meniu išlieka. Esamo katalogo kalakutiena ir jautiena iš Barbora neatitinka naujos politikos, todėl iki alternatyvų patikrinimo gali nebūti naujo meniu.

## Vietinės komandos (Node.js 24+)

```sh
node --test
node scripts/planner.mjs generate
node scripts/planner.mjs validate
node scripts/planner.mjs published https://deivassx.github.io/Mityba/
```

Generavimui reikalingas internetas. Kainos šaltinis, laikas ir metodas saugomi
produkto `verification` lauke; patikros galiojimo langas – 24 valandos.
Senesnis publikuotas meniu lieka istoriniu pasiūlymu; kainos gali keistis vėliau.
Pirkinių varnelės saugomos tik toje naršyklėje ir atskirai kiekvienai savaitei.

## Savaičių istorija

Šoninėje juostoje matomos visų išsaugotų savaičių kortelės, naujausios pirmiausia.
Atidarius svetainę rodomas naujausias meniu; paspaudus kortelę – visas tos savaitės
planas, receptai, pirkiniai ir gaminimas. Nuoroda su `?week=YYYY-MM-DD` leidžia
pasidalyti pasirinkta savaite. Telefone korteles galima slinkti horizontaliai.

Pilni meniu saugomi `data/history/YYYY-MM-DD.json`, kortelių sąrašas –
`data/history/index.json`. Kiekvieną kartą sėkmingai generuojant išsaugoma ankstesnė
ir nauja savaitė. Pakartotinai generuojant tą pačią savaitę atnaujinamas jos meniu;
kitų savaičių failai išlieka. Senesnių savaičių kainos iš naujo netikrinamos.

Svetainė automatiškai atidaro artimiausią / tuo metu galiojančią savaitę pagal Lietuvos laiką. Planams neleidžiama apsimesti patikrintomis kainomis. Ankstesni rugsėjo–lapkričio pavyzdiniai meniu pašalinti; vietoje jų sukurti 9 nauji planai nuo 2026-11-09 iki 2027-01-04. Produktų kainos ir ūkių tiekimas šiems būsimiems planams dar nėra patikrinti. Savaitės turi 4 skirtingus vienos skardos receptus, 2 valgymus kasdien, 2 gaminimus per savaitę. `meta.isPlanningSeries=true` planai nėra pirkimui patvirtinti; kalakutienai, jautienai ir vištienai prekių URL laukiama ūkininkų patikros. Šie produktai nebus klaidingai rodomi kaip pirkimas iš Barbora. `node scripts/planner.mjs archive` saugo tokius aiškiai pažymėtus planus tik kaip nepatvirtintą pirkinių sąrašą. Savaitės biudžeto negalima patvirtinti, kol trūksta ūkininkų kainų.
