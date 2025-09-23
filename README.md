
# NFL Game Tracker

A modern web application that connects to the NFL API on RapidAPI to display real-time game status, play-by-play data, and advanced game details. Features include dark mode scrollbars, a wider modal for game details, and optimized React code for performance.


## Features

- 🏈 Real-time NFL game status tracking
- 📊 Live play-by-play updates
- 🎲 Random game selection from current games
- ⏱️ Auto-refresh every 30 seconds
- 🎨 Modern UI with Tailwind CSS
- 🌑 Dark mode scrollbars for a seamless experience
- �️ Wider modal for detailed game info
- ⚡ Optimized React codebase for performance
- �📱 Responsive design

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Get RapidAPI Key

1. Visit [RapidAPI NFL API](https://rapidapi.com/Creativesdev/api/nfl-api-data/)
2. Subscribe to the API
3. Copy your API key

### 3. Configure Environment


Create a `.env.local` file in the root directory:

```bash
NEXT_PUBLIC_RAPIDAPI_KEY=your-rapidapi-key-here
NEXT_PUBLIC_RAPIDAPI_HOST=nfl-api-data.p.rapidapi.com
```


### 4. Run the Application

#### Development Mode
```bash
npm run dev
```
#### Production Mode
```bash
npm run build
npm run start
```

### 5. Access the Application

- Frontend: http://localhost:3000


## API Endpoints

- `GET /api/games/current` - Get all current games
- `GET /api/games/random-current` - Get a random current game with details
- `GET /api/games/:gameId` - Get specific game details


## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **API**: RapidAPI NFL API
- **HTTP Client**: Axios


## Project Structure

```
nfl-game-tracker/
├── src/
│   └── app/
│       └── page.tsx          # Main game tracker component
├── public/                   # Static assets
├── package.json
└── README.md
```


## Usage

1. Click "Get Games" to fetch NFL games for a selected date
2. Click on a game card to view detailed modal with:
   - Game status (Live, Timeout, Halftime, Final)
   - Team names and scores
   - Current quarter and time
   - Recent plays with player information
   - Odds and other game data
3. The app automatically refreshes every 30 seconds


## Notes

- The app filters for games that are currently in progress, recently finished, or in timeout
- Player names and numbers are displayed when available
- The UI is fully responsive and works on mobile devices
- Scrollbars are styled for dark mode