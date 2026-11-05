# Katalogo priežiūra

Redaguokite `data/catalog.json`, tada paleiskite `node scripts/planner.mjs generate`.
`menu.json` – patikrintas rezultatas, kurį publikuoja workflow.

- Ingredientų gramai recepte skirti vienai porcijai, maistingumas – 100 g.
- Produkto `id` atitinka ingredientą; `store` – parduotuvės ID.
- `url` – tiesioginė tikro produkto HTTPS nuoroda.
- `packGrams` – vienos perkamos pakuotės masė. Aliejui `packLitres` tikrina
  pardavėjo tūrio kainą, masė naudojama recepto gramams perskaičiuoti.
- Farmlio `sourceName` turi tiksliai atitikti pardavėjo produkto pavadinimą.
  Keičiant prekę peržiūrėkite pakuotės dydį ir maistingumą.
- Katalogo `priceEur` generuojant visada pakeičiamas naujai patikrinta kaina.
  Trūkstant patikros, naujas meniu neišsaugomas.
- Receptų ID `kalakutiena`, `samas`, `vistiena`, `jautiena` naudojami
  planuoklio rotacijoje; pakeitus juos keiskite ir planuoklį.
- Nuotraukos turi būti HTTPS vaizdai su nurodytu šaltiniu.

Niekuomet neįkelkite slaptažodžių, API raktų ar prisijungimo slapukų.
