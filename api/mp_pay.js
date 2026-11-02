// api/mp_pay.js
// Cobro desde el formulario de pago integrado (Payment Brick de Mercado Pago).
// El navegador manda los datos de la tarjeta ya tokenizados por Mercado Pago (nunca el número
// de tarjeta). El precio lo fija el servidor: nunca se toma el monto que manda el navegador.
import { randomUUID } from "node:crypto";
import { PRECIO, BASE_URL, decodificarToken } from "./_lib.js";

const MENSAJES = {
  cc_rejected_insufficient_amount: "La tarjeta no tiene saldo suficiente.",
  cc_rejected_bad_filled_security_code: "Revisá el código de seguridad.",
  cc_rejected_bad_filled_date: "Revisá la fecha de vencimiento.",
  cc_rejected_bad_filled_card_number: "Revisá el número de la tarjeta.",
  cc_rejected_bad_filled_other: "Revisá los datos de la tarjeta.",
  cc_rejected_call_for_authorize: "Tu banco pide que autorices este pago. Llamalo o probá con otra tarjeta.",
  cc_rejected_card_disabled: "La tarjeta está inactiva. Activala con tu banco o probá con otra.",
  cc_rejected_duplicated_payment: "Ya hiciste un pago por este mismo monto hace un momento.",
  cc_rejected_high_risk: "El pago fue rechazado por seguridad. Probá con otra tarjeta o con tu cuenta de Mercado Pago.",
  cc_rejected_max_attempts: "Llegaste al límite de intentos con esta tarjeta. Probá con otra.",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, formData } = req.body || {};
  if (!token || String(token).length > 256 || !decodificarToken(token)) {
    return res.status(400).json({ error: "Datos del test inválidos" });
  }
  const fd = formData && typeof formData === "object" ? formData : {};
  if (!fd.token || !fd.payment_method_id) return res.status(400).json({ error: "Faltan los datos del pago" });

  const mpAccessToken = process.env.MP_ACCESS_TOKEN;
  if (!mpAccessToken) return res.status(500).json({ error: "Falta MP_ACCESS_TOKEN en Vercel" });

  const payer = fd.payer && typeof fd.payer === "object" ? fd.payer : {};
  const pago = {
    transaction_amount: PRECIO,
    token: String(fd.token),
    installments: Math.max(1, parseInt(fd.installments, 10) || 1),
    payment_method_id: String(fd.payment_method_id),
    ...(fd.issuer_id ? { issuer_id: String(fd.issuer_id) } : {}),
    payer: {
      email: String(payer.email || "").trim().toLowerCase(),
      ...(payer.identification && payer.identification.number
        ? { identification: { type: String(payer.identification.type || "DNI"), number: String(payer.identification.number) } }
        : {}),
    },
    description: "Reporte Astrotipo: Eneagrama + Carta natal",
    external_reference: String(token),
    notification_url: `${BASE_URL}/api/mp_webhook`,
    statement_descriptor: "ASTROTIPO",
    additional_info: {
      items: [{ id: "reporte-astrotipo", title: "Reporte Astrotipo", quantity: 1, unit_price: PRECIO, category_id: "services" }],
    },
  };

  try {
    const r = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(pago),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Mercado Pago rechazó el pago:", r.status, JSON.stringify(j).slice(0, 400));
      return res.status(402).json({ error: "No se pudo procesar el pago. Revisá los datos o probá con otro medio." });
    }
    return res.status(200).json({
      id: j.id,
      status: j.status,
      status_detail: j.status_detail,
      mensaje: j.status === "rejected" ? (MENSAJES[j.status_detail] || "El pago fue rechazado. Probá con otra tarjeta o con tu cuenta de Mercado Pago.") : null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error procesando el pago" });
  }
}
