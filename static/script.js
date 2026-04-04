/**
 * @file script.js
 * @description Core frontend logic for the JOKER card game. Handles game initialization, 
 * state polling, DOM rendering, and user interactions.
 * @author RoSY
 */

let pollInterval = null;
let isBotThinking = false;
let myId = 0;

/**
 * Initializes the game by sending a configuration request to the server.
 * Transitions the UI from Start Screen to Game Screen.
 */
async function startGame() {
    const bots = document.getElementById('bot-count').value;
    try {
        await fetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bots: parseInt(bots) })
        });

        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');

        // Start Game Loop (Polling)
        pollInterval = setInterval(gameLoop, 1000);
        gameLoop();

    } catch (e) {
        console.error(e);
        alert("Failed to start game");
    }
}

/**
 * Main Game Loop (1s Interval).
 * Fetches current game state and updates the UI.
 * Handles triggering bot turns if it is currently a bot's move.
 */
async function gameLoop() {
    if (isBotThinking) return;

    try {
        const res = await fetch('/api/state');
        const state = await res.json();

        renderGame(state);

        if (state.game_over) {
            clearInterval(pollInterval);
            setTimeout(() => endGame(state.winner), 1000);
            return;
        }

        // Check if it's a Bot's turn
        const currentPlayer = state.players[state.current_turn];
        if (currentPlayer.is_bot) {
            isBotThinking = true;
            await fetch('/api/bot_turn', { method: 'POST' });
            isBotThinking = false;
            gameLoop(); // Refresh state immediately after bot move
        }

    } catch (e) {
        console.error(e);
    }
}

/**
 * Renders the entire game state to the DOM.
 * @param {Object} state - The game state object returned from the API.
 */
function renderGame(state) {
    const players = state.players;
    const me = players.find(p => p.id === 0);
    const bots = players.filter(p => p.id !== 0);
    const isMyTurn = (players[state.current_turn].id === 0);
    const targetId = state.user_target_id;

    // --- Render Bot Opponents ---
    const botsContainer = document.getElementById('opponents-container');
    botsContainer.innerHTML = '';

    bots.forEach(bot => {
        const isTarget = (bot.id === targetId);

        // Mode: 'expanded' if it's my turn and this bot is the target, else 'deck'
        let handMode = 'deck';
        if (isMyTurn && isTarget) handMode = 'expanded';

        const div = document.createElement('div');
        div.className = `opponent ${bot.is_out ? 'out' : ''} ${bot.eliminated ? 'eliminated-bot' : ''}`;

        let handHtml = '';
        const cardClass = (isMyTurn && isTarget) ? "card back interactive" : "card back";
        const cursorStyle = (isMyTurn && isTarget) ? "cursor: pointer;" : "";

        // Render Bot Cards
        for (let i = 0; i < bot.card_count; i++) {
            const onClick = (isMyTurn && isTarget) ? `onclick="drawCard()"` : '';

            let style = '';
            if (handMode === 'expanded') {
                // Expanded Mode: Cards naturally flow (flexbox), pointer cursor
                style = `${cursorStyle}`;
            } else {
                // Deck Mode: Cards are stacked tightly with slight rotation for realism
                style = `--deck-rot: ${(i % 5) - 2}deg; --deck-x: ${(i % 3) - 1}px;`;
            }

            handHtml += `<div class="${cardClass}" style="${style}" ${onClick}></div>`;
        }

        let status = bot.card_count + " CARDS";
        if (bot.eliminated) status = "ELIMINATED";

        div.innerHTML = `
            <div class="bot-avatar"></div> 
            <div class="opponent-hand ${handMode}">
                ${handHtml}
            </div>
            <div class="bot-status">${status}</div>
        `;
        botsContainer.appendChild(div);
    });

    // --- Render Player Hand ---
    const playerContainer = document.getElementById('player-hand');
    playerContainer.innerHTML = '';

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

        // Fan Effect Calculation
        const total = me.hand.length;
        const rot = (index - total / 2) * 5;
        const y = Math.abs(rot) * 2;

        cardDiv.style.setProperty('--rot', `${rot}deg`);
        cardDiv.style.setProperty('--y', `${y}px`);

        playerContainer.appendChild(cardDiv);
    });

    // Update Player Status Text
    const statusEl = document.getElementById('p-status');
    if (me.eliminated) {
        statusEl.innerText = "ELIMINATED";
        statusEl.style.color = "red";
    } else {
        statusEl.innerText = me.is_out ? "SAFE" : "ALIVE";
        statusEl.style.color = me.is_out ? "#555" : "#00f3ff";
    }

    // --- Render Discard Pile ---
    const discardDiv = document.getElementById('discard-pile');
    discardDiv.innerHTML = '';

    if (state.discard_pile) {
        const pile = state.discard_pile.slice(-10); // Show last 10 for performance/clutter
        pile.forEach((card, i) => {
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
                // Use class names for color instead of hex to match player cards
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
                // Reset color logic because classes handle it now (except Joker)
                color = '';
            }

            el.innerHTML = content;
            // Only apply specific color if it was the Joker, else let class handle it
            if (color) el.style.color = color;

            // Random Scatter Effect for Discard Pile
            const seed = (card.charCodeAt(0) + i * 50);
            const rot = (seed % 60) - 30;
            const x = (seed % 30) - 15;
            const y = ((seed * 2) % 30) - 15;
            el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;

            discardDiv.appendChild(el);
        });
    }
}

/**
 * Handles the User's action of drawing a card.
 */
async function drawCard() {
    try {
        const res = await fetch('/api/draw', { method: 'POST' });
        const data = await res.json();
        if (data.error) {
            // Ignore click if invalid
        } else {
            let msg = "";
            const card = data.drawn_card;

            // Helper to format card text for notification
            const formatCard = (c) => {
                if (c === "JOKER") return `<span style="color:#ff0033; text-shadow: 0 0 10px red;">JOKER</span>`;
                const [rank, suit] = c.split('-');
                const suitIcons = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
                const color = (suit === 'H' || suit === 'D') ? '#ff5555' : '#eaeaea';
                const shadow = (suit === 'H' || suit === 'D') ? '0 0 10px rgba(255,0,0,0.5)' : 'none';
                return `<span style="color:${color}; text-shadow: ${shadow}; font-size: 1.2em;">${rank} ${suitIcons[suit]}</span>`;
            };

            msg = `DREW ${formatCard(card)}`;
            showMessage(msg);

            // If pairs were removed, show follow-up message
            if (data.removed_pair && data.removed_pair.length > 0) {
                setTimeout(() => {
                    const c1 = formatCard(data.removed_pair[0]);
                    const c2 = formatCard(data.removed_pair[1]);
                    showMessage(`DISCARDED<br>${c1} & ${c2}`);

                    setTimeout(() => {
                        document.getElementById('message-area').classList.add('hidden');
                        gameLoop();
                    }, 2000);
                }, 1000);
            } else {
                setTimeout(() => {
                    document.getElementById('message-area').classList.add('hidden');
                    gameLoop();
                }, 1000);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

/**
 * Displays a temporary overlay message to the user.
 * @param {string} msg - HTML content to display.
 */
function showMessage(msg) {
    const el = document.getElementById('message-area');
    el.innerHTML = msg;
    el.classList.remove('hidden');
    // Reset Animation
    el.style.animation = 'none';
    el.offsetHeight; /* Trigger reflow */
    el.style.animation = 'fadeUp 0.5s forwards';
}

/**
 * Handles Game Over state and displays the winner.
 * @param {string} winner - Name of the winner.
 */
function endGame(winner) {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.remove('hidden');
    const isWin = (winner === 'PLAYER');

    const title = document.getElementById('end-title');
    const msg = document.getElementById('end-message');

    if (isWin) {
        title.innerText = "GAME CLEAR";
        title.style.color = "#00f3ff";
        title.style.textShadow = "0 0 20px #00f3ff";
        msg.innerHTML = `CONGRATULATIONS.<br>YOU SURVIVED THE BORDERLANDS.`;
    } else {
        title.innerText = "GAME OVER";
        title.style.color = "#ff0033";
        title.style.textShadow = "0 0 20px #ff0033";
        msg.innerHTML = `WINNER: ${winner}<br>YOU HAVE BEEN ELIMINATED.`;
    }
}

// Quick Restart Hotkey
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') {
        location.reload();
    }
});
