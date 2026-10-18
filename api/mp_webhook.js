// api/mp_webhook.js
// Aviso de Mercado Pago cuando cambia un pago. Sirve para que el reporte llegue
// por email aunque la persona pague y no vuelva al sitio.
//
// Para no duplicar el email: los primeros 10 minutos después de aprobado el pago
// se le deja la entrega a la página (respondemos 503 y Mercado Pago reintenta).
// Si para entonces la página no lo mandó, lo manda este aviso.
import {
  decodificarToken, calcularCarta, generarReporte, consultarPago, pagoValido,
  marcarComprador, enviarReportePorEmail, reporteYaEnviado, marcarReporteEnviado,
} from "./_lib.js";

const ESPERA_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  const q = req.query || {};
  const b = (req.body && typeof req.body === "object") ? req.body : {};
  const tipo = String(b.type || b.topic || q.type || q.topic || "");
  const id = String((b.data && b.data.id) || q["data.id"] || q.id || "");
  if (!/payment/.test(tipo) || !/^\d+$/.test(id)) return res.status(200).json({ ok: true, ignorado: true });

  try {
    const pago = await consultarPago(id);
    if (!pagoValido(pago)) return res.status(200).json({ ok: true, estado: pago.status });

    const perfil = decodificarToken(pago.external_reference);
    if (!perfil) return res.status(200).json({ ok: true, ignorado: "referencia" });
    if (!perfil.email && pago.payer && pago.payer.email) perfil.email = String(pago.payer.email).toLowerCase();
    if (!perfil.email) {
      console.error("Pago aprobado sin email para mandar el reporte:", id);
      return res.status(200).json({ ok: true, sin_email: true });
    }

    if (await reporteYaEnviado(perfil.email, id)) return res.status(200).json({ ok: true, ya_enviado: true });

    const aprobado = Date.parse(pago.date_approved || pago.date_created || "") || 0;
    if (Date.now() - aprobado < ESPERA_MS) return res.status(503).json({ reintentar: true });

    // Se marca antes de generar para que un reintento simultáneo no lo duplique
    await marcarReporteEnviado(perfil.email, id);
    await marcarComprador([perfil.email, pago.payer && pago.payer.email]);

    let ok = false;
    try {
      const carta = calcularCarta(perfil);
      const reporte = await generarReporte(perfil, carta);
      ok = await enviarReportePorEmail({ perfil, carta, reporte });
    } catch (e) {
      console.error("Error generando el reporte desde el aviso:", e && e.message);
    }
    if (!ok) {
      await marcarReporteEnviado(perfil.email, ""); // libera para el próximo reintento
      return res.status(500).json({ error: "No se pudo enviar el reporte" });
    }
    return res.status(200).json({ ok: true, enviado: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno" });
  }
}
