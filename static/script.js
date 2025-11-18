// ============================================
// CONFIGURACIÓN Y CONSTANTES
// ============================================
const API = window.location.origin;
const root = document.documentElement;

// ============================================
// TEMA (DARK/LIGHT MODE)
// ============================================
const savedTheme = localStorage.getItem('phishguard-theme');
if (savedTheme) root.setAttribute('data-theme', savedTheme);

document.getElementById('toggleTheme')?.addEventListener('click', () => {
  const now = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', now);
  localStorage.setItem('phishguard-theme', now);
});

// ============================================
// SIDEBAR MÓVIL
// ============================================
const sidebar = document.getElementById('appSidebar');
document.getElementById('openSidebar')?.addEventListener('click', () => sidebar.classList.add('open'));
document.getElementById('closeSidebar')?.addEventListener('click', () => sidebar.classList.remove('open'));

// ============================================
// UTILIDADES UI
// ============================================
const showLoading = (on = true) => {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = on ? 'grid' : 'none';
};

function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  const el = document.createElement('div');
  el.className = 'item';
  el.textContent = msg;
  el.style.background = 'var(--card-bg)';
  el.style.border = '1px solid var(--card-border)';
  el.style.padding = '12px 16px';
  el.style.borderRadius = '8px';
  el.style.marginTop = '8px';
  el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
  
  if (type === 'error') el.style.borderLeft = '4px solid var(--danger)';
  if (type === 'success') el.style.borderLeft = '4px solid var(--success)';
  
  t.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ============================================
// GESTIÓN DE SESIÓN
// ============================================
const loginModal = document.getElementById('loginModal');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const btnLoginOpen = document.getElementById('btnLoginOpen');
const loggedUser = document.getElementById('loggedUser');

function setLoggedUser(name) {
  if (loggedUser && btnLoginOpen) {
    if (name) {
      loggedUser.textContent = name;
      btnLoginOpen.textContent = 'Logout';
    } else {
      loggedUser.textContent = '';
      btnLoginOpen.textContent = 'Login';
    }
  }
}

function setLoggedOutState() {
  localStorage.removeItem('phishguard_token');
  localStorage.removeItem('phishguard_user');
  setLoggedUser(null);
  renderHistory([]);
  resetStatsUI();
}

btnLoginOpen?.addEventListener('click', async () => {
  const token = localStorage.getItem('phishguard_token');
  if (token) {
    // Logout
    setLoggedOutState();
    toast('Sesión cerrada', 'success');
  } else {
    // Open Login
    if (loginModal) loginModal.style.display = 'grid';
  }
});

document.getElementById('authClose')?.addEventListener('click', () => {
  if (loginModal) loginModal.style.display = 'none';
});

// LOGIN
document.getElementById('authLogin')?.addEventListener('click', async () => {
  const u = authUsername?.value.trim();
  const p = authPassword?.value;

  if (!u || !p) {
    toast('Usuario y contraseña requeridos', 'error');
    return;
  }

  try {
    showLoading(true);
    const r = await fetch(`${API}/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username: u, password: p })
    });

    if (!r.ok) throw new Error('Credenciales inválidas');

    const data = await r.json();
    localStorage.setItem('phishguard_token', data.token);
    localStorage.setItem('phishguard_user', data.username);

    setLoggedUser(data.username);
    if (loginModal) loginModal.style.display = 'none';
    
    await loadUserData(); 
    toast('¡Bienvenido!', 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    showLoading(false);
  }
});

// SIGNUP
document.getElementById('authSignup')?.addEventListener('click', async () => {
  const u = authUsername?.value.trim();
  const p = authPassword?.value;

  if (!u || !p) {
    toast('Usuario y contraseña requeridos', 'error');
    return;
  }

  try {
    showLoading(true);
    const r = await fetch(`${API}/signup`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username: u, password: p })
    });

    if (!r.ok) throw new Error('Error al registrar usuario');

    toast('Usuario creado. Inicia sesión.', 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    showLoading(false);
  }
});

// ============================================
// DATOS (HISTORIAL Y ESTADÍSTICAS)
// ============================================
async function loadUserData() {
  const token = localStorage.getItem('phishguard_token');
  const user = localStorage.getItem('phishguard_user');

  if (!token || !user) {
    setLoggedOutState();
    return;
  }
  
  setLoggedUser(user);

  try {
    await Promise.all([fetchHistory(), fetchStats()]);
  } catch (e) {
    console.error('Error loading data:', e);
    if (e.message.includes('401') || e.message.includes('token')) {
      setLoggedOutState();
    }
  }
}

async function fetchHistory() {
  const token = localStorage.getItem('phishguard_token');
  if (!token) return;

  const res = await fetch(`${API}/history`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('401');
    throw new Error('Error fetching history');
  }

  const history = await res.json();
  renderHistory(history);
}

function renderHistory(history) {
  const list = document.getElementById('historyList');
  if (!list) return;

  if (!history || history.length === 0) {
    list.innerHTML = '<li style="padding:10px; text-align:center; color:var(--text-muted);">Sin historial</li>';
    return;
  }

  list.innerHTML = history.slice().reverse().map(h => {
    const type = h.type === 'texto' ? '📝' : '🔗';
    const verdictClass = h.verdict === 'Maliciosa' || h.verdict === 'Phishing' ? 'color:var(--danger)' : 
                         h.verdict === 'Segura' ? 'color:var(--success)' : 'color:var(--warning)';
    
    return `
      <li class="history-item">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="font-weight:600; ${verdictClass}">${type} ${h.verdict}</span>
          <span style="color:var(--text-muted); font-size:11px;">${h.timestamp || ''}</span>
        </div>
        <div style="color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${(h.input || '').replace(/</g, '&lt;')}
        </div>
      </li>
    `;
  }).join('');
}

async function fetchStats() {
  const token = localStorage.getItem('phishguard_token');
  if (!token) return;

  const res = await fetch(`${API}/stats`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) return;

  const s = await res.json();
  
  document.getElementById('kpi-total').textContent = s.total;
  document.getElementById('kpi-avg').textContent = `${s.avg_risk}%`;
  document.getElementById('kpi-safe').textContent = `${s.safe}%`;
  document.getElementById('kpi-suspicious').textContent = `${s.suspicious}%`;
  document.getElementById('kpi-phishing').textContent = `${s.phishing}%`;
}

function resetStatsUI() {
  ['kpi-total', 'kpi-avg', 'kpi-safe', 'kpi-suspicious', 'kpi-phishing'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = id === 'kpi-total' ? '0' : '0%';
  });
}

// CLEAR HISTORY
document.getElementById('clearHistory')?.addEventListener('click', async () => {
  const token = localStorage.getItem('phishguard_token');
  if (!token) {
    toast('Inicia sesión primero', 'error');
    return;
  }

  if (!confirm('¿Borrar todo el historial?')) return;

  try {
    showLoading(true);
    const res = await fetch(`${API}/history`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Error al borrar');

    renderHistory([]);
    resetStatsUI();
    toast('Historial borrado', 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    showLoading(false);
  }
});

// ============================================
// ANÁLISIS
// ============================================
async function analyze(endpoint, payload) {
  const token = localStorage.getItem('phishguard_token');
  if (!token) {
    toast('Inicia sesión para analizar', 'error');
    return;
  }

  try {
    showLoading(true);
    const res = await fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 401) {
        setLoggedOutState();
        throw new Error('Sesión expirada');
      }
      throw new Error('Error en análisis');
    }

    const data = await res.json();
    displayResult(data);
    await loadUserData(); // Refresh stats/history
    toast('Análisis completado', 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function displayResult(data) {
  const resultDiv = document.getElementById('result');
  const riskBarContainer = document.getElementById('riskBarContainer');
  const riskArrow = document.getElementById('riskArrow');
  const riskPercentage = document.getElementById('riskPercentage');

  if (!resultDiv) return;

  // Determine verdict and percentage
  let verdict = data.combined_verdict || data.verdict;
  let percentage = data.percentage;
  
  // If URL analysis (no direct percentage), map verdict to risk
  if (percentage === undefined || percentage === null) {
    if (verdict === 'Segura') percentage = 10;
    else if (verdict === 'Maliciosa') percentage = 90;
    else percentage = 50;
  }

  let color = 'var(--text-main)';
  if (percentage > 66) color = 'var(--danger)';
  else if (percentage > 33) color = 'var(--warning)';
  else color = 'var(--success)';

  resultDiv.innerHTML = `
    <h3 style="margin:0 0 8px; color:${color}">${verdict}</h3>
    <p style="margin:0; font-size:14px;">${data.reasons ? data.reasons.join('<br>') : (data.reason || '')}</p>
  `;

  if (riskBarContainer) {
    riskBarContainer.style.display = 'block';
    riskPercentage.textContent = `${percentage}% Riesgo`;
    riskPercentage.style.color = color;
    
    // Move arrow
    const bar = document.getElementById('riskBar');
    if (bar) {
      const pos = Math.min(Math.max(percentage, 0), 100);
      riskArrow.style.left = `${pos}%`;
      riskArrow.style.borderTopColor = color;
    }
  }
}

window.analyzeText = () => {
  const text = document.getElementById('textInput').value;
  if (!text) return toast('Ingresa texto', 'error');
  analyze('analyze', { text });
};

window.analyzeUrl = () => {
  const url = document.getElementById('urlInput').value;
  if (!url) return toast('Ingresa URL', 'error');
  analyze('analyze_url', { url });
};

// PREFILL
document.getElementById('prefillDemo')?.addEventListener('click', () => {
  document.getElementById('textInput').value = "URGENTE: Su cuenta ha sido suspendida. Haga clic aquí para verificar.";
  document.getElementById('urlInput').value = "http://phishing-example.com/login";
});

document.getElementById('resetForm')?.addEventListener('click', () => {
  document.getElementById('textInput').value = "";
  document.getElementById('urlInput').value = "";
  document.getElementById('result').innerHTML = '<p style="color:var(--text-muted);text-align:center;">Resultados aquí</p>';
  document.getElementById('riskBarContainer').style.display = 'none';
});

// INIT
window.addEventListener('DOMContentLoaded', loadUserData);