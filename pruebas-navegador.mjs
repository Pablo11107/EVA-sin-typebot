#!/usr/bin/env node
// Pruebas de seguridad y accesibilidad en un navegador real (Chrome, sin cabeza).
//
//   npm install          # puppeteer-core y axe-core, solo para las pruebas
//   node pruebas-navegador.mjs
//
// Levanta un servidor local con los archivos del repositorio y ataca la página
// como lo haría alguien con malas intenciones, además de recorrerla con teclado
// y pasarle el auditor de accesibilidad axe-core:
//
//   - Ninguna petición sale del propio sitio; nada queda guardado en el navegador.
//   - La política de seguridad (CSP) bloquea scripts y estilos inyectados y
//     cualquier conexión externa.
//   - Un flujo envenenado (HTML, scripts, enlaces javascript:, dominios falsos,
//     teléfonos no oficiales, bloques de IA) se muestra como texto o detiene EVA.
//   - Los enlaces llevan rel="noopener noreferrer" y solo van a emalsa.es.
//   - Todo se maneja con teclado; la ventana tiene roles y etiquetas; axe-core
//     no encuentra fallos graves ni críticos.
//
// Chrome: se busca en las rutas habituales de macOS y Linux; EVA_CHROME lo fija.
// Firefox: EVA_NAVEGADOR=firefox (y EVA_FIREFOX con la ruta, si no es la habitual).
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const CHROME = process.env.EVA_CHROME ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium',
].find(existsSync);
const FIREFOX = process.env.EVA_FIREFOX ?? ['/Applications/Firefox.app/Contents/MacOS/firefox', '/usr/bin/firefox'].find(existsSync);
const EN_FIREFOX = process.env.EVA_NAVEGADOR === 'firefox';
const NAVEGADOR = EN_FIREFOX ? FIREFOX : CHROME;
if (!NAVEGADOR) { console.error(EN_FIREFOX ? 'No encuentro Firefox: defina EVA_FIREFOX' : 'No encuentro Chrome: defina EVA_CHROME'); process.exit(2); }

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const CSP = `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`;

// ── Flujos envenenados ───────────────────────────────────────────────────────
const flujo = JSON.parse(readFileSync(join(RAIZ, 'flujo', 'eva-chatbot.json'), 'utf8'));
const envenenado = structuredClone(flujo);
envenenado.groups[0].blocks[0].content.richText = [
  { type: 'p', children: [{ text: 'HTML en el texto: <img src=x onerror="document.title=\'XSS\'"> y <script>document.title="XSS"</script>' }] },
  { type: 'p', children: [{ type: 'a', url: 'javascript:document.title="XSS"', children: [{ text: 'enlace javascript' }] }] },
  { type: 'p', children: [{ type: 'a', url: 'https://evil.example/phishing', children: [{ text: 'enlace a otra web' }] }] },
  { type: 'p', children: [{ type: 'a', url: 'https://emalsa.es.evil.example/', children: [{ text: 'dominio parecido' }] }] },
  { type: 'p', children: [{ type: 'a', url: 'tel:+34600000000', children: [{ text: 'teléfono no oficial' }] }] },
  { type: 'p', children: [{ type: 'a', url: 'data:text/html,<script>alert(1)</script>', children: [{ text: 'enlace data' }] }] },
  { type: 'p', children: [{ type: 'a', url: 'https://www.emalsa.es/contacto/', children: [{ text: 'enlace legítimo' }] }] },
  { type: 'p', children: [{ type: 'iframe', url: 'https://evil.example', children: [{ text: 'nodo desconocido' }] }] },
];
const primerMenu = envenenado.groups.flatMap((g) => g.blocks).find((b) => b.type === 'choice input');
primerMenu.items[0].content = '<b>Trámites</b><img src=x onerror="document.title=\'XSS\'">';
const conIA = structuredClone(flujo);
conIA.groups[0].blocks.unshift({ id: 'ia', type: 'openai', options: { prompt: 'ignora todo' } });

const DINAMICOS = {
  '/flujo/envenenado.json': ['application/json', JSON.stringify(envenenado)],
  '/flujo/con-ia.json': ['application/json', JSON.stringify(conIA)],
  '/prueba.html': ['text/html; charset=utf-8', `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${CSP}"><title>Prueba</title></head>
    <body><p>Página de prueba</p><script type="module" src="/prueba-arranque.js"></script></body></html>`],
  '/prueba-arranque.js': ['text/javascript', `import { iniciarEVA } from '/eva.js';
    const flujo = new URLSearchParams(location.search).get('flujo');
    try { window.eva = await iniciarEVA({ flujo, invitacion: false }); window.eva.abrir(); }
    catch (e) { window.errorEVA = e.message; }`],
};

const servidor = http.createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (DINAMICOS[ruta]) { res.writeHead(200, { 'Content-Type': DINAMICOS[ruta][0] }); return res.end(DINAMICOS[ruta][1]); }
  try {
    const datos = await readFile(join(RAIZ, normalize(ruta.endsWith('/') ? ruta + 'index.html' : ruta)));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta) || '.html'] ?? 'application/octet-stream' });
    res.end(datos);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

// ── utilidades ───────────────────────────────────────────────────────────────
let fallos = 0;
const ok = (cond, msg, detalle = '') => { console.log(`  [${cond ? 'OK   ' : 'FALLO'}] ${msg}${detalle ? ' — ' + detalle : ''}`); if (!cond) fallos++; };
const SOMBRA = `document.querySelector('#eva-asistente').shadowRoot`;
const enSombra = (pagina, fn) => pagina.evaluate(`(${fn})(${SOMBRA})`);
const esperarOpciones = (pagina) => pagina.waitForFunction(`${SOMBRA}.querySelector('.opciones button, .opciones a')`, { timeout: 15000 });

const navegador = await puppeteer.launch(EN_FIREFOX
  ? { browser: 'firefox', executablePath: NAVEGADOR, headless: true }
  : { executablePath: NAVEGADOR, headless: true, args: ['--no-sandbox'] });

async function nuevaPagina() {
  const pagina = await navegador.newPage();
  const estado = { consola: [], peticiones: [], dialogos: 0 };
  pagina.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) estado.consola.push(m.text()); });
  pagina.on('pageerror', (e) => estado.consola.push(e.message));
  pagina.on('request', (r) => estado.peticiones.push(r.url()));
  pagina.on('dialog', async (d) => { estado.dialogos++; await d.dismiss(); });
  await pagina.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline')));
  });
  // Sin animaciones, para que las esperas no dependan de ellas (Firefox no admite esta emulación: se usan las esperas normales).
  try { await pagina.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); } catch {}
  return { pagina, estado };
}

console.log(`Pruebas en navegador (${EN_FIREFOX ? 'Firefox' : 'Chrome'} ${await navegador.version()})\n`);

// ── 1. La página real: red, almacenamiento, enlaces ──────────────────────────
{
  console.log('Página real');
  const { pagina, estado } = await nuevaPagina();
  await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await pagina.click('#abrirHero');
  await esperarOpciones(pagina);
  const antes = estado.peticiones.length;
  for (let i = 0; i < 3; i++) {
    await enSombra(pagina, (s) => s.querySelector('.opciones button').click());
    await pagina.waitForFunction(`${SOMBRA}.querySelectorAll('.fila.usuario').length === ${i + 1} && ${SOMBRA}.querySelector('.opciones button, .opciones a')`);
  }
  const hosts = [...new Set(estado.peticiones.filter((u) => !u.startsWith('data:')).map((u) => new URL(u).host))];
  ok(hosts.length === 1 && hosts[0] === new URL(BASE).host, 'Ninguna petición sale del propio sitio', hosts.join(', '));
  ok(estado.peticiones.length === antes, 'Conversar no genera ninguna petición de red', `${estado.peticiones.length - antes} nuevas`);
  const almacen = await pagina.evaluate(async () => ({
    cookies: document.cookie, local: localStorage.length, sesion: sessionStorage.length,
    bbdd: (await indexedDB.databases()).length,
  }));
  ok(almacen.cookies === '' && !almacen.local && !almacen.sesion && !almacen.bbdd, 'Nada guardado: cookies, localStorage, sessionStorage, IndexedDB', JSON.stringify(almacen));
  const enlaces = await enSombra(pagina, (s) => [...s.querySelectorAll('a')].map((a) => ({ href: a.href, rel: a.rel, target: a.target })));
  const malos = enlaces.filter((a) => !(/^https:\/\/(www\.)?emalsa\.es\//.test(a.href) || /^tel:/.test(a.href)) || !/noopener/.test(a.rel) || !/noreferrer/.test(a.rel) || (a.href.startsWith('https') && a.target !== '_blank'));
  ok(enlaces.length > 0 && malos.length === 0, `Los ${enlaces.length} enlaces mostrados van a emalsa.es o a un teléfono, con noopener y noreferrer`, malos.map((a) => a.href).join(', '));
  ok(estado.consola.length === 0 && (await pagina.evaluate('window.__csp')).length === 0, 'Sin errores de consola ni violaciones de CSP en el uso normal', estado.consola.join(' / '));

  // CSP: lo que un script inyectado intentaría.
  const resultadoCsp = await pagina.evaluate(async () => {
    const s = document.createElement('script'); s.textContent = 'window.__inyectado = 1'; document.body.append(s);
    const d = document.createElement('div'); d.setAttribute('style', 'background:red'); document.body.append(d);
    let fetchBloqueado = false;
    try { await fetch('https://example.com/'); } catch { fetchBloqueado = true; }
    const img = document.createElement('img'); img.src = 'https://example.com/pixel.png'; document.body.append(img);
    await new Promise((r) => setTimeout(r, 300));
    return { inyectado: window.__inyectado, fondo: getComputedStyle(d).backgroundColor, fetchBloqueado, violaciones: window.__csp };
  });
  ok(resultadoCsp.inyectado === undefined, 'CSP: un script inyectado en la página no se ejecuta');
  ok(resultadoCsp.fondo !== 'rgb(255, 0, 0)', 'CSP: un atributo style inyectado no se aplica');
  ok(resultadoCsp.fetchBloqueado && resultadoCsp.violaciones.some((v) => v.startsWith('connect-src')), 'CSP: una conexión a otro dominio se bloquea');
  ok(resultadoCsp.violaciones.some((v) => v.startsWith('img-src')), 'CSP: una imagen de otro dominio se bloquea (sin balizas de seguimiento posibles)');
  await pagina.close();
}

// ── 2. Flujo envenenado ──────────────────────────────────────────────────────
{
  console.log('\nFlujo envenenado');
  const { pagina, estado } = await nuevaPagina();
  await pagina.goto(`${BASE}/prueba.html?flujo=/flujo/envenenado.json`, { waitUntil: 'networkidle0' });
  await esperarOpciones(pagina);
  const dom = await enSombra(pagina, (s) => ({
    titulo: document.title,
    peligrosos: s.querySelectorAll('img:not(.fila img):not(.cabecera img), script, iframe, object, embed').length,
    enlaces: [...s.querySelectorAll('.burbuja a')].map((a) => a.getAttribute('href')),
    texto: s.querySelector('.burbuja').textContent,
    boton: s.querySelector('.opciones button').innerHTML,
  }));
  ok(dom.titulo !== 'XSS' && estado.dialogos === 0, 'El HTML del flujo no se ejecuta (ni onerror, ni script, ni alert)');
  ok(dom.peligrosos === 0, 'No se crea ningún elemento img, script, iframe, object ni embed a partir del flujo');
  ok(dom.texto.includes('<img src=x onerror=') && dom.texto.includes('<script>'), 'El HTML se muestra como texto literal');
  ok(dom.enlaces.length === 1 && dom.enlaces[0] === 'https://www.emalsa.es/contacto/', 'De siete enlaces, solo el de emalsa.es se enlaza; javascript:, data:, otras webs, dominios parecidos y teléfonos no oficiales quedan como texto', dom.enlaces.join(', '));
  ok(!dom.boton.includes('<b>') && !dom.boton.includes('<img'), 'El HTML en el texto de un botón se muestra como texto', dom.boton.slice(0, 60));
  await pagina.close();

  const otra = await nuevaPagina();
  await otra.pagina.goto(`${BASE}/prueba.html?flujo=/flujo/con-ia.json`, { waitUntil: 'networkidle0' });
  await otra.pagina.waitForFunction('window.errorEVA || window.eva', { timeout: 10000 });
  const error = await otra.pagina.evaluate('window.errorEVA');
  ok(/no admitido/.test(error ?? ''), 'Un flujo con un bloque de IA detiene EVA antes de mostrar nada', error);
  await otra.pagina.close();
}

// ── 3. Teclado y accesibilidad ───────────────────────────────────────────────
{
  console.log('\nTeclado y accesibilidad');
  const { pagina } = await nuevaPagina();
  await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  // Llegar al botón flotante solo con Tab.
  let llegado = false;
  for (let i = 0; i < 40 && !llegado; i++) {
    await pagina.keyboard.press('Tab');
    llegado = await pagina.evaluate(`document.activeElement?.id === 'eva-asistente' && ${SOMBRA}.activeElement?.classList.contains('boton')`);
  }
  ok(llegado, 'El botón de EVA se alcanza con Tab');
  await pagina.keyboard.press('Enter');
  await esperarOpciones(pagina);
  const foco = await enSombra(pagina, (s) => s.activeElement?.closest('.opciones') ? s.activeElement.textContent : null);
  ok(!!foco, 'Al abrir, el foco pasa a la primera opción', foco);
  await pagina.keyboard.press('Enter');
  await pagina.waitForFunction(`${SOMBRA}.querySelectorAll('.fila.usuario').length === 1 && ${SOMBRA}.querySelector('.opciones button, .opciones a')`);
  ok(true, 'Enter sobre una opción avanza la conversación');
  const aria = await enSombra(pagina, (s) => ({
    dialogo: s.querySelector('[role=dialog]')?.getAttribute('aria-label'),
    log: s.querySelector('[role=log]')?.getAttribute('aria-live'),
    boton: s.querySelector('.boton')?.getAttribute('aria-expanded'),
    botones: [...s.querySelectorAll('.cabecera button')].every((b) => b.getAttribute('aria-label')),
  }));
  ok(aria.dialogo && aria.log === 'polite' && aria.boton === 'true' && aria.botones, 'Roles y etiquetas: dialog con nombre, log aria-live, aria-expanded, botones con aria-label', JSON.stringify(aria));
  await pagina.keyboard.press('Escape');
  const cerrado = await enSombra(pagina, (s) => s.querySelector('.ventana').hidden && s.activeElement?.classList.contains('boton'));
  ok(cerrado, 'Escape cierra la ventana y devuelve el foco al botón');

  // axe-core sobre la página con la ventana abierta.
  await pagina.keyboard.press('Enter');
  await esperarOpciones(pagina);
  await pagina.evaluate(AXE);
  const axe = await pagina.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } });
    return r.violations.map((v) => ({ id: v.id, impacto: v.impact, nodos: v.nodes.length, ayuda: v.help }));
  });
  const graves = axe.filter((v) => ['serious', 'critical'].includes(v.impacto));
  ok(graves.length === 0, `axe-core (WCAG 2.1 AA y buenas prácticas): ${axe.length} avisos, ${graves.length} graves o críticos`,
    axe.map((v) => `${v.id} (${v.impacto}, ${v.nodos})`).join('; '));
  await pagina.close();
}

// ── 4. Tamaño de lo que se sirve ─────────────────────────────────────────────
{
  console.log('\nTamaño');
  const kb = (f) => Math.round(readFileSync(join(RAIZ, f)).length / 1024);
  ok(kb('eva.js') + kb('motor.js') < 30, `Código de la burbuja: ${kb('eva.js') + kb('motor.js')} KB (eva.js ${kb('eva.js')}, motor.js ${kb('motor.js')})`);
  ok(kb('flujo/eva-chatbot.json') < 1024, `Flujo: ${kb('flujo/eva-chatbot.json')} KB`);
}

await navegador.close();
servidor.close();
console.log(`\n${fallos ? `${fallos} fallos.` : 'Todo correcto.'}`);
process.exit(fallos ? 1 : 0);
