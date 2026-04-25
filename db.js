const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const query = (text, params) => pool.query(text, params);

const services = [
  ['drenagem-linfatica', 'Drenagem linfática', 60, 130.00, 1],
  ['drenagem-local', 'Drenagem local', 40, 60.00, 2],
  ['massagem-relaxante', 'Massagem relaxante', 60, 130.00, 3],
  ['massagem-relaxante-ventosa', 'Massagem relaxante com ventosa', 75, 150.00, 4],
  ['liberacao-miofascial', 'Liberação miofascial', 75, 170.00, 5],
  ['modeladora', 'Modeladora', 45, 80.00, 6],
  ['dreno-modeladora', 'Dreno-modeladora', 60, 100.00, 7],
  ['limpeza-de-pele', 'Limpeza de pele', 90, 150.00, 8],
  ['revitalizacao-facial', 'Revitalização facial', 40, 40.00, 9],
  ['microagulhamento', 'Microagulhamento', 90, 280.00, 10]
];

const initDB = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
      price DECIMAL(10,2) NOT NULL CHECK (price >= 0)
    );

    ALTER TABLE services
      ADD COLUMN IF NOT EXISTS slug VARCHAR(120),
      ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 999;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_services_slug_unique
      ON services(slug)
      WHERE slug IS NOT NULL;

    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      client_name VARCHAR(100) NOT NULL,
      client_phone VARCHAR(20) NOT NULL,
      service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
      google_event_id VARCHAR(255),
      google_event_link TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS google_event_link TEXT;

    CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(starts_at, ends_at);
    CREATE INDEX IF NOT EXISTS idx_bookings_confirmed_time
      ON bookings(starts_at, ends_at)
      WHERE status = 'confirmed';
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bookings_valid_time'
      ) THEN
        ALTER TABLE bookings
          ADD CONSTRAINT bookings_valid_time CHECK (ends_at > starts_at);
      END IF;
    END $$;
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap_confirmed'
      ) THEN
        ALTER TABLE bookings
          ADD CONSTRAINT bookings_no_overlap_confirmed
          EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&)
          WHERE (status = 'confirmed');
      END IF;
    END $$;
  `);

  await query(
    `
      UPDATE services
      SET active = false
      WHERE slug IS NULL OR slug <> ALL($1::text[])
    `,
    [services.map(([slug]) => slug)]
  );

  for (const [slug, name, duration, price, displayOrder] of services) {
    await query(
      `
        INSERT INTO services (slug, name, duration_minutes, price, active, display_order)
        VALUES ($1, $2, $3, $4, true, $5)
        ON CONFLICT (slug) WHERE slug IS NOT NULL
        DO UPDATE SET
          name = EXCLUDED.name,
          duration_minutes = EXCLUDED.duration_minutes,
          price = EXCLUDED.price,
          active = true,
          display_order = EXCLUDED.display_order
      `,
      [slug, name, duration, price, displayOrder]
    );
  }
};

module.exports = { pool, query, initDB };
