# Nuolatinės Mityba projekto agento taisyklės

Šis failas yra instrukcija **Codex ir kitiems projektą redaguojantiems AI agentams**. Kiekvieno darbo su šiuo projektu pradžioje **perskaityk iš naujo**:
1. `AGENTS.md`;
2. `config/planavimo-taisykles.json` (vienintelis nuolatinis naudotojo mitybos ir tiekėjų pasirinkimo taisyklių šaltinis);
3. `data/catalog.json`, `data/recipe-library.json`, `data/history/index.json` pagal vykdomą užduotį.

## Privalomas darbo procesas

- Remkis naujausia `config/planavimo-taisykles.json` versija GitHub saugykloje, **ne** ankstesniu pokalbiu ar modelio atmintimi.
- Generuojant naują savaitę pirmenybę teik **sotumui, pakankamiems baltymams, daržovėms, maisto paruošimui du kartus per savaitę**. Pietums palik didesnę krakmolingų produktų dalį.
- Produktus ir tiekėjus rinkis pagal `shopping.selectionPriorities` ir `shopping.supplierCandidates`. **Netvirtink**, kad iš konkretaus tiekėjo galima užsisakyti, kol nepatikrintas konkretaus produkto puslapis, pristatymas ir vietovė. Vien Facebook profilio nuoroda nėra patvirtintas produkto pasiūlymas.
- **PRIVALOMA tikrinant Farmlio:** identifikuok konkretaus produkto gamintoją / ūkį ir surask jo oficialią tiesioginę parduotuvę. Jeigu joje parduodamas toks pats arba tikrai palyginamas produktas, patikrink abiejų kanalų aktualią kainą, vieneto kainą, pakuotę, sudėtį, minimalų užsakymą, pristatymą į Vilnių, pakavimą ir viso užsakymo kainą. Rinkis naudingesnį patikrintą variantą; jokios išvados apie pigumą nedaryk iš vien produkto kainos. Pavyzdys: Šešuolėlių ūkio šviežios ėrienos dešrelės turi Farmlio ir tiesioginio ūkio pasiūlymų nuorodas `shopping.farmlioDirectProducerComparison.example`; dabartinės kainos ir prekių tapatumas nepatikrinti. Jei neradai ūkio svetainės, fiksuok, kad tiesioginis kanalas nepatikrintas.
- Palygink **galutinę krepšelių kainą**, įskaitant pakuočių apvalinimą, pristatymą ir pakavimą; siek daugiausia 1–2 tiekėjų, jei įmanoma.
- Nepriskirk išgalvotų kainų, pristatymo mokesčių, maistingumo ar nepatikrintų produkto URL. Prie nepatikrintų duomenų rašyk „nepatikrinta“, nepublikuok kaip patvirtintų.
- `data/menu.json` atnaujink tik po validacijos; kiekvienai naujai savaitei išsaugok istoriją. Neištrink ankstesnių savaičių.
- Vykdydamas kodo pakeitimus paleisk `node --test` ir esamą planavimo validaciją; nesunaikink GitHub Pages ir nemokamo workflow.
- Neskelbk, kad užsakymai pateikti, ir niekada **nepirk automatiškai** be atskiro aiškaus naudotojo leidimo.
- Vieša GitHub saugykla: nerašyk API raktų, slaptažodžių, tikslaus gyvenamosios vietos adreso, medicininės istorijos ar kitų privačių duomenų.

## Ką dabar sistema padaro ir ko dar nedaro

GitHub Actions naudoja **Node.js** planuoklį, o ne generatyvinį AI. Jo `validate` funkcija programiškai perskaito taisyklių JSON kiekvieno paleidimo metu ir tikrina ten nurodytus *implementationStatus.enforcedByNodePlanner* kriterijus. Tiekėjų sąrašas, Farmlio ir tiesioginio ūkio kainų palyginimas, viso krepšelio optimizavimas, pridėtinio cukraus ir pristatymo patikra kol kas yra **agento darbo instrukcijos**, bet ne automatinio planuoklio garantijos. Nepateik to vartotojui kaip jau realizuoto.

## Taisyklių redagavimas

Jei vartotojas keičia pirmenybes, atnaujink `config/planavimo-taisykles.json` ir, kai reikia, testus bei planuoklį. Naujos taisyklės galioja visiems būsimiems darbams, tačiau nekeičia istorinių meniu atgaline data. Jei naujas reikalavimas neįgyvendintas kode, aiškiai pažymėk tai `implementationStatus.agentGuidanceOnly` ir suplanuok funkcionalumą atskirai.
