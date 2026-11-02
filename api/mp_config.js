// api/mp_config.js
// Clave pública de Mercado Pago para el formulario de pago integrado (Payment Brick).
// La clave pública está pensada para usarse en el navegador; la privada nunca sale del servidor.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).json({ publicKey: process.env.MP_PUBLIC_KEY || null });
}
