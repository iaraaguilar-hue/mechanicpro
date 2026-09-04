# 🎬 `render/` — el set de filmación de Mechanic Pro

No es parte de la app. Es una página aparte que **monta los componentes reales de MP con
datos de prueba** para sacarlos como imagen o como capa animada de video.

> **La idea es de Iara (26-ago-2026):** *"no es que necesitamos tener un screenshot; podés
> generar animaciones con el código de la aplicación de Mechanic Pro directamente."*

## Por qué, y no un screenshot

| Screenshot | Componente real renderizado |
|---|---|
| Resolución fija, se pixela al agrandar | Se renderiza al tamaño que quieras, nítido siempre |
| Estático: animarlo es recortarlo a mano | Se anima de verdad (el gráfico se dibuja, la fila entra) |
| Muestra los datos que había ese día | 🚩 **Datos de prueba siempre. Nunca un cliente real** |
| Envejece cuando cambia la app | Siempre es el producto de HOY: sale del mismo código que está en producción |

## Cómo se usa

```bash
# a ojo, en el navegador
npx vite --config vite.config.render.ts        # http://localhost:5199/?c=metrics

# a imagen / a secuencia de video (levanta el server solo)
node ~/Documents/estudio_iara/tools/edicion/mp_capa_datos.mjs metrics salida.png --escala 2
node ~/Documents/estudio_iara/tools/edicion/mp_capa_datos.mjs metrics carpeta/ --dur 2 --fps 30
```

`?c=` elige el componente: `metrics` (ExpertMetrics, los números del taller) · `orden`
(JobCard, la orden de trabajo). `?fondo=transparente` (default, para superponer al video) o
`claro`. La secuencia sale con el mismo contrato que el resto del motor de edición
(`f00000.png` + `concat.txt`), así que la consume el mismo ffmpeg.

## Las dos piezas que lo hacen posible

1. **`stubs/supabase.ts`** — el módulo real hace `throw` si faltan las variables de entorno,
   así que **cualquier componente que arrastre la base en su cadena de imports no se podía
   montar afuera de la app** (ExpertMetrics importa `getSemanticCategory` de `pages/Metrics`,
   que importa supabase). El stub devuelve vacío y no falla nunca.
2. **`vite.config.render.ts`** — cambia el root a esta carpeta y aliasea el stub. El alias
   específico va **antes** del genérico `@`, porque Vite resuelve en orden.

## Ojo

- **Tailwind no escanea esta carpeta** (`tailwind.config.cjs` → `content` solo mira `src/`).
  Los estilos de la página de render van inline; las clases las traen los componentes.
- El capturador tiene un candado: **si un texto queda cortado, la captura falla.** Nació de
  un defecto real — el eje del gráfico de ingresos decía `$340k` en el DOM y en pantalla se
  leía `40k`. Ver el comentario en `ExpertMetrics.tsx`.
