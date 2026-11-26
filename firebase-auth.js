import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAPjZ7JNMi0VlwO7c1FlP2F2wYUHdgksM',
  authDomain: 'rhg-app-901e6.firebaseapp.com',
  projectId: 'rhg-app-901e6',
  storageBucket: 'rhg-app-901e6.firebasestorage.app',
  messagingSenderId: '17154887758',
  appId: '1:17154887758:web:596127c4cb3ff14dda331f',
  measurementId: 'G-59WLWRBZPZ'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const originalFetch = window.fetch.bind(window);
let resolveAuthReady;
const authReady = new Promise(resolve => { resolveAuthReady = resolve; });
let backendSession = null;

function setStatus(message, isError = false) {
  const node = document.getElementById('authStatus');
  if (node) {
    node.textContent = message;
    node.classList.toggle('error', isError);
  }
}
function showAuthScreen(show) {
  document.getElementById('authGate')?.classList.toggle('hidden', !show);
  document.body.classList.toggle('rhg-auth-locked', show);
}
function showUser(user) {
  const node = document.getElementById('authUser');
  if (node) node.textContent = user?.displayName || user?.email || '';
  document.getElementById('authSignOut')?.classList.toggle('hidden', !user);
}

window.fetch = async (input, init = {}) => {
  const requestUrl = typeof input === 'string' ? input : input?.url || '';
  const url = new URL(requestUrl, window.location.origin);
  if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
    await authReady;
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }
  }
  return originalFetch(input, init);
};

async function validateBackendSession(user) {
  const token = await user.getIdToken();
  const response = await originalFetch('/api/auth/session', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || data.role !== 'admin') {
    const error = new Error(data.error || 'Esta conta não tem autorização administrativa.');
    error.code = data.code || 'NOT_AUTHORIZED';
    throw error;
  }
  backendSession = data;
  return data;
}

await setPersistence(auth, browserLocalPersistence);

onAuthStateChanged(auth, async user => {
  resolveAuthReady();
  if (!user) {
    backendSession = null;
    showUser(null);
    showAuthScreen(true);
    setStatus('Entre com a conta Google autorizada para acessar o RHG App.');
    return;
  }
  showAuthScreen(true);
  setStatus('Validando sua conta com o servidor RHG…');
  try {
    if (!user.emailVerified) throw new Error('A conta Google precisa estar com o e-mail verificado.');
    await validateBackendSession(user);
    showUser(user);
    showAuthScreen(false);
    setStatus('Acesso autorizado.');
    // Recarrega os dados que podem ter sido solicitados antes da sessão ficar pronta.
    if (typeof window.loadSharedHistory === 'function') await window.loadSharedHistory();
    if (typeof window.rhgLoadCatalog === 'function') await window.rhgLoadCatalog(true).catch(() => {});
  } catch (error) {
    console.error('Falha na autenticação RHG:', error);
    backendSession = null;
    await signOut(auth);
    showAuthScreen(true);
    setStatus(error.message || 'Não foi possível validar o acesso.', true);
  }
});

async function login() {
  const button = document.getElementById('googleLogin');
  button.disabled = true;
  setStatus('Abrindo o acesso Google…');
  try {
    const result = await signInWithPopup(auth, provider);
    await validateBackendSession(result.user);
  } catch (error) {
    console.error('Login Google RHG:', error);
    if (error.code === 'auth/popup-blocked') setStatus('O navegador bloqueou a janela. Permita pop-ups para este site e tente novamente.', true);
    else if (error.code === 'auth/unauthorized-domain') setStatus('Este domínio ainda não está autorizado no Firebase Authentication.', true);
    else if (error.code === 'ADMIN_ONLY' || error.code === 'NOT_AUTHORIZED') setStatus('Conta Google autenticada, mas sem permissão administrativa.', true);
    else setStatus(error.message || 'Não foi possível entrar com Google.', true);
  } finally {
    button.disabled = false;
  }
}

document.getElementById('googleLogin')?.addEventListener('click', login);
document.getElementById('authSignOut')?.addEventListener('click', () => signOut(auth));
window.rhgAuth = { auth, get currentUser() { return auth.currentUser; }, get backendSession() { return backendSession; }, signOut: () => signOut(auth) };
