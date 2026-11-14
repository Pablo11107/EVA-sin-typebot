// La burbuja de EVA sin Typebot. Un archivo, sin dependencias, sin servidor:
// lee el flujo (JSON) y lo pinta dentro de un Shadow DOM para que los estilos
// de la web no le afecten ni ella afecte a la web.
//
//   import { iniciarEVA } from './eva.js'
//   iniciarEVA({ flujo: '/ruta/eva-chatbot.json' })
//
// Decisiones de seguridad:
//   - Nada de innerHTML: todo el contenido se construye nodo a nodo.
//   - Los enlaces solo se enlazan si van a emalsa.es o a un teléfono oficial;
//     cualquier otra URL se muestra como texto (misma lista que el verificador del repositorio de EVA).
//   - Los estilos van por adoptedStyleSheets, así que la web puede tener una
//     Content-Security-Policy sin 'unsafe-inline'.
//   - No guarda nada: ni cookies, ni almacenamiento, ni conversaciones.

import { crearMotor, richTextATexto } from './motor.js';

const DOMINIOS = new Set(['emalsa.es', 'www.emalsa.es']);
const TELEFONOS = new Set(['928926033', '928010334']);

function urlPermitida(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && DOMINIOS.has(u.hostname)) return true;
    if (u.protocol === 'tel:') return TELEFONOS.has(u.pathname.replace(/\D/g, '').replace(/^34/, ''));
  } catch {
    return false;
  }
  return false;
}

// h('p', {class: 'x'}, 'texto', otroNodo): construye elementos sin HTML.
function h(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    el.append(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo);
  }
  return el;
}

function svg(cadena) {
  // Icono propio, constante: se parsea con el analizador XML, no como HTML.
  return new DOMParser().parseFromString(cadena, 'image/svg+xml').documentElement;
}

const ICONO_GOTA = (relleno, barras) => svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-hidden="true">
     <path d="M60 10C60 10 24 50 24 74a36 36 0 0 0 72 0C96 50 60 10 60 10Z" fill="${relleno}"/>
     <rect x="40" y="58" width="40" height="7" rx="3.5" fill="${barras}"/>
     <rect x="34" y="72" width="52" height="7" rx="3.5" fill="${barras}"/>
     <rect x="44" y="86" width="32" height="7" rx="3.5" fill="${barras}"/></svg>`);
const ICONO_CERRAR = () => svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>');
const ICONO_REINICIAR = () => svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>');

const ESTILOS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .raiz { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
    font: 400 15px/1.5 var(--fuente); color: var(--texto); }
  button { font: inherit; cursor: pointer; }
  button:focus-visible, a:focus-visible { outline: 3px solid var(--acento); outline-offset: 2px; }

  .boton { width: 60px; height: 60px; border: 0; border-radius: 50%; background: var(--primario);
    box-shadow: 0 6px 20px rgba(14,34,56,.28); display: grid; place-items: center; padding: 0;
    transition: transform .2s; }
  .boton:hover { transform: scale(1.06); }
  .boton svg { width: 34px; height: 34px; }

  .invitacion { position: absolute; right: 0; bottom: 74px; width: 280px; background: #fff; color: var(--texto);
    border-radius: 14px; box-shadow: 0 10px 30px rgba(14,34,56,.18); padding: 12px 14px 12px 12px;
    display: flex; gap: 10px; align-items: center; }
  .invitacion img { width: 36px; height: 36px; border-radius: 50%; flex: none; }
  .invitacion button { position: absolute; top: -8px; right: -8px; width: 24px; height: 24px; border-radius: 50%;
    border: 0; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.15); display: grid; place-items: center; }
  .invitacion button svg { width: 12px; height: 12px; }

  .ventana { position: absolute; right: 0; bottom: 76px; width: 400px; height: min(640px, calc(100vh - 110px));
    background: var(--fondo); border-radius: 18px; box-shadow: 0 16px 48px rgba(14,34,56,.3);
    display: flex; flex-direction: column; overflow: hidden; }
  .ventana[hidden] { display: none; }
  .cabecera { display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 16px;
    background: var(--primario); color: #fff; }
  .cabecera img { width: 38px; height: 38px; border-radius: 50%; background: #fff; }
  .cabecera b { display: block; font-size: 16px; font-weight: 600; }
  .cabecera span { font-size: 12.5px; opacity: .85; }
  .cabecera .acciones { margin-left: auto; display: flex; gap: 4px; }
  .cabecera .acciones button { width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent;
    color: #fff; display: grid; place-items: center; }
  .cabecera .acciones button:hover { background: rgba(255,255,255,.15); }
  .cabecera .acciones svg { width: 20px; height: 20px; }

  .mensajes { flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 10px;
    scroll-behavior: smooth; }
  .fila { display: flex; gap: 8px; align-items: flex-end; max-width: 92%; }
  .fila img { width: 28px; height: 28px; border-radius: 50%; flex: none; }
  .fila.sin-avatar { padding-left: 36px; }
  .fila.usuario { align-self: flex-end; justify-content: flex-end; }
  .burbuja { background: var(--anfitrion-fondo); color: var(--anfitrion-texto); padding: 10px 14px;
    border-radius: 16px 16px 16px 6px; overflow-wrap: anywhere; }
  .usuario .burbuja { background: var(--usuario-fondo); color: var(--usuario-texto); border-radius: 16px 16px 6px 16px; }
  .burbuja p { margin: 0; }
  .burbuja p + p { margin-top: 8px; }
  .burbuja a { color: var(--acento-texto); font-weight: 600; }
  .escribiendo { display: inline-flex; gap: 4px; padding: 4px 2px; }
  .escribiendo i { width: 7px; height: 7px; border-radius: 50%; background: #8aa0b8; animation: latir 1.1s infinite; }
  .escribiendo i:nth-child(2) { animation-delay: .18s; } .escribiendo i:nth-child(3) { animation-delay: .36s; }
  @keyframes latir { 0%,80%,100% { opacity: .35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

  .opciones { display: flex; flex-direction: column; gap: 8px; padding-left: 36px; }
  .opciones button, .opciones a { text-align: left; border: 1.5px solid var(--primario); background: #fff;
    color: var(--primario); border-radius: 12px; padding: 10px 14px; font-weight: 500; text-decoration: none;
    transition: background .15s, color .15s; }
  .opciones button:hover, .opciones a:hover { background: var(--primario); color: #fff; }
  .opciones a.llamar { background: var(--primario); color: #fff; }
  .opciones .fin { border-style: dashed; }

  .pie { padding: 8px 14px; font-size: 11.5px; color: #5b6b7f; text-align: center; border-top: 1px solid #e6ebf1; }

  @media (max-width: 720px) {
    .ventana { position: fixed; inset: 0; width: auto; height: auto; border-radius: 0; bottom: 0; }
    .invitacion { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .escribiendo i { animation: none; } .boton { transition: none; }
  }
`;

export async function iniciarEVA(opciones = {}) {
  const respuesta = await fetch(opciones.flujo ?? 'eva-chatbot.json', { credentials: 'omit' });
  if (!respuesta.ok) throw new Error(`no se pudo cargar el flujo (${respuesta.status})`);
  const flujo = await respuesta.json();
  const bot = flujo.typebot ?? flujo;
  const motor = crearMotor(flujo);

  const tema = bot.theme?.chat ?? {};
  const primario = opciones.color ?? tema.buttons?.backgroundColor ?? '#214881';
  const avatar = tema.hostAvatar?.isEnabled !== false ? tema.hostAvatar?.url : null;
  const nombre = opciones.nombre ?? 'EVA';
  const subtitulo = opciones.subtitulo ?? 'Asistente virtual de EMALSA';
  const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Anfitrión en la página + Shadow DOM.
  const anfitrion = h('div', { id: 'eva-asistente' });
  const sombra = anfitrion.attachShadow({ mode: 'open' });
  if ('adoptedStyleSheets' in sombra) {
    const hoja = new CSSStyleSheet();
    hoja.replaceSync(ESTILOS);
    sombra.adoptedStyleSheets = [hoja];
  } else {
    // Navegadores anteriores a 2023: hoja de estilos clásica (requiere style-src 'unsafe-inline').
    sombra.append(h('style', {}, ESTILOS));
  }
  const raiz = h('div', { class: 'raiz' });
  raiz.style.setProperty('--fuente', opciones.fuente ?? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
  raiz.style.setProperty('--primario', primario);
  raiz.style.setProperty('--acento', '#2BC8E8');
  raiz.style.setProperty('--acento-texto', '#1F5FA8');
  raiz.style.setProperty('--fondo', bot.theme?.general?.background?.content ?? '#FFFFFF');
  raiz.style.setProperty('--texto', '#1C2B3A');
  raiz.style.setProperty('--anfitrion-fondo', tema.hostBubbles?.backgroundColor ?? '#F1F4F8');
  raiz.style.setProperty('--anfitrion-texto', tema.hostBubbles?.color ?? '#1C2B3A');
  raiz.style.setProperty('--usuario-fondo', tema.guestBubbles?.backgroundColor ?? primario);
  raiz.style.setProperty('--usuario-texto', tema.guestBubbles?.color ?? '#FFFFFF');
  sombra.append(raiz);
  document.body.append(anfitrion);

  const mensajes = h('div', { class: 'mensajes', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const ventana = h('div', { class: 'ventana', role: 'dialog', 'aria-modal': 'false', 'aria-label': `${nombre}, ${subtitulo}`, hidden: true },
    h('div', { class: 'cabecera' },
      avatar ? h('img', { src: avatar, alt: '' }) : null,
      h('div', {}, h('b', {}, nombre), h('span', {}, subtitulo)),
      h('div', { class: 'acciones' },
        h('button', { type: 'button', title: 'Volver al inicio', 'aria-label': 'Volver al inicio', onclick: () => empezar() }, ICONO_REINICIAR()),
        h('button', { type: 'button', title: 'Cerrar', 'aria-label': 'Cerrar el asistente', onclick: () => cerrar() }, ICONO_CERRAR()))),
    mensajes,
    h('div', { class: 'pie' }, opciones.pie ?? 'EVA no pide ni guarda datos personales. Los trámites se hacen siempre en emalsa.es.'));

  const boton = h('button', { class: 'boton', type: 'button', 'aria-label': `Abrir ${nombre}, ${subtitulo}`, 'aria-expanded': 'false', onclick: () => (ventana.hidden ? abrir() : cerrar()) },
    ICONO_GOTA('#ffffff', primario));

  let invitacion = null;
  if (opciones.invitacion !== false && matchMedia('(min-width: 720px)').matches) {
    const texto = opciones.invitacion?.texto ?? 'Hola, soy EVA. ¿Le ayudo con algún trámite?';
    setTimeout(() => {
      if (!ventana.hidden) return;
      invitacion = h('div', { class: 'invitacion', role: 'status' },
        avatar ? h('img', { src: avatar, alt: '' }) : null,
        h('span', { onclick: () => abrir(), style: 'cursor:pointer' }, texto),
        h('button', { type: 'button', 'aria-label': 'Cerrar la invitación', onclick: () => quitarInvitacion() }, ICONO_CERRAR()));
      raiz.append(invitacion);
    }, opciones.invitacion?.retraso ?? 6000);
  }
  const quitarInvitacion = () => { invitacion?.remove(); invitacion = null; };

  raiz.append(ventana, boton);

  // ── conversación ──────────────────────────────────────────────────────────
  let empezado = false;
  let ocupado = false;

  function abrir() {
    quitarInvitacion();
    ventana.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    if (!empezado) empezar();
    mensajes.querySelector('.opciones button, .opciones a')?.focus();
  }
  function cerrar() {
    ventana.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
    boton.focus();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ventana.hidden) cerrar(); });

  async function empezar() {
    if (ocupado) return;
    mensajes.replaceChildren();
    empezado = true;
    await mostrar(motor.iniciar());
  }

  // Texto enriquecido de Typebot → nodos DOM. Solo p, texto con marcas y enlaces permitidos.
  function pintarRichText(nodos) {
    const frag = document.createDocumentFragment();
    for (const n of nodos ?? []) {
      if (n.type === 'p') frag.append(h('p', {}, pintarRichText(n.children)));
      else if (n.type === 'a') {
        const hijos = pintarRichText(n.children);
        if (urlPermitida(n.url)) {
          const esTel = n.url.startsWith('tel:');
          frag.append(h('a', { href: n.url, target: esTel ? null : '_blank', rel: 'noopener noreferrer' }, hijos));
        } else frag.append(hijos); // URL fuera de la lista: se ve el texto, no el enlace
      } else if ('text' in n) {
        let nodo = document.createTextNode(n.text);
        if (n.bold) nodo = h('strong', {}, nodo);
        if (n.italic) nodo = h('em', {}, nodo);
        if (n.underline) nodo = h('u', {}, nodo);
        frag.append(nodo);
      } else frag.append(pintarRichText(n.children));
    }
    return frag;
  }

  const bajar = () => { mensajes.scrollTop = mensajes.scrollHeight; };
  const esperar = (ms) => new Promise((r) => setTimeout(r, reducirMovimiento ? 0 : ms));

  async function mostrar(paso) {
    ocupado = true;
    if (paso.error) { ocupado = false; return; }
    for (const [i, richText] of paso.mensajes.entries()) {
      const texto = richTextATexto(richText);
      const escribiendo = h('div', { class: 'fila' + (i ? ' sin-avatar' : ''), 'aria-hidden': 'true' },
        i === 0 && avatar ? h('img', { src: avatar, alt: '' }) : null,
        h('div', { class: 'burbuja' }, h('span', { class: 'escribiendo' }, h('i'), h('i'), h('i'))));
      mensajes.append(escribiendo); bajar();
      await esperar(Math.min(1400, 350 + texto.length * 6));
      escribiendo.replaceWith(h('div', { class: 'fila' + (i ? ' sin-avatar' : '') },
        i === 0 && avatar ? h('img', { src: avatar, alt: '' }) : null,
        h('div', { class: 'burbuja' }, pintarRichText(richText))));
      bajar();
    }
    const opciones = h('div', { class: 'opciones' });
    if (paso.redireccion && urlPermitida(paso.redireccion)) {
      // En Typebot la redirección se abre sola; aquí es un botón: Safari bloquea lo que no pulsa el usuario.
      const numero = paso.redireccion.replace(/\D/g, '').replace(/^34/, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
      opciones.append(h('a', { class: 'llamar', href: paso.redireccion }, `Llamar al ${numero}`));
    }
    for (const b of paso.botones ?? []) {
      opciones.append(h('button', { type: 'button', onclick: () => elegir(b, opciones) }, b.texto));
    }
    if (paso.fin) opciones.append(h('button', { type: 'button', class: 'fin', onclick: () => empezar() }, 'Volver al inicio'));
    if (opciones.childElementCount) { mensajes.append(opciones); bajar(); }
    ocupado = false;
    opciones.querySelector('button, a')?.focus({ preventScroll: true });
  }

  async function elegir(boton, opciones) {
    if (ocupado) return;
    opciones.remove();
    mensajes.append(h('div', { class: 'fila usuario' }, h('div', { class: 'burbuja' }, h('p', {}, boton.texto))));
    bajar();
    await esperar(250);
    await mostrar(motor.responder(boton.id));
  }

  return { abrir, cerrar, reiniciar: empezar };
}
