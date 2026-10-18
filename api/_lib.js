// api/_lib.js
// Lógica compartida de Astrotipo. El "_" del nombre hace que Vercel no lo
// publique como una ruta.
import * as Astronomy from "astronomy-engine";

// ─── Precio ──────────────────────────────────────────────────────────────────
// El precio lo fija el servidor. Si lo cambiás, cambialo también en index.html
// (CONFIG.precio), que es solo lo que se muestra en pantalla.
export const PRECIO = 6000;

export const BASE_URL = process.env.BASE_URL || "https://www.astrotipo.com.ar";

// ─── Token del pago ──────────────────────────────────────────────────────────
// Viaja como external_reference de Mercado Pago (máximo 256 caracteres).
// Es base64url de un JSON corto:
//   n nombre · e email · t eneatipo · w ala · i instinto (sp/so/sx)
//   u fecha y hora de nacimiento en UTC (minutos desde 1970) · h 1 si sabe la hora
//   la, lo latitud y longitud · c ciudad (solo para mostrar)
const INSTINTOS = { sp: "Autoconservación", so: "Social", sx: "Uno a uno" };

export function decodificarToken(raw) {
  try {
    const tok = decodeURIComponent(String(raw || "")).replace(/-/g, "+").replace(/_/g, "/");
    if (!tok) return null;
    const p = JSON.parse(Buffer.from(tok, "base64").toString("utf-8"));
    const t = Number(p.t), w = Number(p.w), u = Number(p.u), la = Number(p.la), lo = Number(p.lo);
    if (!(t >= 1 && t <= 9) || !(w >= 1 && w <= 9) || !INSTINTOS[p.i]) return null;
    if (!Number.isFinite(u) || !(la >= -90 && la <= 90) || !(lo >= -180 && lo <= 180)) return null;
    const nombre = String(p.n || "").replace(/[<>]/g, "").trim().slice(0, 40);
    if (!nombre) return null;
    return {
      nombre, email: p.e ? String(p.e).trim().toLowerCase().slice(0, 120) : "",
      eneatipo: t, ala: w, instinto: p.i, instintoNombre: INSTINTOS[p.i],
      u, conHora: p.h === 1 || p.h === "1", la, lo,
      ciudad: String(p.c || "").replace(/[<>]/g, "").slice(0, 40),
    };
  } catch {
    return null;
  }
}

// ─── Carta natal ─────────────────────────────────────────────────────────────
const SIGNOS = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"];
const ELEMENTOS = ["Fuego", "Tierra", "Aire", "Agua"];
const CUERPOS = [["Mercurio", "Mercury"], ["Venus", "Venus"], ["Marte", "Mars"], ["Júpiter", "Jupiter"], ["Saturno", "Saturn"], ["Urano", "Uranus"], ["Neptuno", "Neptune"], ["Plutón", "Pluto"]];
const rad = Math.PI / 180, deg = 180 / Math.PI;
const norm = x => ((x % 360) + 360) % 360;

function signo(lon) {
  const l = norm(lon), i = Math.floor(l / 30), d = l - i * 30;
  return { lon: Math.round(l * 100) / 100, i, signo: SIGNOS[i], g: Math.floor(d), m: Math.floor((d % 1) * 60) };
}
function lunaEn(date) { return Astronomy.EclipticGeoMoon(Astronomy.MakeTime(date)).lon; }

// Misma cuenta que hace la página. Si no hay hora, la página manda el mediodía local.
export function calcularCarta({ u, conHora, la, lo }) {
  const date = new Date(u * 60000);
  const t = Astronomy.MakeTime(date);
  const lon = { Sol: Astronomy.SunPosition(t).elon, Luna: Astronomy.EclipticGeoMoon(t).lon };
  for (const [n, b] of CUERPOS) lon[n] = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[b], t, true)).elon;
  const puntos = {};
  for (const k in lon) puntos[k] = signo(lon[k]);
  let asc = null, mc = null, lunaAlt = null;
  if (conHora) {
    const eps = Astronomy.e_tilt(t).tobl * rad, ramc = norm(Astronomy.SiderealTime(t) * 15 + lo) * rad, phi = la * rad;
    asc = signo(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * deg);
    mc = signo(Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) * deg);
  } else {
    const a = signo(lunaEn(new Date((u - 720) * 60000))), b = signo(lunaEn(new Date((u + 719) * 60000)));
    if (a.i !== b.i) lunaAlt = [a.signo, b.signo];
  }
  const PESOS = { Sol: 3, Luna: 3, Mercurio: 1.5, Venus: 1.5, Marte: 1.5, "Júpiter": 1, Saturno: 1 };
  const e = [0, 0, 0, 0];
  for (const k in PESOS) e[puntos[k].i % 4] += PESOS[k];
  if (asc) e[asc.i % 4] += 2;
  const tot = e.reduce((x, y) => x + y, 0);
  const elementos = e.map(v => Math.round(v / tot * 100));
  const dom = e.indexOf(Math.max(...e));
  return { puntos, asc, mc, lunaAlt, conHora: !!conHora, elementos, elementoDominante: ELEMENTOS[dom], dom };
}

const fmt = p => `${p.signo} ${p.g}°${String(p.m).padStart(2, "0")}′`;
function cartaEnTexto(c) {
  const l = [];
  l.push(`- Sol: ${fmt(c.puntos.Sol)}`);
  l.push(c.lunaAlt ? `- Luna: cambió de signo ese día; puede estar en ${c.lunaAlt[0]} o en ${c.lunaAlt[1]} (sin hora no se sabe)` : `- Luna: ${fmt(c.puntos.Luna)}`);
  l.push(c.asc ? `- Ascendente: ${fmt(c.asc)}` : `- Ascendente: no disponible (no sabe su hora de nacimiento)`);
  if (c.mc) l.push(`- Medio Cielo: ${fmt(c.mc)}`);
  for (const k of ["Mercurio", "Venus", "Marte", "Júpiter", "Saturno", "Urano", "Neptuno", "Plutón"]) l.push(`- ${k}: ${fmt(c.puntos[k])}`);
  l.push(`- Balance de elementos: ${ELEMENTOS.map((n, i) => `${n} ${c.elementos[i]}%`).join(", ")} (predomina ${c.elementoDominante})`);
  return l.join("\n");
}

// ─── Reporte con IA ──────────────────────────────────────────────────────────
const NOMBRES_TIPO = { 1: "El Reformador", 2: "El Ayudador", 3: "El Triunfador", 4: "El Individualista", 5: "El Investigador", 6: "El Leal", 7: "El Entusiasta", 8: "El Desafiador", 9: "El Pacificador" };
export { NOMBRES_TIPO };

export async function generarReporte(perfil, carta) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY");
  const { nombre, eneatipo, ala, instintoNombre } = perfil;
  const prompt = `Vas a redactar un reporte de personalidad que integra el Eneagrama (escuela Riso-Hudson) y la carta natal (astrología tropical, signos y planetas) para ${nombre}.

ENEAGRAMA (resultado de su test):
- Eneatipo: Tipo ${eneatipo} (${NOMBRES_TIPO[eneatipo]})
- Ala: ${ala}
- Instinto dominante: ${instintoNombre}

CARTA NATAL (calculada con su fecha, hora y lugar de nacimiento):
${cartaEnTexto(carta)}

LA IDEA CENTRAL: la carta describe el temperamento (cómo siente, cómo se muestra, a qué ritmo hace las cosas) y el eneatipo describe la motivación de fondo (qué busca sin darse cuenta y qué teme perder). El valor del reporte está en CRUZARLOS: explicar cómo esta carta concreta cambia la forma en que se expresa este eneatipo concreto. Evitá describir por separado lo que cualquier libro dice del signo o del tipo: cada párrafo tiene que hablar de la combinación.

ESTRUCTURA OBLIGATORIA (usá solo etiquetas HTML <h3>, <p>, <ul>, <li>, <strong>, <blockquote> y el <div class="clave"> indicado):
1. <h3>Tu núcleo: Tipo ${eneatipo} con ala ${ala}</h3>
   Su herida de origen, su deseo fundamental, su miedo básico y cómo el ala modifica el tipo. Después del primer párrafo incluí exactamente:
   <div class="clave"><p><strong>Deseo fundamental</strong>...</p><p><strong>Miedo básico</strong>...</p></div>
2. <h3>Tus tres pilares</h3>
   Sol, Luna y Ascendente, cada uno en un párrafo que empiece con <strong>Sol en ...</strong>, explicado para un Tipo ${eneatipo}. ${carta.asc ? "" : "Sin hora no hay Ascendente: decilo en una oración y explicá que con la hora se puede sumar."}${carta.lunaAlt ? " La Luna puede estar en dos signos: describí brevemente las dos posibilidades." : ""}
3. <h3>Dónde se cruzan</h3>
   La sección más importante y la más larga (4 o 5 párrafos). Cómo su carta potencia, suaviza o contradice su eneatipo. Mencioná al menos un punto de tensión concreto (por ejemplo, un Sol o una Luna que empujan en sentido contrario a su motivación de fondo) y cómo se vive en el día a día. Usá también el balance de elementos.
4. <h3>Tu instinto: ${instintoNombre}</h3>
   Cómo su instinto dominante cambia la forma en que se expresa su tipo, y qué planeta de su carta lo refuerza.
5. <h3>Cómo pensás, amás y actuás</h3>
   Mercurio, Venus y Marte: un párrafo de 4 o 5 oraciones para cada uno, siempre leído desde su eneatipo (por ejemplo, cómo un Tipo ${eneatipo} usa ese Mercurio para protegerse o para conseguir lo que busca).
6. <h3>Tu sombra</h3>
   Su mecanismo de defensa principal (nombralo y explicá cómo funciona con un ejemplo cotidiano), cómo reacciona bajo estrés (dirección de desintegración del eneagrama), qué señales le avisan que está entrando en ese modo y qué papel juega su Saturno. Dos o tres párrafos.
7. <h3>Tu camino de crecimiento</h3>
   Hacia dónde crece en su mejor versión (dirección de integración), cómo se ve eso en situaciones concretas de su vida (trabajo, pareja, amistades) y dónde su Júpiter le facilita ese crecimiento. Dos o tres párrafos.
8. <h3>Tus vínculos</h3>
   Su eneatipo más compatible y por qué se complementan; con qué tipo suele tener más fricción y cómo manejarla; con qué elementos y signos fluye más según su Venus y su Luna; qué necesita de una pareja o de un amigo para sentirse bien, y qué suele hacer sin darse cuenta que aleja a los demás. Dos o tres párrafos.
9. <h3>Prácticas para tu día a día</h3>
   Una lista <ul> con 5 prácticas pensadas para la combinación de SU tipo y SU carta. Cada práctica empieza con su nombre en <strong>, y explica en 2 o 3 oraciones qué hacer, cuándo (en qué situación de su día o ante qué señal) y por qué le sirve a alguien con su combinación. Nada genérico como "meditá", "hacé ejercicio" o "llevá un diario" sin decir exactamente cómo y para qué en su caso.

EXTENSIÓN: entre 1600 y 2000 palabras en total. Cada sección tiene que aportar algo que la persona no leería en una descripción genérica de su signo o de su tipo.

FORMATO:
- En el cuadro de Deseo fundamental y Miedo básico, no pongas dos puntos después del <strong>: el texto sigue directo.
- En cada sección incluí una sola frase clave, breve y memorable, dentro de <blockquote>...</blockquote>.
- No uses <h1>, <h2>, estilos en línea, emojis ni bloques de código.
- Los planetas lentos (Urano, Neptuno, Plutón) los comparte con su generación: no les des peso personal.

TONO: español rioplatense con voseo en TODOS los verbos (sentís, tenés, podés). Cálido, preciso y concreto, como un buen terapeuta que además sabe astrología. Nada de frases de horóscopo ni predicciones: es una herramienta de autoconocimiento, no de adivinación. Hablale a ${nombre} en segunda persona.`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Sos un psicoterapeuta experto en Eneagrama (Riso-Hudson) y en astrología psicológica. Escribís en español rioplatense con voseo." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4500,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("OpenAI error: " + JSON.stringify(j).slice(0, 300));
  const html = j?.choices?.[0]?.message?.content;
  if (!html) throw new Error("OpenAI no devolvió reporte");
  return limpiarHtml(html);
}

// Solo deja pasar las etiquetas que el reporte usa
function limpiarHtml(html) {
  return String(html)
    .replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "")
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(?!\/?(h3|p|ul|li|strong|em|blockquote|div)\b)[^>]*>/gi, "")
    .replace(/<(h3|p|ul|li|strong|em|blockquote)\s[^>]*>/gi, "<$1>")
    .replace(/<div(?![^>]*class="clave")[^>]*>/gi, "<div>")
    // En los cuadros de deseo y miedo, "<strong>Deseo fundamental</strong>: texto" → sin los dos puntos sueltos
    .replace(/<div class="clave">[\s\S]*?<\/div>/g, b => b.replace(/<\/strong>\s*[:\-–—]\s*/g, "</strong>"));
}

// ─── Adelanto gratis con IA ──────────────────────────────────────────────────
export async function generarAdelanto(perfil, carta) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY");
  const luna = carta.lunaAlt ? `${carta.lunaAlt[0]} o ${carta.lunaAlt[1]}` : carta.puntos.Luna.signo;
  const prompt = `Escribí un ADELANTO GRATUITO de un reporte de personalidad para ${perfil.nombre}, que cruza su carta natal con su Eneagrama.

DATOS QUE PODÉS MENCIONAR: Sol en ${carta.puntos.Sol.signo}, Luna en ${luna}${carta.asc ? `, Ascendente en ${carta.asc.signo}` : ""}, predomina el elemento ${carta.elementoDominante}.
DATOS INTERNOS QUE NO PODÉS MENCIONAR NI INSINUAR: Tipo ${perfil.eneatipo} del Eneagrama, ala ${perfil.ala}, instinto ${perfil.instintoNombre}.

REGLAS:
1. Nunca nombres el número del eneatipo, el nombre del tipo (Reformador, Ayudador, Triunfador, Individualista, Investigador, Leal, Entusiasta, Desafiador, Pacificador), el ala ni el instinto.
2. Mostrá cómo su Sol o su Luna se combinan con su motivación de fondo, descripta con palabras propias, en un patrón que probablemente reconozca.
3. Un solo párrafo de 3 oraciones, entre 50 y 70 palabras, en segunda persona.
4. Terminá con una oración que genere curiosidad por lo que todavía no sabe, sin hablar de precios ni pagos.
5. Español rioplatense con voseo en todos los verbos. Sin títulos, listas ni markdown. Nada de frases de horóscopo.`;
  const prohibido = /\b(eneatipo|tipo|ala)\s*(n[uú]mero\s*)?[1-9]\b|reformador|ayudador|triunfador|individualista|investigador|\bleal(es)?\b|entusiasta|desafiador|pacificador|autoconservaci|instinto (social|sexual)|subtipo/i;
  async function pedir(extra) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.8, max_tokens: 260, messages: [{ role: "user", content: prompt + (extra || "") }] }),
        signal: ctrl.signal,
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j && j.error && j.error.message) || "OpenAI error");
      return String(j?.choices?.[0]?.message?.content || "").trim();
    } finally { clearTimeout(to); }
  }
  let texto = await pedir();
  if (prohibido.test(texto)) texto = await pedir("\n\nIMPORTANTE: tu respuesta anterior mencionaba el tipo, el ala o el instinto. Reescribila sin ninguna de esas referencias.");
  if (prohibido.test(texto)) texto = texto.split(/(?<=[.!?])\s+/).filter(o => !prohibido.test(o)).join(" ");
  texto = texto.replace(/[#*_`<>]/g, "").trim();
  if (texto.length < 60) throw new Error("Adelanto demasiado corto");
  return texto;
}

// ─── Brevo ───────────────────────────────────────────────────────────────────
// Atributos propios de Astrotipo (hay que crearlos en Brevo, tipo Texto):
//   ASTRO_LINK   link personal para volver a la pantalla de pago
//   ASTRO_COMPRO "SI" cuando compró (corta la secuencia de emails)
//   ASTRO_PAGO   id del último pago cuyo reporte ya se mandó (evita duplicados)
// NOMBRE se comparte con MiEneatipo.
const brevoKey = () => process.env.BREVO_API_KEY;
const emailNorm = e => String(e || "").trim().toLowerCase();

export async function guardarContacto(email, atributos, listIds) {
  const apiKey = brevoKey();
  if (!apiKey || !email) return false;
  try {
    const r = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ email: emailNorm(email), updateEnabled: true, attributes: atributos, ...(listIds ? { listIds } : {}) }),
    });
    if (r.status === 201 || r.status === 204) return true;
    console.error("Brevo rechazó el contacto:", r.status, await r.text().catch(() => ""));
    return false;
  } catch (e) {
    console.error("Error llamando a Brevo:", e && e.message);
    return false;
  }
}

export async function reporteYaEnviado(email, paymentId) {
  const apiKey = brevoKey();
  if (!apiKey || !email) return false;
  try {
    const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(emailNorm(email))}`, { headers: { "api-key": apiKey } });
    if (!r.ok) return false;
    const j = await r.json();
    return String((j.attributes || {}).ASTRO_PAGO || "") === String(paymentId);
  } catch { return false; }
}
export const marcarReporteEnviado = (email, paymentId) => guardarContacto(email, { ASTRO_PAGO: String(paymentId || "") });

export async function marcarComprador(emails) {
  const apiKey = brevoKey();
  if (!apiKey) return;
  for (const email of [...new Set((emails || []).filter(Boolean).map(emailNorm))]) {
    try {
      const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({ attributes: { ASTRO_COMPRO: "SI" } }),
      });
      if (r.status !== 204 && r.status !== 404) console.error("Brevo no marcó comprador:", r.status, await r.text().catch(() => ""));
    } catch (e) { console.error("Error marcando comprador:", e && e.message); }
  }
}

export function ocultarEmail(email) {
  const [u, d] = emailNorm(email).split("@");
  if (!u || !d) return null;
  return u.slice(0, 2) + "***@" + d;
}

// ─── Email del reporte ───────────────────────────────────────────────────────
const esc = s => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const AZUL = "#14213D", ROJO = "#B23A2C", GRIS = "#3A4256", FONDO = "#EDF0F4";

// Los programas de email no leen las clases del sitio: los estilos van en línea.
function reporteParaEmail(html) {
  let n = 0;
  return String(html)
    .replace(/<div class="clave">([\s\S]*?)<\/div>/g, (_, dentro) => dentro.replace(/<p>([\s\S]*?)<\/p>/g, (__, txt) =>
      `<div style="background:${FONDO};border-radius:10px;padding:12px 14px;margin:0 0 8px 0;font-size:15px;line-height:1.5;color:${GRIS};">` +
      txt.replace(/<strong>/, `<strong style="display:block;font-size:13px;color:${ROJO};margin-bottom:3px;">`) + `</div>`))
    .replace(/<h3>/g, () => `<h3 style="font-family:Georgia,serif;font-weight:normal;font-size:21px;line-height:1.3;color:${AZUL};margin:30px 0 12px 0;padding-top:18px;border-top:1px solid #DDE2EA;"><span style="font-family:Arial,sans-serif;font-size:13px;color:${ROJO};margin-right:8px;">${String(++n).padStart(2, "0")}</span>`)
    .replace(/<blockquote>/g, `<blockquote style="margin:18px 0;padding:2px 0 2px 14px;border-left:2px solid ${ROJO};font-family:Georgia,serif;font-style:italic;font-size:18px;line-height:1.5;color:${AZUL};">`)
    .replace(/<p>/g, `<p style="margin:0 0 14px 0;font-size:16px;line-height:1.65;color:${GRIS};">`)
    .replace(/<ul>/g, `<ul style="margin:0 0 14px 0;padding-left:20px;">`)
    .replace(/<li>/g, `<li style="margin:0 0 8px 0;font-size:16px;line-height:1.55;color:${GRIS};">`)
    .replace(/<strong>/g, `<strong style="color:${AZUL};">`);
}

export async function enviarReportePorEmail({ perfil, carta, reporte }) {
  const apiKey = brevoKey();
  const email = perfil.email;
  if (!apiKey || !email) return false;
  const chip = t => `<span style="display:inline-block;border:1px solid rgba(255,255,255,0.35);color:#ffffff;font-size:13px;padding:4px 10px;border-radius:12px;margin:0 4px 4px 0;">${esc(t)}</span>`;
  const luna = carta.lunaAlt ? carta.lunaAlt.join("/") : carta.puntos.Luna.signo;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${FONDO};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="background:${AZUL};padding:26px 28px;">
  <div style="font-size:13px;color:#AEB8CC;margin-bottom:4px;">Astrotipo</div>
  <div style="font-family:Georgia,serif;font-size:26px;color:#ffffff;margin-bottom:12px;">El mapa de ${esc(perfil.nombre)}</div>
  ${chip("Tipo " + perfil.eneatipo + " · " + NOMBRES_TIPO[perfil.eneatipo])}${chip("Ala " + perfil.ala)}${chip(perfil.instintoNombre)}<br>
  ${chip("Sol " + carta.puntos.Sol.signo)}${chip("Luna " + luna)}${carta.asc ? chip("Asc " + carta.asc.signo) : ""}
</td></tr>
<tr><td style="padding:26px 28px 8px 28px;">
  <p style="margin:0 0 6px 0;font-size:16px;line-height:1.6;color:${GRIS};">Hola ${esc(perfil.nombre)},</p>
  <p style="margin:0 0 4px 0;font-size:16px;line-height:1.6;color:${GRIS};">Gracias por tu compra. Acá tenés tu reporte completo. Guardá este email: es tu copia para volver a leerlo cuando quieras.</p>
  ${reporteParaEmail(reporte)}
</td></tr>
<tr><td style="padding:18px 28px 26px 28px;border-top:1px solid #DDE2EA;font-size:13px;line-height:1.6;color:#7A8296;">
  Tenés garantía de 7 días: si el reporte no te aporta valor, respondé este email y te devolvemos el 100%.<br>
  Astrotipo · <a href="${BASE_URL}" style="color:${AZUL};">astrotipo.com.ar</a>
</td></tr>
</table></td></tr></table></body></html>`;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { name: "Astrotipo", email: process.env.EMAIL_REMITENTE || "hola@astrotipo.com.ar" },
        to: [{ email: emailNorm(email), name: perfil.nombre }],
        replyTo: { email: process.env.EMAIL_RESPUESTA || "yannittojorge@gmail.com", name: "Astrotipo" },
        subject: `Tu reporte Astrotipo: Tipo ${perfil.eneatipo} con Sol en ${carta.puntos.Sol.signo}`,
        htmlContent: html,
        tags: ["reporte-astrotipo"],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (r.status === 201 || r.status === 200) return true;
    console.error("Brevo no envió el reporte:", r.status, await r.text().catch(() => ""));
    return false;
  } catch (e) {
    console.error("Error enviando el reporte:", e && e.message);
    return false;
  }
}

// ─── Mercado Pago ────────────────────────────────────────────────────────────
export async function consultarPago(id) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("Falta MP_ACCESS_TOKEN");
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok) throw new Error("Mercado Pago: " + JSON.stringify(j).slice(0, 200));
  return j;
}
export const pagoValido = p => p.status === "approved" && p.currency_id === "ARS" && Number(p.transaction_amount) >= PRECIO;
