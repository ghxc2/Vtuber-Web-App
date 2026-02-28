// Temporary Slop for Testing

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

  // Load Data into Table
  if (data.type === 'state' && data.users) {
    Object.keys(usersById).forEach((k) => delete usersById[k]);
    Object.assign(usersById, data.users);
    renderTable();
    return;
  }
};

stream.onerror = () => {
  voiceStatus.textContent = 'Disconnected';
};
