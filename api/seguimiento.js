// api/seguimiento.js
// Lo llama el cron de Vercel una vez por día (ver vercel.json).
// Recorre la lista de Astrotipo en Brevo y manda el email que le toca a cada uno.
// Mientras ACTIVO sea false (en _seguimiento.js) solo simula y devuelve el resumen.
import { ACTIVO, TOPE_DIARIO, armarEmail, siguientePaso } from "./_seguimiento.js";

const hoyAR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // fecha de Argentina

async function contactosDeLaLista(apiKey, listId) {
  const todos = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const r = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts?limit=500&offset=${offset}`, { headers: { "api-key": apiKey } });
    if (!r.ok) throw new Error("Brevo no devolvió la lista: " + r.status);
    const j = await r.json();
    todos.push(...(j.contacts || []));
    if (!j.contacts || j.contacts.length < 500) break;
  }
  return todos;
}

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.authorization !== `Bearer ${secreto}`) return res.status(401).json({ error: "No autorizado" });

  const apiKey = process.env.BREVO_API_KEY, listId = Number(process.env.BREVO_LIST_ID);
  if (!apiKey || !listId) return res.status(500).json({ error: "Falta BREVO_API_KEY o BREVO_LIST_ID" });
  const enviar = ACTIVO && !(req.query && req.query.simular);
  const hoy = hoyAR();

  try {
    const contactos = (await contactosDeLaLista(apiKey, listId))
      .filter(c => !c.emailBlacklisted)
      .map(c => ({ email: c.email, attrs: c.attributes || {}, paso: siguientePaso(c.attributes, hoy) }))
      .filter(c => c.paso > 0)
      // Primero los más recientes: son los que más chances tienen de comprar
      .sort((a, b) => String(b.attrs.ASTRO_FECHA || "").localeCompare(String(a.attrs.ASTRO_FECHA || "")));

    const resumen = { hoy, enviar, pendientes: contactos.length, porPaso: {}, enviados: 0, errores: 0 };
    for (const c of contactos) resumen.porPaso[c.paso] = (resumen.porPaso[c.paso] || 0) + 1;
    if (!enviar) return res.status(200).json(resumen);

    for (const c of contactos.slice(0, TOPE_DIARIO)) {
      const mail = armarEmail(c.paso, { email: c.email, nombre: c.attrs.NOMBRE, link: c.attrs.ASTRO_LINK });
      if (!mail) continue;
      // Se marca antes de mandar: si algo falla a la mitad, nadie recibe dos veces el mismo email
      const marca = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(c.email)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({ attributes: { ASTRO_PASO: c.paso, ASTRO_ENVIO: hoy } }),
      });
      if (marca.status !== 204) { resumen.errores++; console.error("No se pudo marcar el paso:", c.email, marca.status, await marca.text().catch(() => "")); continue; }
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({
          sender: { name: "Astrotipo", email: process.env.EMAIL_REMITENTE || "hola@astrotipo.com.ar" },
          to: [{ email: c.email, name: String(c.attrs.NOMBRE || "").slice(0, 60) || undefined }],
          replyTo: { email: process.env.EMAIL_RESPUESTA || "yannittojorge@gmail.com", name: "Astrotipo" },
          subject: mail.asunto,
          htmlContent: mail.html,
          tags: ["seguimiento-astrotipo", "seguimiento-" + c.paso],
        }),
      });
      if (r.status === 201 || r.status === 200) resumen.enviados++;
      else { resumen.errores++; console.error("Brevo no mandó el seguimiento:", c.email, r.status, await r.text().catch(() => "")); }
    }
    return res.status(200).json(resumen);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error en el seguimiento" });
  }
}
