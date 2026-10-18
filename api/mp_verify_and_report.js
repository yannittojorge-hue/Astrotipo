// api/mp_verify_and_report.js
// Cuando la persona vuelve de Mercado Pago: verifica el pago, arma la carta,
// genera el reporte con IA y manda una copia por email.
import {
  decodificarToken, calcularCarta, generarReporte, consultarPago, pagoValido,
  marcarComprador, enviarReportePorEmail, ocultarEmail, reporteYaEnviado, marcarReporteEnviado,
} from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { payment_id, enviar_email } = req.body || {};
  if (!/^\d+$/.test(String(payment_id || ""))) return res.status(400).json({ error: "Falta payment_id" });

  try {
    // 1) El pago se consulta a Mercado Pago: nunca se confía en lo que manda el navegador
    const pago = await consultarPago(payment_id);
    if (pago.status !== "approved") return res.status(402).json({ error: "Pago no aprobado", status: pago.status });
    if (!pagoValido(pago)) return res.status(402).json({ error: "Monto pagado incorrecto" });

    // 2) El resultado viene en el external_reference del pago
    const perfil = decodificarToken(pago.external_reference);
    if (!perfil) return res.status(400).json({ error: "Pago aprobado sin datos del test" });
    if (!perfil.email && pago.payer && pago.payer.email) perfil.email = String(pago.payer.email).toLowerCase();

    await marcarComprador([perfil.email, pago.payer && pago.payer.email]);

    // 3) Carta natal y reporte
    const carta = calcularCarta(perfil);
    let reporte;
    try {
      reporte = await generarReporte(perfil, carta);
    } catch (e) {
      console.error(e);
      return res.status(502).json({ error: "No se pudo generar el reporte" });
    }

    // 4) Copia por email, una sola vez por pago (el aviso de Mercado Pago puede haberla mandado)
    let emailCopia = null;
    if (enviar_email && perfil.email) {
      if (await reporteYaEnviado(perfil.email, payment_id)) {
        emailCopia = ocultarEmail(perfil.email);
      } else if (await enviarReportePorEmail({ perfil, carta, reporte })) {
        emailCopia = ocultarEmail(perfil.email);
        await marcarReporteEnviado(perfil.email, payment_id);
      }
    }

    const { email, ...publico } = perfil;
    return res.status(200).json({ reporte, perfil: publico, carta, email_copia: emailCopia });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno" });
  }
}
