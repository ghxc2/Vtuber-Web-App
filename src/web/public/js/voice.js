// Temporary Slop for Testing

const voiceStatus = document.getElementById('voiceStatus');
const voiceTableBody = document.getElementById('voiceTableBody');
const voiceWarning = document.getElementById('voiceWarning');

const usersById = {}; // local UI cache

function yesNo(v) {
  return v ? 'Yes' : 'No';
}

function pickAvatarForState(avatarSet, state) {
  const safeSet = avatarSet || {};
  const isDeaf = !!state?.deaf;
  const isMuted = !!state?.mute;
  const isSpeaking = !!state?.speaking;

  if (isDeaf) {
    return safeSet.deafened || safeSet.muted || safeSet.speaking || safeSet.avatar || safeSet.default || '';
  }
  if (isMuted) {
    return safeSet.muted || safeSet.deafened || safeSet.speaking || safeSet.avatar || safeSet.default || '';
  }
  if (isSpeaking) {
    return safeSet.speaking || safeSet.avatar || safeSet.default || '';
  }
  return safeSet.avatar || safeSet.default || safeSet.speaking || '';
}

function renderTable() {
  const users = Object.values(usersById);

  if (!users.length) {
    voiceTableBody.innerHTML = '<tr><td colspan="8">No Users in Channel</td></tr>';
    return;
  }

  voiceTableBody.innerHTML = users
    .map((u) => {
      const renderAvatarCell = (type) => {
        const src = (u.avatarSet && u.avatarSet[type]) || (type === 'avatar' ? (u.avatarUrl || pickAvatarForState(u.avatarSet, u) || '') : '');
        if (!src) return '-';
        return `<img src="${src}" alt="${u.username ?? u.userId}-${type}" width="128" height="128" style="object-fit: cover; border-radius: 8px;" />`;
      };

      return `
      <tr>
        <td>${u.username ?? u.userId}</td>
        <td>${renderAvatarCell('avatar')}</td>
        <td>${renderAvatarCell('speaking')}</td>
        <td>${renderAvatarCell('muted')}</td>
        <td>${renderAvatarCell('deafened')}</td>
        <td>${yesNo(u.speaking)}</td>
        <td>${yesNo(u.mute)}</td>
        <td>${yesNo(u.deaf)}</td>
      </tr>
    `;
    })
    .join('');
}

if (Array.isArray(window.__INITIAL_VOICE_USERS__)) {
  window.__INITIAL_VOICE_USERS__.forEach((u) => {
    usersById[u.userId] = u;
  });
  renderTable();
}

const stream = new EventSource('/voice/events');

stream.onopen = () => {
  voiceStatus.textContent = 'Connected';
};

stream.onmessage = (msg) => {
  const data = JSON.parse(msg.data);

  // Load Data into Table
  if (data.type === 'state' && data.users) {
    const incoming = data.users;
    Object.keys(usersById).forEach((k) => {
      if (!incoming[k]) delete usersById[k];
    });
    Object.keys(incoming).forEach((k) => {
      const prev = usersById[k] || {};
      usersById[k] = { ...prev, ...incoming[k] };
    });
    renderTable();
    return;
  }
};

stream.onerror = () => {
  voiceStatus.textContent = 'Disconnected';
};

function updateVoiceWarning(status) {
  if (!voiceWarning) return;
  const showWarning = !!status?.userInVoice && !status?.inSameChannel;
  voiceWarning.style.display = showWarning ? '' : 'none';
}

async function refreshVoiceWarning() {
  try {
    const res = await fetch('/voice/status', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const data = await res.json();
    updateVoiceWarning(data.voiceStatus || null);
  } catch (_) {
    // Ignore transient failures.
  }
}

setInterval(refreshVoiceWarning, 2000);

