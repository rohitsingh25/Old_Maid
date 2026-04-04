import random
from flask import Flask, render_template, jsonify, request
import time
import os
import platform

app = Flask(__name__)

class Game:
    """
    Main Game Controller Class.
    Manages the deck, players, turn logic, and win conditions.
    """
    def __init__(self, human_name="PLAYER", bot_count=3):
        self.players = []
        self.discard_pile = [] # Store pairs removed from play
        self.deck = self.create_deck()
        self.current_turn = 0 
        self.game_over = False
        self.winner = None
        self.logs = []
        
        # --- Player Initialization ---
        # Human player always has ID 0
        self.players.append({"name": human_name, "is_bot": False, "hand": [], "id": 0, "eliminated": False})
        
        # Bot pool names (Alice in Borderland themed)
        bot_names = ["Arisu", "Usagi", "Cheshire", "Kuina", "Aguni", "Niragi", "Ann", "Hatter"]
        random.shuffle(bot_names)
        
        for i in range(bot_count):
            name = bot_names[i % len(bot_names)]
            self.players.append({"name": name, "is_bot": True, "hand": [], "id": i+1, "eliminated": False})
            
        # Initial Deal and Setup
        self.deal_cards()
        self.remove_pairs()
        
        self.current_turn = 0
        self.log("Game Started. Pairs discarded.")

    def create_deck(self):
        """Generates a standard 52-card deck + 1 JOKER."""
        suits = ['H', 'D', 'C', 'S']
        ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
        deck = [f"{r}-{s}" for r in ranks for s in suits]
        deck.append("JOKER")
        random.shuffle(deck)
        return deck
        
    def deal_cards(self):
        """Distributes cards evenly among all players."""
        num_players = len(self.players)
        for i, card in enumerate(self.deck):
            self.players[i % num_players]["hand"].append(card)
            
    def remove_pairs(self):
        """Scans all players and removes pairs based on color rules."""
        for p in self.players:
            self.remove_pairs_from_hand(p)
            
    def remove_pairs_from_hand(self, player):
        """
        Removes pairs from a specific player's hand.
        Rule: Two cards of the same COLOR (Red=H/D, Black=S/C) form a pair.
        """
        hand = player["hand"]
        from collections import defaultdict
        groups = defaultdict(list)
        
        # Group cards by Rank (e.g., all 7s together)
        for card in hand:
            if card == "JOKER":
                groups["JOKER"].append(card)
            else:
                rank = card.split('-')[0]
                groups[rank].append(card)
        
        final_hand = []
        removed_cards = []
        
        # Check pairs in each rank group
        for rank, cards in groups.items():
            if rank == "JOKER":
                final_hand.extend(cards)
                continue
                
            # Separate by color
            reds = [c for c in cards if c.split('-')[1] in ['H', 'D']]
            blacks = [c for c in cards if c.split('-')[1] in ['S', 'C']]
            
            # Process Reds (Remove pairs)
            while len(reds) >= 2:
                removed_cards.append(reds.pop())
                removed_cards.append(reds.pop())
            final_hand.extend(reds)
            
            # Process Blacks (Remove pairs)
            while len(blacks) >= 2:
                removed_cards.append(blacks.pop())
                removed_cards.append(blacks.pop())
            final_hand.extend(blacks)
                    
        player["hand"] = final_hand
        self.discard_pile.extend(removed_cards)
        return removed_cards

    def log(self, message):
        """Adds a message to the system log with timestamp."""
        timestamp = time.strftime("%H:%M:%S")
        self.logs.insert(0, f"[{timestamp}] {message}") 
        if len(self.logs) > 50:
            self.logs.pop()

    def get_neighbor_idx(self, player_idx):
        """Returns the index of the next active player (Right Neighbor)."""
        idx = (player_idx + 1) % len(self.players)
        attempts = 0
        # Skip players with no cards (Eliminated/Safe)
        while len(self.players[idx]["hand"]) == 0:
            idx = (idx + 1) % len(self.players)
            attempts += 1
            if attempts > len(self.players): return None
        return idx
        
    def next_turn(self):
        """Advances the turn pointer to the next active player."""
        start = self.current_turn
        attempts = 0
        while True:
            self.current_turn = (self.current_turn + 1) % len(self.players)
            p = self.players[self.current_turn]
            if len(p["hand"]) > 0: 
                break
            attempts += 1
            if attempts > len(self.players) + 1: break 

    def distribute_cards(self, cards, start_idx):
        """Redistributes cards (used when a player crashes/is eliminated unexpectedly)."""
        if not cards: return
        active_indices = [i for i, p in enumerate(self.players) if len(p["hand"]) > 0]
        if not active_indices: return 
        
        closest_next = -1
        for i in range(len(active_indices)):
            if active_indices[i] >= start_idx:
                closest_next = i
                break
        if closest_next == -1: closest_next = 0
        
        current = closest_next
        random.shuffle(cards)
        for card in cards:
            target_p = self.players[active_indices[current]]
            target_p["hand"].append(card)
            removed = self.remove_pairs_from_hand(target_p)
            if removed:
                self.log(f"{target_p['name']} discarded pair(s) from received cards.")
            
            current = (current + 1) % len(active_indices)

    def check_game_over(self):
        """Checks win conditions (Last Man Standing)."""
        active_players = [p for p in self.players if len(p["hand"]) > 0]
        
        if len(active_players) == 1:
            self.game_over = True
            winner = active_players[0]
            # WIN CONDITION: Must hold JOKER
            if "JOKER" in winner["hand"]:
                self.winner = winner["name"]
                self.log(f"GAME CLEAR! {winner['name']} wins with the JOKER!")
            else:
                self.winner = winner["name"]
                self.log(f"GAME OVER! {winner['name']} left (Technical Win).")
        elif len(active_players) == 0:
            self.game_over = True
            self.winner = "NOBODY"

    def draw_card(self, drawer_idx, target_idx):
        """
        Executes the 'Draw' action.
        1. Drawer picks random card from Target.
        2. Card moves to Drawer.
        3. Logic checks for pairs and game over.
        """
        drawer = self.players[drawer_idx]
        target = self.players[target_idx]
        
        if len(target["hand"]) == 0: return False, None, []
        
        # Pick Random Card
        rand_idx = random.randint(0, len(target["hand"]) - 1)
        card = target["hand"].pop(rand_idx)
        drawer["hand"].append(card)
        
        self.log(f"{drawer['name']} drew from {target['name']}.")
        
        # --- JOKER SNATCHED RULE ---
        # If the Joker was the card drawn, the person who lost it (target) is eliminated.
        if card == "JOKER":
             self.log(f"⚡ JOKER SNATCHED! {target['name']} is ELIMINATED! ⚡")
             target["eliminated"] = True
             
             # Any remaining cards in the eliminated player's hand are distributed to others
             remaining_hand = target["hand"][:]
             target["hand"] = [] # Clear hand
             
             # active players to distribute to, starting from next player
             dist_start_idx = (target_idx + 1) % len(self.players)
             self.distribute_cards(remaining_hand, dist_start_idx)
        
        # Check newly formed pairs
        removed = self.remove_pairs_from_hand(drawer)
        if removed:
             for i in range(0, len(removed), 2):
                 c1, c2 = removed[i], removed[i+1]
                 self.log(f"{drawer['name']} discarded {c1} & {c2}")
             
        self.check_game_over()
        
        if not self.game_over:
            self.next_turn()
            
        return True, card, removed

game_instance = None

# --- API ENDPOINTS ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/start', methods=['POST'])
def start():
    """Initializes a new game session."""
    global game_instance
    data = request.json
    bots = int(data.get('bots', 3))
    game_instance = Game(bot_count=bots)
    return jsonify({"status": "ok"})

@app.route('/api/state')
def state():
    """
    Returns the full game state to the frontend.
    Includes player hands (masked for opponents), logs, and turn info.
    """
    global game_instance
    if not game_instance: return jsonify({"error": "No game"})
    
    # Custom Sort Function for Player Hand
    def card_key(card):
        if card == "JOKER": return (0, 0)
        
        ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
        r, s = card.split('-')
        
        # Order: Joker (0), Spade (1), Heart (2), Club (3), Diamond (4)
        s_rank = 5
        if s == 'S': s_rank = 1
        elif s == 'H': s_rank = 2
        elif s == 'C': s_rank = 3
        elif s == 'D': s_rank = 4
            
        r_rank = ranks.index(r) if r in ranks else 99
        return (s_rank, r_rank)

    players = []
    for p in game_instance.players:
        hand_view = []
        if not p["is_bot"]:
            # Player sees their sorted hand
            p["hand"].sort(key=card_key)
            hand_view = p["hand"]
        else:
            # Mask opponent cards
            hand_view = ["BACK" for _ in p["hand"]]
            
        players.append({
            "id": p["id"],
            "name": p["name"],
            "is_bot": p["is_bot"],
            "hand": hand_view,
            "card_count": len(p["hand"]),
            "is_out": len(p["hand"]) == 0,
            "is_turn": (game_instance.players[game_instance.current_turn]["id"] == p["id"]),
            "eliminated": p.get("eliminated", False)
        })
    
    # Calculate target for user (player 0)
    user_target_idx = game_instance.get_neighbor_idx(0)
    user_target_id = game_instance.players[user_target_idx]["id"] if user_target_idx is not None else None
        
    return jsonify({
        "players": players,
        "logs": game_instance.logs,
        "current_turn": game_instance.current_turn,
        "game_over": game_instance.game_over,
        "winner": game_instance.winner,
        "discard_pile": game_instance.discard_pile[-6:], # Send last few for visuals
        "user_target_id": user_target_id
    })

@app.route('/api/draw', methods=['POST'])
def draw():
    """Endpoint for Human Player drawing a card."""
    global game_instance
    if not game_instance: return jsonify({"error": "No game"})
    
    # Validation: Is it actually proper turn?
    if game_instance.players[game_instance.current_turn]["id"] != 0:
        return jsonify({"error": "Not your turn"}), 400
        
    target_idx = game_instance.get_neighbor_idx(0)
    if target_idx is None: return jsonify({"error": "No target"})
    
    success, card, removed = game_instance.draw_card(0, target_idx)
    
    return jsonify({"success": success, "drawn_card": card, "removed_pair": removed})

@app.route('/api/bot_turn', methods=['POST'])
def bot_turn():
    """Trigger a bot's turn action."""
    global game_instance
    if not game_instance: return jsonify({"error": "No game"})
    if game_instance.game_over: return jsonify({"game_over": True})
    
    curr_idx = game_instance.current_turn
    player = game_instance.players[curr_idx]
    
    if not player["is_bot"]:
        return jsonify({"user_turn": True})
        
    time.sleep(1.0) # Simulate "thinking" time
    target_idx = game_instance.get_neighbor_idx(curr_idx)
    if target_idx is not None:
        game_instance.draw_card(curr_idx, target_idx)
        
    return jsonify({"success": True, "game_over": game_instance.game_over})

if __name__ == '__main__':
    def kill_port(port):
        if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
            return
        if platform.system() == "Linux":
            try:
                print(f"Checking for process on port {port}...")
                os.system(f"fuser -k {port}/tcp")
                time.sleep(1)
            except Exception as e:
                print(f"Error killing port {port}: {e}")
                
    kill_port(5000)
    app.run(debug=True, port=5000)
