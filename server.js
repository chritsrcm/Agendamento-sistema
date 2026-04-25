require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { DateTime } = require('luxon');
const { initDB, pool, query } = require('./db');
const {
  createCalendarEvent,
  deleteCalendarEvent,
  isCalendarEnabled
} = require('./googleCalendar');

const app = express();

const COMPANY_NAME = process.env.COMPANY_NAME || 'Vitta Estética';
const PROFESSIONAL_NAME = process.env.PROFESSIONAL_NAME || 'Lívia Roberta';
const INSTAGRAM_HANDLE = process.env.INSTAGRAM_HANDLE || '@livia_roberta_estetica';
const INSTAGRAM_URL = process.env.INSTAGRAM_URL || 'https://www.instagram.com/livia_roberta_estetica/';
const CLINIC_ADDRESS = process.env.CLINIC_ADDRESS || 'Av. 10, Jardim Progresso, Anápolis - Goiás';
const CLINIC_EMAIL = process.env.CLINIC_EMAIL || 'E-mail em breve';
const TIME_ZONE = process.env.TIME_ZONE || 'America/Sao_Paulo';
const SLOT_INTERVAL_MINUTES = Number(process.env.SLOT_INTERVAL_MINUTES || 30);

const normalizeClock = (value, fallback) => {
  const source = value || fallback;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(source) ? source : fallback;
};

const BUSINESS_HOURS = {
  weekday: {
    label: 'Segunda a sexta',
    start: normalizeClock(process.env.WEEKDAY_BUSINESS_START, '18:00'),
    end: normalizeClock(process.env.WEEKDAY_BUSINESS_END, '21:30')
  },
  weekend: {
    label: 'Sábado e domingo',
    start: normalizeClock(process.env.WEEKEND_BUSINESS_START, '14:00'),
    end: normalizeClock(process.env.WEEKEND_BUSINESS_END, '19:00')
  }
};

const corsOrigin = process.env.CORS_ORIGIN?.trim();
if (corsOrigin) {
  app.use(cors({ origin: corsOrigin.split(',').map((origin) => origin.trim()) }));
}

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const parseLocalDate = (date) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = DateTime.fromISO(date, { zone: TIME_ZONE });
  return parsed.isValid ? parsed : null;
};

const parseClock = (clock) => {
  const [hour, minute] = clock.split(':').map(Number);
  return { hour, minute };
};

const getScheduleForDay = (day) => (day.weekday >= 6 ? BUSINESS_HOURS.weekend : BUSINESS_HOURS.weekday);

const getBusinessWindow = (day) => {
  const schedule = getScheduleForDay(day);
  const open = parseClock(schedule.start);
  const close = parseClock(schedule.end);

  return {
    schedule,
    start: day.set({ hour: open.hour, minute: open.minute, second: 0, millisecond: 0 }),
    end: day.set({ hour: close.hour, minute: close.minute, second: 0, millisecond: 0 })
  };
};

const dayBounds = (day) => ({
  start: day.startOf('day'),
  end: day.plus({ days: 1 }).startOf('day')
});

const getService = async (runner, serviceId) => {
  const { rows } = await runner.query(
    `
      SELECT id, name, duration_minutes, price
      FROM services
      WHERE id = $1 AND active = true
    `,
    [serviceId]
  );
  return rows[0];
};

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

const requireAdmin = (req, res, next) => {
  const expectedToken = process.env.ADMIN_TOKEN;
  const providedToken = req.get('x-admin-token') || req.query.admin_token;

  if (!expectedToken) {
    return res.status(403).json({ error: 'ADMIN_TOKEN nao configurado no servidor' });
  }
  if (providedToken !== expectedToken) {
    return res.status(401).json({ error: 'Nao autorizado' });
  }

  return next();
};

const getAvailability = async (date, serviceId) => {
  const day = parseLocalDate(date);
  if (!day) {
    const err = new Error('Data invalida');
    err.status = 400;
    throw err;
  }

  const parsedServiceId = Number(serviceId);
  if (!isPositiveInteger(parsedServiceId)) {
    const err = new Error('Servico invalido');
    err.status = 400;
    throw err;
  }

  const service = await getService(pool, parsedServiceId);
  if (!service) {
    const err = new Error('Servico nao encontrado');
    err.status = 404;
    throw err;
  }

  const bounds = dayBounds(day);
  const { schedule, start: openAt, end: closeAt } = getBusinessWindow(day);
  const { rows: bookings } = await query(
    `
      SELECT id, starts_at, ends_at
      FROM bookings
      WHERE status = 'confirmed'
        AND starts_at < $1
        AND ends_at > $2
      ORDER BY starts_at ASC
    `,
    [bounds.end.toUTC().toISO(), bounds.start.toUTC().toISO()]
  );

  const now = DateTime.now().setZone(TIME_ZONE);
  const slots = [];
  for (
    let slotStart = openAt;
    slotStart.plus({ minutes: service.duration_minutes }).toMillis() <= closeAt.toMillis();
    slotStart = slotStart.plus({ minutes: SLOT_INTERVAL_MINUTES })
  ) {
    const slotEnd = slotStart.plus({ minutes: service.duration_minutes });
    const overlaps = bookings.some((booking) => {
      const bookingStart = new Date(booking.starts_at).getTime();
      const bookingEnd = new Date(booking.ends_at).getTime();
      return bookingStart < slotEnd.toMillis() && bookingEnd > slotStart.toMillis();
    });
    const isPast = slotStart.toMillis() < now.toMillis();

    slots.push({
      label: slotStart.toFormat('HH:mm'),
      starts_at: slotStart.toUTC().toISO(),
      ends_at: slotEnd.toUTC().toISO(),
      available: !overlaps && !isPast
    });
  }

  return {
    date,
    service,
    slots,
    time_zone: TIME_ZONE,
    business_hours: {
      label: schedule.label,
      start: schedule.start,
      end: schedule.end
    }
  };
};

app.get('/api/config', (req, res) => {
  res.json({
    company_name: COMPANY_NAME,
    professional_name: PROFESSIONAL_NAME,
    instagram_handle: INSTAGRAM_HANDLE,
    instagram_url: INSTAGRAM_URL,
    clinic_address: CLINIC_ADDRESS,
    clinic_email: CLINIC_EMAIL,
    time_zone: TIME_ZONE,
    business_hours: BUSINESS_HOURS,
    slot_interval_minutes: SLOT_INTERVAL_MINUTES,
    google_calendar_enabled: isCalendarEnabled()
  });
});

app.get('/api/services', async (req, res) => {
  try {
    const { rows } = await query(
      `
        SELECT id, name, duration_minutes, price
        FROM services
        WHERE active = true
        ORDER BY display_order, name
      `
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar servicos' });
  }
});

app.get('/api/availability', async (req, res) => {
  try {
    const availability = await getAvailability(req.query.date, req.query.service_id);
    res.json(availability);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erro ao carregar horarios' });
  }
});

app.get('/api/bookings', requireAdmin, async (req, res) => {
  try {
    const day = parseLocalDate(req.query.date);
    if (!day) return res.status(400).json({ error: 'Data invalida' });

    const bounds = dayBounds(day);
    const { rows } = await query(
      `
        SELECT b.id, b.client_name, b.client_phone, b.starts_at, b.ends_at, b.status,
               b.google_event_link, s.name AS service_name, s.duration_minutes, s.price
        FROM bookings b
        JOIN services s ON b.service_id = s.id
        WHERE b.status = 'confirmed'
          AND b.starts_at >= $1
          AND b.starts_at < $2
        ORDER BY b.starts_at ASC
      `,
      [bounds.start.toUTC().toISO(), bounds.end.toUTC().toISO()]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar agendamentos' });
  }
});

app.post('/api/bookings', async (req, res) => {
  const clientName = cleanText(req.body.client_name, 100);
  const clientPhone = cleanText(req.body.client_phone, 20);
  const serviceId = Number(req.body.service_id);
  const start = DateTime.fromISO(String(req.body.starts_at || ''), { setZone: true });

  if (!clientName || !clientPhone || !isPositiveInteger(serviceId) || !start.isValid) {
    return res.status(400).json({ error: 'Dados incompletos ou invalidos' });
  }

  const client = await pool.connect();
  let booking;
  let service;

  try {
    await client.query('BEGIN');

    service = await getService(client, serviceId);
    if (!service) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Servico nao encontrado' });
    }

    const startUtc = start.toUTC();
    const endUtc = startUtc.plus({ minutes: service.duration_minutes });
    const localStart = startUtc.setZone(TIME_ZONE);
    const localEnd = endUtc.setZone(TIME_ZONE);
    const { start: openAt, end: closeAt } = getBusinessWindow(localStart);

    if (startUtc.toMillis() < DateTime.now().toUTC().toMillis()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Nao e possivel agendar no passado' });
    }

    if (localStart.toMillis() < openAt.toMillis() || localEnd.toMillis() > closeAt.toMillis()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Horario fora do expediente' });
    }

    const { rows: conflicts } = await client.query(
      `
        SELECT id FROM bookings
        WHERE status = 'confirmed'
          AND starts_at < $1
          AND ends_at > $2
        LIMIT 1
      `,
      [endUtc.toISO(), startUtc.toISO()]
    );

    if (conflicts.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Horario indisponivel' });
    }

    const { rows } = await client.query(
      `
        INSERT INTO bookings (client_name, client_phone, service_id, starts_at, ends_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, client_name, client_phone, service_id, starts_at, ends_at, status
      `,
      [clientName, clientPhone, serviceId, startUtc.toISO(), endUtc.toISO()]
    );

    booking = rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Horario indisponivel' });
    }
    console.error('Erro ao criar agendamento:', err);
    return res.status(500).json({ error: 'Erro interno ao processar' });
  } finally {
    client.release();
  }

  try {
    const calendarEvent = await createCalendarEvent({
      ...booking,
      service_name: service.name,
      companyName: COMPANY_NAME,
      timeZone: TIME_ZONE
    });

    if (calendarEvent) {
      await query(
        'UPDATE bookings SET google_event_id = $1, google_event_link = $2 WHERE id = $3',
        [calendarEvent.id, calendarEvent.htmlLink, booking.id]
      );
    }

    return res.status(201).json({
      message: 'Agendamento confirmado',
      booking: {
        id: booking.id,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        service_name: service.name
      },
      calendar: calendarEvent
        ? { synced: true, html_link: calendarEvent.htmlLink }
        : { synced: false }
    });
  } catch (err) {
    console.error('Erro ao sincronizar Google Calendar:', err);
    await query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [booking.id]);
    return res.status(502).json({
      error: 'Nao foi possivel sincronizar com o Google Calendar. Agendamento nao confirmado.'
    });
  }
});

app.delete('/api/bookings/:id', requireAdmin, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!isPositiveInteger(bookingId)) {
    return res.status(400).json({ error: 'Agendamento invalido' });
  }

  try {
    const { rows } = await query(
      `
        UPDATE bookings
        SET status = 'cancelled'
        WHERE id = $1 AND status = 'confirmed'
        RETURNING id, google_event_id
      `,
      [bookingId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Agendamento nao encontrado' });

    await deleteCalendarEvent(rows[0].google_event_id);
    res.json({ message: 'Agendamento cancelado' });
  } catch (err) {
    console.error('Erro ao cancelar agendamento:', err);
    res.status(500).json({ error: 'Erro ao cancelar agendamento' });
  }
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await initDB();
  const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`A porta ${PORT} ja esta em uso. Feche o servidor antigo ou altere PORT no .env.`);
      process.exit(1);
    }
    throw err;
  });
};

startServer().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});

