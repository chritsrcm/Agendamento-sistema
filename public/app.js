const API = '/api';

const state = {
  services: [],
  selectedSlot: null
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const elements = {
  headerCompanyName: document.getElementById('headerCompanyName'),
  heroTitle: document.getElementById('heroTitle'),
  businessHoursSummary: document.getElementById('businessHoursSummary'),
  servicesPreview: document.getElementById('servicesPreview'),
  bookingForm: document.getElementById('bookingForm'),
  clientName: document.getElementById('client_name'),
  clientPhone: document.getElementById('client_phone'),
  serviceSelect: document.getElementById('service_id'),
  bookingDate: document.getElementById('bookingDate'),
  slotsGrid: document.getElementById('slotsGrid'),
  availabilityMeta: document.getElementById('availabilityMeta'),
  submitButton: document.getElementById('submitButton'),
  formMessage: document.getElementById('formMessage'),
  businessHours: document.getElementById('businessHours'),
  clinicAddress: document.getElementById('clinicAddress'),
  clinicEmail: document.getElementById('clinicEmail'),
  instagramLink: document.getElementById('instagramLink')
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível concluir a operação');
  }
  return data;
};

const todayLocal = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const formatSchedule = (hours) => {
  if (!hours?.weekday || !hours?.weekend) {
    return 'Horários sob consulta.';
  }

  return `${hours.weekday.label}, ${hours.weekday.start} às ${hours.weekday.end}. ${hours.weekend.label}, ${hours.weekend.start} às ${hours.weekend.end}.`;
};

const setMessage = (text, type = 'neutral') => {
  elements.formMessage.replaceChildren();
  elements.formMessage.textContent = text;
  elements.formMessage.className = `form-message ${type}`;
};

const setMessageWithLink = (text, href) => {
  elements.formMessage.replaceChildren();
  elements.formMessage.className = 'form-message success';

  const message = document.createElement('span');
  message.textContent = text;
  elements.formMessage.appendChild(message);

  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Ver no Google Calendar';
    elements.formMessage.appendChild(link);
  }
};

const renderEmpty = (text) => {
  const message = document.createElement('p');
  message.className = 'empty-state';
  message.textContent = text;
  elements.slotsGrid.replaceChildren(message);
};

const updateSubmitState = () => {
  elements.submitButton.disabled = !state.selectedSlot || !elements.bookingForm.checkValidity();
};

const selectSlot = (slot, button) => {
  state.selectedSlot = slot;
  document.querySelectorAll('.slot-button').forEach((slotButton) => {
    slotButton.classList.remove('is-selected');
    slotButton.setAttribute('aria-pressed', 'false');
  });
  button.classList.add('is-selected');
  button.setAttribute('aria-pressed', 'true');
  setMessage('', 'neutral');
  updateSubmitState();
};

const renderSlots = (availability) => {
  elements.slotsGrid.replaceChildren();

  if (!availability.slots.length) {
    renderEmpty('Não há horários para esta data.');
    return;
  }

  availability.slots.forEach((slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `slot-button ${slot.available ? 'is-available' : 'is-unavailable'}`;
    button.textContent = slot.label;
    button.disabled = !slot.available;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute(
      'aria-label',
      `${slot.label} ${slot.available ? 'disponível' : 'indisponível'}`
    );

    if (slot.available) {
      button.addEventListener('click', () => selectSlot(slot, button));
    }

    elements.slotsGrid.appendChild(button);
  });
};

const renderServicesPreview = (services) => {
  if (!elements.servicesPreview) return;
  elements.servicesPreview.replaceChildren();

  services.forEach((service) => {
    const article = document.createElement('article');
    article.className = 'service-card';

    const name = document.createElement('h3');
    name.textContent = service.name;

    const meta = document.createElement('p');
    meta.textContent = `${service.duration_minutes} min em média`;

    const price = document.createElement('strong');
    price.textContent = currency.format(Number(service.price));

    article.append(name, meta, price);
    elements.servicesPreview.appendChild(article);
  });
};

const loadConfig = async () => {
  const config = await fetchJson(`${API}/config`);
  const schedule = formatSchedule(config.business_hours);

  document.title = `${config.company_name} | Clínica de Estética em Anápolis`;
  elements.headerCompanyName.textContent = config.company_name;
  elements.heroTitle.textContent = config.company_name;
  elements.businessHours.textContent = schedule;
  elements.businessHoursSummary.textContent = schedule;
  elements.clinicAddress.textContent = config.clinic_address;
  elements.clinicEmail.textContent = config.clinic_email;
  elements.instagramLink.href = config.instagram_url;
  elements.instagramLink.textContent = config.instagram_handle;
};

const loadServices = async () => {
  const services = await fetchJson(`${API}/services`);
  state.services = services;

  elements.serviceSelect.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = services.length ? 'Selecione um procedimento' : 'Nenhum procedimento cadastrado';
  elements.serviceSelect.appendChild(placeholder);

  services.forEach((service) => {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = `${service.name} - ${service.duration_minutes}min - ${currency.format(Number(service.price))}`;
    elements.serviceSelect.appendChild(option);
  });

  renderServicesPreview(services);
};

const loadAvailability = async () => {
  state.selectedSlot = null;
  updateSubmitState();

  const date = elements.bookingDate.value;
  const serviceId = elements.serviceSelect.value;

  if (!date || !serviceId) {
    elements.availabilityMeta.textContent = '';
    renderEmpty('Selecione um procedimento e uma data.');
    return;
  }

  elements.availabilityMeta.textContent = 'Carregando...';
  renderEmpty('Carregando horários...');

  try {
    const availability = await fetchJson(
      `${API}/availability?date=${encodeURIComponent(date)}&service_id=${encodeURIComponent(serviceId)}`
    );
    elements.availabilityMeta.textContent = `${availability.business_hours.label}: ${availability.business_hours.start} às ${availability.business_hours.end} | ${availability.service.duration_minutes} min`;
    renderSlots(availability);
  } catch (err) {
    elements.availabilityMeta.textContent = '';
    renderEmpty(err.message);
  }
};

const submitBooking = async (event) => {
  event.preventDefault();
  if (!state.selectedSlot) return;

  elements.submitButton.disabled = true;
  setMessage('Confirmando agendamento...', 'neutral');

  const payload = {
    client_name: elements.clientName.value.trim(),
    client_phone: elements.clientPhone.value.trim(),
    service_id: Number(elements.serviceSelect.value),
    starts_at: state.selectedSlot.starts_at
  };

  try {
    const result = await fetchJson(`${API}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    elements.clientName.value = '';
    elements.clientPhone.value = '';
    setMessageWithLink('Agendamento confirmado.', result.calendar?.html_link);
    await loadAvailability();
  } catch (err) {
    setMessage(err.message, 'error');
    await loadAvailability();
  } finally {
    updateSubmitState();
  }
};

const init = async () => {
  elements.bookingDate.min = todayLocal();
  elements.bookingDate.value = todayLocal();

  try {
    await loadConfig();
    await loadServices();
    await loadAvailability();
  } catch (err) {
    setMessage(err.message, 'error');
    renderEmpty('Não foi possível carregar a agenda.');
  }
};

elements.serviceSelect.addEventListener('change', loadAvailability);
elements.bookingDate.addEventListener('change', loadAvailability);
elements.clientName.addEventListener('input', updateSubmitState);
elements.clientPhone.addEventListener('input', updateSubmitState);
elements.bookingForm.addEventListener('submit', submitBooking);

document.addEventListener('DOMContentLoaded', init);

// No app.js, se quiser o header mudar ao rolar:
window.addEventListener('scroll', () => {
  document.querySelector('.site-header')?.classList.toggle('scrolled', window.scrollY > 20);
});