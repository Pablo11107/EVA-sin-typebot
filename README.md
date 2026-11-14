# EVA sin Typebot

Prototipo de EVA (Emalsa Virtual Assistant) sin ninguna plataforma detrás: un motor de 93 líneas
que recorre el flujo exportado de Typebot y una burbuja de 288 líneas que lo pinta. Sin
dependencias, sin servidor, sin base de datos, sin cuenta en ningún sitio y sin guardar nada.

El flujo (`flujo/eva-chatbot.json`) es el mismo archivo que se revisa y publica en el
[repositorio de EVA](https://github.com/Pablo11107/EVA). Este repositorio no lo edita: lo lee.

| Archivo | Qué es |
|---|---|
| `motor.js` | Lee el flujo y decide qué mostrar en cada paso. Solo entiende texto, botones y redirecciones; con cualquier otro bloque se detiene |
| `eva.js` | La burbuja: Shadow DOM, sin `innerHTML`, enlaces solo a emalsa.es o a los teléfonos oficiales, estilos sin `'unsafe-inline'` |
| `pruebas.mjs` | Recorre todos los caminos del flujo (141 menús) y comprueba que lo que muestra existe tal cual en el flujo; revisa también la burbuja |
| `index.html`, `arranque.js`, `estilo.css` | Página de demostración |
| `flujo/eva-chatbot.json` | Copia del flujo revisado (v9) |
| `capturas/` | Capturas en escritorio y móvil |

## Verlo

La burbuja descarga el flujo, así que hace falta un servidor local (abrir el archivo a pelo no
funciona):

```sh
python3 -m http.server 8000
# y abrir http://localhost:8000/
```

## Probarlo

```sh
node pruebas.mjs
```

Recorre los 141 menús (633 pasos) y comprueba que cada texto, enlace y teléfono existe en el
flujo revisado, que ningún menú se queda sin salida, que una opción que no es un botón se
rechaza y que un bloque de IA en el flujo detiene el motor en vez de ejecutarse. Se ejecuta en
cada push (`.github/workflows/pruebas.yml`).

## Ponerlo en una web

1. Copiar `eva.js`, `motor.js` y `flujo/eva-chatbot.json` a la web (por ejemplo, en `/eva/`).
2. Antes de `</body>`:
   ```html
   <script type="module">
     import { iniciarEVA } from '/eva/eva.js';
     iniciarEVA({ flujo: '/eva/eva-chatbot.json' });
   </script>
   ```
3. Si la web tiene Content-Security-Policy, basta con `script-src 'self'`, `connect-src 'self'`
   e `img-src 'self' data:`. No hace falta `'unsafe-inline'` en navegadores de 2023 en adelante
   (Chrome, Edge, Firefox, Safari 16.4); en los anteriores la burbuja usa una hoja de estilos
   clásica y sí lo necesita.

Opciones de `iniciarEVA`: `flujo` (URL del JSON), `color`, `nombre`, `subtitulo`, `pie`,
`fuente`, `invitacion` (`false` o `{ texto, retraso }`). Devuelve `{ abrir, cerrar, reiniciar }`.

## Actualizar el contenido

Cuando cambie el flujo en el repositorio de EVA (tras pasar su verificador y sus pruebas),
copiar el nuevo `flujo/eva-chatbot.json` aquí, ejecutar `node pruebas.mjs` y volver a subir el
archivo a la web. No hay nada más que publicar.

## Lo que no hace, a propósito

- No guarda conversaciones ni estadísticas. Si hicieran falta, se añadiría un contador anónimo
  de botones pulsados (sin sesión, sin IP, sin cookies); es una decisión de la empresa.
- Los botones «Llamar» muestran un botón con el número en lugar de iniciar la llamada por su
  cuenta: Safari bloquea lo que el usuario no pulsa.
- No tiene editor visual: el contenido se redacta en el archivo del flujo, o en Typebot y se exporta.

## Qué falta antes de producción

Pruebas manuales en Safari y Firefox, una revisión de accesibilidad y una prueba con personas
reales. Está probado con las pruebas automáticas y en Chrome (escritorio y móvil).
