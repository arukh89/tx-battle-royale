const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname,'..','client')));

const file = path.join(__dirname,'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter);

async function initDB(){
  await db.read();
  db.data = db.data || { players: [], leaderboard: [], rounds: [], settings: {} };
  await db.write();
}
initDB();

async function broadcastState(){
  await db.read();
  const state = { players: db.data.players, leaderboard: db.data.leaderboard, currentBlock: db.data.currentBlock };
  io.emit('state', state);
}

let lastBlockHeight = null;
async function pollBlocks(){
  try{
    const res = await fetch('https://mempool.space/api/blocks');
    const blocks = await res.json();
    if(blocks && blocks.length>0){
      const b = blocks[0];
      await db.read();
      db.data.currentBlock = b;
      await db.write();
      if(lastBlockHeight && b.height !== lastBlockHeight){
        settleRound(b);
      }
      lastBlockHeight = b.height;
      broadcastState();
    }
  }catch(e){ console.warn('poll error', e); }
}
setInterval(pollBlocks, 20000);
pollBlocks();

async function settleRound(block){
  await db.read();
  const players = db.data.players || [];
  if(players.length===0) return;
  const target = block.tx_count;
  let best = null; let bestDiff = Infinity;
  players.forEach(p=>{
    const diff = Math.abs(p.guess - target);
    if(diff < bestDiff){ bestDiff = diff; best = p; }
  });
  const round = { ts: Date.now(), block: block.height, target, winner: best ? { fid: best.fid, display: best.display, guess: best.guess } : null };
  db.data.rounds.push(round);

  let lb = db.data.leaderboard || [];
  if(best){
    const entry = lb.find(x=>x.fid===best.fid);
    if(entry) entry.wins = (entry.wins||0) + 1;
    else lb.push({ fid: best.fid, name: best.display || best.fid, wins: 1 });
  }
  db.data.leaderboard = lb.sort((a,b)=>b.wins - a.wins);

  db.data.players = [];
  await db.write();

  io.emit('settlement', round);
  broadcastState();
}

io.on('connection', socket=>{
  socket.on('join', async ()=>{
    await db.read();
    const p = { fid: socket.id, display: 'anon-'+socket.id.slice(0,5) };
    db.data.players.push(p);
    await db.write();
    broadcastState();
  });

  socket.on('prediction', async (payload)=>{
    await db.read();
    const pIndex = db.data.players.findIndex(x=>x.fid===socket.id);
    const player = pIndex>=0 ? db.data.players[pIndex] : { fid: socket.id, display:'anon-'+socket.id.slice(0,5) };
    player.guess = payload.guess;
    player.sig = payload.sig || null;
    if(pIndex===-1) db.data.players.push(player);
    await db.write();
    broadcastState();
  });

  socket.on('chat', async (msg)=>{
    io.emit('chat', `${socket.id.slice(0,6)}: ${msg}`);
  });

  socket.on('disconnect', async ()=>{
    await db.read();
    db.data.players = (db.data.players||[]).filter(p=>p.fid!==socket.id);
    await db.write();
    broadcastState();
  });
});

const port = process.env.PORT||3000;
server.listen(port, ()=> console.log('Server listening on', port));