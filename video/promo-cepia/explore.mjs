// Exploration : crée l'espace de démo puis photographie les écrans principaux (repérage avant captures finales).
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = 'scratch';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'fr-FR' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));

await page.goto(BASE);
await page.getByRole('button', { name: 'Essayer en mode démo' }).click();
await page.getByText('Hôtel / restaurant / palace').click();
await page.getByRole('button', { name: 'Suivant' }).click();
await page.getByLabel("Nom de l'entreprise ou de l'établissement").fill('Hôtel Les Ormes — Paris');
await page.getByRole('button', { name: "Créer l'espace" }).click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/01-dashboard.png` });

for (const [name, path] of [
  ['02-vins', '/vins'],
  ['03-stock', '/stock'],
  ['04-plan', '/stock?tab=cellar'],
  ['05-carte', '/carte'],
  ['06-service', '/service'],
  ['07-achats', '/achats'],
  ['08-pilotage', '/pilotage'],
]) {
  await page.goto(BASE + path);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
fs.writeFileSync(`${OUT}/state.json`, JSON.stringify(await ctx.storageState()));
const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /public_lists|wineLists|sites$/.test(k)));
console.log(keys);
await browser.close();
