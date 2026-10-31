const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Chameleon server is running');
});

const io = new Server(server, { cors: { origin: '*' } });

const rooms = {};

function makeRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms[code]);
  return code;
}

function publicPlayers(room) {
  return room.players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    isHost: p.playerId === room.hostId,
  }));
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name, playerId }) => {
    const code = makeRoomCode();
    rooms[code] = {
      hostId: playerId,
      started: false,
      players: [{ socketId: socket.id, playerId, name, role: null }],
    };
    socket.join(code);
    socket.data = { code, playerId };
    socket.emit('room_joined', { code, players: publicPlayers(rooms[code]) });
  });

  socket.on('join_room', ({ code, name, playerId }) => {
    const room = rooms[code];
    if (!room) return socket.emit('error_msg', 'الغرفة غير موجودة');
    if (room.started) return socket.emit('error_msg', 'اللعبة بدأت بالفعل');
    if (room.players.length >= 10) return socket.emit('error_msg', 'الغرفة ممتلئة');
    if (!room.players.find((p) => p.playerId === playerId)) {
      room.players.push({ socketId: socket.id, playerId, name, role: null });
    }
    socket.join(code);
    socket.data = { code, playerId };
    io.to(code).emit('room_update', { code, players: publicPlayers(room) });
    socket.emit('room_joined', { code, players: publicPlayers(room) });
  });

  socket.on('start_game', () => {
    const { code, playerId } = socket.data || {};
    const room = rooms[code];
    if (!room) return;
    if (room.hostId !== playerId) return socket.emit('error_msg', 'فقط صاحب الغرفة يبدأ اللعبة');
    if (room.players.length < 2) return socket.emit('error_msg', 'لازم لاعبين على الأقل');

    const seekerIndex = Math.floor(Math.random() * room.players.length);
    room.players.forEach((p, i) => {
      p.role = i === seekerIndex ? 'seeker' : 'hider';
    });
    room.started = true;

    room.players.forEach((p) => {
      io.to(p.socketId).emit('role_assigned', { role: p.role });
    });
  });

  socket.on('disconnect', () => {
    const { code, playerId } = socket.data || {};
    const room = rooms[code];
    if (!room) return;
    room.players = room.players.filter((p) => p.playerId !== playerId);
    if (room.players.length === 0) {
      delete rooms[code];
    } else {
      if (room.hostId === playerId) room.hostId = room.players[0].playerId;
      io.to(code).emit('room_update', { code, players: publicPlayers(room) });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on port ' + PORT));
