// api/adelanto.js
// Adelanto GRATIS que se ve al terminar el test. Lo escribe la IA cruzando la
// carta natal con el eneatipo, pero nunca revela el eneatipo, el ala ni el instinto.
import { decodificarToken, calcularCarta, generarAdelanto } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const perfil = decodificarToken((req.body || {}).token);
  if (!perfil) return res.status(400).json({ error: "Datos inválidos" });
  try {
    const carta = calcularCarta(perfil);
    const adelanto = await generarAdelanto(perfil, carta);
    return res.status(200).json({ adelanto });
  } catch (e) {
    console.error("Error generando el adelanto:", e && e.message);
    // La página tiene un texto de respaldo
    return res.status(502).json({ error: "No se pudo generar el adelanto" });
  }
}
