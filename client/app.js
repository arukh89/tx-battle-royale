const socket = io(); // auto connects to host that serves the client
let currentUser = null;

const el = id => document.getElementById(id);

function appendChat(msg){
  const box = el('chatMessages');
  const d = document.createElement('div');
  d.textContent = msg;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function renderPlayers(players){
  const list = el('playersList'); list.innerHTML='';
  players.forEach(p=>{
    const li = document.createElement('li');
    li.textContent = `${p.display||p.fid}: ${p.guess}`;
    list.appendChild(li);
  });
  el('playersCount').textContent = players.length;
}

function renderLeaderboard(items){
  const list = el('leaderboardList'); list.innerHTML='';
  items.forEach(it=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${it.name}</span><span>${it.wins}</span>`;
    list.appendChild(li);
  });
}

socket.on('connect', ()=>{
  el('status').textContent = 'Connected to server';
});

socket.on('state', state=>{
  renderPlayers(state.players || []);
  renderLeaderboard(state.leaderboard || []);
  const b = state.currentBlock;
  if(b) el('status').innerHTML = `Live block: ${b.height} | ${b.tx_count} TXs`;
});

socket.on('chat', m=> appendChat(m));

socket.on('settlement', s=>{
  appendChat('Settlement: ' + JSON.stringify(s));
});

el('submitPrediction').addEventListener('click', async ()=>{
  const v = parseInt(el('predictionInput').value);
  if(!v || v<=0) return alert('Enter positive number');

  let sig = null;
  if(window.farcaster && window.farcaster.sign){
    try{
      const payload = JSON.stringify({type:'prediction', guess:v, ts:Date.now()});
      sig = await window.farcaster.sign(payload);
    }catch(e){ console.warn('sign failed', e); }
  }

  socket.emit('prediction', { guess: v, sig });
  el('predictionInput').value='';
});

el('sendMessage').addEventListener('click', ()=>{
  const msg = el('chatInput').value.trim(); if(!msg) return;
  socket.emit('chat', msg);
  el('chatInput').value='';
});

el('joinButton').addEventListener('click', ()=>{
  socket.emit('join');
});

el('shareBtn').addEventListener('click', ()=>{
  if(navigator.share) navigator.share({title:'TX Battle Royale',text:'Join my battle',url:location.href});
  else alert('Share not available');
});