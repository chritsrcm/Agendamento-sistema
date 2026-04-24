// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDB, query } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

initDB().then(() => console.log('✅ Banco inicializado e pronto'));

app.get('/api/services', async (req, res) => {
  try {
    const { rows } = await query('SELECT id, name, duration_minutes, price FROM services ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const { date } = req.query;
    const startDay = new Date(`${date}T00:00:00Z`).toISOString();
    const endDay = new Date(`${date}T23:59:59Z`).toISOString();

    const { rows } = await query(`
      SELECT b.id, b.client_name, b.client_phone, b.starts_at, b.ends_at, b.status,
             s.name AS service_name, s.duration_minutes, s.price
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.starts_at >= $1 AND b.starts_at <= $2
      ORDER BY b.starts_at ASC
    `, [startDay, endDay]);

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bookings', async (req, res) => {
  const { client_name, client_phone, service_id, starts_at } = req.body;
  if (!client_name || !client_phone || !service_id || !starts_at) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  try {
    const { rows: services } = await query('SELECT duration_minutes FROM services WHERE id = $1', [service_id]);
    if (!services.length) return res.status(404).json({ error: 'Serviço não encontrado' });

    const start = new Date(starts_at);
    const end = new Date(start.getTime() + services[0].duration_minutes * 60000);

    const { rows: conflicts } = await query(`
      SELECT id FROM bookings
      WHERE status = 'confirmed'
        AND starts_at < $1 AND ends_at > $2
    `, [end, start]);

    if (conflicts.length > 0) return res.status(409).json({ error: 'Horário indisponível' });

    await query(`
      INSERT INTO bookings (client_name, client_phone, service_id, starts_at, ends_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [client_name, client_phone, service_id, start.toISOString(), end.toISOString()]);

    res.status(201).json({ message: 'Agendamento criado com sucesso' });
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ error: 'Erro interno ao processar' });
  }
});

app.delete('/api/bookings/:id', async (req, res) => {
  try {
    const { rowCount } = await query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Agendamento não encontrado' });
    res.json({ message: 'Agendamento cancelado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor: http://localhost:${PORT}`));