// db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const query = (text, params) => pool.query(text, params);

const initDB = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
      price DECIMAL(10,2) NOT NULL CHECK (price >= 0)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      client_name VARCHAR(100) NOT NULL,
      client_phone VARCHAR(20) NOT NULL,
      service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(starts_at, ends_at);
  `);

  const { rowCount } = await query('SELECT id FROM services LIMIT 1');
  if (rowCount === 0) {
    await query(`
      INSERT INTO services (name, duration_minutes, price) VALUES
      ('Corte Feminino', 45, 80.00),
      ('Manicure Completa', 60, 50.00),
      ('Limpeza de Pele', 90, 120.00)
    `);
    console.log('🌱 Serviços padrão inseridos');
  }
};

module.exports = { pool, query, initDB };