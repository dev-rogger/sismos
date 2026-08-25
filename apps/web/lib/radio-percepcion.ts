/**
 * Estimación del radio en que un sismo alcanza a sentirse, para dibujar la
 * onda expansiva en el mapa.
 *
 * Usa una IPE (Intensity Prediction Equation) basada en Allen, Wald & Worden
 * (2012), "Intensity attenuation for active crustal regions", J. Seismology
 * 16:409–433 — variante con distancia hipocentral (R_hyp) — con los
 * coeficientes de magnitud y profundidad recalibrados por regresión contra
 * 8.259 reportes reales de USGS "Did You Feel It?" de sismos chilenos
 * (1995–2026). El umbral de "se sintió" es MMI ≥ III, según la relación
 * PGA–MMI de Worden et al. (2012).
 *
 * A diferencia de la curva exponencial que se usaba antes (solo magnitud,
 * calibrada a ojo), este modelo sí toma en cuenta la profundidad, que es lo
 * que explica por qué los sismos intraplaca de profundidad intermedia
 * (60–150 km) se sienten en un área mucho más amplia de lo que sugería la
 * magnitud sola.
 *
 * Sigue siendo una estimación con incertidumbre importante (σ ≈ 0.19 en
 * log10, es decir del orden de ±50% en el radio): no es un ShakeMap ni
 * reemplaza a los sistemas oficiales de intensidad (CSN, USGS).
 */

/** Umbral MMI III: el nivel donde la gente empieza a reportar "sí lo sentí". */
const UMBRAL_MMI_SENTIDO = 3;

/** Profundidad asumida cuando el dato no viene o no es válido. */
const PROFUNDIDAD_POR_DEFECTO_KM = 20;

const RADIO_MINIMO_KM = 10;
const RADIO_MAXIMO_KM = 1500;

/**
 * MMI predicho a una distancia hipocentral dada, para una magnitud y
 * profundidad determinadas.
 */
function mmiPredicho(
  magnitud: number,
  profundidadKm: number,
  distanciaHipocentralKm: number,
): number {
  const rm = -0.209 + 2.042 * Math.exp(magnitud - 5);
  const hAcotada = Math.min(200, Math.max(30, profundidadKm));
  let mmi =
    4.811 +
    1.002 * magnitud +
    0.00749 * (hAcotada - 30) -
    1.402 *
      Math.log(
        Math.sqrt(
          distanciaHipocentralKm * distanciaHipocentralKm + rm * rm,
        ),
      );
  if (distanciaHipocentralKm > 50) {
    mmi += 0.078 * Math.log(distanciaHipocentralKm / 50);
  }
  return mmi;
}

/**
 * Radio (epicentral, en km) hasta donde se estima que el sismo se sintió,
 * dado su magnitud y profundidad. La profundidad es opcional en la práctica:
 * si falta o es inválida se asume un sismo superficial.
 */
export function radioPercepcionKm(
  magnitud: number,
  profundidadKm: number,
): number {
  const m = Math.max(2, magnitud);
  const h =
    Number.isFinite(profundidadKm) && profundidadKm > 0
      ? profundidadKm
      : PROFUNDIDAD_POR_DEFECTO_KM;

  // El MMI predicho es monótonamente decreciente con la distancia, así que
  // basta una bisección para encontrar dónde cruza el umbral de MMI III.
  let bajo = 0.1;
  let alto = 5000;
  for (let i = 0; i < 60 && alto - bajo > 0.5; i += 1) {
    const medio = (bajo + alto) / 2;
    if (mmiPredicho(m, h, medio) >= UMBRAL_MMI_SENTIDO) {
      bajo = medio;
    } else {
      alto = medio;
    }
  }
  const distanciaHipocentralKm = (bajo + alto) / 2;

  // El círculo se dibuja en el mapa centrado en el epicentro, no en el
  // hipocentro: hay que proyectar la distancia hipocentral a la superficie.
  const radioEpicentralKm = Math.sqrt(
    Math.max(distanciaHipocentralKm * distanciaHipocentralKm - h * h, 0),
  );

  return Math.round(
    Math.min(RADIO_MAXIMO_KM, Math.max(RADIO_MINIMO_KM, radioEpicentralKm)),
  );
}
