// Arranque de la página de demostración: la burbuja con el flujo del repositorio.
import { iniciarEVA } from './eva.js';

const eva = await iniciarEVA({ flujo: 'flujo/eva-chatbot.json' });
document.getElementById('abrir')?.addEventListener('click', () => eva.abrir());
