// api/save_lead.js
// Guarda en Brevo a quien terminó el test y lo suma a la lista de Astrotipo
// (la que dispara la secuencia de emails).
import { guardarContacto, BASE_URL } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, nombre, r } = req.body || {};
  if (!email || !nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return res.status(400).json({ error: "Faltan campos requeridos" });
  }

  const listId = Number(process.env.BREVO_LIST_ID);
  if (!listId) {
    console.error("Falta BREVO_LIST_ID en Vercel: el contacto no se guarda en ninguna lista");
  }

  // Link personal para los emails: vuelve a la pantalla de pago con su resultado
  // cargado, sin repetir el test.
  const rLimpio = /^[A-Za-z0-9_-]{10,900}$/.test(String(r || "")) ? String(r) : "";
  const link = rLimpio ? `${BASE_URL}/?r=${rLimpio}&utm_source=brevo&utm_medium=email&utm_campaign=secuencia_astrotipo` : BASE_URL;

  const ok = await guardarContacto(String(email), {
    NOMBRE: String(nombre).trim().slice(0, 60),
    ASTRO_LINK: link,
  }, listId ? [listId] : undefined);

  // Nunca bloquea a la persona: si Brevo falla, queda en los logs de Vercel
  return res.status(200).json({ ok });
}
