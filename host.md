# Joker Card Game Deployment Guide

This guide explains how to run the multiplayer Joker (Old Maid) card game locally and deploy it to **Vercel** (frontend) and **Render** (backend).

---

## 1. Local Development

To run the game locally, both the frontend and backend are run together from the Node.js Express server.

### Prerequisites
- Node.js (v18 or higher recommended)
- npm (Node Package Manager)

### Setup & Run
1. Install dependencies for the backend:
   ```bash
   npm install
   ```
   *(This automatically installs backend packages inside the `backend` folder via the `postinstall` script).*

2. Start the local server:
   ```bash
   npm start
   ```
   *(This starts the backend on port `5000` and serves the frontend locally).*

3. Open your browser and navigate to:
   ```
   http://localhost:5000
   ```
4. Open multiple browser tabs or private windows to test multiplayer rooms locally!

---

## 2. Backend Deployment on Render

Because Render supports persistent connections, it is perfect for hosting the Socket.IO WebSockets backend.

### Deployment Steps
1. Create a free account at [Render](https://render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository containing this project.
4. Configure the Web Service settings:
   - **Name**: `old-maid-backend` (or a name of your choice)
   - **Environment**: `Node`
   - **Region**: Choose the region closest to your target audience.
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. Click **Deploy Web Service**.
6. Once deployed, Render will provide you with a public URL, for example:
   ```
   https://old-maid-backend.onrender.com
   ```
   Copy this URL as you will need it for the frontend configuration.

---

## 3. Frontend Deployment on Vercel

Vercel is designed for static site hosting and will serve the HTML, CSS, JavaScript, and image assets.

### Step A: Update the Backend URL
1. Before deploying, configure your frontend code to connect to your deployed Render URL.
2. Open [frontend/static/script.js](file:///home/rohit/Desktop/GitHub/OLD_MAID/Old_Maid/frontend/static/script.js) and locate the backend URL definition around line 11:
   ```javascript
   const DEFAULT_BACKEND = "https://old-maid-backend.onrender.com";
   ```
3. Replace the placeholder URL with your actual Render Web Service URL.
4. Commit and push these changes to your GitHub repository.

> [!TIP]
> **Developer Shortcut (Console Configuration)**
> Alternatively, you can test the frontend by keeping the default and setting a custom backend URL directly in your browser's dev console:
> ```javascript
> localStorage.setItem('joker_backend_url', 'https://your-custom-backend.onrender.com');
> ```
> Reload the page, and the client will automatically connect to your custom backend!

### Step B: Vercel Deployment
1. Create an account or sign in to [Vercel](https://vercel.com/).
2. Click **Add New** -> **Project**.
3. Import your GitHub repository.
4. Configure the Project settings:
   - **Framework Preset**: `Other` (or standard HTML/CSS)
   - **Root Directory**: `frontend`
   - **Build Command**: Leave empty / default
   - **Output Directory**: Leave empty / default (it will serve the root of the selected `frontend` folder)
5. Click **Deploy**.
6. Once deployment finishes, Vercel will provide your live game url (e.g. `https://old-maid-game.vercel.app`).
7. Open the Vercel URL on your phone or share the link with friends to play real-time multiplayer!

---

## 4. Troubleshooting WebSockets on Render

- **Render Sleep Delay**: Render's free tier spins down Web Services after 15 minutes of inactivity. When launching the game for the first time in a while, it may take 50–90 seconds for the backend to start up and allow connections.
- **CORS Issues**: The backend is preconfigured to accept connections from any origin (`*`). If you run into CORS issues, verify that you are connecting via `http/https` properly and websocket endpoints are reachable.
