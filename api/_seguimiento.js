// api/_seguimiento.js
// Seguimiento por email a quienes terminaron el test y no compraron.
// Lo corre una vez por día /api/seguimiento (cron de Vercel).
//
// Estado de cada contacto en Brevo:
//   ASTRO_FECHA  fecha en que terminó el test (la guarda /api/save_lead)
//   ASTRO_PASO   último email del seguimiento que recibió (0, 1, 2, 3)
//   ASTRO_ENVIO  fecha de ese último email
// Si compra (ASTRO_COMPRO = SI) o se da de baja, no recibe nada más.
import { createHash, createHmac } from "node:crypto";
import { BASE_URL, calcularCarta } from "./_lib.js";

// Interruptor general: hasta que Jor apruebe los textos, solo simula (no manda nada).
export const ACTIVO = false;
// Tope por corrida: el plan gratis de Brevo permite 300 emails por día entre las dos páginas.
export const TOPE_DIARIO = 120;
// El tercer email (cierre) depende de la decisión de precio de lanzamiento.
export const EMAIL3_ACTIVO = false;

const AZUL = "#14213D", ROJO = "#B23A2C", GRIS = "#3A4256", FONDO = "#EDF0F4";
const esc = s => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const emailNorm = e => String(e || "").trim().toLowerCase();

// ─── Baja ────────────────────────────────────────────────────────────────────
function claveBaja() { return createHash("sha256").update("baja-astrotipo:" + (process.env.BREVO_API_KEY || "")).digest(); }
export function firmaBaja(email) { return createHmac("sha256", claveBaja()).update(emailNorm(email)).digest("base64url").slice(0, 22); }
export const linkBaja = email => `${BASE_URL}/api/baja?e=${encodeURIComponent(emailNorm(email))}&k=${firmaBaja(email)}`;

// ─── Datos del contacto ──────────────────────────────────────────────────────
// El link personal (ASTRO_LINK) trae el resultado del test: de ahí sale la carta para personalizar.
export function datosDelLink(link) {
  try {
    const r = new URL(link).searchParams.get("r");
    if (!r) return null;
    const d = JSON.parse(Buffer.from(r.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
    if (!Number.isFinite(+d.u) || !Number.isFinite(+d.la) || !Number.isFinite(+d.lo)) return null;
    const carta = calcularCarta({ u: +d.u, conHora: d.h === 1, la: +d.la, lo: +d.lo });
    return { sol: carta.puntos.Sol.signo, luna: carta.lunaAlt ? null : carta.puntos.Luna.signo, asc: carta.asc ? carta.asc.signo : null };
  } catch { return null; }
}
const linkConEmail = (link, paso) => {
  try { const u = new URL(link); u.searchParams.set("utm_content", "seguimiento_" + paso); return u.toString(); } catch { return BASE_URL; }
};

// ─── Plantilla ───────────────────────────────────────────────────────────────
function plantilla({ email, previa, cuerpo, boton, link }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${FONDO};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(previa)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="background:${AZUL};padding:18px 28px;font-family:Georgia,serif;font-size:20px;color:#ffffff;">Astrotipo</td></tr>
<tr><td style="padding:26px 28px 6px 28px;font-size:16px;line-height:1.65;color:${GRIS};">${cuerpo}</td></tr>
<tr><td style="padding:10px 28px 26px 28px;">
  <a href="${esc(link)}" style="display:inline-block;background:${ROJO};color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 26px;border-radius:999px;">${esc(boton)}</a>
  <p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:#7A8296;">Pago único · Llega por email y en PDF · Garantía de 7 días</p>
</td></tr>
<tr><td style="padding:16px 28px 22px 28px;border-top:1px solid #DDE2EA;font-size:12px;line-height:1.6;color:#7A8296;">
  Recibís este email porque hiciste el test en <a href="${BASE_URL}" style="color:${AZUL};">astrotipo.com.ar</a>.
  Si no querés recibir más, <a href="${esc(linkBaja(email))}" style="color:#7A8296;">date de baja acá</a>.
</td></tr>
</table></td></tr></table></body></html>`;
}

const p = t => `<p style="margin:0 0 14px 0;">${t}</p>`;
const li = t => `<li style="margin:0 0 8px 0;">${t}</li>`;

export function armarEmail(paso, { email, nombre, link }) {
  const n = esc(String(nombre || "").trim().split(/\s+/)[0] || "");
  const hola = n ? `Hola ${n},` : "Hola,";
  const c = datosDelLink(link) || {};
  const url = linkConEmail(link, paso);

  if (paso === 1) {
    const cielo = c.sol ? ` (Sol en ${esc(c.sol)}${c.luna ? `, Luna en ${esc(c.luna)}` : ""}${c.asc ? `, Ascendente en ${esc(c.asc)}` : ""})` : "";
    return {
      asunto: n ? `${n}, tu reporte quedó listo para abrir` : "Tu reporte Astrotipo quedó listo para abrir",
      html: plantilla({
        email, link: url, boton: "Ver mi reporte",
        previa: "Tu carta natal y tu eneatipo ya están cruzados. Falta un solo paso.",
        cuerpo: p(hola) +
          p(`Hace poco respondiste las 31 situaciones del test y cargaste tus datos de nacimiento. Con eso ya calculamos tu carta${cielo} y encontramos tu eneatipo.`) +
          p("Lo único que falta es abrirlo. En tu reporte vas a encontrar:") +
          `<ul style="margin:0 0 14px 0;padding-left:20px;">` +
          li("Tu eneatipo, tu ala y tu instinto, con tu miedo de fondo y tu deseo fundamental.") +
          li("Cómo tu Sol, tu Luna y tu Ascendente modulan ese tipo, punto por punto.") +
          li("Hacia dónde vas bajo estrés, cómo es tu mejor versión y prácticas pensadas para tu combinación.") +
          `</ul>` +
          p("Tu resultado quedó guardado: el botón te lleva directo a él, sin repetir el test."),
      }),
    };
  }

  if (paso === 2) {
    const ancla = c.luna ? `Tu Luna en ${esc(c.luna)}` : c.sol ? `Tu Sol en ${esc(c.sol)}` : "Tu carta natal";
    const verbo = c.luna ? "dice cómo reaccionás cuando algo te mueve por dentro" : c.sol ? "dice mucho de cómo te mostrás" : "dice mucho de cómo sos";
    return {
      asunto: c.luna ? `Lo que tu Luna en ${c.luna} no explica sola` : "Lo que tu signo no explica solo",
      html: plantilla({
        email, link: url, boton: "Abrir mi reporte",
        previa: "Dos personas con la misma carta pueden reaccionar igual por motivos opuestos.",
        cuerpo: p(hola) +
          p(`${ancla} ${verbo}. Pero no dice por qué esa reacción aparece justo ahí, ni qué está cuidando.`) +
          p("Eso lo responde tu eneatipo. Dos personas con la misma carta pueden reaccionar igual por motivos opuestos: una para no perder su seguridad, otra para no perder su imagen, otra para no perder su libertad.") +
          p("Tu reporte junta las dos cosas: lo que marcó tu cielo al nacer y lo que te mueve sin que te des cuenta. Está escrito con tu nombre, tus datos de nacimiento y tus respuestas.") +
          p("Si tenés alguna duda antes de abrirlo, respondé este email y te contestamos."),
      }),
    };
  }

  // paso 3: cierre (texto pendiente de la decisión de precio de lanzamiento)
  return null;
}

// ─── Quién recibe qué ────────────────────────────────────────────────────────
const dia = d => (d ? String(d).slice(0, 10) : "");
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function siguientePaso(attrs, hoy) {
  const a = attrs || {};
  if (String(a.ASTRO_COMPRO || "").toUpperCase() === "SI") return 0;
  if (!a.ASTRO_LINK || !/[?&]r=/.test(String(a.ASTRO_LINK))) return 0;
  const paso = Number(a.ASTRO_PASO) || 0;
  const fecha = dia(a.ASTRO_FECHA), envio = dia(a.ASTRO_ENVIO);
  if (paso === 0) return !fecha || diasEntre(fecha, hoy) >= 1 ? 1 : 0;   // el día siguiente al test
  if (paso === 1) return !envio || diasEntre(envio, hoy) >= 1 ? 2 : 0;   // un día después del primero
  if (paso === 2) return EMAIL3_ACTIVO && (!envio || diasEntre(envio, hoy) >= 2) ? 3 : 0; // dos días después
  return 0;
}
