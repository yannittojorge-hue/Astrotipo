// api/ciudades.js
// Buscador de lugar de nacimiento: GET /api/ciudades?q=salta
// Devuelve hasta 8 ciudades con coordenadas y zona horaria.
import DATOS from "./_ciudades.js";

const pliegue = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Índice preparado una sola vez por instancia
const INDICE = DATOS.c.map(r => ({ r, nombre: pliegue(r[0]), todo: pliegue(r[0] + " " + r[1]) }));

export default function handler(req, res) {
  const q = pliegue(req.query && req.query.q).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
  if (q.length < 2) return res.status(200).json({ ciudades: [] });
  const palabras = q.split(" ");
  const empieza = [], contiene = [];
  for (const x of INDICE) {
    if (!palabras.every(p => x.todo.includes(p))) continue;
    (x.nombre.startsWith(palabras[0]) ? empieza : contiene).push(x.r);
    if (empieza.length >= 8) break;
  }
  // DATOS.c ya viene ordenado por población: primero las que empiezan igual
  const ciudades = empieza.concat(contiene).slice(0, 8).map(r => ({
    nombre: r[0], region: r[1], lat: r[2], lon: r[3], tz: DATOS.tz[r[4]],
  }));
  return res.status(200).json({ ciudades });
}
