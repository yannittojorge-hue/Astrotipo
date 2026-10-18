// api/mp_create_preference.js
// Crea el link de pago de Mercado Pago. El token con el resultado viaja como
// external_reference, así el reporte se puede armar aunque la persona no vuelva.
import { PRECIO, BASE_URL, decodificarToken } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token } = req.body || {};
  if (!token || String(token).length > 256 || !decodificarToken(token)) {
    return res.status(400).json({ error: "Datos del test inválidos" });
  }

  const mpAccessToken = process.env.MP_ACCESS_TOKEN;
  if (!mpAccessToken) return res.status(500).json({ error: "Falta MP_ACCESS_TOKEN en Vercel" });

  const preferencia = {
    items: [{ title: "Reporte Astrotipo: Eneagrama + Carta natal", quantity: 1, currency_id: "ARS", unit_price: PRECIO }],
    external_reference: String(token),
    // Aviso de Mercado Pago: manda el reporte por email aunque la persona no vuelva al sitio
    notification_url: `${BASE_URL}/api/mp_webhook`,
    back_urls: {
      success: `${BASE_URL}/?mp_return=1`,
      failure: `${BASE_URL}/?mp_return=1`,
      pending: `${BASE_URL}/?mp_return=1`,
    },
    auto_return: "approved",
    statement_descriptor: "ASTROTIPO",
    // Sin efectivo (Pago Fácil / Rapipago): se acreditan días después y la
    // persona no vuelve a la página.
    payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }] },
  };

  try {
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${mpAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(preferencia),
    });
    const j = await r.json();
    if (!r.ok) {
      console.error("Mercado Pago rechazó la preferencia:", JSON.stringify(j).slice(0, 400));
      return res.status(502).json({ error: "Mercado Pago no respondió bien" });
    }
    return res.status(200).json({ init_point: j.init_point });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error creando el pago" });
  }
}
