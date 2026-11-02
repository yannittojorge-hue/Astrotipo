// api/baja.js
// Link "date de baja" de los emails de seguimiento. Marca el contacto en Brevo
// para que no reciba más emails de marketing.
import { firmaBaja } from "./_seguimiento.js";

const pagina = (titulo, texto) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · Astrotipo</title></head><body style="margin:0;background:#EDF0F4;font-family:Arial,Helvetica,sans-serif;color:#14213D;">
<div style="max-width:520px;margin:12vh auto;padding:28px 24px;background:#fff;border-radius:14px;">
<div style="font-family:Georgia,serif;font-size:22px;margin-bottom:10px;">${titulo}</div><p style="line-height:1.6;color:#3A4256;margin:0;">${texto}</p>
</div></body></html>`;

export default async function handler(req, res) {
  const email = String((req.query && req.query.e) || "").trim().toLowerCase();
  const k = String((req.query && req.query.k) || "");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!email || !k || k !== firmaBaja(email)) return res.status(400).end(pagina("Link inválido", "Este link de baja no es válido. Si querés dejar de recibir emails, respondé cualquiera de nuestros emails y te sacamos de la lista."));
  try {
    const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY },
      body: JSON.stringify({ emailBlacklisted: true }),
    });
    if (r.status !== 204 && r.status !== 404) throw new Error(String(r.status));
    return res.status(200).end(pagina("Listo", "Te dimos de baja. No vas a recibir más emails nuestros."));
  } catch (e) {
    console.error("Error dando de baja:", e && e.message);
    return res.status(500).end(pagina("No pudimos completar la baja", "Probá de nuevo en unos minutos o respondé cualquiera de nuestros emails y te sacamos de la lista."));
  }
}
