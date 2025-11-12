// Persistencia de tema
const root = document.documentElement;
const savedTheme = localStorage.getItem('phishguard-theme');
if (savedTheme) root.setAttribute('data-theme', savedTheme);

document.getElementById('toggleTheme').addEventListener('click', () => {
  const now = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', now);
  localStorage.setItem('phishguard-theme', now);
});

// Sidebar en móvil
const sidebar = document.getElementById('appSidebar');
document.getElementById('openSidebar').addEventListener('click', () => sidebar.classList.add('open'));
document.getElementById('closeSidebar').addEventListener('click', () => sidebar.classList.remove('open'));

// Utilidades UI
const showLoading = (on = true) => document.getElementById('loading').style.display = on ? 'grid' : 'none';

function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'item';
  el.textContent = msg;
  if (type === 'error') el.style.borderColor = 'rgba(231, 76, 60, .45)';
  if (type === 'success') el.style.borderColor = 'rgba(46, 204, 113, .45)';
  t.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

function getGradientColor(percentage) {
  let r, g;
  if (percentage <= 50) { r = Math.round((percentage / 50) * 255); g = 255; }
  else { r = 255; g = Math.round(255 - ((percentage - 50) / 50) * 255); }
  return `rgb(${r}, ${g}, 0)`;
}

const API = window.location.origin;

document.getElementById('prefillDemo').addEventListener('click', () => {
  document.getElementById('textInput').value = "[ALERTA] Su cuenta bancaria será bloqueada. Verifique sus datos en https://seguro-banco-validacion.com de inmediato.";
  document.getElementById('urlInput').value = "http://sospechoso.com/login";
  toast('Ejemplo cargado', 'success');
});

document.getElementById('resetForm').addEventListener('click', () => {
  document.getElementById('textInput').value = '';
  document.getElementById('urlInput').value = '';
  document.getElementById('result').innerHTML = '';
  document.getElementById('riskBarContainer').style.display = 'none';
  toast('Campos limpios');
});

// Auth UI
const loginModal = document.getElementById('loginModal');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authClose = document.getElementById('authClose');
const authLogin = document.getElementById('authLogin');
const authSignup = document.getElementById('authSignup');
const btnLoginOpen = document.getElementById('btnLoginOpen');
const loggedUser = document.getElementById('loggedUser');

function setLoggedUser(name) {
  if (name) {
    loggedUser.textContent = name;
    btnLoginOpen.textContent = 'Logout';
  } else {
    loggedUser.textContent = '';
    btnLoginOpen.textContent = 'Login';
  }
}

btnLoginOpen.addEventListener('click', async () => {
  const token = localStorage.getItem('phishguard_token');
  if (token) {
    try {
      await fetch(`${API}/logout`, { 
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
    } catch (e) { 
      console.warn('Error al cerrar sesión:', e);
    }
    localStorage.removeItem('phishguard_token');
    localStorage.removeItem('phishguard_user');
    setLoggedUser(null);
    renderHistory([]);
    resetStatsUI();
    toast('Sesión cerrada', 'success');
    return;
  }
  loginModal.style.display = 'grid';
});

authClose.addEventListener('click', () => { 
  loginModal.style.display = 'none'; 
});

authSignup.addEventListener('click', async () => {
  const u = authUsername.value.trim(); 
  const p = authPassword.value;
  if (!u || !p) { 
    toast('Usuario y contraseña requeridos','error'); 
    return; 
  }
  try {
    const r = await fetch(`${API}/signup`, { 
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({ username: u, password: p }) 
    });
    if (!r.ok) {
      const errorData = await r.json();
      throw new Error(errorData.detail || 'Error al crear usuario');
    }
    toast('Usuario creado. Haz login.', 'success');
    authUsername.value = '';
    authPassword.value = '';
  } catch (e) { 
    toast(`Error: ${e.message}`, 'error'); 
  }
});

authLogin.addEventListener('click', async () => {
  const u = authUsername.value.trim(); 
  const p = authPassword.value;
  if (!u || !p) { 
    toast('Usuario y contraseña requeridos','error'); 
    return; 
  }
  try {
    const r = await fetch(`${API}/login`, { 
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({ username: u, password: p }) 
    });
    if (!r.ok) {
      const errorData = await r.json();
      throw new Error(errorData.detail || 'Credenciales inválidas');
    }
    const data = await r.json();
    localStorage.setItem('phishguard_token', data.token);
    localStorage.setItem('phishguard_user', data.username);
    setLoggedUser(data.username);
    loginModal.style.display = 'none';
    toast('Login correcto', 'success');
    
    // Cargar datos del usuario
    await loadUserData();
  } catch (e) { 
    toast(`Error: ${e.message}`, 'error'); 
  }
});

// Validar token al cargar la página
async function validateAndRestoreSession() {
  const token = localStorage.getItem('phishguard_token');
  const storedUser = localStorage.getItem('phishguard_user');
  
  if (!token || !storedUser) {
    console.log('No hay sesión guardada');
    return false;
  }
  
  try {
    const response = await fetch(`${API}/validate-token`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Token válido para usuario:', data.username);
      setLoggedUser(data.username);
      await loadUserData();
      return true;
    } else {
      console.warn('Token expirado o inválido');
      localStorage.removeItem('phishguard_token');
      localStorage.removeItem('phishguard_user');
      setLoggedUser(null);
      return false;
    }
  } catch (e) {
    console.error('Error validando token:', e);
    localStorage.removeItem('phishguard_token');
    localStorage.removeItem('phishguard_user');
    setLoggedUser(null);
    return false;
  }
}

// Cargar datos del usuario (historial y stats)
async function loadUserData() {
  try {
    await Promise.all([
      fetchHistory(),
      fetchStats()
    ]);
  } catch (e) {
    console.error('Error cargando datos del usuario:', e);
  }
}

// Limpiar SOLO historial (botón papelera)
document.getElementById('clearHistory').addEventListener('click', async () => {
  const token = localStorage.getItem('phishguard_token');
  if (!token) return toast('Debes iniciar sesión', 'error');

  if (!confirm('¿Limpiar SOLO tu historial?')) return;

  try {
    await fetch(`${API}/history`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    await updateHistory(null);   // refrescar
    toast('Historial eliminado', 'success');
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  }
});


function resetStatsUI() {
  document.getElementById('kpi-total').textContent = '0';
  document.getElementById('kpi-avg').textContent = '0%';
  document.getElementById('kpi-safe').textContent = '0%';
  document.getElementById('kpi-suspicious').textContent = '0%';
  document.getElementById('kpi-phishing').textContent = '0%';
  
  document.getElementById('g-safe').style.width = '0%';
  document.getElementById('g-suspicious').style.width = '0%';
  document.getElementById('g-phishing').style.width = '0%';
}

async function analyzeText() {
  const text = document.getElementById('textInput').value.trim();
  const resultDiv = document.getElementById('result');
  const riskBar = document.getElementById('riskBarContainer');
  const riskArrow = document.getElementById('riskArrow');
  const riskPercentage = document.getElementById('riskPercentage');

  if (!text) {
    resultDiv.innerHTML = 'Por favor, ingresa un texto para analizar.';
    resultDiv.style.backgroundColor = '';
    riskBar.style.display = 'none';
    return;
  }

  const token = localStorage.getItem('phishguard_token');
  if (!token) {
    toast('Debes iniciar sesión para analizar', 'error');
    return;
  }

  showLoading(true);
  resultDiv.innerHTML = '';
  resultDiv.style.backgroundColor = '';
  riskBar.style.display = 'none';

  try {
    const response = await fetch(`${API}/analyze`, { 
      method: 'POST', 
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ text }) 
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Sesión expirada. Inicia sesión de nuevo.');
      }
      throw new Error('Error en la conexión con la API');
    }

    const data = await response.json();
    let html = `<p style="margin:0 0 6px; font-weight:700;">${data.combined_verdict} <span style="opacity:.8; font-weight:600;">(${data.percentage}% riesgo)</span></p>`;
    
    if (data.url_results && data.url_results.length > 0) {
      html += `<div style="margin-top:10px"><h3 style="margin:0 0 6px; font-size:14px;">URLs detectadas</h3><ul style="margin:0; padding-left:18px">`;
      data.url_results.forEach(u => { 
        html += `<li><strong>${u.url}</strong>: ${u.verdict} <span style="color:var(--muted)">(${u.reason})</span></li>`; 
      });
      html += `</ul></div>`;
    }
    
    resultDiv.innerHTML = html;
    resultDiv.style.backgroundColor = getGradientColor(data.percentage);
    resultDiv.style.color = '#000';

    const percentage = Number(data.percentage) || 0;
    riskBar.style.display = 'block';
    const barWidth = document.getElementById('riskBar').offsetWidth;
    const arrowPosition = (percentage / 100) * barWidth - 8;
    riskArrow.style.left = `${Math.max(0, Math.min(arrowPosition, barWidth-8))}px`;
    riskPercentage.innerText = `${percentage}% de riesgo`;
    riskArrow.style.borderTopColor = percentage > 66 ? 'var(--danger)' : percentage > 33 ? 'var(--warning)' : 'var(--success)';

    await loadUserData();
    toast('Análisis completado', 'success');
  } catch (error) {
    resultDiv.innerHTML = 'Error: ' + error.message;
    resultDiv.style.backgroundColor = 'rgba(231, 76, 60, .15)';
    toast(`Error: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

async function analyzeUrl() {
  const url = document.getElementById('urlInput').value.trim();
  const resultDiv = document.getElementById('result');
  const riskBar = document.getElementById('riskBarContainer');

  if (!url) {
    resultDiv.innerHTML = 'Por favor, ingresa una URL para analizar.';
    resultDiv.style.backgroundColor = '';
    riskBar.style.display = 'none';
    return;
  }

  const token = localStorage.getItem('phishguard_token');
  if (!token) {
    toast('Debes iniciar sesión para analizar', 'error');
    return;
  }

  showLoading(true);
  resultDiv.innerHTML = '';
  resultDiv.style.backgroundColor = '';
  riskBar.style.display = 'none';

  try {
    const response = await fetch(`${API}/analyze_url`, { 
      method: 'POST', 
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ url }) 
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Sesión expirada. Inicia sesión de nuevo.');
      }
      throw new Error('Error en la conexión con la API');
    }

    const data = await response.json();
    resultDiv.innerHTML = `<p style="margin:0; font-weight:700;">URL: ${data.verdict} <span style="color:var(--muted); font-weight:600;">(${data.reason})</span></p>`;
    resultDiv.style.backgroundColor = data.verdict === 'Maliciosa' ? 'rgba(231, 76, 60, .15)' : 'rgba(46, 204, 113, .15)';
    resultDiv.style.color = 'inherit';

    await loadUserData();
    toast('Análisis completado', 'success');
  } catch (error) {
    resultDiv.innerHTML = 'Error: ' + error.message;
    resultDiv.style.backgroundColor = 'rgba(231, 76, 60, .15)';
    toast(`Error: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

async function fetchHistory() {
  const token = localStorage.getItem('phishguard_token');
  if (!token) {
    renderHistory([]);
    return;
  }
  
  try {
    const res = await fetch(`${API}/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        console.warn('Token inválido al obtener historial');
        localStorage.removeItem('phishguard_token');
        localStorage.removeItem('phishguard_user');
        setLoggedUser(null);
      }
      throw new Error('Error al obtener historial');
    }
    
    const history = await res.json();
    console.log('Historial obtenido:', history.length, 'entradas');
    renderHistory(history);
  } catch (error) {
    console.error('Error al obtener historial:', error);
    renderHistory([]);
  }
}

function renderHistory(history = []) {
  const list = document.getElementById('historyList');
  
  if (!Array.isArray(history) || history.length === 0) {
    list.innerHTML = '<li style="padding: 20px; text-align: center; color: var(--muted);">No hay historial</li>';
    return;
  }
  
  list.innerHTML = history.slice().reverse().map(h => {
    const type = h.type === 'texto' ? 'Texto' : 'URL';
    const badge = `<span class="badge">${type}</span>`;
    const pct = h.percentage ? ` <span class="meta">(${h.percentage}%)</span>` : '';
    const ts = `<div class="meta">${h.timestamp || ''}</div>`;
    const inputText = (h.input || '').toString().replace(/</g,'&lt;').slice(0, 90);
    const ellipsis = (h.input || '').length > 90 ? '…' : '';
    return `<li class="history-item">${badge}<div><div><strong>${h.verdict || '—'}</strong>${pct}</div><div class="meta">${inputText}${ellipsis}</div>${ts}</div></li>`;
  }).join('');
}
async function updateHistory(entry) {
  // entry === null  →  solo refrescar
  if (entry && entry.input) {
    const token = localStorage.getItem('phishguard_token');
    if (token) {
      await fetch(`${API}/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(entry)
      });
    }
  }
  // GET siempre que exista token
  const token = localStorage.getItem('phishguard_token');
  if (!token) { renderHistory([]); return; }
  const res = await fetch(`${API}/history`, { headers: { 'Authorization': `Bearer ${token}` }});
  if (res.ok) renderHistory(await res.json());
}

async function fetchStats() {
  const token = localStorage.getItem('phishguard_token');
  if (!token) {
    resetStatsUI();
    return;
  }
  
  try {
    const res = await fetch(`${API}/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        console.warn('Token inválido al obtener stats');
      }
      throw new Error('Error al obtener estadísticas');
    }
    
    const s = await res.json();
    console.log('Estadísticas obtenidas:', s);
    
    document.getElementById('kpi-total').textContent = s.total ?? 0;
    document.getElementById('kpi-avg').textContent = `${s.avg_risk ?? 0}%`;
    document.getElementById('kpi-safe').textContent = `${s.safe ?? 0}%`;
    document.getElementById('kpi-suspicious').textContent = `${s.suspicious ?? 0}%`;
    document.getElementById('kpi-phishing').textContent = `${s.phishing ?? 0}%`;
    
    document.getElementById('g-safe').style.width = `${s.safe ?? 0}%`;
    document.getElementById('g-suspicious').style.width = `${s.suspicious ?? 0}%`;
    document.getElementById('g-phishing').style.width = `${s.phishing ?? 0}%`;
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    resetStatsUI();
  }
}

// Inicialización al cargar la página
window.addEventListener('DOMContentLoaded', async () => {
  console.log('Inicializando aplicación...');
  await validateAndRestoreSession();
});

(function restoreAuth() {
  const token = localStorage.getItem('phishguard_token');
  if (!token) return;
  setLoggedUser(localStorage.getItem('phishguard_user') || 'usuario');
  updateHistory(null);   // ← sólo GET
  updateStats();
})();

