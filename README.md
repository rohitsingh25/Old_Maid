# JOKER 

> **Developer:** RoSY  
> **Theme:** Alice in Borderland (Cyberpunk/Survival)  
> **Genre:** Psychological Strategy / Card Game  

## 🃏 Overview
**JOKER** is a web-based psychological survival card game inspired by the "Old Maid" mechanic, but with a twist: the goal is to **survive with the Joker**.

Set in a dystopian, neon-lit cyberpunk atmosphere, players must outlast AI opponents in a game of chance and strategy. The interface features immersive "glassmorphism" UI, dynamic animations, and atmospheric soundscapes (visualized).

## 🎮 Gameplay Mechanics

### Core Rules
1.  **Objective**: Be the last player remaining holding the **JOKER**.
2.  **The Joker**: Unlike traditional Old Maid, the Joker is the *Winning Condition*. Losing it means death (elimination).
3.  **Discarding**: Pairs of the same color (e.g., any Heart + any Diamond, or any Spade + any Club) are discarded automatically to reduce your hand size.
4.  **The Draw**: Players take turns drawing one blind card from their neighbor's hand.
5.  **Elimination**: 
    *   If you run out of cards, you are "Safe" (removed from the table).
    *   If the game ends and you do *not* hold the Joker, you lose.

### Game Loop
1.  **Deal**: 53 cards (Standard 52 + 1 Joker) distributed among players.
2.  **Purge**: All initial pairs are immediately discarded.
3.  **Turns**:
    *   **Player Turn**: Select a card from the Target Opponent (Right).
    *   **Bot Turn**: AI automatically draws from its neighbor.
4.  **Win Condition**: The game ends when only one player remains (who must hold the Joker).

## 🏗️ Technical Architecture

### Backend (Python/Flask)
*   **Framework**: Flask (lightweight WSGI web app framework).
*   **State Management**: `Game` class manages the singleton state instance.
*   **API**: RESTful endpoints (`/api/state`, `/api/draw`, `/api/bot_turn`) provide game state to the frontend client.
*   **Logic**:
    *   `remove_pairs_from_hand()`: Complex algorithm to match pairs by suit color rules.
    *   `distribute_cards()`: Redistribution logic when a player is eliminated holding the Joker (Joker Snatched rule).

### Frontend (Vanilla JS + CSS3)
*   **Rendering**: efficiently polls the game state and renders the DOM using pure JavaScript.
*   **Styling**:
    *   **CSS Variables**: Used for dynamic rotation (`--rot`), positioning (`--y`), and theming.
    *   **Layout**: Flexbox and absolute positioning for Card Fan effects and Table layout.
    *   **Effects**: CSS `backdrop-filter` for glass vibes, `box-shadow` for neon glows, and transform animations.
*   **Responsiveness**: 
    *   **Expanded Mode**: Target opponent's hand expands to full width for easy mobile/desktop selection.
    *   **Deck Mode**: Inactive opponents show a stacked deck to conserve screen real estate.

## 🚀 Setup & Installation

### Prerequisites
*   Python 3.x
*   (Optional) Virtual Environment

### Installation
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/joker-card-game.git
    cd joker-card-game
    ```
2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

### Running the Game
1.  Start the Flask server:
    ```bash
    python3 app.py
    ```
2.  Open your browser and navigate to:
    `http://localhost:5000`

## 👨‍💻 Controls
*   **Mouse**: Click cards to draw.
*   **R Key**: Quick Restart.

## 🤝 Credits
*   **Lead Developer**: RoSY
*   **Assets**: AI Generated (Midjourney/DALL-E)
*   **Font**: Orbitron & Roboto Mono (Google Fonts)

---
*© 2025 RoSY. All Rights Reserved.*
