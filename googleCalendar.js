const { google } = require('googleapis');

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

let calendarClientPromise;

const isEnabled = () => String(process.env.GOOGLE_CALENDAR_ENABLED).toLowerCase() === 'true';

const getCalendarId = () => process.env.GOOGLE_CALENDAR_ID || 'primary';

const normalizePrivateKey = (key) => key?.replace(/\\n/g, '\n');

const parseCredentialsJson = () => {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!raw) return null;

  const trimmed = raw.trim();
  const json = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');

  const credentials = JSON.parse(json);
  if (credentials.private_key) {
    credentials.private_key = normalizePrivateKey(credentials.private_key);
  }
  return credentials;
};

const getInlineCredentials = () => {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) return null;

  return {
    client_email: clientEmail,
    private_key: normalizePrivateKey(privateKey)
  };
};

const hasCredentialConfig = () =>
  Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_CREDENTIALS_JSON ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  );

const getCalendarClient = async () => {
  if (!isEnabled()) return null;
  if (!process.env.GOOGLE_CALENDAR_ID) {
    throw new Error('GOOGLE_CALENDAR_ID não configurado');
  }
  if (!hasCredentialConfig()) {
    throw new Error('Credenciais do Google Calendar não configuradas');
  }

  if (!calendarClientPromise) {
    calendarClientPromise = (async () => {
      const credentials = parseCredentialsJson() || getInlineCredentials();
      const auth = new google.auth.GoogleAuth({
        credentials: credentials || undefined,
        scopes: [CALENDAR_SCOPE]
      });
      const authClient = await auth.getClient();
      return google.calendar({ version: 'v3', auth: authClient });
    })();
  }

  return calendarClientPromise;
};

const toIsoString = (value) => {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
};

const createCalendarEvent = async (booking) => {
  const calendar = await getCalendarClient();
  if (!calendar) return null;

  const event = {
    summary: `${booking.companyName} - ${booking.service_name}`,
    description: [
      `Cliente: ${booking.client_name}`,
      `Telefone: ${booking.client_phone}`,
      `Serviço: ${booking.service_name}`,
      `Agendamento interno: #${booking.id}`
    ].join('\n'),
    start: {
      dateTime: toIsoString(booking.starts_at),
      timeZone: booking.timeZone
    },
    end: {
      dateTime: toIsoString(booking.ends_at),
      timeZone: booking.timeZone
    },
    extendedProperties: {
      private: {
        bookingId: String(booking.id)
      }
    },
    reminders: {
      useDefault: true
    }
  };

  const response = await calendar.events.insert({
    calendarId: getCalendarId(),
    requestBody: event
  });

  return {
    id: response.data.id,
    htmlLink: response.data.htmlLink
  };
};

const deleteCalendarEvent = async (eventId) => {
  const calendar = await getCalendarClient();
  if (!calendar || !eventId) return;

  try {
    await calendar.events.delete({
      calendarId: getCalendarId(),
      eventId
    });
  } catch (err) {
    const status = err?.response?.status || err?.code;
    if (status === 404 || status === 410) return;
    throw err;
  }
};

module.exports = {
  createCalendarEvent,
  deleteCalendarEvent,
  isCalendarEnabled: isEnabled
};
