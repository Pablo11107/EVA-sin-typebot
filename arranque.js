// Arranque de la página de demostración: la burbuja con el flujo del repositorio,
// la cabecera que aparece al bajar, el revelado de las secciones y la calculadora.
// Sin estilos ni scripts en línea: la política de seguridad de la página no los permite.
import { iniciarEVA } from './eva.js';

// ── La burbuja ──────────────────────────────────────────────────────────────
const eva = await iniciarEVA({ flujo: 'flujo/eva-chatbot.json' });
for (const id of ['abrirHero', 'abrirBot']) {
  document.getElementById(id)?.addEventListener('click', () => eva.abrir());
}

// ── Cabecera y barra de progreso ───────────────────────────────────────────
const cab = document.getElementById('cab');
const barra = document.getElementById('progreso');
const hero = document.getElementById('hero');
let pendiente = false;
function alDesplazar() {
  const y = window.scrollY;
  const total = document.documentElement.scrollHeight - window.innerHeight;
  barra.style.width = (total > 0 ? (y / total) * 100 : 0) + '%';
  cab.classList.toggle('visible', y > hero.offsetHeight * 0.75);
}
window.addEventListener('scroll', () => {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => { alDesplazar(); pendiente = false; });
}, { passive: true });
window.addEventListener('resize', alDesplazar);
alDesplazar();

// ── Revelado al entrar en pantalla ─────────────────────────────────────────
const observador = new IntersectionObserver((entradas) => {
  for (const e of entradas) if (e.isIntersecting) { e.target.classList.add('in'); observador.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.rv').forEach((el) => observador.observe(el));

// ── Calculadora de coste ───────────────────────────────────────────────────
const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const euros = (n) => miles(n) + ' €';
const valor = (id) => { const v = parseFloat(document.getElementById(id).value); return Number.isNaN(v) ? 0 : v; };
const texto = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
const horas = (h) => h.toLocaleString('es-ES') + ' h';

function calcular() {
  const hContenido = valor('cContenido'), tContenido = valor('cTarifaContenido');
  const hSistemas = valor('cSistemas'), tSistemas = valor('cTarifaSistemas');
  const servidor = valor('cServidor'), nube = valor('cNube');
  const contenido = hContenido * tContenido;
  const sistemas = hSistemas * tSistemas;
  const costeNube = contenido + nube;
  const costePropio = contenido + sistemas + servidor;
  const costeSin = contenido;

  texto('oContenido', horas(hContenido));
  texto('oTarifaContenido', tContenido + ' €');
  texto('oSistemas', horas(hSistemas));
  texto('oTarifaSistemas', tSistemas + ' €');
  texto('rNube', euros(costeNube));
  texto('dNube', `${euros(contenido)} de contenido + ${euros(nube)} de plan`);
  texto('rPropio', euros(costePropio));
  texto('dPropio', `${euros(contenido)} de contenido + ${euros(sistemas)} de sistemas + ${euros(servidor)} de servidor`);
  texto('rSin', euros(costeSin));
  texto('dSin', `${euros(contenido)} de contenido, y nada más`);
  texto('rAhorro', euros((costePropio - costeSin) * 12));
}
const calc = document.getElementById('calculadora');
if (calc) {
  calc.addEventListener('input', calcular);
  calc.addEventListener('submit', (e) => e.preventDefault());
  calcular();
}
