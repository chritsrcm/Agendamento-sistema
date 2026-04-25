# Vitta Estetica - Agendamento

Site institucional e agenda online da Vitta Estetica, com Node.js, PostgreSQL e sincronizacao opcional com Google Calendar.

## Rodar localmente

```bash
npm install
cp .env.example .env
npm start
```

Configure `DATABASE_URL` no `.env` antes de iniciar. O site fica em `http://localhost:3000`.

## Horarios

- Segunda a sexta: 18:00 as 21:30
- Sabado e domingo: 14:00 as 19:00

Esses horarios sao usados pela API de disponibilidade e pelo formulario de agendamento.

## Google Calendar

1. Ative a Google Calendar API no projeto do Google Cloud.
2. Crie uma conta de servico e baixe o arquivo JSON de credenciais.
3. Compartilhe o calendario da empresa com o e-mail da conta de servico, com permissao para criar eventos.
4. Configure no `.env`:

```env
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_ID=seu-calendario@group.calendar.google.com
GOOGLE_APPLICATION_CREDENTIALS=C:\caminho\seguro\google-service-account.json
```

Quando `GOOGLE_CALENDAR_ENABLED=true`, uma falha de sincronizacao impede a confirmacao do agendamento para evitar divergencia entre o site e o calendario.

## Administracao

Os endpoints administrativos exigem `ADMIN_TOKEN` via header:

```http
x-admin-token: seu-token
```

Use `GET /api/bookings?date=YYYY-MM-DD` para consultar agendamentos confirmados e `DELETE /api/bookings/:id` para cancelar.
