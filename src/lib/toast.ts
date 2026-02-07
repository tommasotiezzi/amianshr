/**
 * Notifiche toast temporanee.
 * Appaiono in alto a destra e scompaiono dopo 3 secondi.
 */

export function showToast(message: string, type: 'success' | 'error' = 'success') {
  // Rimuovi toast esistente
  document.querySelector('.toast-container')?.remove();

  const el = document.createElement('div');
  el.className = 'toast-container fixed top-6 right-6 z-50';
  el.innerHTML = `
    <div class="toast-slide-in ${
      type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
    } text-white px-5 py-3 rounded-xl shadow-elevated text-sm font-medium">
      ${message}
    </div>
  `;

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}