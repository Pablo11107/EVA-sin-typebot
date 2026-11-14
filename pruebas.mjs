#!/usr/bin/env node
// Pruebas del motor sin Typebot. Recorren TODOS los caminos del flujo y
// comprueban lo mismo que exigimos al bot publicado:
//
//   node prototipo/pruebas.mjs
//
//   - Se llega a todos los grupos y no hay callejones sin salida ni bucles
//     sin botones.
//   - Cada botón lleva a algún sitio; una opción inventada se rechaza.
//   - Todo lo que se muestra existe tal cual en el flujo; los enlaces solo
//     van a emalsa.es y las llamadas solo a los teléfonos oficiales.
//   - La burbuja (eva.js) no usa innerHTML ni CDN.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearMotor, enlaces, richTextATexto } from './motor.js';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const flujo = JSON.parse(readFileSync(join(RAIZ, 'flujo', 'eva-chatbot.json'), 'utf8'));
const DOMINIOS = new Set(['emalsa.es', 'www.emalsa.es']);
const TELEFONOS = new Set(['928926033', '928010334']);

let fallos = 0;
const ok = (condicion, mensaje) => {
  console.log(`  [${condicion ? 'OK   ' : 'FALLO'}] ${mensaje}`);
  if (!condicion) fallos++;
};
const urlPermitida = (url) => {
  const u = new URL(url);
  return (u.protocol === 'https:' && DOMINIOS.has(u.hostname)) ||
    (u.protocol === 'tel:' && TELEFONOS.has(u.pathname.replace(/\D/g, '').replace(/^34/, '')));
};

console.log('Motor sin Typebot: recorrido completo del flujo\n');

// ── Recorrido exhaustivo: cada bloque de botones, cada botón ───────────────
const motor = crearMotor(flujo);
const textosDelFlujo = new Set(flujo.groups.flatMap((g) => g.blocks.filter((b) => b.type === 'text').map((b) => richTextATexto(b.content.richText))));
const gruposVistos = new Set();
const pendientes = [];   // caminos por explorar: listas de ids de botones desde el inicio
const bloquesVistos = new Set();
let pasos = 0, finales = 0, redirecciones = 0, enlacesVistos = 0, maxProfundidad = 0;
const problemas = [];

function registrar(paso, camino) {
  pasos++;
  for (const m of paso.mensajes) {
    if (!textosDelFlujo.has(richTextATexto(m))) problemas.push(`texto no previsto en ${camino.join(' > ')}`);
    for (const url of enlaces(m)) { enlacesVistos++; if (!urlPermitida(url)) problemas.push(`enlace no permitido: ${url}`); }
  }
  if (paso.redireccion) { redirecciones++; if (!urlPermitida(paso.redireccion)) problemas.push(`redirección no permitida: ${paso.redireccion}`); }
  if (paso.fin) finales++;
  if (!paso.fin && !paso.botones) problemas.push(`paso sin botones y sin fin en ${camino.join(' > ')}`);
  if (paso.botones && paso.botones.length === 0) problemas.push(`botones vacíos en ${camino.join(' > ')}`);
  if (paso.mensajes.length === 0 && !paso.redireccion) problemas.push(`paso mudo en ${camino.join(' > ')}`);
}

function grupoActual() { return motor.esperando?.grupoId; }

pendientes.push([]);
while (pendientes.length) {
  const camino = pendientes.pop();
  let paso = motor.iniciar();
  for (const id of camino) paso = motor.responder(id);
  if (paso.error) { problemas.push(`error siguiendo ${camino.join(' > ')}: ${paso.error}`); continue; }
  registrar(paso, camino);
  maxProfundidad = Math.max(maxProfundidad, camino.length);
  if (grupoActual()) gruposVistos.add(grupoActual());
  if (paso.fin || !paso.botones) continue;
  const clave = motor.esperando.bloqueId;
  if (bloquesVistos.has(clave)) continue;   // ya exploramos este menú por otro camino
  bloquesVistos.add(clave);
  for (const b of paso.botones) pendientes.push([...camino, b.id]);
}

// Los grupos que no esperan respuesta (solo texto o redirección) se cuentan por los textos vistos.
const gruposConBotones = flujo.groups.filter((g) => g.blocks.some((b) => b.type === 'choice input'));
const totalBotones = flujo.groups.flatMap((g) => g.blocks).filter((b) => b.type === 'choice input').length;

ok(bloquesVistos.size === totalBotones, `se alcanzan todos los menús de botones (${bloquesVistos.size} de ${totalBotones})`);
ok(gruposVistos.size === gruposConBotones.length, `se alcanzan todos los grupos con botones (${gruposVistos.size} de ${gruposConBotones.length})`);
ok(problemas.length === 0, problemas.length ? `${problemas.length} problemas: ${problemas.slice(0, 3).join('; ')}` : `${pasos} pasos sin textos, enlaces ni redirecciones fuera del flujo`);
ok(finales > 0, `${finales} finales de conversación, ${redirecciones} llamadas, ${enlacesVistos} enlaces, profundidad máxima ${maxProfundidad}`);

// ── Lo que el bot no debe hacer ───────────────────────────────────────────
motor.iniciar();
ok(motor.responder('opcion-inventada').error === 'opción no válida', 'una opción que no es un botón se rechaza');
ok(motor.responder('<script>alert(1)</script>').error === 'opción no válida', 'un intento de inyección se rechaza');
const primero = motor.iniciar();
ok(motor.responder(primero.botones[0].id).eleccion === primero.botones[0].texto, 'un botón legítimo avanza y devuelve lo elegido');
motor.iniciar();
const sinPendiente = crearMotor(flujo).responder('x');
ok(sinPendiente.error === 'no hay ninguna pregunta pendiente', 'responder sin pregunta pendiente se rechaza');

// Un flujo con un bloque no admitido (IA, texto libre, webhook) detiene el motor.
const envenenado = structuredClone(flujo);
envenenado.groups[0].blocks.unshift({ id: 'x', type: 'openai', options: {} });
let detenido = false;
try { crearMotor(envenenado).iniciar(); } catch (e) { detenido = /no admitido/.test(e.message); }
ok(detenido, 'un bloque de IA en el flujo detiene el motor en vez de ejecutarse');

// ── La burbuja ────────────────────────────────────────────────────────────
const eva = readFileSync(join(RAIZ, 'eva.js'), 'utf8').replace(/^\s*\/\/.*$/gm, ''); // sin comentarios
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(eva), 'eva.js no usa innerHTML ni equivalentes');
ok(!/https?:\/\/(cdn|unpkg|fonts\.g)/.test(eva), 'eva.js no carga nada de CDN');
ok(!/localStorage|sessionStorage|document\.cookie|indexedDB/.test(eva), 'eva.js no guarda nada en el navegador');
ok(/adoptedStyleSheets/.test(eva), 'eva.js aplica estilos sin exigir unsafe-inline');

console.log(`\n${fallos ? `${fallos} fallos` : 'Todo correcto'}.`);
process.exit(fallos ? 1 : 0);
