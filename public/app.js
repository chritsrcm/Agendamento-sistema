const API = 'http://localhost:3000/api';

// 🔹 Carregar serviços no dropdown
async function loadServices() {
  try {
    const res = await fetch(`${API}/services`);
    if (!res.ok) throw new Error('Falha ao carregar serviços');
    
    const services = await res.json();
    const select = document.getElementById('service_id');
    
    if (!services.length) {
      select.innerHTML = '<option value="">Nenhum serviço cadastrado</option>';
      return;
    }

    select.innerHTML = '<option value="">Selecione um serviço</option>';
    services.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} • ${s.duration_minutes}min • R$${parseFloat(s.price).toFixed(2)}`;
      select.appendChild(opt);
    });
    console.log('✅ Serviços carregados:', services.length);
  } catch (err) {
    console.error('❌ Erro ao carregar serviços:', err);
    document.getElementById('service_id').innerHTML = 
      '<option value="">Erro ao carregar</option>';
  }
}

// 🔹 Carregar agendamentos por data
async function loadBookings(date) {
  try {
    const res = await fetch(`${API}/bookings?date=${date}`);
    const bookings = await res.json();
    const list = document.getElementById('bookingsList');
    list.innerHTML = '';

    if (!bookings.length) {
      list.innerHTML = '<li style="color:#666; text-align:center">Nenhum agendamento para esta data.</li>';
      return;
    }

    bookings.forEach(b => {
      const li = document.createElement('li');
      const time = new Date(b.starts_at).toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      li.innerHTML = `
        <strong>${time}</strong>
        <span>${b.client_name} • ${b.service_name}</span>
        <button class="cancel-btn" data-id="${b.id}">Cancelar</button>
      `;
      list.appendChild(li);
    });

    // Adicionar evento de cancelar
    document.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Cancelar este agendamento?')) return;
        await fetch(`${API}/bookings/${btn.dataset.id}`, { method: 'DELETE' });
        loadBookings(document.getElementById('filterDate').value);
      };
    });
  } catch (err) {
    console.error('Erro ao carregar agendamentos:', err);
  }
}

// 🔹 Submit do formulário
document.getElementById('bookingForm').onsubmit = async (e) => {
  e.preventDefault();
  
  const starts_at = new Date(document.getElementById('starts_at').value).toISOString();
  
  const data = {
    client_name: document.getElementById('client_name').value.trim(),
    client_phone: document.getElementById('client_phone').value.trim(),
    service_id: Number(document.getElementById('service_id').value),
    starts_at
  };

  const res = await fetch(`${API}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await res.json();
  if (!res.ok) return alert('❌ ' + result.error);
  
  alert('✅ Agendado com sucesso!');
  e.target.reset();
  loadBookings(document.getElementById('filterDate').value);
};

// 🔹 Filtro de data
document.getElementById('filterDate').onchange = (e) => {
  loadBookings(e.target.value);
};

// 🔹 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  loadServices();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('filterDate').value = today;
  loadBookings(today);
});