'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

interface Team {
  id: string;
  uid: string;
  location: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  color: string;
  alternateColor: string;
  isActive: boolean;
  logo: string;
}

interface Competitor {
  id: string;
  uid: string;
  type: string;
  order: number;
  homeAway: 'home' | 'away';
  winner: boolean;
  team: Team;
  score: string;
  linescores: {
    value: number;
    displayValue: string;
    period: number;
  }[];
  records: {
    name: string;
    abbreviation?: string;
    type: string;
    summary: string;
  }[];
}

interface Venue {
  id: string;
  fullName: string;
  address: {
    city: string;
    state: string;
    country: string;
  };
  indoor: boolean;
}

interface Status {
  clock: number;
  displayClock: string;
  period: number;
  type: {
    id: string;
    name: string;
    state: string;
    completed: boolean;
    description: string;
    detail: string;
    shortDetail: string;
  };
}

interface Competition {
  id: string;
  uid: string;
  date: string;
  attendance: number;
  venue: Venue;
  competitors: Competitor[];
  status: Status;
  broadcasts: {
    market: string;
    names: string[];
  }[];
  leaders: {
    name: string;
    displayName: string;
    shortDisplayName: string;
    abbreviation: string;
    leaders: {
      displayValue: string;
      value: number;
      athlete: {
        id: string;
        fullName: string;
        displayName: string;
        shortName: string;
        headshot: string;
        jersey: string;
        position: {
          abbreviation: string;
        };
        team: {
          id: string;
        };
        active: boolean;
      };
      team: {
        id: string;
      };
    }[];
  }[];
  headlines: {
    type: string;
    description: string;
    shortLinkText: string;
  }[];
}

interface Game {
  id: string;
  uid: string;
  date: string;
  name: string;
  shortName: string;
  season: {
    year: number;
    type: number;
    slug: string;
  };
  week: {
    number: number;
  };
  competitions: Competition[];
  status: Status;
}

interface GamesResponse {
  leagues: {
    id: string;
    uid: string;
    name: string;
    abbreviation: string;
    slug: string;
    season: {
      year: number;
      startDate: string;
      endDate: string;
      displayName: string;
      type: {
        id: string;
        type: number;
        name: string;
        abbreviation: string;
      };
    };
  }[];
  events: Game[];
}

export default function Home() {
  const [gamesData, setGamesData] = useState<GamesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const fetchGamesByDate = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      
      const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '74d9463fafmshc4ebac754a3194cp14260djsn6a4aaac8e56f';
      const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'nfl-api-data.p.rapidapi.com';
      const day = date.replace(/-/g, '');
      const response = await axios.get(`https://${RAPIDAPI_HOST}/nfl-scoreboard-day?day=${day}`, {headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }});
      setGamesData(response.data);
      
    } catch (err) {
      setError('Failed to fetch games data. Please try again.');
      console.error('Error fetching games:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = event.target.value;
    setSelectedDate(newDate);
    // Clear previous data when date changes
    setGamesData(null);
    setError(null);
  };

  const handleFetchGames = () => {
    fetchGamesByDate(selectedDate);
  };

  // No automatic fetching on mount - user must click button

  const handleGameClick = (game: Game) => {
    setSelectedGame(game);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedGame(null);
  };

  const getStatusColor = (status: Status) => {
    const statusType = status.type.name;
    
    switch (statusType) {
      case 'STATUS_IN_PROGRESS':
        return 'text-green-500';
      case 'STATUS_TIMEOUT':
        return 'text-yellow-500';
      case 'STATUS_HALFTIME':
        return 'text-blue-500';
      case 'STATUS_FINAL':
        return 'text-gray-500';
      case 'STATUS_SCHEDULED':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusText = (status: Status) => {
    if (status.type.completed) {
      return status.type.shortDetail || status.type.description;
    }
    
    if (status.displayClock && status.displayClock !== '0:00') {
      return `${status.displayClock} - Q${status.period}`;
    }
    
    return status.type.shortDetail || status.type.description;
  };

  const handleRefresh = () => {
    fetchGamesByDate(selectedDate);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            NFL Game Tracker
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            Live NFL games and results
          </p>
          
          {/* Date Picker and Fetch Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <label htmlFor="date-picker" className="text-white font-medium">
                Select Date:
              </label>
              <input
                id="date-picker"
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleFetchGames}
              disabled={loading}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-500 disabled:to-gray-600 text-white font-bold py-3 px-6 rounded-full text-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 shadow-lg"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Loading Games...</span>
                </div>
              ) : (
                'Get Games'
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 px-6 py-4 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}

        {/* Games Display */}
        {gamesData && gamesData.events && gamesData.events.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">
              Games for {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {gamesData.events.map((game) => {
                const competition = game.competitions[0];
                const homeTeam = competition.competitors.find(c => c.homeAway === 'home')?.team;
                const awayTeam = competition.competitors.find(c => c.homeAway === 'away')?.team;
                const homeScore = competition.competitors.find(c => c.homeAway === 'home')?.score;
                const awayScore = competition.competitors.find(c => c.homeAway === 'away')?.score;
                
                return (
                  <div
                    key={game.id}
                    onClick={() => handleGameClick(game)}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 cursor-pointer hover:bg-white/20 transition-all duration-300 transform hover:scale-105"
                  >
                    {/* Game Header */}
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm text-gray-300">
                        Week {game.week.number}
                      </span>
                      <span className={`text-sm font-medium ${getStatusColor(competition.status)}`}>
                        {getStatusText(competition.status)}
                      </span>
                    </div>

                    {/* Teams */}
                    <div className="space-y-4">
                      {/* Away Team */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <img
                            src={awayTeam?.logo}
                            alt={awayTeam?.displayName}
                            className="w-8 h-8"
                          />
                          <span className="text-white font-medium">
                            {awayTeam?.abbreviation}
                          </span>
                        </div>
                        <span className="text-white text-xl font-bold">
                          {awayScore}
                        </span>
                      </div>

                      {/* Home Team */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <img
                            src={homeTeam?.logo}
                            alt={homeTeam?.displayName}
                            className="w-8 h-8"
                          />
                          <span className="text-white font-medium">
                            {homeTeam?.abbreviation}
                          </span>
                        </div>
                        <span className="text-white text-xl font-bold">
                          {homeScore}
                        </span>
                      </div>
                    </div>

                    {/* Venue */}
                    <div className="mt-4 pt-4 border-t border-white/20">
                      <p className="text-sm text-gray-300 text-center">
                        {competition.venue.fullName}
                      </p>
                      <p className="text-xs text-gray-400 text-center mt-1">
                        {competition.venue.address.city}, {competition.venue.address.state}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No Games Message */}
        {gamesData && gamesData.events && gamesData.events.length === 0 && (
          <div className="text-center py-12">
            <p className="text-xl text-gray-300">
              No games found for {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
        )}

        {/* Game Details Modal */}
        {isModalOpen && selectedGame && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                {/* Modal Header */}
                <div className="flex justify-between items-center mb-6">
                  <div className = "flex flex-start items-center gap-2">
                    <h3 className="text-2xl font-bold text-white">
                      Game Details
                    </h3>
                    {/* refresh button */}
                    <button
                      onClick={handleRefresh}
                      className="text-gray-400 hover:text-white text-2xl"
                    >
                      ↻
                    </button>
                  </div>
                  
                  <button
                    onClick={closeModal}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ×
                  </button>
                </div>

                {(() => {
                  const competition = selectedGame.competitions[0];
                  const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
                  const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
                  
                  return (
                    <div className="space-y-6">
                      {/* Game Info */}
                      <div className="bg-white/5 rounded-lg p-4">
                        <h4 className="text-lg font-semibold text-white mb-3">Game Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-400">Date:</span>
                            <span className="text-white ml-2">
                              {new Date(competition.date).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Venue:</span>
                            <span className="text-white ml-2">{competition.venue.fullName}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Attendance:</span>
                            <span className="text-white ml-2">{competition.attendance?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Broadcast:</span>
                            <span className="text-white ml-2">
                              {competition.broadcasts.map(b => b.names.join('/')).join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Teams and Scores */}
                      <div className="bg-white/5 rounded-lg p-4">
                        <h4 className="text-lg font-semibold text-white mb-4">Teams & Scores</h4>
                        <div className="space-y-4">
                          {/* Away Team */}
                          <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <img
                                src={awayTeam?.team.logo}
                                alt={awayTeam?.team.displayName}
                                className="w-12 h-12"
                              />
                              <div>
                                <p className="text-white font-medium">{awayTeam?.team.displayName}</p>
                                <p className="text-gray-400 text-sm">
                                  {awayTeam?.records.find(r => r.type === 'total')?.summary}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-3xl font-bold text-white">{awayTeam?.score}</p>
                              {awayTeam?.winner && (
                                <p className="text-green-400 text-sm font-medium">WINNER</p>
                              )}
                            </div>
                          </div>

                          {/* Home Team */}
                          <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <img
                                src={homeTeam?.team.logo}
                                alt={homeTeam?.team.displayName}
                                className="w-12 h-12"
                              />
                              <div>
                                <p className="text-white font-medium">{homeTeam?.team.displayName}</p>
                                <p className="text-gray-400 text-sm">
                                  {homeTeam?.records.find(r => r.type === 'total')?.summary}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-3xl font-bold text-white">{homeTeam?.score}</p>
                              {homeTeam?.winner && (
                                <p className="text-green-400 text-sm font-medium">WINNER</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Game Leaders */}
                      {competition.leaders && competition.leaders.length > 0 && (
                        <div className="bg-white/5 rounded-lg p-4">
                          <h4 className="text-lg font-semibold text-white mb-4">Game Leaders</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {competition.leaders.map((leader, index) => (
                              <div key={index} className="bg-white/5 rounded-lg p-3">
                                <h5 className="text-white font-medium mb-2">{leader.displayName}</h5>
                                {leader.leaders.map((player, playerIndex) => (
                                  <div key={playerIndex} className="flex items-center space-x-2">
                                    <img
                                      src={player.athlete.headshot}
                                      alt={player.athlete.displayName}
                                      className="w-8 h-8 rounded-full"
                                    />
                                    <div className="flex-1">
                                      <p className="text-white text-sm font-medium">
                                        {player.athlete.displayName}
                                      </p>
                                      <p className="text-gray-400 text-xs">
                                        {player.displayValue}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Headlines */}
                      {competition.headlines && competition.headlines.length > 0 && (
                        <div className="bg-white/5 rounded-lg p-4">
                          <h4 className="text-lg font-semibold text-white mb-4">Game Recap</h4>
                          {competition.headlines.map((headline, index) => (
                            <div key={index} className="mb-3">
                              <h5 className="text-white font-medium mb-2">{headline.shortLinkText}</h5>
                              <p className="text-gray-300 text-sm">{headline.description}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* gamesData */}
                      {gamesData && (() => {
                        
                        return (
                          <div className="mt-4">
                            <button
                                  onClick={() => setShowRaw((prev) => !prev)}
                                  className="text-xs px-3 py-1 rounded bg-white/10 text-white hover:bg-white/20 transition mb-2"
                                  type="button"
                                >
                                  {showRaw ? 'Hide Raw Data' : 'Show Raw Data'}
                                </button>
                                {showRaw && (
                                  <pre className="overflow-x-auto bg-black/70 text-green-300 p-2 rounded text-xs max-h-96">
                                    {JSON.stringify(gamesData, null, 2)}
                                  </pre>
                                )}
                              </div>
                            );
                          })()}
                        
                      
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
}