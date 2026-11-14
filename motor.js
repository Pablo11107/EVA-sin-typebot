// Motor de EVA sin Typebot: recorre el flujo exportado (flujo/eva-chatbot.json)
// y dice qué mostrar en cada paso. No sabe nada de pantallas: eso lo hace
// eva.js. Así se puede probar con Node (pruebas.mjs) sin navegador.
//
// Solo entiende los tres tipos de bloque que el verificador del repositorio
// admite: texto, botones y redirección. Si el flujo trajera otro, se detiene
// con un error en vez de improvisar: es la misma garantía que en Typebot,
// sin modelo de lenguaje, sin texto libre y sin variables.

const ADMITIDOS = new Set(['text', 'choice input', 'Redirect']);

export function crearMotor(flujo) {
  const bot = flujo.typebot ?? flujo;
  const grupos = new Map(bot.groups.map((g) => [g.id, g]));
  const aristas = new Map(bot.edges.map((e) => [e.id, e]));
  const inicio = (bot.events ?? []).find((e) => e.type === 'start');
  if (!inicio) throw new Error('el flujo no tiene evento de inicio');

  // Se comprueba todo el flujo al cargarlo, no al llegar a cada bloque: un
  // bloque no admitido en cualquier rincón impide arrancar EVA.
  for (const grupo of bot.groups) {
    for (const bloque of grupo.blocks) {
      if (!ADMITIDOS.has(bloque.type)) throw new Error(`bloque no admitido en «${grupo.title}»: ${bloque.type}`);
    }
  }

  // Dónde espera el flujo una respuesta: el bloque de botones en curso.
  let esperando = null;

  const grupoDestino = (aristaId) => aristas.get(aristaId)?.to?.groupId ?? null;

  // Avanza desde un bloque hasta el siguiente bloque de botones, o hasta el final.
  function recorrer(grupoId, indice = 0) {
    const salida = { mensajes: [], botones: null, redireccion: null, fin: false };
    let grupo = grupos.get(grupoId);
    let i = indice;
    while (grupo && i < grupo.blocks.length) {
      const bloque = grupo.blocks[i];
      if (bloque.type === 'text') {
        salida.mensajes.push(bloque.content?.richText ?? []);
      } else if (bloque.type === 'choice input') {
        salida.botones = bloque.items.map((it) => ({ id: it.id, texto: it.content }));
        esperando = { grupoId: grupo.id, bloqueId: bloque.id };
        return salida;
      } else if (bloque.type === 'Redirect') {
        salida.redireccion = bloque.options?.url ?? null;
      } else {
        throw new Error(`bloque no admitido en «${grupo.title}»: ${bloque.type}`);
      }
      if (bloque.outgoingEdgeId) {
        grupo = grupos.get(grupoDestino(bloque.outgoingEdgeId));
        i = 0;
      } else {
        i++;
      }
    }
    esperando = null;
    salida.fin = true;
    return salida;
  }

  return {
    iniciar() {
      esperando = null;
      return recorrer(grupoDestino(inicio.outgoingEdgeId));
    },

    // itemId es el identificador del botón pulsado. Cualquier otra cosa se rechaza.
    responder(itemId) {
      if (!esperando) return { error: 'no hay ninguna pregunta pendiente' };
      const grupo = grupos.get(esperando.grupoId);
      const indice = grupo.blocks.findIndex((b) => b.id === esperando.bloqueId);
      const bloque = grupo.blocks[indice];
      const item = bloque.items.find((it) => it.id === itemId);
      if (!item) return { error: 'opción no válida' };
      const destino = grupoDestino(item.outgoingEdgeId);
      const salida = destino ? recorrer(destino) : recorrer(grupo.id, indice + 1);
      return { eleccion: item.content, ...salida };
    },

    get esperando() {
      return esperando;
    },
  };
}

// Aplana el texto enriquecido de Typebot a texto plano (para pruebas y lectores de pantalla).
export function richTextATexto(nodos) {
  return (nodos ?? [])
    .map((n) => ('text' in n ? n.text : richTextATexto(n.children)) + (n.type === 'p' ? '\n' : ''))
    .join('')
    .trim();
}

// Todas las URL de los enlaces de un texto enriquecido.
export function enlaces(nodos) {
  const salida = [];
  for (const n of nodos ?? []) {
    if (n.type === 'a' && n.url) salida.push(n.url);
    salida.push(...enlaces(n.children));
  }
  return salida;
}
