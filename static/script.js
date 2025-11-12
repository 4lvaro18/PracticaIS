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
  if (type === 'error') el.style.borderColor = 'rgba(231, 76, 60, .45)';
  if (type === 'success') el.style.borderColor = 'rgba(46, 204, 113, .45)';
  t.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
  }, 2600);
  setTimeout(() => el.remove(), 3000);
}

function getGradientColor(percentage) {
  let r, g;
  if (percentage <= 50) {
    r = Math.round((percentage / 50) * 255);
    g = 255;
  } else {
    r = 255;
    g = Math.round(255 - ((percentage - 50) / 50) * 255);
  }
  return `rgb(${r}, ${g}, 0)`;
}

// ============================================
// EJEMPLOS Y LIMPIEZA
// ============================================
document.getElementById('prefillDemo')?.addEventListener('click', () => {
  document.getElementById('textInput').value = "[ALERTA] Su cuenta bancaria será bloqueada. Verifique sus datos en https://seguro-banco-validacion.com de inmediato.";
  document.getElementById('urlInput').value = "http://sospechoso.com/login";
  toast('Ejemplo cargado', 'success');
});

document.getElementById('resetForm')?.addEventListener('click', () => {
  document.getElementById('textInput').value = '';
  document.getElementById('urlInput').value = '';
  document.getElementById('result').innerHTML = '';
  document.getElementById('riskBarContainer').style.display = 'none';
  toast('Campos limpios');
});

// ============================================
// GESTIÓN DE SESIÓN
// ============================================
const loginModal = document.getElementById('loginModal');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const btnLoginOpen = document.getElementById('btnLoginOpen');
const loggedUser = document.getElementById('loggedUser');

/**
 * Actualiza la UI para mostrar el nombre del usuario y cambiar el botón de Login/Logout
 * @param {string | null} name - El nombre del usuario o null para limpiar
 */
function setLoggedUser(name) {
  console.log('🔄 setLoggedUser llamado con:', name);
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

/**
 * Limpia la UI de las estadísticas
 */
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

/**
 * NUEVA FUNCIÓN: Limpia el estado de la sesión, localStorage y UI.
 * Esta es la única fuente de verdad para "cerrar sesión" en el frontend.
 */
function setLoggedOutState() {
  console.log('🔒 Saliendo... limpiando estado.');
  localStorage.removeItem('phishguard_token');
  localStorage.removeItem('phishguard_user');
  setLoggedUser(null);
  renderHistory([]);
  resetStatsUI();
}

// LOGOUT
btnLoginOpen?.addEventListener('click', async () => {
  const token = localStorage.getItem('phishguard_token');

  if (token) {
    try {
      await fetch(`${API}/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      console.warn('Error al cerrar sesión en el servidor (se cerrará localmente):', e);
    }
    
    // USAR LA NUEVA FUNCIÓN
    setLoggedOutState();
    toast('Sesión cerrada', 'success');
    return;
  }

  // Si no había token, mostramos el modal de login
  if (loginModal) loginModal.style.display = 'grid';
});

document.getElementById('authClose')?.addEventListener('click', () => {
  if (loginModal) loginModal.style.display = 'none';
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
    const r = await fetch(`${API}/signup`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username: u, password: p })
    });

    if (!r.ok) {
      const errorData = await r.json();
      throw new Error(errorData.detail || 'Error al crear usuario');
    }

    toast('Usuario creado. Ahora inicia sesión', 'success');
    authUsername.value = '';
    authPassword.value = '';
  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  }
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

    if (!r.ok) {
      const errorData = await r.json();
      throw new Error(errorData.detail || 'Credenciales inválidas');
    }

    const data = await r.json();

    // 1. GUARDAR CREDENCIALES
    localStorage.setItem('phishguard_token', data.token);
    localStorage.setItem('phishguard_user', data.username);

    // 2. ACTUALIZAR UI INMEDIATAMENTE
    setLoggedUser(data.username);

    if (loginModal) loginModal.style.display = 'none';

    // 3. CORRECCIÓN: Cargar datos INMEDIATAMENTE (sin setTimeout)
    // Esto asegura que el historial aparezca al iniciar sesión.
    await loadUserData(); 
    
    toast('¡Bienvenido!', 'success');

  } catch (e) {
    toast(`Error: ${e.message}`, 'error');
  } finally {
    showLoading(false);
  }
});


// ============================================
// CARGAR DATOS (FUNCIÓN CENTRALIZADA)
// ============================================

/**
 * NUEVA FUNCIÓN: Carga todos los datos del usuario (historial y estadísticas).
 * Esta función es la fuente de verdad para restaurar la sesión.
 * Se llama al cargar la página (F5) y al iniciar sesión.
 */
async function loadUserData() {
  console.log('📥 Cargando datos del usuario...');
  const token = localStorage.getItem('phishguard_token');
  const storedUser = localStorage.getItem('phishguard_user');

  if (!token || !storedUser) {
    console.log('❌ No hay sesión, limpiando.');
    // Asegurarse de que todo esté limpio si no hay token
    setLoggedOutState();
    return;
  }
  
  // CORRECCIÓN: Mostrar el nombre de usuario de forma optimista
  // Esto asegura que el nombre persista en F5 y en todas las acciones.
  setLoggedUser(storedUser);

  try {
    // Intentar cargar historial y estadísticas en paralelo
    await Promise.all([
      fetchHistory(),
      fetchStats()
    ]);
    console.log('✅ Datos cargados');
  } catch (e) {
    console.error('❌ Error cargando datos (probablemente sesión expirada):', e.message);
    // Si Promise.all falla (p.ej. por un 401), fetchHistory/fetchStats
    // ya habrán llamado a setLoggedOutState()
  }
  
  // CORRECCIÓN: Re-asegurar que el nombre de usuario esté visible
  // (en caso de que la carga de datos falle pero la sesión siga siendo válida)
  const finalUser = localStorage.getItem('phishguard_user');
  if(finalUser) {
    setLoggedUser(finalUser);
  }
}

// ============================================
// HISTORIAL
// ============================================
async function fetchHistory() {
  const token = localStorage.getItem('phishguard_token');

  if (!token) {
    console.log('⚠️ No hay token, mostrando historial vacío');
    renderHistory([]);
    return; // No lanzar error, solo no hacer nada
  }

  try {
    console.log('📡 Fetching history...');
    const res = await fetch(`${API}/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      // CORRECCIÓN: Si el token es inválido, limpiar la sesión
      if (res.status === 401) {
        console.warn('⚠️ Token inválido al obtener historial. Cerrando sesión.');
        setLoggedOutState();
        throw new Error('Sesión expirada'); // Lanzar error para detener Promise.all
      }
      throw new Error(`Error ${res.status} al obtener historial`);
    }

    const history = await res.json();
    console.log(`✅ Historial: ${history.length} entradas`);
    renderHistory(history);
  } catch (error) {
    console.error('❌ Error en fetchHistory:', error.message);
    renderHistory([]); // Limpiar historial en caso de error
    // Re-lanzar el error para que loadUserData lo capture
    throw error;
  }
}

function renderHistory(history = []) {
  const list = document.getElementById('historyList');
  if (!list) return;

  if (!Array.isArray(history) || history.length === 0) {
    list.innerHTML = '<li style="padding: 20px; text-align: center; color: var(--muted);">No hay historial aún</li>';
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

// LIMPIAR HISTORIAL
document.getElementById('clearHistory')?.addEventListener('click', async () => {
  const token = localStorage.getItem('phishguard_token');

  if (!token) {
    toast('Debes iniciar sesión', 'error');
    return;
  }

  if (!confirm('¿Eliminar TODO tu historial? Esta acción no se puede deshacer.')) {
    return;
  }

  try {
    showLoading(true);

    console.log('🗑️ Borrando historial...');
    const response = await fetch(`${API}/history`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // CORRECCIÓN: Si el token es inválido, limpiar la sesión
        setLoggedOutState();
        throw new Error('Sesión expirada. Inicia sesión de nuevo.');
      }
      throw new Error('Error al borrar historial');
    }

    console.log('✅ Historial borrado del servidor');

    // CORRECCIÓN: Actualizar UI INMEDIATAMENTE
    // La función ya hacía esto, confirmando que está bien.
    renderHistory([]);
    await fetchStats(); // Recargar estadísticas (que ahora serán 0)

    toast('Historial eliminado', 'success');
  } catch (e) {
    console.error('❌ Error:', e);
    toast(`Error: ${e.message}`, 'error');
  } finally {
    showLoading(false);
  }
});

// ============================================
// ESTADÍSTICAS
// ============================================
async function fetchStats() {
  const token = localStorage.getItem('phishguard_token');

  if (!token) {
    resetStatsUI();
    return; // No lanzar error
  }

  try {
    const res = await fetch(`${API}/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
       // CORRECCIÓN: Si el token es inválido, limpiar la sesión
      if (res.status === 401) {
        console.warn('⚠️ Token inválido al obtener estadísticas. Cerrando sesión.');
        setLoggedOutState();
        throw new Error('Sesión expirada'); // Lanzar error para detener Promise.all
      }
      throw new Error(`Error ${res.status} al obtener estadísticas`);
    }

    const s = await res.json();
    console.log('📊 Estadísticas:', s);

    document.getElementById('kpi-total').textContent = s.total ?? 0;
    document.getElementById('kpi-avg').textContent = `${s.avg_risk ?? 0}%`;
    document.getElementById('kpi-safe').textContent = `${s.safe ?? 0}%`;
    document.getElementById('kpi-suspicious').textContent = `${s.suspicious ?? 0}%`;
    document.getElementById('kpi-phishing').textContent = `${s.phishing ?? 0}%`;

    document.getElementById('g-safe').style.width = `${s.safe ?? 0}%`;
    document.getElementById('g-suspicious').style.width = `${s.suspicious ?? 0}%`;
    document.getElementById('g-phishing').style.width = `${s.phishing ?? 0}%`;
  } catch (error) {
    console.error('❌ Error al obtener estadísticas:', error.message);
    resetStatsUI();
    // Re-lanzar el error para que loadUserData lo capture
    throw error;
  }
}

// ============================================
// ANÁLISIS DE TEXTO
// ============================================
async function analyzeText() {
  const text = document.getElementById('textInput')?.value.trim();
  const resultDiv = document.getElementById('result');
  const riskBar = document.getElementById('riskBarContainer');
  const riskArrow = document.getElementById('riskArrow');
  const riskPercentage = document.getElementById('riskPercentage');

  if (!text) {
    if (resultDiv) {
      resultDiv.innerHTML = 'Por favor, ingresa un texto para analizar.';
      resultDiv.style.backgroundColor = '';
    }
    if (riskBar) riskBar.style.display = 'none';
    return;
  }

  const token = localStorage.getItem('phishguard_token');
  if (!token) {
    toast('Debes iniciar sesión', 'error');
    return;
  }

  showLoading(true);
  if (resultDiv) {
    resultDiv.innerHTML = '';
    resultDiv.style.backgroundColor = '';
  }
  if (riskBar) riskBar.style.display = 'none';

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
        setLoggedOutState(); // Limpiar sesión
        throw new Error('Sesión expirada');
      }
      throw new Error('Error en la API');
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

    if (resultDiv) {
      resultDiv.innerHTML = html;
      resultDiv.style.backgroundColor = getGradientColor(data.percentage);
      resultDiv.style.color = '#000';
    }

    const percentage = Number(data.percentage) || 0;
    if (riskBar && riskArrow && riskPercentage) {
      riskBar.style.display = 'block';
      const barWidth = document.getElementById('riskBar').offsetWidth;
      const arrowPosition = (percentage / 100) * barWidth - 8;
      riskArrow.style.left = `${Math.max(0, Math.min(arrowPosition, barWidth-8))}px`;
      riskPercentage.innerText = `${percentage}% de riesgo`;
      riskArrow.style.borderTopColor = percentage > 66 ? 'var(--danger)' : percentage > 33 ? 'var(--warning)' : 'var(--success)';
    }

    // RECARGAR DATOS
    // Esto asegura que el historial y las estadísticas se actualicen
    await loadUserData();
    toast('Análisis completado', 'success');
  } catch (error) {
    if (resultDiv) {
      resultDiv.innerHTML = 'Error: ' + error.message;
      resultDiv.style.backgroundColor = 'rgba(231, 76, 60, .15)';
    }
    toast(`Error: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

// ============================================
// ANÁLISIS DE URL
// ============================================
async function analyzeUrl() {
  const url = document.getElementById('urlInput')?.value.trim();
  const resultDiv = document.getElementById('result');
  const riskBar = document.getElementById('riskBarContainer');

  if (!url) {
    if (resultDiv) {
      resultDiv.innerHTML = 'Por favor, ingresa una URL.';
      resultDiv.style.backgroundColor = '';
    }
    if (riskBar) riskBar.style.display = 'none';
    return;
  }

  const token = localStorage.getItem('phishguard_token');
  if (!token) {
    toast('Debes iniciar sesión', 'error');
    return;
  }

  showLoading(true);
  if (resultDiv) {
    resultDiv.innerHTML = '';
    resultDiv.style.backgroundColor = '';
  }
  if (riskBar) riskBar.style.display = 'none';

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
         setLoggedOutState(); // Limpiar sesión
        throw new Error('Sesión expirada');
      }
      throw new Error('Error en la API');
    }

    const data = await response.json();
    if (resultDiv) {
      resultDiv.innerHTML = `<p style="margin:0; font-weight:700;">URL: ${data.verdict} <span style="color:var(--muted); font-weight:600;">(${data.reason})</span></p>`;
      resultDiv.style.backgroundColor = data.verdict === 'Maliciosa' ? 'rgba(231, 76, 60, .15)' : 'rgba(46, 204, 113, .15)';
      resultDiv.style.color = 'inherit';
    }

    // RECARGAR DATOS
    // Esto asegura que el historial y las estadísticas se actualicen
    await loadUserData();
    toast('Análisis completado', 'success');
  } catch (error) {
    if (resultDiv) {
      resultDiv.innerHTML = 'Error: ' + error.message;
      resultDiv.style.backgroundColor = 'rgba(231, 76, 60, .15)';
    }
    toast(`Error: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

// ============================================
// INICIALIZACIÓN
// ============================================
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Inicializando PhishGuard AI...');
  
  
  await loadUserData();
  
  console.log('✅ Aplicación lista');
  
  
});