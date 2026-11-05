# 🥗 Mityba · Sotus planas

Nemokama asmeninė 7 dienų mitybos svetainė, pritaikyta **GitHub Pages**.

**Viešas adresas:** https://deivassx.github.io/Mityba/

## Kaip įdiegti

1. Išarchyvuok `Mityba-GitHub-Pages.zip` kompiuteryje.
2. Atidaryk https://github.com/deivassx/Mityba ir pasirink **Add file → Upload files**.
3. Įkelk **išarchyvuotus failus ir aplankus** (`index.html`, `css/`, `js/`, `data/`, `.nojekyll`, `README.md`). *Ne patį ZIP failą.*
4. Spausk **Commit changes** (jei reikia, į `main`).
5. GitHub atidaryk **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.
6. Atidaryk https://deivassx.github.io/Mityba/ po GitHub Pages diegimo.

### Kaip atnaujinti savaitės meniu

Redaguok tik **`data/menu.json`**: čia yra dienų grafikas (`days`), receptai (`recipes`), ingredientų maistingumas 100 g (`nutrients`), produktų krepšelis (`products`), parduotuvės ir pristatymo sąlygos (`stores`), gaminimo sesijos (`sessions`).

Svetainė automatiškai paskaičiuos reikalingus prekių gramus pagal 7 dienų pietų / vakarienės receptus, pakuočių skaičių, orientacines kainas, kalorijas ir makroelementus. Kiekvienam naujam meniu pakeisk `meta.weekStart` (YYYY-MM-DD); tada varnelės pradės naują savaitę.

> ⚠️ GitHub Pages **tik publikuoja GitHub pakeitimus**. ChatGPT suplanuota savaitinė užduotis savaime į GitHub nerašo. Tam reikia atskiros įgaliotos GitHub integracijos arba rankinio `menu.json` pakeitimo.

## Peržiūra kompiuteryje

Kadangi JavaScript skaito JSON failą per `fetch`, dėl naršyklės saugumo `index.html` negalima patikimai paleisti dukart spustelėjus (`file://`). Vietiniam testui naudok:

```bash
python -m http.server 8000
```

ir atidaryk http://localhost:8000 (pasileisk komandą iš svetainės aplanko).

## Kaina ir ribojimai

- GitHub Pages ir viešas GitHub projektas nemokami asmeniniam naudojimui, pagal GitHub plano sąlygas.
- Svetainė statiška, neprašo prisijungimo, nenaudoja mokamų API.
- Prekių nuorodos tik atidaro pardavėjų tinklalapius – į krepšelius nededa.
- Visas turinys viešas. Nelaikyk čia prisijungimų, tokenų ar kitų paslapčių.
- Pirkinių varnelės veikia tik vienoje naršyklėje (saugomos `localStorage`).
- Produktų kainos / siuntimas – orientaciniai. Patikrink prieš užsakydamas.
- Nuotraukos yra išorinės iliustracijos; jų šaltiniai nurodyti prie kiekvieno recepto.
