const usersById = {};

function pickAvatarForState(avatarSet, state) {
  const safeSet = avatarSet || {};
  const isDeaf = !!state?.deaf;
  const isMuted = !!state?.mute;
  const isSpeaking = !!state?.speaking;

  if (isDeaf) return safeSet.deafened || safeSet.muted || safeSet.speaking || safeSet.avatar || safeSet.default || '';
  if (isMuted) return safeSet.muted || safeSet.deafened || safeSet.speaking || safeSet.avatar || safeSet.default || '';
  if (isSpeaking) return safeSet.speaking || safeSet.avatar || safeSet.default || '';
  return safeSet.avatar || safeSet.default || safeSet.speaking || '';
}

function renderDisplay() {
  const root = document.body || document.documentElement;
  if (!root) return;
  const users = Object.values(usersById);

  document.querySelectorAll('img[data-display-avatar="1"]').forEach((img) => img.remove());
  if (!users.length) return;

  const fragment = document.createDocumentFragment();
  users.forEach((u) => {
    const avatarSrc = pickAvatarForState(u.avatarSet, u) || u.avatarUrl || '';
    if (!avatarSrc) return;
    const img = document.createElement('img');
    img.src = avatarSrc;
    img.alt = `${u.username || u.userId || 'user'} avatar`;
    img.width = 300;
    img.height = 300;
    img.style.marginRight = '20px';
    img.style.marginBottom = '20px';
    img.setAttribute('data-display-avatar', '1');
    fragment.appendChild(img);
  });
  root.appendChild(fragment);
}

if (Array.isArray(window.__INITIAL_DISPLAY_USERS__)) {
  window.__INITIAL_DISPLAY_USERS__.forEach((u) => {
    usersById[u.userId] = u;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderDisplay);
} else {
  renderDisplay();
}

const streamPath = window.__VOICE_EVENT_PATH__ || '/voice/events';
const stream = new EventSource(streamPath);

stream.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.type === 'state' && data.users) {
    const incoming = data.users;
    Object.keys(usersById).forEach((k) => {
      if (!incoming[k]) delete usersById[k];
    });
    Object.keys(incoming).forEach((k) => {
      const prev = usersById[k] || {};
      usersById[k] = { ...prev, ...incoming[k] };
    });
    renderDisplay();
  }
};
