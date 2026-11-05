# Meniu atnaujinimo taisyklės

Pakeisk `menu.json` turinį, nekeisk JSON laukų struktūros. Galima keisti 2–4 receptus ir juos kartoti 7 dienų pietums/vakarienei.

- `meta.weekStart`: pirmadienio data, pvz., `2026-11-09` (atskira savaitė = naujos pirkinių varnelės).
- `meta.generatedAt`: kada paruoštas pasiūlymas.
- `days`: tiksliai 7 įrašai, su `date`, `lunch` ir `dinner`. `lunch` / `dinner` turi sutapti su `recipes[].id`.
- `recipes[].ingredients`: kiekvieno žaliavinio produkto gramai **vienai porcijai**.
- `nutrients`: kiekvieno ingrediento kcal / baltymų / angliavandenių / riebalų kiekis **100 gramų**. Svetainė perskaičiuoja energiją pagal recepto gramus.
- `products`: ingredientų identifikatoriai `id`, parduotuvė `store`, tikra prekės nuoroda `url`, pakuotės dydis `packGrams`, orientacinė pakuotės kaina `priceEur` (`null`, jeigu nepatikrinta).
- `stores`: `deliveryFeeEur`, `freeDeliveryFromEur`, `packingFeeEur` arba `packingTiers`, `notes`.
- `sessions`: gaminimo diena, receptai ir žingsniai.

Patikrink, kad dienos kalorijos neviršytų 2100, būtų daug baltymų ir daržovių, o gaminimas tilptų į dvi sesijas. Kainų ar tiesioginių produktų nuorodų neišgalvok.

**Svarbu:** šis tinklalapis pats neskaito parduotuvių katalogų. Kainas / nuorodas patikrinti ir pakeisti turi žmogus arba AI agentas su tinkama prieiga. Jokių API raktų ar slaptažodžių nedėk į viešą saugyklą.
