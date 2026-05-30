const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Serve static frontend files when running locally
app.use(express.static(path.join(__dirname, '../frontend')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store for all active game rooms
// roomCode (string) -> roomState
const rooms = {};

// Helper: Generate a unique 4-digit code
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[code]);
  return code;
}

// Helper: Shuffle array in place
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Helper: Create a deck (52 cards + 1 Joker)
function createDeck() {
  const suits = ['H', 'D', 'C', 'S']; // Hearts, Diamonds, Clubs, Spades
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (const r of ranks) {
    for (const s of suits) {
      deck.push(`${r}-${s}`);
    }
  }
  deck.push('JOKER');
  return shuffle(deck);
}

// Helper: Sort cards by Suit and Rank
function sortHand(hand) {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  
  return [...hand].sort((a, b) => {
    if (a === 'JOKER') return -1;
    if (b === 'JOKER') return 1;
    
    const [rA, sA] = a.split('-');
    const [rB, sB] = b.split('-');
    
    // Order: Spade (1), Heart (2), Club (3), Diamond (4)
    const suitOrder = { 'S': 1, 'H': 2, 'C': 3, 'D': 4 };
    const suitDiff = (suitOrder[sA] || 5) - (suitOrder[sB] || 5);
    if (suitDiff !== 0) return suitDiff;
    
    return ranks.indexOf(rA) - ranks.indexOf(rB);
  });
}

// Helper: Remove pairs of the same rank and color
function removePairsFromHand(hand, discardPile, logs, playerName) {
  const groups = {};
  
  // Group by rank
  for (const card of hand) {
    if (card === 'JOKER') {
      if (!groups['JOKER']) groups['JOKER'] = [];
      groups['JOKER'].push(card);
    } else {
      const [rank] = card.split('-');
      if (!groups[rank]) groups[rank] = [];
      groups[rank].push(card);
    }
  }
  
  const finalHand = [];
  const removedCards = [];
  
  for (const [rank, cards] of Object.entries(groups)) {
    if (rank === 'JOKER') {
      finalHand.push(...cards);
      continue;
    }
    
    // Split by color: Reds (Hearts/Diamonds), Blacks (Spades/Clubs)
    const reds = cards.filter(c => ['H', 'D'].includes(c.split('-')[1]));
    const blacks = cards.filter(c => ['S', 'C'].includes(c.split('-')[1]));
    
    // Remove pairs from reds
    while (reds.length >= 2) {
      removedCards.push(reds.pop());
      removedCards.push(reds.pop());
    }
    finalHand.push(...reds);
    
    // Remove pairs from blacks
    while (blacks.length >= 2) {
      removedCards.push(blacks.pop());
      removedCards.push(blacks.pop());
    }
    finalHand.push(...blacks);
  }
  
  if (removedCards.length > 0) {
    discardPile.push(...removedCards);
    for (let i = 0; i < removedCards.length; i += 2) {
      addLog(logs, `${playerName} discarded pair: ${removedCards[i]} & ${removedCards[i+1]}`);
    }
  }
  
  return { hand: finalHand, removedCards };
}

// Helper: Add log with timestamp
function addLog(logs, message) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
  logs.unshift(`[${timeStr}] ${message}`);
  if (logs.length > 50) {
    logs.pop();
  }
}

// Helper: Get next active player index
function getNeighborIdx(players, startIdx) {
  let idx = (startIdx + 1) % players.length;
  let attempts = 0;
  // Skip players with no cards or who are eliminated
  while (players[idx].hand.length === 0 || players[idx].eliminated) {
    idx = (idx + 1) % players.length;
    attempts++;
    if (attempts > players.length) return null;
  }
  return idx;
}

// Helper: Distribute cards to remaining active players
function distributeCards(cards, players, startIdx, discardPile, logs) {
  if (!cards || cards.length === 0) return;
  
  // Active players: not eliminated and have cards (or is the last player standing)
  const activeIndices = [];
  players.forEach((p, idx) => {
    if (!p.eliminated && (p.hand.length > 0 || players.filter(pl => !pl.eliminated && pl.hand.length > 0).length === 0)) {
      activeIndices.push(idx);
    }
  });
  
  if (activeIndices.length === 0) return;
  
  // Find index in activeIndices closest to startIdx
  let closestNext = activeIndices.findIndex(idx => idx >= startIdx);
  if (closestNext === -1) closestNext = 0;
  
  let current = closestNext;
  const shuffledCards = shuffle([...cards]);
  
  for (const card of shuffledCards) {
    const targetPlayer = players[activeIndices[current]];
    targetPlayer.hand.push(card);
    addLog(logs, `${card === 'JOKER' ? 'JOKER' : card} distributed to ${targetPlayer.name}`);
    
    // Remove pairs from target
    const result = removePairsFromHand(targetPlayer.hand, discardPile, logs, targetPlayer.name);
    targetPlayer.hand = result.hand;
    
    current = (current + 1) % activeIndices.length;
  }
}

// Helper: Check win conditions
function checkGameOver(room) {
  // Active players are those who are not eliminated AND still have cards in hand
  const activePlayers = room.players.filter(p => !p.eliminated && p.hand.length > 0);
  
  if (activePlayers.length === 1) {
    room.status = 'ended';
    const winner = activePlayers[0];
    room.winner = winner.name;
    addLog(room.logs, `GAME OVER! ${winner.name} is the last survivor holding the JOKER!`);
    return true;
  } else if (activePlayers.length === 0) {
    room.status = 'ended';
    room.winner = 'NOBODY';
    addLog(room.logs, `GAME OVER! No survivors remain.`);
    return true;
  }
  return false;
}

// Helper: Advance turn to the next player
function advanceTurn(room) {
  const start = room.currentTurn;
  let attempts = 0;
  while (true) {
    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    const p = room.players[room.currentTurn];
    // A player can take a turn if they are not eliminated and have cards in hand
    if (!p.eliminated && p.hand.length > 0) {
      break;
    }
    attempts++;
    if (attempts > room.players.length + 1) break;
  }
}

// Helper: Mask game state for a specific socket connection
function maskStateForPlayer(room, socketId) {
  const playersMasked = room.players.map(p => {
    const isMe = p.socketId === socketId;
    let handView = [];
    if (isMe) {
      // Sort my hand for visual display
      p.hand = sortHand(p.hand);
      handView = p.hand;
    } else {
      // Mask other player cards
      handView = p.hand.map(() => 'BACK');
    }
    
    return {
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      cardCount: p.hand.length,
      hand: handView,
      isOut: p.hand.length === 0 && !p.eliminated,
      eliminated: p.eliminated,
      isHost: p.isHost
    };
  });
  
  // Find current turn player ID
  const currentTurnPlayer = room.players[room.currentTurn];
  const currentTurnId = currentTurnPlayer ? currentTurnPlayer.id : null;
  const isMyTurn = currentTurnPlayer ? currentTurnPlayer.socketId === socketId : false;
  
  // Find the target to draw from (for this player specifically)
  let targetPlayerId = null;
  const myPlayerIdx = room.players.findIndex(p => p.socketId === socketId);
  if (myPlayerIdx !== -1 && isMyTurn) {
    const targetIdx = getNeighborIdx(room.players, myPlayerIdx);
    if (targetIdx !== null) {
      targetPlayerId = room.players[targetIdx].id;
    }
  }
  
  return {
    code: room.code,
    status: room.status,
    players: playersMasked,
    logs: room.logs,
    currentTurnId,
    isMyTurn,
    targetPlayerId,
    discardPile: room.discardPile.slice(-10), // Send last 10 discard cards
    winner: room.winner
  };
}

// Helper: Broadcast game state to all players in a room
function broadcastState(room) {
  if (!room) return;
  room.players.forEach(p => {
    if (!p.isBot && p.socketId) {
      const state = maskStateForPlayer(room, p.socketId);
      io.to(p.socketId).emit('gameStateUpdated', state);
    }
  });
}

// Helper: Broadcast lobby state to all players in a room
function broadcastLobby(room) {
  if (!room) return;
  const lobbyState = {
    code: room.code,
    status: room.status,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      isHost: p.isHost
    }))
  };
  io.to(room.code).emit('lobbyUpdated', lobbyState);
}

// Helper: Execute a draw action (Shared logic for human and bot)
function executeDraw(room, drawerIdx, targetIdx) {
  const drawer = room.players[drawerIdx];
  const target = room.players[targetIdx];
  
  if (target.hand.length === 0) return { success: false };
  
  // Pick random card from target
  const randIdx = Math.floor(Math.random() * target.hand.length);
  const card = target.hand.splice(randIdx, 1)[0];
  drawer.hand.push(card);
  
  addLog(room.logs, `${drawer.name} drew a card from ${target.name}.`);
  
  let jokerSnatched = false;
  let eliminatedName = null;
  let removedPairs = [];
  
  // Joker rule: If joker is snatched, target is eliminated immediately
  if (card === 'JOKER') {
    jokerSnatched = true;
    eliminatedName = target.name;
    target.eliminated = true;
    addLog(room.logs, `⚡ JOKER SNATCHED! ${target.name} is ELIMINATED! ⚡`);
    
    // Distribute target's remaining cards to others
    const remainingCards = [...target.hand];
    target.hand = []; // Clear hand
    
    distributeCards(remainingCards, room.players, (targetIdx + 1) % room.players.length, room.discardPile, room.logs);
  }
  
  // Check newly formed pairs for drawer
  const pairResult = removePairsFromHand(drawer.hand, room.discardPile, room.logs, drawer.name);
  drawer.hand = pairResult.hand;
  removedPairs = pairResult.removedCards;
  
  // Broadcast a notification for draw visual effects
  io.to(room.code).emit('drawNotification', {
    drawerName: drawer.name,
    targetName: target.name,
    jokerSnatched,
    eliminatedName,
    cardDrawn: drawer.isBot && card !== 'JOKER' ? 'BACK' : card, // Mask bot draw unless JOKER
    removedPairs
  });
  
  const isOver = checkGameOver(room);
  if (!isOver) {
    advanceTurn(room);
    // If the next turn is a bot, schedule bot turn
    const nextPlayer = room.players[room.currentTurn];
    if (nextPlayer && nextPlayer.isBot) {
      scheduleBotTurn(room.code);
    }
  } else {
    // Game over! Clean up bot timers
    if (room.botTimeout) {
      clearTimeout(room.botTimeout);
      room.botTimeout = null;
    }
  }
  
  broadcastState(room);
  return { success: true };
}

// Helper: Schedule bot turn
function scheduleBotTurn(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.status !== 'playing') return;
  
  if (room.botTimeout) clearTimeout(room.botTimeout);
  
  room.botTimeout = setTimeout(() => {
    const r = rooms[roomCode];
    if (!r || r.status !== 'playing') return;
    
    const currIdx = r.currentTurn;
    const botPlayer = r.players[currIdx];
    
    if (!botPlayer || !botPlayer.isBot || botPlayer.eliminated || botPlayer.hand.length === 0) {
      // Not a bot turn or bot is inactive, skip
      advanceTurn(r);
      broadcastState(r);
      const nextPlayer = r.players[r.currentTurn];
      if (nextPlayer && nextPlayer.isBot) {
        scheduleBotTurn(roomCode);
      }
      return;
    }
    
    const targetIdx = getNeighborIdx(r.players, currIdx);
    if (targetIdx !== null) {
      executeDraw(r, currIdx, targetIdx);
    } else {
      // No targets, advance
      advanceTurn(r);
      broadcastState(r);
    }
  }, 1500); // 1.5s thinking time
}

// Helper: Handle when a player leaves or disconnects
function handlePlayerLeave(socket, roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  
  const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
  if (playerIdx === -1) return;
  
  const leavingPlayer = room.players[playerIdx];
  addLog(room.logs, `${leavingPlayer.name} has left the game.`);
  
  if (room.status === 'lobby') {
    // If in lobby, simply remove them
    room.players.splice(playerIdx, 1);
    
    if (room.players.length === 0) {
      // Delete room if empty
      if (room.botTimeout) clearTimeout(room.botTimeout);
      delete rooms[roomCode];
      return;
    }
    
    // Transfer host if leaving player was host
    if (leavingPlayer.isHost) {
      // Set new host to the first human player, or any player
      const newHost = room.players.find(p => !p.isBot);
      if (newHost) {
        newHost.isHost = true;
      } else {
        room.players[0].isHost = true;
      }
    }
    
    broadcastLobby(room);
  } else {
    // If in gameplay, mark them as eliminated and distribute cards
    leavingPlayer.eliminated = true;
    const cardsToDistribute = [...leavingPlayer.hand];
    leavingPlayer.hand = []; // Clear hand
    
    // Distribute cards
    distributeCards(cardsToDistribute, room.players, (playerIdx + 1) % room.players.length, room.discardPile, room.logs);
    
    // Check if host left
    if (leavingPlayer.isHost) {
      leavingPlayer.isHost = false;
      const newHost = room.players.find(p => !p.isBot && !p.eliminated);
      if (newHost) newHost.isHost = true;
    }
    
    // If it was leaving player's turn, advance turn
    if (room.currentTurn === playerIdx) {
      advanceTurn(room);
    }
    
    // Check game over
    const isOver = checkGameOver(room);
    if (!isOver) {
      const nextPlayer = room.players[room.currentTurn];
      if (nextPlayer && nextPlayer.isBot) {
        scheduleBotTurn(roomCode);
      }
    }
    
    // If no human active players left, clean up the room
    const activeHumans = room.players.filter(p => !p.isBot && !p.eliminated);
    if (activeHumans.length === 0) {
      if (room.botTimeout) clearTimeout(room.botTimeout);
      delete rooms[roomCode];
      return;
    }
    
    broadcastState(room);
  }
  
  socket.leave(roomCode);
  delete socket.roomCode;
}

// Socket IO Event Listeners
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  // Event: Create Room
  socket.on('createRoom', ({ playerName }) => {
    if (!playerName || playerName.trim() === '') {
      return socket.emit('errorMsg', 'Name is required to create a room.');
    }
    
    const code = generateRoomCode();
    rooms[code] = {
      code,
      status: 'lobby',
      players: [{
        id: 'player_' + Math.random().toString(36).substr(2, 9),
        socketId: socket.id,
        name: playerName.trim().substring(0, 12),
        isBot: false,
        hand: [],
        eliminated: false,
        isHost: true
      }],
      discardPile: [],
      logs: [],
      currentTurn: 0,
      winner: null,
      botTimeout: null
    };
    
    socket.join(code);
    socket.roomCode = code;
    
    addLog(rooms[code].logs, `${playerName} created the room.`);
    
    socket.emit('roomCreated', { code, playerId: socket.id });
    broadcastLobby(rooms[code]);
  });
  
  // Event: Join Room
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    if (!roomCode || !playerName) {
      return socket.emit('errorMsg', 'Room code and Player name are required.');
    }
    
    const code = roomCode.trim();
    const room = rooms[code];
    
    if (!room) {
      return socket.emit('errorMsg', 'Room not found. Check the 4-digit code.');
    }
    
    if (room.status !== 'lobby') {
      return socket.emit('errorMsg', 'The game has already started in this room.');
    }
    
    if (room.players.length >= 8) {
      return socket.emit('errorMsg', 'Room is full (max 8 players).');
    }
    
    const normalizedName = playerName.trim().substring(0, 12);
    const nameExists = room.players.some(p => p.name.toLowerCase() === normalizedName.toLowerCase());
    if (nameExists) {
      return socket.emit('errorMsg', `Name "${normalizedName}" is already taken in this room.`);
    }
    
    room.players.push({
      id: 'player_' + Math.random().toString(36).substr(2, 9),
      socketId: socket.id,
      name: normalizedName,
      isBot: false,
      hand: [],
      eliminated: false,
      isHost: false
    });
    
    socket.join(code);
    socket.roomCode = code;
    
    addLog(room.logs, `${normalizedName} joined the room.`);
    
    socket.emit('roomJoined', { code, playerId: socket.id });
    broadcastLobby(room);
  });
  
  // Event: Add Bot
  socket.on('addBot', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.status !== 'lobby') return;
    
    // Only host can add bots
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    
    if (room.players.length >= 8) {
      return socket.emit('errorMsg', 'Room is full (max 8 players).');
    }
    
    const botPool = ['Arisu', 'Usagi', 'Cheshire', 'Kuina', 'Aguni', 'Niragi', 'Ann', 'Hatter'];
    // Filter out names already taken in the room
    const availableNames = botPool.filter(name => !room.players.some(p => p.name.toLowerCase() === name.toLowerCase()));
    
    let botName;
    if (availableNames.length > 0) {
      botName = availableNames[Math.floor(Math.random() * availableNames.length)];
    } else {
      botName = `Bot ${room.players.filter(p => p.isBot).length + 1}`;
    }
    
    room.players.push({
      id: 'bot_' + Math.random().toString(36).substr(2, 9),
      socketId: null,
      name: botName,
      isBot: true,
      hand: [],
      eliminated: false,
      isHost: false
    });
    
    addLog(room.logs, `Bot "${botName}" added to the lobby.`);
    broadcastLobby(room);
  });
  
  // Event: Remove Bot / Remove Player
  socket.on('removePlayer', ({ playerId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.status !== 'lobby') return;
    
    // Only host can remove players/bots in lobby
    const sender = room.players.find(p => p.socketId === socket.id);
    if (!sender || !sender.isHost) return;
    
    const targetIdx = room.players.findIndex(p => p.id === playerId);
    if (targetIdx === -1) return;
    
    const target = room.players[targetIdx];
    // Host cannot remove themselves
    if (target.socketId === socket.id) return;
    
    addLog(room.logs, `${target.name} was removed from the lobby.`);
    
    if (target.isBot) {
      room.players.splice(targetIdx, 1);
      broadcastLobby(room);
    } else {
      // Disconnect and remove human player
      const targetSocket = io.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.emit('kicked');
        handlePlayerLeave(targetSocket, code);
      } else {
        room.players.splice(targetIdx, 1);
        broadcastLobby(room);
      }
    }
  });
  
  // Event: Start Game
  socket.on('startGame', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.status !== 'lobby') return;
    
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    
    if (room.players.length < 2) {
      return socket.emit('errorMsg', 'Need at least 2 players to start.');
    }
    
    // Setup and Deal
    room.status = 'playing';
    room.discardPile = [];
    room.logs = [];
    room.winner = null;
    
    const deck = createDeck();
    
    // Distribute cards
    for (let i = 0; i < deck.length; i++) {
      room.players[i % room.players.length].hand.push(deck[i]);
    }
    
    addLog(room.logs, 'Cards dealt. Removing starting pairs...');
    
    // Remove initial pairs
    room.players.forEach(p => {
      const result = removePairsFromHand(p.hand, room.discardPile, room.logs, p.name);
      p.hand = result.hand;
    });
    
    // Set random turn holder from active players
    const activeIndices = [];
    room.players.forEach((p, idx) => {
      if (p.hand.length > 0) activeIndices.push(idx);
    });
    
    room.currentTurn = activeIndices.length > 0 ? activeIndices[Math.floor(Math.random() * activeIndices.length)] : 0;
    
    addLog(room.logs, `Game Started. First Turn: ${room.players[room.currentTurn].name}.`);
    
    // Tell clients to switch screens
    io.to(code).emit('gameStarted');
    
    broadcastState(room);
    
    // If first turn is bot, schedule bot turn
    const currentTurnPlayer = room.players[room.currentTurn];
    if (currentTurnPlayer && currentTurnPlayer.isBot) {
      scheduleBotTurn(code);
    }
  });
  
  // Event: Draw Card
  socket.on('drawCard', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.status !== 'playing') return;
    
    const currIdx = room.currentTurn;
    const player = room.players[currIdx];
    
    // Validate it's this player's turn
    if (!player || player.socketId !== socket.id) {
      return socket.emit('errorMsg', 'It is not your turn.');
    }
    
    const targetIdx = getNeighborIdx(room.players, currIdx);
    if (targetIdx === null) {
      return socket.emit('errorMsg', 'No targets to draw from.');
    }
    
    executeDraw(room, currIdx, targetIdx);
  });
  
  // Event: Leave Room (Manual)
  socket.on('leaveRoom', () => {
    if (socket.roomCode) {
      handlePlayerLeave(socket, socket.roomCode);
    }
  });
  
  // Event: End Game (early termination by Host)
  socket.on('endGame', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.status !== 'playing') return;
    
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || !player.isHost) return;
    
    if (room.botTimeout) {
      clearTimeout(room.botTimeout);
      room.botTimeout = null;
    }
    
    room.status = 'lobby';
    room.players.forEach(p => {
      p.hand = [];
      p.eliminated = false;
    });
    room.discardPile = [];
    room.logs = [];
    room.winner = null;
    
    addLog(room.logs, `Game was ended early by the host.`);
    
    io.to(code).emit('gameEnded');
    broadcastLobby(room);
  });
  
  // Event: Disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (socket.roomCode) {
      handlePlayerLeave(socket, socket.roomCode);
    }
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Socket.IO Server running on port ${PORT}`);
});
