import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture as marketFixture, testEnvironment, users} from '../marches/test.mjs';
import {migrateBilling} from './billing-schema.mjs';
import {dashboardFixture} from './dashboard-fixture.mjs';

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE || 'C:/Users/quili/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium} = require('playwright');
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
process.env.MARCHES_TEST_WORKER = join(root, '.build', 'entry.mjs');
process.env.MARCHES_TEST_COMPATIBILITY_DATE = '2026-06-09';

const test = await testEnvironment();
const fixture = dashboardFixture(test.accounts, '2026-10-18');
const portrait = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVwQAAAAASUVORK5CYII=';
for (const [index, person] of fixture.salaries.entries()) {
  person.photo = index < 2 ? portrait : null;
  person.payslip = null;
  if (users[index]) person.email = users[index];
}
Object.assign(fixture, {params: {anneeSuivi: 2026}, types: [], mouvements: [], codesAffaires: []});
fixture.notesFrais[0].signature = null;
delete fixture.notesFrais[0].lignes[0].justificatif;
Object.assign(fixture.notesFrais[0], {projectId: 'retired', projectName: 'Ancien projet'});
fixture.notesFrais[0].lignes.push({
  id: 'old-mileage', date: '2026-10-18', categorie: 'Frais kilométriques', description: 'Ancien trajet',
  depart: 'Bastia', arrivee: 'Corte', allerRetour: true, vehicule: 'voiture', cv: '3', km: 140, montant: 74.06
});
const projects = [
  {id: 'north', name: 'Projet Boréal', startDate: '2025-01-01', endDate: '2028-01-01'},
  {id: 'south', name: 'Projet Austral', startDate: '2025-01-01', endDate: '2028-01-01'},
  {id: 'retired', name: 'Ancien projet', archived: true}
];
const routeCoordinates = {
  Bastia: ['9.45', '42.7'], Furiani: ['9.42', '42.65'], Borgo: ['9.43', '42.55'],
  'Ponte Leccia': ['9.19', '42.45'], Corte: ['9.15', '42.3']
};
const routeRequests = [];
const cors = {'Access-Control-Allow-Origin': '*'};

const html = (await readFile(join(root, 'index.html'), 'utf8')).replace('\nbootAuth();', () => `
budgetsObserveClients=()=>{};
facturxWarmLogin=()=>{};
notify=()=>{throw Error('External notifications disabled')};
bootAuth();`);
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png'};
const apiErrors = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (/^\/(api\/v1|budgets|files)\//.test(url.pathname)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = {Origin: 'https://app.cdinnov.eu'};
      for (const key of ['cookie', 'x-cdinnov-request', 'sec-fetch-site', 'content-type', 'if-match', 'if-none-match']) {
        if (req.headers[key]) headers[key] = req.headers[key];
      }
      const response = await test.worker.dispatchFetch('https://test' + url.pathname + url.search, {
        method: req.method, headers, ...(chunks.length ? {body: Buffer.concat(chunks)} : {})
      });
      if (!response.ok && ['/api/v1/portal', '/api/v1/projects'].includes(url.pathname)) {
        apiErrors.push(`${req.method} ${url.pathname}: ${response.status}`);
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep)) throw Error('Outside the test asset directory');
    const body = path === join(root, 'index.html') ? html : await readFile(path);
    res.writeHead(200, {'Content-Type': mime[extname(path)] || 'application/octet-stream'});
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

let browser;
try {
  await migrateBilling(test.db);
  await test.setPortal(JSON.stringify(fixture));
  const admin = await test.login(users[0]);
  const seed = await test.call('markets', {
    method: 'POST', headers: {Cookie: admin.cookie},
    body: JSON.stringify({id: 'market-test', market: {...marketFixture(), projects: projects.map(project => ({code: '', archived: false, notes: '', orders: [], ...project}))}})
  });
  assert.equal(seed.status, 201, await seed.text());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({...process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {channel: 'msedge'}, headless: true});
  const errors = [];

  async function openSession(email, width) {
    const context = await browser.newContext({viewport: {width, height: 920}, locale: 'fr-FR'});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      if (url.hostname === 'nominatim.openstreetmap.org') {
        const coordinates = routeCoordinates[url.searchParams.get('q')];
        const result = coordinates ? [{lon: coordinates[0], lat: coordinates[1]}] : [];
        return route.fulfill({headers: cors, json: result});
      }
      if (url.hostname === 'router.project-osrm.org') {
        const coordinates = decodeURIComponent(url.pathname.split('/').at(-1)).split(';');
        routeRequests.push(coordinates);
        return route.fulfill({headers: cors, json: {code: 'Ok', routes: [{distance: 60000}]}});
      }
      if (url.hostname === 'www.google.com' && url.pathname.startsWith('/maps/dir')) {
        return route.fulfill({contentType: 'text/html', body: '<title>Google Maps fixture</title>'});
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#authEmail').fill(email);
    await page.locator('#authEmail').press('Enter');
    await page.locator('#authPw').fill(test.password);
    await page.locator('#authPw').press('Enter');
    await page.locator('body.authed').waitFor();
    if (width <= 880) await page.getByRole('button', {name: 'Menu', exact: true}).click();
    await page.locator('.sidebar [data-view="notesfrais"]').click();
    await page.locator('[data-react-finance="notesfrais"]').waitFor();
    return page;
  }

  const page = await openSession(users[0], 1440);
  await page.locator('#financeRoot').getByRole('button', {name: 'Créer une note de frais', exact: true}).click();
  const editor = page.locator('[data-react-editor="expense"]');
  await editor.waitFor();
  const subject = 'Mission de vérification fictive';
  const subjectField = editor.locator('#nfObjet');
  await subjectField.fill(subject);

  const employee = editor.getByRole('combobox', {name: 'Salarié', exact: true});
  await employee.click();
  const alex = page.getByRole('option', {name: 'Alex Consultant', exact: true});
  assert.equal(await alex.locator('img').getAttribute('src'), portrait);
  assert.equal(await page.getByRole('option', {name: 'Robin Projet', exact: true}).locator('.finance-person-avatar').innerText(), 'RP');
  await alex.click();
  assert.match(await employee.innerText(), /Alex Consultant/);
  await employee.locator('img').waitFor();
  const photoBox = await employee.locator('img').boundingBox();
  assert.ok(photoBox.width <= 40 && Math.abs(photoBox.width - photoBox.height) < 1);
  assert.doesNotMatch(await editor.innerText(), /Matricule/i);

  const picker = editor.getByRole('combobox', {name: 'Ajouter un projet', exact: true});
  const selected = editor.getByRole('list', {name: 'Projets sélectionnés', exact: true});
  const chooseProject = async name => {
    await picker.click();
    await page.getByRole('option', {name}).click();
  };
  await chooseProject(/Projet Boréal/);
  await picker.click();
  assert.equal(await page.getByRole('option', {name: /Ancien projet|Projet Boréal/}).count(), 0);
  await page.keyboard.press('Escape');
  await page.getByRole('listbox').waitFor({state: 'hidden'});
  await picker.click();
  await page.mouse.click(5, 5);
  await page.getByRole('listbox').waitFor({state: 'hidden'});
  await chooseProject(/Projet Austral/);
  assert.deepEqual(await selected.locator('li span').allTextContents(), ['Projet Boréal', 'Projet Austral']);
  await editor.getByRole('button', {name: 'Retirer Projet Austral', exact: true}).click();
  assert.deepEqual(await selected.locator('li span').allTextContents(), ['Projet Boréal']);
  await chooseProject(/Projet Austral/);
  await page.mouse.click(5, 5);
  await page.keyboard.press('Escape');
  await subjectField.press('Enter');
  assert.equal(await subjectField.inputValue(), subject);
  assert.equal(await page.locator('#financeRoot tbody tr').filter({hasText: subject}).count(), 0);

  const dismissClose = page.waitForEvent('dialog').then(async dialog => {
    assert.equal(dialog.type(), 'confirm');
    await dialog.dismiss();
  });
  await editor.getByRole('button', {name: 'Fermer', exact: true}).last().click();
  await dismissClose;
  assert.equal(await subjectField.inputValue(), subject);

  await editor.getByRole('button', {name: 'Ajouter une ligne', exact: true}).click();
  await editor.locator('#nfl-cat-1').selectOption('Repas');
  await editor.locator('#nfl-montant-1').fill('42.50');
  await editor.locator('#nfl-desc-1').fill('Déjeuner de test');
  await editor.locator('#nfLieu').fill('Bastia');
  assert.equal(await editor.locator('#nfSal').inputValue(), '004');
  assert.deepEqual(await selected.locator('li span').allTextContents(), ['Projet Boréal', 'Projet Austral']);
  assert.equal(await subjectField.inputValue(), subject);

  await editor.getByRole('button', {name: 'Ajouter une ligne', exact: true}).click();
  await editor.locator('#nfl-cat-2').selectOption('Frais kilométriques');
  await editor.locator('#nfl-dep-2').fill('Bastia');
  await editor.locator('#nfl-arr-2').fill('Corte');
  const addStop = editor.getByRole('button', {name: 'Ajouter une étape', exact: true});
  await addStop.click();
  await editor.locator('#nfl-stop-2-0').fill('Borgo');
  await addStop.click();
  await editor.locator('#nfl-stop-2-1').fill('Furiani');
  await editor.getByRole('button', {name: 'Monter l’étape 2', exact: true}).click();
  assert.equal(await editor.locator('#nfl-stop-2-0').inputValue(), 'Furiani');
  await addStop.click();
  await editor.locator('#nfl-stop-2-2').fill('Ponte Leccia');
  await editor.getByRole('button', {name: 'Retirer l’étape 3', exact: true}).click();
  assert.equal(await editor.locator('#nfl-stop-2-2').count(), 0);
  await editor.locator('#nfl-ar-2').check();
  await editor.getByRole('button', {name: 'Calculer les km', exact: true}).click();
  await page.waitForFunction(() => document.getElementById('nfl-km-2')?.value === '120');
  assert.deepEqual(routeRequests, [['Bastia', 'Furiani', 'Borgo', 'Corte'].map(name => routeCoordinates[name].join(','))]);
  assert.equal(await editor.locator('#nfl-montant-2').inputValue(), '63.48');
  await editor.locator('#nfl-stop-2-0').fill('Ponte Leccia');
  await page.waitForFunction(() => document.getElementById('nfl-km-2')?.value === '0');
  assert.equal(await editor.locator('#nfl-montant-2').inputValue(), '0');
  await editor.locator('#nfl-km-2').fill('122');
  await editor.locator('#nfl-stop-2-0').fill('Furiani');
  assert.equal(await editor.locator('#nfl-km-2').inputValue(), '122');
  await editor.getByRole('button', {name: 'Calculer les km', exact: true}).click();
  await page.waitForFunction(() => document.getElementById('nfl-km-2')?.value === '120');

  const openedMaps = page.context().waitForEvent('page');
  await editor.getByRole('button', {name: 'Google Maps', exact: true}).click();
  const maps = await openedMaps;
  await maps.waitForURL(/google\.com\/maps\/dir/);
  const mapsUrl = new URL(maps.url());
  assert.equal(mapsUrl.searchParams.get('origin'), 'Bastia');
  assert.equal(mapsUrl.searchParams.get('destination'), 'Bastia');
  assert.deepEqual(mapsUrl.searchParams.get('waypoints').split('|'), ['Furiani', 'Borgo', 'Corte', 'Borgo', 'Furiani']);
  await maps.close();
  assert.equal(await subjectField.inputValue(), subject);

  await editor.getByRole('button', {name: 'Aperçu', exact: true}).click();
  await page.locator('#nfPreviewRoot').waitFor();
  await page.mouse.click(5, 5);
  await page.locator('#nfPreviewRoot').waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Télécharger PDF', exact: true}).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^Note_de_frais_N\d+_Consultant\.pdf$/);
  const pdf = await readFile(await download.path(), 'latin1');
  assert.match(pdf, /^%PDF-/);
  assert.match(pdf, /Projet Boréal/);
  assert.match(pdf, /Projet Austral/);
  assert.doesNotMatch(pdf, /Matricule/i);
  assert.match(pdf, /Furiani[\s\S]*Borgo[\s\S]*Corte/);
  assert.match(pdf, /120 km/);
  await page.getByRole('button', {name: 'Retour', exact: true}).click();
  assert.equal(await subjectField.inputValue(), subject);
  assert.equal(await editor.locator('#nfl-desc-1').inputValue(), 'Déjeuner de test');
  assert.equal(await editor.locator('#nfl-stop-2-1').inputValue(), 'Borgo');
  assert.deepEqual(await selected.locator('li span').allTextContents(), ['Projet Boréal', 'Projet Austral']);

  const synced = page.waitForResponse(response => response.url().endsWith('/api/v1/portal') && response.request().method() === 'PATCH');
  await editor.getByRole('button', {name: 'Enregistrer', exact: true}).click();
  assert.equal((await synced).status(), 200);
  await editor.waitFor({state: 'detached'});
  const response = await test.worker.dispatchFetch('https://test/api/v1/portal', {headers: {Origin: 'https://app.cdinnov.eu', Cookie: admin.cookie}});
  assert.equal(response.status, 200);
  const saved = (await response.json()).workspace.notesFrais.find(note => note.objet === subject);
  assert.deepEqual(saved.projects, [{id: 'north', name: 'Projet Boréal'}, {id: 'south', name: 'Projet Austral'}]);
  assert.equal(saved.matricule, '004');
  assert.equal(saved.statut, 'Brouillon');
  assert.equal(saved.lignes[1].montant, 42.5);
  assert.equal(saved.lignes[1].description, 'Déjeuner de test');
  assert.equal(saved.lignes[2].km, 120);
  assert.equal(saved.lignes[2].montant, 63.48);
  console.log('OK Desktop: portraits, two projects, accidental clicks and keys, preview, PDF, and local server persistence');
  console.log('OK Desktop mileage: ordered intermediate stops, routing distance doubled for a round trip, matching Google Maps loop and PDF');

  const mobile = await openSession(users[1], 390);
  const mobileEditor = mobile.locator('[data-react-editor="expense"]');
  await mobile.getByRole('button', {name: 'N°' + saved.numero, exact: true}).click();
  assert.equal(await mobileEditor.locator('#nfObjet').inputValue(), subject);
  assert.match(await mobileEditor.locator('.finance-locked-person').innerText(), /Alex Consultant/);
  await mobileEditor.locator('.finance-locked-person img').waitFor();
  assert.equal(await mobileEditor.getByRole('combobox', {name: 'Salarié', exact: true}).count(), 0);
  assert.doesNotMatch(await mobileEditor.innerText(), /Matricule/i);
  assert.deepEqual(await mobileEditor.getByRole('list', {name: 'Projets sélectionnés'}).locator('li span').allTextContents(), ['Projet Boréal', 'Projet Austral']);
  assert.equal(await mobileEditor.locator('#nfl-stop-2-0').inputValue(), 'Furiani');
  assert.equal(await mobileEditor.locator('#nfl-stop-2-1').inputValue(), 'Borgo');
  assert.equal(await mobileEditor.locator('#nfl-ar-2').isChecked(), true);

  await mobileEditor.getByRole('button', {name: 'Ajouter une ligne', exact: true}).click();
  await mobileEditor.locator('#nfl-cat-3').selectOption('Frais kilométriques');
  const importLine = mobileEditor.locator('.nf-line').nth(3);
  await importLine.locator('#nfl-ar-3').check();
  const importedLink = new URL('https://www.google.com/maps/dir/?api=1');
  importedLink.searchParams.set('origin', 'Bastia');
  importedLink.searchParams.set('destination', 'Corte');
  importedLink.searchParams.set('waypoints', 'Furiani|Ponte Leccia');
  importedLink.searchParams.set('travelmode', 'driving');
  async function enterMapsImport(link, distance) {
    const linkField = importLine.locator('#nfl-maps-link-3');
    if (!await linkField.isVisible()) await importLine.getByText('Importer depuis Google Maps', {exact: true}).click();
    await linkField.fill(link);
    await importLine.locator('#nfl-maps-km-3').fill(distance);
  }
  const applyMaps = importLine.getByRole('button', {name: 'Appliquer à la ligne', exact: true});
  await enterMapsImport(mapsUrl.href, '120');
  await applyMaps.click();
  assert.equal(await importLine.locator('#nfl-ar-3').isChecked(), false);
  assert.equal(await importLine.locator('#nfl-km-3').inputValue(), '120');
  await importLine.locator('#nfl-ar-3').check();
  assert.equal(await importLine.locator('#nfl-km-3').inputValue(), '0');
  await enterMapsImport(importedLink.href, '75,4 km');
  await mobileEditor.locator('#nfl-cat-1').selectOption('Restaurant');
  assert.equal(await importLine.locator('#nfl-maps-link-3').inputValue(), importedLink.href);
  assert.equal(await importLine.locator('#nfl-maps-km-3').inputValue(), '75,4 km');
  assert.equal(await applyMaps.isVisible(), true);
  await applyMaps.click();
  assert.equal(await importLine.locator('#nfl-dep-3').inputValue(), 'Bastia');
  assert.equal(await importLine.locator('#nfl-arr-3').inputValue(), 'Corte');
  assert.equal(await importLine.locator('#nfl-stop-3-0').inputValue(), 'Furiani');
  assert.equal(await importLine.locator('#nfl-stop-3-1').inputValue(), 'Ponte Leccia');
  assert.equal(await importLine.locator('#nfl-km-3').inputValue(), '75.4');
  assert.equal(await importLine.locator('#nfl-montant-3').inputValue(), '39.89');
  assert.equal(await importLine.locator('#nfl-ar-3').isChecked(), true);
  await importLine.locator('#nfl-km-3').fill('76.25');
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  const mobileSynced = mobile.waitForResponse(response => response.url().endsWith('/api/v1/portal') && response.request().method() === 'PATCH');
  await mobileEditor.getByRole('button', {name: 'Enregistrer', exact: true}).click();
  assert.equal((await mobileSynced).status(), 200);
  await mobileEditor.waitFor({state: 'detached'});
  await mobile.reload();
  await mobile.locator('body.authed').waitFor();
  await mobile.getByRole('button', {name: 'Menu', exact: true}).click();
  await mobile.locator('.sidebar [data-view="notesfrais"]').click();
  await mobile.getByRole('button', {name: 'N°' + saved.numero, exact: true}).click();
  assert.equal(await mobileEditor.locator('#nfl-km-3').inputValue(), '76.25');
  assert.equal(await mobileEditor.locator('#nfl-stop-3-1').inputValue(), 'Ponte Leccia');
  await importLine.getByText('Importer depuis Google Maps', {exact: true}).click();
  assert.equal(await importLine.locator('#nfl-maps-link-3').inputValue(), importedLink.href);
  assert.equal(await importLine.locator('#nfl-maps-km-3').inputValue(), '75,4');
  assert.equal(await importLine.getByRole('link', {name: 'Ouvrir le lien enregistré', exact: true}).getAttribute('href'), importedLink.href);
  assert.ok(await importLine.locator('.finance-maps-fields').evaluate(fields => fields.scrollWidth <= fields.clientWidth + 1));

  await mobileEditor.getByRole('button', {name: 'Aperçu', exact: true}).click();
  await mobile.locator('#nfPreviewRoot').waitFor();
  const importedDownload = mobile.waitForEvent('download');
  await mobile.getByRole('button', {name: 'Télécharger PDF', exact: true}).click();
  const importedPdf = await readFile(await (await importedDownload).path(), 'latin1');
  assert.match(importedPdf, /Ponte Leccia[\s\S]*76,25 km/);
  await mobile.getByRole('button', {name: 'Retour', exact: true}).click();
  await mobileEditor.getByRole('button', {name: 'Fermer', exact: true}).last().click();
  await mobileEditor.waitFor({state: 'detached'});
  await mobile.getByRole('button', {name: 'N°12', exact: true}).click();
  await mobileEditor.getByRole('button', {name: 'Retirer Ancien projet', exact: true}).waitFor();
  assert.equal(await mobileEditor.getByRole('list', {name: 'Projets sélectionnés'}).locator('li span').innerText(), 'Ancien projet');
  assert.equal(await mobileEditor.locator('#nfl-dep-2').inputValue(), 'Bastia');
  assert.equal(await mobileEditor.locator('#nfl-arr-2').inputValue(), 'Corte');
  assert.equal(await mobileEditor.locator('#nfl-ar-2').isChecked(), true);
  assert.equal(await mobileEditor.locator('#nfl-km-2').inputValue(), '140');
  assert.equal(await mobileEditor.locator('#nfl-stop-2-0').count(), 0);
  await mobileEditor.getByRole('button', {name: 'Fermer', exact: true}).last().click();
  await mobileEditor.waitFor({state: 'detached'});
  assert.deepEqual(errors, []);
  assert.deepEqual(apiErrors, []);
  console.log('OK Mobile consultant: personal portrait, persisted projects, unchanged edit, archived project from a historical note');
  console.log('OK Mobile mileage: imported route and entered total after reload and in PDF, with legacy itineraries readable');
} catch (error) {
  if (apiErrors.length) console.error(apiErrors);
  throw error;
} finally {
  await browser?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  await test.worker.dispose();
}
