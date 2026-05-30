/**
 * @file script.js
 * @description Core frontend logic for JOKER Multiplayer card game.
 * Interfaces with Socket.IO to manage room state and game loops.
 * @author RoSY
 */

// Connection Setup
// If on localhost/127.0.0.1, connect to local root. Otherwise, connect to saved URL or fallback.
const DEFAULT_BACKEND = "https://old-maid.onrender.com";
const savedBackend = localStorage.getItem('joker_backend_url') || DEFAULT_BACKEND;
const socket = io(
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? '/'
        : savedBackend
);

let myId = null;
let roomCode = null;
let currentLobbyState = null;
let currentGameState = null;

// --- SOCKET EVENT HANDLERS ---

socket.on('connect', () => {
    console.log('Connected to server, Socket ID:', socket.id);
});

socket.on('errorMsg', (msg) => {
    showToast(msg);
});

socket.on('kicked', () => {
    showToast("You were removed from the lobby by the host.");
    resetToStartScreen();
});

socket.on('roomCreated', ({ code, playerId }) => {
    myId = playerId;
    roomCode = code;

    // Switch screens
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
    document.getElementById('display-room-code').innerText = code;
});

socket.on('roomJoined', ({ code, playerId }) => {
    myId = playerId;
    roomCode = code;

    // Switch screens
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
    document.getElementById('display-room-code').innerText = code;
});

socket.on('lobbyUpdated', (lobbyState) => {
    currentLobbyState = lobbyState;
    renderLobby(lobbyState);
});

socket.on('gameStarted', () => {
    // Switch screens
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('game-room-code').innerText = roomCode;
});

socket.on('gameStateUpdated', (state) => {
    currentGameState = state;
    renderGame(state);

    if (state.status === 'ended') {
        setTimeout(() => endGame(state.winner), 1500);
    }
});

socket.on('gameEnded', () => {
    showToast("Host has ended the game. Returning to lobby.");

    // Switch screens
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
});

socket.on('drawNotification', (data) => {
    handleDrawNotification(data);
});

socket.on('activeRoomsCount', (count) => {
    const el = document.getElementById('active-tables-count');
    if (el) {
        el.innerText = count;
    }
});

// --- LOBBY ACTIONS ---

function createRoom() {
    const name = document.getElementById('player-name').value;
    if (!name || name.trim() === '') {
        showToast("Please enter your name first.");
        return;
    }
    socket.emit('createRoom', { playerName: name });
}

function joinRoom() {
    const name = document.getElementById('player-name').value;
    const code = document.getElementById('room-code').value;

    if (!name || name.trim() === '') {
        showToast("Please enter your name first.");
        return;
    }
    if (!code || code.trim().length !== 4) {
        showToast("Please enter a valid 4-digit room code.");
        return;
    }

    socket.emit('joinRoom', { roomCode: code, playerName: name });
}

function addBot() {
    const nextBotNum = currentLobbyState ? currentLobbyState.players.filter(p => p.isBot).length + 1 : 1;
    const botName = prompt("Enter Bot Name:", "Bot " + nextBotNum);
    if (botName === null) return; // User cancelled
    socket.emit('addBot', { botName: botName.trim() });
}

function removePlayer(playerId) {
    socket.emit('removePlayer', { playerId });
}

function startGame() {
    socket.emit('startGame');
}

function leaveRoom() {
    socket.emit('leaveRoom');
    resetToStartScreen();
}

function endGame() {
    socket.emit('endGame');
}

function returnToLobby() {
    document.getElementById('end-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
}

function resetToStartScreen() {
    myId = null;
    roomCode = null;
    currentLobbyState = null;
    currentGameState = null;

    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

// --- RENDERING LOGIC ---

/**
 * Renders the lobby screen list and host-only controls
 */
function renderLobby(lobby) {
    document.getElementById('player-count').innerText = lobby.players.length;

    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '';

    // Find if current player is host
    const me = lobby.players.find(p => p.id === myId);
    const isMeHost = me ? me.isHost : false;

    lobby.players.forEach(p => {
        const li = document.createElement('li');

        let badges = '';
        if (p.isHost) {
            badges += `<span class="host-badge">HOST</span> `;
        }
        if (p.isBot) {
            badges += `<span class="bot-badge">BOT</span>`;
        }

        let kickBtn = '';
        if (isMeHost && p.id !== myId) {
            kickBtn = `<button class="kick-btn" onclick="removePlayer('${p.id}')">REMOVE</button>`;
        }

        li.innerHTML = `
            <div class="player-name-wrapper">
                ${badges}
                <span>${escapeHtml(p.name)}</span>
            </div>
            ${kickBtn}
        `;
        playersList.appendChild(li);
    });

    // Toggle host buttons
    const hostControls = document.querySelectorAll('.host-only');
    hostControls.forEach(el => {
        if (isMeHost) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

/**
 * Renders the main gameplay screen state
 */
function renderGame(state) {
    // Find my representation in players
    const me = state.players.find(p => p.id === myId);
    if (!me) return;

    // Opponents are players that are not me
    const opponents = state.players.filter(p => p.id !== myId);
    const isMyTurn = state.isMyTurn;
    const targetPlayerId = state.targetPlayerId;

    // --- Update turn panels style ---
    const playerArea = document.getElementById('player-container');
    if (isMyTurn) {
        playerArea.classList.add('is-turn');
    } else {
        playerArea.classList.remove('is-turn');
    }

    // --- Render Opponent Hands ---
    const opponentsContainer = document.getElementById('opponents-container');
    opponentsContainer.innerHTML = '';

    opponents.forEach(opp => {
        const isTarget = (opp.id === targetPlayerId);
        const isOppTurn = (state.currentTurnId === opp.id);

        // Mode: 'expanded' if it's my turn and this opponent is the target, else 'deck'
        let handMode = 'deck';
        if (isMyTurn && isTarget) handMode = 'expanded';

        const div = document.createElement('div');
        div.className = `opponent ${opp.isOut ? 'out' : ''} ${opp.eliminated ? 'eliminated-bot' : ''} ${isOppTurn ? 'is-turn' : ''}`;

        let handHtml = '';
        const cardClass = (isMyTurn && isTarget) ? "card back interactive" : "card back";
        const cursorStyle = (isMyTurn && isTarget) ? "cursor: pointer;" : "";

        // Render Cards (backed or expanded)
        for (let i = 0; i < opp.cardCount; i++) {
            const onClick = (isMyTurn && isTarget) ? `onclick="drawCard()"` : '';

            let style = '';
            if (handMode === 'expanded') {
                style = `${cursorStyle}`;
            } else {
                style = `--deck-rot: ${(i % 5) - 2}deg; --deck-x: ${(i % 3) - 1}px;`;
            }
            handHtml += `<div class="${cardClass}" style="${style}" ${onClick}></div>`;
        }

        let status = opp.cardCount + " CARDS";
        if (opp.eliminated) {
            status = "ELIMINATED";
        } else if (opp.isOut) {
            status = "SAFE";
        }

        let avatarEmoji = '👤';
        if (opp.isBot) avatarEmoji = '🤖';
        if (opp.eliminated) avatarEmoji = '💀';
        if (opp.isOut && !opp.eliminated) avatarEmoji = '🏆';

        div.innerHTML = `
            <div class="bot-avatar-display">${avatarEmoji}</div>
            <div class="bot-name-label">${escapeHtml(opp.name)}</div>
            <div class="opponent-hand ${handMode}">
                ${handHtml}
            </div>
            <div class="bot-status">${status}</div>
        `;
        opponentsContainer.appendChild(div);
    });

    // --- Render Player Hand ---
    const playerHand = document.getElementById('player-hand');
    playerHand.innerHTML = '';

    me.hand.forEach((card, index) => {
        const isJoker = card === 'JOKER';
        const className = isJoker ? 'card joker' : 'card';
        let content = '';

        if (!isJoker) {
            const [rank, suit] = card.split('-');
            const color = (suit === 'H' || suit === 'D') ? 'card-red' : 'card-black';
            const suitIcon = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' }[suit];

            content = `
                <div class="card-content-top ${color}">
                    <span class="card-rank">${rank}</span>
                    <span class="card-suit">${suitIcon}</span>
                </div>
                <div class="card-content-center ${color}">${suitIcon}</div>
                <div class="card-content-bottom ${color}">
                    <span class="card-rank">${rank}</span>
                    <span class="card-suit">${suitIcon}</span>
                </div>
            `;
        }

        const cardDiv = document.createElement('div');
        cardDiv.className = className;
        cardDiv.innerHTML = content;

        // Fan Effect
        const total = me.hand.length;
        const rot = (index - total / 2) * 5;
        const y = Math.abs(rot) * 2;
        cardDiv.style.setProperty('--rot', `${rot}deg`);
        cardDiv.style.setProperty('--y', `${y}px`);

        playerHand.appendChild(cardDiv);
    });

    // Update Player Info Text
    document.getElementById('p-name').innerText = me.name;
    const statusEl = document.getElementById('p-status');
    if (me.eliminated) {
        statusEl.innerText = "ELIMINATED";
        statusEl.style.color = "red";
        statusEl.style.textShadow = "0 0 5px red";
    } else {
        statusEl.innerText = me.isOut ? "SAFE" : "ALIVE";
        statusEl.style.color = me.isOut ? "#555" : "#00f3ff";
        statusEl.style.textShadow = me.isOut ? "none" : "0 0 5px #00f3ff";
    }

    // --- Render Discard Pile ---
    const discardDiv = document.getElementById('discard-pile');
    discardDiv.innerHTML = '';

    if (state.discardPile) {
        state.discardPile.forEach((card, i) => {
            const el = document.createElement('div');
            el.className = 'discard-card';

            let content = '';
            let color = '';
            if (card === 'JOKER') {
                content = '<div style="font-size:0.8em">J</div><div>👹</div>';
                color = '#ff0033';
            } else {
                const [rank, suit] = card.split('-');
                const suitIcons = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
                const colorClass = (suit === 'H' || suit === 'D') ? 'card-red' : 'card-black';
                const suitIcon = suitIcons[suit];

                content = `
                    <div class="card-content-top ${colorClass}">
                        <span class="card-rank">${rank}</span>
                        <span class="card-suit">${suitIcon}</span>
                    </div>
                    <div class="card-content-center ${colorClass}">${suitIcon}</div>
                    <div class="card-content-bottom ${colorClass}">
                        <span class="card-rank">${rank}</span>
                        <span class="card-suit">${suitIcon}</span>
                    </div>
                `;
            }

            el.innerHTML = content;
            if (color) el.style.color = color;

            // Random scatter
            const seed = (card.charCodeAt(0) + i * 50);
            const rot = (seed % 60) - 30;
            const x = (seed % 30) - 15;
            const y = ((seed * 2) % 30) - 15;
            el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;

            discardDiv.appendChild(el);
        });
    }

    // --- Render Live Logs ---
    const logsContainer = document.getElementById('game-logs');
    logsContainer.innerHTML = '';
    if (state.logs) {
        state.logs.forEach(log => {
            const logDiv = document.createElement('div');
            // Stylize warnings/joker snatches
            if (log.includes('⚡') || log.includes('ELIMINATED')) {
                logDiv.style.color = 'var(--primary-red)';
            } else if (log.includes('discarded pair')) {
                logDiv.style.color = '#ffcc00';
            }
            logDiv.innerText = log;
            logsContainer.appendChild(logDiv);
        });
    }

    // Toggle host gameplay controls
    const isMeHost = me.isHost;
    const hostGameControls = document.querySelectorAll('#game-screen .host-only');
    hostGameControls.forEach(el => {
        if (isMeHost) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

function drawCard() {
    socket.emit('drawCard');
}

/**
 * Formats a card name for displaying in log/notifications
 */
function formatCardForMessage(c) {
    if (c === "BACK") return `a card`;
    if (c === "JOKER") return `<span style="color:#ff0033; text-shadow: 0 0 10px red;">JOKER</span>`;
    const [rank, suit] = c.split('-');
    const suitIcons = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
    const color = (suit === 'H' || suit === 'D') ? '#ff5555' : '#eaeaea';
    const shadow = (suit === 'H' || suit === 'D') ? '0 0 10px rgba(255,0,0,0.5)' : 'none';
    return `<span style="color:${color}; text-shadow: ${shadow}; font-weight: bold;">${rank}${suitIcons[suit]}</span>`;
}

/**
 * Handles showing temporary animation notifications in center board
 */
function handleDrawNotification(data) {
    const el = document.getElementById('message-area');

    let messageHtml = "";
    if (data.jokerSnatched) {
        el.classList.add('joker-snatch');
        messageHtml = `👹 JOKER SNATCHED! 👹<br>${escapeHtml(data.drawerName)} drew JOKER from ${escapeHtml(data.targetName)}!<br><span style="color:var(--primary-red); text-shadow: 0 0 10px red;">${escapeHtml(data.eliminatedName)} ELIMINATED!</span>`;
    } else {
        el.classList.remove('joker-snatch');
        messageHtml = `${escapeHtml(data.drawerName)} drew ${formatCardForMessage(data.cardDrawn)} from ${escapeHtml(data.targetName)}`;
    }

    showMessage(messageHtml);

    // If pairs were removed, queue another message shortly after
    if (data.removedPairs && data.removedPairs.length > 0) {
        setTimeout(() => {
            let pairsHtml = "DISCARDED PAIRS:<br>";
            for (let i = 0; i < data.removedPairs.length; i += 2) {
                const c1 = formatCardForMessage(data.removedPairs[i]);
                const c2 = formatCardForMessage(data.removedPairs[i + 1]);
                pairsHtml += `${c1} & ${c2}<br>`;
            }
            showMessage(pairsHtml);
            setTimeout(() => {
                el.classList.add('hidden');
            }, 1800);
        }, 1500);
    } else {
        setTimeout(() => {
            el.classList.add('hidden');
        }, 1500);
    }
}

function showMessage(htmlContent) {
    const el = document.getElementById('message-area');
    el.innerHTML = htmlContent;
    el.classList.remove('hidden');
    // Reset animation
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = 'fadeUp 0.4s forwards';
}

/**
 * Renders Game Over screen
 */
function endGame(winner) {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.remove('hidden');

    // Find my player details
    const me = currentGameState ? currentGameState.players.find(p => p.id === myId) : null;
    const amIWinner = me ? me.name === winner : false;

    const title = document.getElementById('end-title');
    const msg = document.getElementById('end-message');

    if (amIWinner) {
        title.innerText = "GAME CLEAR";
        title.style.color = "var(--primary-cyan)";
        title.style.textShadow = "0 0 20px var(--primary-cyan)";
        msg.innerHTML = `CONGRATULATIONS.<br>YOU SURVIVED THE BORDERLANDS AS THE SOLE HOLDER OF JOKER.`;
    } else {
        title.innerText = "GAME OVER";
        title.style.color = "var(--primary-red)";
        title.style.textShadow = "0 0 20px var(--primary-red)";
        msg.innerHTML = `SURVIVOR: ${escapeHtml(winner)}<br>YOU HAVE BEEN ELIMINATED.`;
    }
}

// --- UTILITY FUNCTIONS ---

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.remove('hidden');

    // Auto hide after 3.5s
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Quick reload support for testing (if pressed 'R' outside input)
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && document.activeElement.tagName !== 'INPUT') {
        location.reload();
    }
});
