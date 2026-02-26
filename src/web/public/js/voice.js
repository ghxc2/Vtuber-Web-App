// // Create EventSource
// const es = new EventSource('/voice/events');

// // On Message Event
// es.onmessage = (msg) => {
//     const evt = JSON.parse(msg.data);
//     voiceStatus.textContent = `${evt.type} | user: ${evt.userId} | channel: ${evt.channelId}`;
// };

// // Error Handler
// stream.onerror = () => {
//     voiceStatus.textContent = 'Disconnected from voice event stream';
// };


const voiceStatus = document.getElementById('voiceStatus');
const voiceTableBody = document.getElementById('voiceTableBody');

const usersById = {}; // local UI cache

function yesNo(v) {
  return v ? 'Yes' : 'No';
}

function renderTable() {
  const users = Object.values(usersById);

  if (!users.length) {
    voiceTableBody.innerHTML = '<tr><td colspan="4">No Users in Channel</td></tr>';
    return;
  }

  voiceTableBody.innerHTML = users
    .map((u) => `
      <tr>
        <td>${u.username ?? u.userId}</td>
        <td>${yesNo(u.speaking)}</td>
        <td>${yesNo(u.mute)}</td>
        <td>${yesNo(u.deaf)}</td>
      </tr>
    `)
    .join('');
}

const stream = new EventSource('/voice/events');

stream.onopen = () => {
  voiceStatus.textContent = 'Connected';
};

stream.onmessage = (msg) => {
  const data = JSON.parse(msg.data);

  // If server sends full snapshot: { type: 'state', users: { ... } }
  if (data.type === 'state' && data.users) {
    Object.keys(usersById).forEach((k) => delete usersById[k]);
    Object.assign(usersById, data.users);
    renderTable();
    return;
  }

  // If server sends single user event
  const userId = data.userId;
  if (!userId) return;

  if (!usersById[userId]) {
    usersById[userId] = {
      userId,
      username: data.username ?? userId,
      speaking: false,
      mute: false,
      deaf: false,
    };
  }

  const u = usersById[userId];
  if (data.username) u.username = data.username;

  switch (data.type) {
    case 'start': u.speaking = true; break;
    case 'end': u.speaking = false; break;
    case 'muted': u.mute = true; break;
    case 'unmuted': u.mute = false; break;
    case 'deafened': u.deaf = true; break;
    case 'undeafened': u.deaf = false; break;
    default: break;
  }

  renderTable();
};

stream.onerror = () => {
  voiceStatus.textContent = 'Disconnected';
};
