// Nemokamas deterministinis meniu įvairinimas: receptai iš patikrinto katalogo, be API rakto.
const GROUPS = ['kalakutiena', 'vistiena', 'samas', 'jautiena'];
const ANCHOR = Date.parse('2026-11-09T00:00:00Z');
const WEEK_MS = 7 * 86400000;
const ensure = (ok, message) => { if (!ok) throw new Error(message); };

export function selectWeeklyRecipes(baseRecipes, bank, weekStart) {
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(weekStart), 'Neteisinga savaitės data');
  const date = Date.parse(weekStart + 'T00:00:00Z');
  const weekIndex = (date - ANCHOR) / WEEK_MS;
  ensure(Number.isInteger(weekIndex), 'Savaitė turi prasidėti pirmadienį');
  const originals = new Map(baseRecipes.map(r => [r.id, r]));
  const picked = {};
  for (const [position, group] of GROUPS.entries()) {
    const baseline = originals.get(group);
    const extras = bank.variants?.[group];
    ensure(baseline && Array.isArray(extras) && extras.length === 3, 'Trūksta 4 receptų grupėje: ' + group);
    const options = [baseline, ...extras];
    const offset = Math.floor(weekIndex / 4 ** (position + 1));
    const optionIndex = ((weekIndex + offset) % 4 + 4) % 4;
    picked[group] = options[optionIndex];
  }
  const recipes = GROUPS.map(group => picked[group]);
  ensure(new Set(recipes.map(r => r.id)).size === 4, 'Pasikartojantys receptų ID');
  ensure(recipes.every(r => (r.slot === 'PIETŪS') === ['kalakutiena','vistiena'].some(group => picked[group] === r)), 'Netinkama recepto kategorija');
  const first = weekIndex % 2 === 0 ? ['kalakutiena','samas'] : ['vistiena','jautiena'];
  const second = weekIndex % 2 === 0 ? ['vistiena','jautiena'] : ['kalakutiena','samas'];
  return {recipes, pairs: [[picked[first[0]].id,picked[first[1]].id],[picked[second[0]].id,picked[second[1]].id]], weekIndex};
}
