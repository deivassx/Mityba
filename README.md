# Mityba · automatinis savaitės planas

Svetainė: https://deivassx.github.io/Mityba/

## Nuolatinės taisyklės (prieš kiekvieną generavimą)

**Visos nuostatos laikomos GitHub saugykloje, ne ChatGPT atmintyje.**

- [`AGENTS.md`](AGENTS.md) – instrukcijos Codex ir AI agentams: kiekvieną darbą pradėti nuo taisyklių perskaitymo.
- [`config/planavimo-taisykles.json`](config/planavimo-taisykles.json) – vienas redaguojamas taisyklių šaltinis: mityba, produktai, tiekėjai, prioritetai ir kokybės patikra.
- `scripts/planner.mjs` kiekvieną kartą perskaito JSON ir vykdo automatiškai patikrinamas skaitines bei domenų taisykles. Kai kurie pirkinių optimizavimo pageidavimai dar įgyvendinti **tik kaip agento instrukcijos**.
- **Farmlio → tiesioginis ūkis:** kai produktas rastas Farmlio, prieš renkantis būtina paieškoti jo gamintojo oficialios parduotuvės ir palyginti *visą krepšelio kainą*, ne tik prekės kainą. Tiksli taisyklė ir naudotojo pateiktas Šešuolėlių ūkio pavyzdys saugomi `shopping.farmlioDirectProducerComparison`. Automatinis Node.js planuoklis kol kas šios paieškos nevykdo – tai Codex / AI agento nurodymas.

**Nauja apsipirkimo politika:** tiesioginiai ūkiai → Farmlio (su palyginimu) → Barbora tik daržovėms ir priedams, vištienai tik kai kitur nėra. Savaitės tikslas **100 EUR**, iki **110 EUR** tolerancija su visomis pakuotėmis ir pristatymu. `scripts/shopping-audit.mjs` per kiekvieną CI vykdymą suskaičiuoja numatomą krepšelį ir pažymi dabartinio katalogo neatitikimus, bet dar neieško alternatyvų internetu. Kad taisyklė būtų įvykdyta, turi būti pakeistos kataloge esančios kalakutienos ir jautienos nuorodos iš Barbora į patikrintus ūkius.

Pakeitus JSON ir įkėlus į `main`, kita GitHub Actions užduotis naudos atnaujintas taisykles.
Saugykla vieša, todėl nekelkite privačių duomenų.

## Automatinis ciklas

`.github/workflows/weekly-menu.yml` vykdomas trečiadieniais 06:17 UTC
(08:17 Lietuvos žiemą, 09:17 vasarą), po pakeitimų į `main` ir rankiniu būdu
per **Actions → Savaitės meniu ir GitHub Pages → Run workflow**.
GitHub grafikas gali vėluoti; po ilgo viešos saugyklos neaktyvumo gali būti išjungtas.

1. Testuojama planavimo ir kainų tikrinimo logika.
2. Iš `data/catalog.json` ir `data/recipe-library.json` sudaroma artimiausio būsimo pirmadienio savaitė.
   Bibliotekoje yra **16 skirtingų receptų** (4 baziniai + 12 alternatyvų).
   Kiekvieną savaitę parenkami **4 receptai**: 2 pietums ir 2 vakarienei.
   Keturių variantų kiekvienoje grupėje deterministinis 4-ainių ciklas sudaro
   **256 skirtingas savaitines kombinacijas**, todėl gretimos savaitės nesikartoja.
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

Istorijoje taip pat yra 8 retrospektyvūs pavyzdžiai (2026-09-14–2026-11-08),
pažymėti „Pavyzdinis meniu“. Jie sukurti iš patikrinto dabartinio katalogo:
rodomos kainos nėra istorinės. `node scripts/create-examples.mjs` atkuria šiuos
pavyzdžius pagal naujausio plano datą ir neleidžia perrašyti tikrų planų.
