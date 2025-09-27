'use client';

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

const RAPIDAPI_KEY = process.env.NEXT_PUBLIC_RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.NEXT_PUBLIC_RAPIDAPI_HOST;

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

interface Play {
  sequenceNumber?: number | string;
  wallclock?: string;
  period?: { number?: number };
  clock?: { displayValue?: string };
  type?: { text?: string; alternativeText?: string };
  shortText?: string;
  shortAlternativeText?: string;
}

interface RawPlaysResponse {
  items?: Play[];
  plays?: Play[];
  [key: string]: unknown;
}

interface Unified {
  gameId: string;
  isStoppage: boolean;
  confidence: string;
  stoppageReason: string | null;
  stoppageDurationSeconds: number | null;
  stoppageDurationPretty: string;
  gameStatus: string;
  lastPlaySummary: string;
  totalPlays: number;
}

interface SelectedGame {
  unified: Unified;
  gameData: RawPlaysResponse & Record<string, unknown>;
  odds?: unknown;
  competitions?: Competition[];
}

type JSONFormatterInstance = {
  render: () => HTMLElement;
};

type JSONFormatterConstructor = new (obj: unknown, depth?: number, opts?: Record<string, unknown>) => JSONFormatterInstance;

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds as number)) return "—";
  const s = Math.max(0, Math.floor(seconds as number));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function isExplicitStoppage(playTypeText = "", shortText = "") {
  const t = (playTypeText || "").toLowerCase();
  const s = (shortText || "").toLowerCase();
  return (
    t.includes("timeout") ||
    (t.includes("end") && (t.includes("quarter") || t.includes("half") || t.includes("game"))) ||
    t.includes("two-minute warning") ||
    t.includes("review") ||
    s.includes("timeout") ||
    (s.includes("end") && (s.includes("quarter") || s.includes("half") || s.includes("game"))) ||
    s.includes("two-minute warning") ||
    s.includes("review")
  );
}

function inferStoppageFromPlays(plays: Play[]) {
  if (!Array.isArray(plays) || plays.length === 0) {
    return {
      isStoppage: false,
      confidence: "low",
      stoppageReason: null,
      stoppageDurationSeconds: null,
      gameStatus: "unknown",
      lastPlaySummary: "",
    };
  }
  const sorted = [...plays].sort((a, b) => {
    const sa = Number(a.sequenceNumber ?? 0);
    const sb = Number(b.sequenceNumber ?? 0);
    if (!Number.isNaN(sa) && !Number.isNaN(sb) && sa !== sb) return sa - sb;
    const ta = Date.parse(a.wallclock || "") || 0;
    const tb = Date.parse(b.wallclock || "") || 0;
    return ta - tb;
  });

  const last = sorted[sorted.length - 1] || {};
  const now = Date.now();
  const lastWallclockMs = Date.parse(last.wallclock || "") || null;
  const secsSinceLastPlay = lastWallclockMs ? Math.floor((now - lastWallclockMs) / 1000) : null;
  const periodNum = last?.period?.number ?? null;
  const clockDisp = last?.clock?.displayValue ?? null;
  const typeText = last?.type?.text || last?.type?.alternativeText || "";
  const shortText = last?.shortText || last?.shortAlternativeText || "";

  if (isExplicitStoppage(typeText, shortText)) {
    return {
      isStoppage: true,
      confidence: "high",
      stoppageReason: typeText || "Stoppage",
      stoppageDurationSeconds: secsSinceLastPlay,
      gameStatus: `Q${periodNum ?? "?"} ${clockDisp ?? ""}`.trim(),
      lastPlaySummary: shortText || typeText || "",
    };
  }

  if (secsSinceLastPlay != null && secsSinceLastPlay > 60) {
    return {
      isStoppage: true,
      confidence: "medium",
      stoppageReason: "Possible stoppage (no events > 60s)",
      stoppageDurationSeconds: secsSinceLastPlay,
      gameStatus: `Q${periodNum ?? "?"} ${clockDisp ?? ""}`.trim(),
      lastPlaySummary: shortText || typeText || "",
    };
  }

  return {
    isStoppage: false,
    confidence: "medium",
    stoppageReason: null,
    stoppageDurationSeconds: null,
    gameStatus: `Q${periodNum ?? "?"} ${clockDisp ?? ""}`.trim(),
    lastPlaySummary: shortText || typeText || "",
  };
}

function toUnifiedResponse(gameId: string, raw: RawPlaysResponse | null) {
  const plays: Play[] = (raw?.items as Play[] | undefined) || (raw?.plays as Play[] | undefined) || [];
  const inf = inferStoppageFromPlays(plays);
  return {
    gameId,
    isStoppage: inf.isStoppage,
    confidence: inf.confidence,
    stoppageReason: inf.stoppageReason,
    stoppageDurationSeconds: inf.stoppageDurationSeconds,
    stoppageDurationPretty: formatDuration(inf.stoppageDurationSeconds),
    gameStatus: inf.gameStatus,
    lastPlaySummary: inf.lastPlaySummary,
    totalPlays: Array.isArray(plays) ? plays.length : 0,
  };
}

export default function Home() {
  const [gamesData, setGamesData] = useState<GamesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedGame, setSelectedGame] = useState<SelectedGame | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [showPlays, setShowPlays] = useState(false);
  const [showOtherData, setShowOtherData] = useState(false);
  const [rawDataFormatter, setRawDataFormatter] = useState<JSONFormatterInstance | null>(null);
  const [otherDataFormatter, setOtherDataFormatter] = useState<JSONFormatterInstance | null>(null);
  const [oddsFormatter, setOddsFormatter] = useState<JSONFormatterInstance | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const rawDataRef = useRef<HTMLDivElement>(null);
  const otherDataRef = useRef<HTMLDivElement>(null);
  const oddsRef = useRef<HTMLDivElement>(null);
  const fetchGamesByDate = async (date: string) => {

    setLoading(true);
    setError(null);
    try {
      const day = date.replace(/-/g, '');
      const response = await axios.get(`https://${RAPIDAPI_HOST}/nfl-scoreboard-day?day=${day}`, {
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': RAPIDAPI_HOST
        }
      });
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

  const handleGameClick = async (game: Game) => {
    // Set a temporary SelectedGame so modal can open immediately with basic info
    setSelectedGame({
      unified: {
        gameId: game.id,
        isStoppage: false,
        confidence: 'low',
        stoppageReason: null,
        stoppageDurationSeconds: null,
        stoppageDurationPretty: '—',
        gameStatus: '',
        lastPlaySummary: '',
        totalPlays: 0,
      },
      gameData: {},
      odds: null,
      competitions: game.competitions,
    });
    setIsModalLoading(true);
    setIsModalOpen(true);

    const options = {
      method: 'GET',
      url: 'https://nfl-api-data.p.rapidapi.com/nfl-plays',
      params: {
        id: game.id
      },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY || 'd107b6c225msh5c3f2338251f4f7p11b7f8jsn20be93c7d3ff',
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    }
    const anotherOptions = {
      method: 'GET',
      url: 'https://nfl-api-data.p.rapidapi.com/nfl-eventodds',
      params: { id: game.id },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY || 'd107b6c225msh5c3f2338251f4f7p11b7f8jsn20be93c7d3ff',
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    }
    try {
      const response = await axios.request(options);
      const resp = await axios.request(anotherOptions);
      const odds = resp.data;
      const gameData = response.data;
      const unified = toUnifiedResponse(game.id, gameData);
      setSelectedGame({ unified, gameData, odds, competitions: game.competitions })
      setIsModalLoading(false);

    } catch (error) {
      console.error(error);
      setIsModalLoading(false);
    }
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchGamesByDate(selectedDate);
    } finally {
      // Add a small delay to show the animation
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
    }
  };

  // Create JSON formatters when selectedGame changes
  useEffect(() => {
    if (selectedGame?.gameData) {
      const { gameData, odds } = selectedGame;

      let mounted = true;

      (async () => {
        try {
          const mod = (await import('json-formatter-js')) as unknown;
          const modTyped = mod as { default?: unknown };
          const JSONFormatter = (typeof modTyped.default === 'function' ? (modTyped.default as unknown) : (mod as unknown)) as unknown as JSONFormatterConstructor;

          // Create formatter for raw game data
          const rawFormatter = new JSONFormatter(gameData, 1, {
            theme: 'dark',
            hoverPreviewEnabled: true,
            hoverPreviewArrayCount: 100,
            hoverPreviewFieldCount: 5,
            animateOpen: true,
            animateClose: true
          });

          // Create formatter for other data (excluding items)
          const otherData = Object.fromEntries(
            Object.entries(gameData).filter(([key]) => key !== 'items')
          );

          const otherFormatter = new JSONFormatter(otherData, 1, {
            theme: 'dark',
            hoverPreviewEnabled: true,
            hoverPreviewArrayCount: 100,
            hoverPreviewFieldCount: 5,
            animateOpen: true,
            animateClose: true
          });

          // Create formatter for odds data
          let oddsFormatterLocal: JSONFormatterInstance | null = null;
          if (odds) {
            oddsFormatterLocal = new JSONFormatter(odds, 1, {
              theme: 'dark',
              hoverPreviewEnabled: true,
              hoverPreviewArrayCount: 100,
              hoverPreviewFieldCount: 5,
              animateOpen: true,
              animateClose: true
            });
          }

          if (!mounted) return;
          setRawDataFormatter(rawFormatter as JSONFormatterInstance);
          setOtherDataFormatter(otherFormatter as JSONFormatterInstance);
          setOddsFormatter(oddsFormatterLocal as JSONFormatterInstance | null);
        } catch (error) {
          console.error('Error creating formatters:', error);
        }
      })();

      return () => {
        mounted = false;
      };
    }
  }, [selectedGame]);

  // Render formatters to DOM when they change
  useEffect(() => {
    if (rawDataFormatter && rawDataRef.current && showRaw) {
      rawDataRef.current.innerHTML = '';
      rawDataRef.current.appendChild(rawDataFormatter.render());
    }
  }, [rawDataFormatter, showRaw]);

  useEffect(() => {
    if (otherDataFormatter && otherDataRef.current && showOtherData) {
      otherDataRef.current.innerHTML = '';
      otherDataRef.current.appendChild(otherDataFormatter.render());
    }
  }, [otherDataFormatter, showOtherData]);

  useEffect(() => {
    if (oddsFormatter && oddsRef.current && showOdds) {
      oddsRef.current.innerHTML = '';
      oddsRef.current.appendChild(oddsFormatter.render());
    }
  }, [oddsFormatter, showOdds]);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-8"
          >
            <motion.h1
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-4xl md:text-6xl font-bold text-white mb-4"
            >
              NFL Game Tracker
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-xl text-gray-300 mb-8"
            >
              Live NFL games and results
            </motion.p>

            {/* Date Picker and Fetch Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
            >
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
            </motion.div>
          </motion.div>

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
                {gamesData.events.map((game, index) => {
                  const competition = game.competitions[0];
                  const homeTeam = competition?.competitors.find(c => c.homeAway === 'home')?.team;
                  const awayTeam = competition?.competitors.find(c => c.homeAway === 'away')?.team;
                  const homeScore = competition?.competitors.find(c => c.homeAway === 'home')?.score;
                  const awayScore = competition?.competitors.find(c => c.homeAway === 'away')?.score;

                  return (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      whileHover={{ scale: 1.05, y: -5 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleGameClick(game)}
                      className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 cursor-pointer hover:bg-white/20 transition-all duration-300"
                    >
                      {/* Game Header */}
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-sm text-gray-300">
                          Week {game.week.number}
                        </span>
                        <span className={`text-sm font-medium ${getStatusColor(competition?.status)}`}>
                          {getStatusText(competition?.status)}
                        </span>
                      </div>

                      {/* Teams */}
                      <div className="space-y-4">
                        {/* Away Team */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Image
                              src={awayTeam?.logo || ''}
                              alt={awayTeam?.displayName || ''}
                              width={32}
                              height={32}
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
                            <Image
                              src={homeTeam?.logo || ''}
                              alt={homeTeam?.displayName || ''}
                              width={32}
                              height={32}
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
                          {competition?.venue.fullName}
                        </p>
                        <p className="text-xs text-gray-400 text-center mt-1">
                          {competition?.venue.address.city}, {competition?.venue.address.state}
                        </p>
                      </div>
                    </motion.div>
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
          <AnimatePresence>
            {isModalOpen && selectedGame && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ type: "spring", duration: 0.5 }}
                  className="bg-slate-800 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
                >
                  <div className="p-6">
                    {/* Modal Header */}
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex flex-start items-center gap-2">
                        <h3 className="text-2xl font-bold text-white">
                          Game Details
                        </h3>
                        {/* refresh button */}
                        <button
                          onClick={handleRefresh}
                          disabled={isRefreshing}
                          className={`text-gray-400 hover:text-white text-2xl transition-all duration-300 ${isRefreshing ? 'animate-spin cursor-not-allowed' : 'hover:scale-110'
                            }`}
                          title={isRefreshing ? 'Refreshing...' : 'Refresh data'}
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

                    {/* Loading State */}
                    {isModalLoading && (
                      <div className="flex items-center justify-center py-12">
                        <div className="flex flex-col items-center space-y-4">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                          <p className="text-white text-lg">Loading game details...</p>
                        </div>
                      </div>
                    )}

                    {/* Game Content */}
                    {!isModalLoading && selectedGame && (() => {
                      const { unified, gameData } = selectedGame;
                      console.log(selectedGame, '===========');

                      const competition = selectedGame?.competitions?.[0];
                      const homeTeam = competition?.competitors?.find((c: Competitor) => c.homeAway === 'home');
                      const awayTeam = competition?.competitors?.find((c: Competitor) => c.homeAway === 'away');
                      return (
                        <div className="space-y-6">
                          {/* Game Status Overview */}
                          <div className="bg-white/5 rounded-lg p-4">
                            <h4 className="text-lg font-semibold text-white mb-3">Game Status</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-gray-400">Game ID:</span>
                                <span className="text-white ml-2">{unified.gameId}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Status:</span>
                                <span className={`ml-2 font-medium ${unified.isStoppage ? 'text-yellow-400' : 'text-green-400'
                                  }`}>
                                  {unified.isStoppage ? 'Stoppage' : 'Active'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Confidence:</span>
                                <span className={`ml-2 font-medium ${unified.confidence === 'high' ? 'text-green-400' :
                                  unified.confidence === 'medium' ? 'text-yellow-400' : 'text-red-400'
                                  }`}>
                                  {unified.confidence}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Game Status:</span>
                                <span className="text-white ml-2">{unified.gameStatus}</span>
                              </div>
                              {unified.stoppageReason && (
                                <div className="md:col-span-2">
                                  <span className="text-gray-400">Stoppage Reason:</span>
                                  <span className="text-white ml-2">{unified.stoppageReason}</span>
                                </div>
                              )}
                              {unified.stoppageDurationSeconds && (
                                <div>
                                  <span className="text-gray-400">Stoppage Duration:</span>
                                  <span className="text-white ml-2">{unified.stoppageDurationPretty}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-gray-400">Total Plays:</span>
                                <span className="text-white ml-2">{unified.totalPlays}</span>
                              </div>
                            </div>
                          </div>
                          {/* Game Info */}
                          <div className="bg-white/5 rounded-lg p-4">
                            <h4 className="text-lg font-semibold text-white mb-3">Game Information</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-gray-400">Date:</span>
                                <span className="text-white ml-2">
                                  {competition?.date ? new Date(competition.date).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  }) : 'Unknown date'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Venue:</span>
                                <span className="text-white ml-2">{competition?.venue.fullName}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Attendance:</span>
                                <span className="text-white ml-2">{competition?.attendance?.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Broadcast:</span>
                                <span className="text-white ml-2">
                                  {competition?.broadcasts.map((b: { market: string; names: string[] }) => b.names.join('/')).join(', ')}
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
                                  <Image
                                    src={awayTeam?.team.logo || ''}
                                    alt={awayTeam?.team.displayName || ''}
                                    width={48}
                                    height={48}
                                    className="w-12 h-12"
                                  />
                                  <div>
                                    <p className="text-white font-medium">{awayTeam?.team.displayName}</p>
                                    <p className="text-gray-400 text-sm">
                                      {awayTeam?.records.find((r: { type: string; summary?: string }) => r.type === 'total')?.summary}
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
                                  <Image
                                    src={homeTeam?.team.logo || ''}
                                    alt={homeTeam?.team.displayName || ''}
                                    width={48}
                                    height={48}
                                    className="w-12 h-12"
                                  />
                                  <div>
                                    <p className="text-white font-medium">{homeTeam?.team.displayName}</p>
                                    <p className="text-gray-400 text-sm">
                                      {homeTeam?.records.find((r: { type: string; summary?: string }) => r.type === 'total')?.summary}
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
                          {competition?.leaders && competition?.leaders.length > 0 && (
                            <div className="bg-white/5 rounded-lg p-4">
                              <h4 className="text-lg font-semibold text-white mb-4">Game Leaders</h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {competition?.leaders.map((leader: Competition['leaders'][number], index: number) => (
                                  <div key={index} className="bg-white/5 rounded-lg p-3">
                                    <h5 className="text-white font-medium mb-2">{leader.displayName}</h5>
                                    {leader.leaders.map((player, playerIndex) => (
                                      <div key={playerIndex} className="flex items-center space-x-2">
                                        <Image
                                          src={player.athlete.headshot || ''}
                                          alt={player.athlete.displayName || ''}
                                          width={32}
                                          height={32}
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
                          {competition?.headlines && competition?.headlines.length > 0 && (
                            <div className="bg-white/5 rounded-lg p-4">
                              <h4 className="text-lg font-semibold text-white mb-4">Game Recap</h4>
                              {competition?.headlines.map((headline: Competition['headlines'][number], index: number) => (
                                <div key={index} className="mb-3">
                                  <h5 className="text-white font-medium mb-2">{headline.shortLinkText}</h5>
                                  <p className="text-gray-300 text-sm">{headline.description}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Last Play Summary */}
                          {unified.lastPlaySummary && (
                            <div className="bg-white/5 rounded-lg p-4">
                              <h4 className="text-lg font-semibold text-white mb-3">Last Play</h4>
                              <p className="text-gray-300">{unified.lastPlaySummary}</p>
                            </div>
                          )}

                          {/* Collapsible Game Data Sections */}
                          <div className="space-y-4">
                            {/* Odds Data */}
                            {selectedGame?.odds != null && (
                              <div className="bg-white/5 rounded-lg p-4">
                                <button
                                  onClick={() => setShowOdds(prev => !prev)}
                                  className="flex items-center justify-between w-full text-left"
                                >
                                  <h4 className="text-lg font-semibold text-white">
                                    Odds Data
                                  </h4>
                                  <span className="text-gray-400 text-xl">
                                    {showOdds ? '−' : '+'}
                                  </span>
                                </button>
                                {showOdds && (
                                  <div className="mt-4">
                                    <div
                                      ref={oddsRef}
                                      className="overflow-x-auto bg-black/70 p-4 rounded text-xs max-h-96"
                                      style={{
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        lineHeight: '1.4'
                                      }}
                                    />
                                    {/* Fallback raw JSON if formatter fails */}
                                    {!oddsFormatter && (
                                      <pre className="overflow-x-auto bg-black/70 text-green-300 p-4 rounded text-xs max-h-96 whitespace-pre-wrap">
                                        {JSON.stringify(selectedGame.odds, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Raw Game Data */}
                            <div className="bg-white/5 rounded-lg p-4">
                              <button
                                onClick={() => setShowRaw(prev => !prev)}
                                className="flex items-center justify-between w-full text-left"
                              >
                                <h4 className="text-lg font-semibold text-white">
                                  Raw Game Data
                                </h4>
                                <span className="text-gray-400 text-xl">
                                  {showRaw ? '−' : '+'}
                                </span>
                              </button>
                              {showRaw && (
                                <div className="mt-4">
                                  <div
                                    ref={rawDataRef}
                                    className="overflow-x-auto bg-black/70 p-4 rounded text-xs max-h-96"
                                    style={{
                                      fontFamily: 'monospace',
                                      fontSize: '12px',
                                      lineHeight: '1.4'
                                    }}
                                  />
                                  {/* Fallback raw JSON if formatter fails */}
                                  {!rawDataFormatter && (
                                    <pre className="overflow-x-auto bg-black/70 text-green-300 p-4 rounded text-xs max-h-96 whitespace-pre-wrap">
                                      {JSON.stringify(gameData, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Plays Data */}
                            {gameData?.items && (
                              <div className="bg-white/5 rounded-lg p-4">
                                <button
                                  onClick={() => setShowPlays(prev => !prev)}
                                  className="flex items-center justify-between w-full text-left"
                                >
                                  <h4 className="text-lg font-semibold text-white">
                                    Plays Data ({gameData.items.length} plays)
                                  </h4>
                                  <span className="text-gray-400 text-xl">
                                    {showPlays ? '−' : '+'}
                                  </span>
                                </button>
                                {showPlays && (
                                  <div className="mt-4">
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                      {gameData.items.map((play: Play, index: number) => (
                                        <div key={index} className="bg-black/50 p-3 rounded text-xs">
                                          <div className="flex justify-between items-start mb-2">
                                            <span className="text-blue-400 font-medium">
                                              Play #{play.sequenceNumber || index + 1}
                                            </span>
                                            <span className="text-gray-400">
                                              Q{play.period?.number} {play.clock?.displayValue}
                                            </span>
                                          </div>
                                          <div className="text-white mb-1">
                                            {play.type?.text || play.type?.alternativeText}
                                          </div>
                                          <div className="text-gray-300 text-xs">
                                            {play.shortText || play.shortAlternativeText}
                                          </div>
                                          {play.wallclock && (
                                            <div className="text-gray-500 text-xs mt-1">
                                              Time: {new Date(play.wallclock).toLocaleString()}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Other Game Data Fields */}
                            {gameData && Object.keys(gameData).filter(key => key !== 'items').length > 0 && (
                              <div className="bg-white/5 rounded-lg p-4">
                                <button
                                  onClick={() => setShowOtherData(prev => !prev)}
                                  className="flex items-center justify-between w-full text-left"
                                >
                                  <h4 className="text-lg font-semibold text-white">
                                    Other Game Data
                                  </h4>
                                  <span className="text-gray-400 text-xl">
                                    {showOtherData ? '−' : '+'}
                                  </span>
                                </button>
                                {showOtherData && (
                                  <div className="mt-4">
                                    <div
                                      ref={otherDataRef}
                                      className="overflow-x-auto bg-black/70 p-4 rounded text-xs max-h-96"
                                      style={{
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        lineHeight: '1.4'
                                      }}
                                    />
                                    {/* Fallback raw JSON if formatter fails */}
                                    {!otherDataFormatter && (
                                      <pre className="overflow-x-auto bg-black/70 text-green-300 p-4 rounded text-xs max-h-96 whitespace-pre-wrap">
                                        {JSON.stringify(
                                          Object.fromEntries(
                                            Object.entries(gameData).filter(([key]) => key !== 'items')
                                          ),
                                          null,
                                          2
                                        )}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </>
  );
}