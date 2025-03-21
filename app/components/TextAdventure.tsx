'use client';

import { useState, useEffect, useRef } from 'react';
import AsciiArt from './AsciiArt';
import { processGameAction, testApiConnection } from '../utils/llm';
import { subscribeToGameRoom, updateGameState } from '../utils/supabase';
import type { GameRoom } from '../utils/supabase';

interface Player {
  id: string;
  name: string;
  isReady: boolean;
}

interface GameState {
  currentLocation: string;
  inventory: { [playerId: string]: string[] };
  history: string[];
  currentPlayer: string;
  players: Player[];
}

interface TextAdventureProps {
  players: Player[];
  roomId: string;
  playerId: string;
}

const TURN_TIME_LIMIT = 60; // 60 seconds per turn

export default function TextAdventure({ players, roomId, playerId }: TextAdventureProps) {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<string>('');
  const [commandCount, setCommandCount] = useState(0);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isApiLimited, setIsApiLimited] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(TURN_TIME_LIMIT);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const subscriptionRef = useRef<any>(null);

  // Subscribe to game state changes
  useEffect(() => {
    // Only set up subscription if we don't have one
    if (!subscriptionRef.current) {
      console.log('Setting up game state subscription for room:', roomId);
      subscriptionRef.current = subscribeToGameRoom(roomId, (newGameState) => {
        console.log('Received game state update:', newGameState);
        // Only update if the state has actually changed
        setGameState(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newGameState)) {
            return newGameState;
          }
          return prev;
        });
      });
    }

    // Cleanup function
    return () => {
      if (subscriptionRef.current) {
        console.log('Cleaning up game state subscription');
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [roomId]); // Only depend on roomId

  // Show loading state while waiting for initial game state
  if (!gameState) {
    return (
      <div className="min-h-screen bg-black text-green-400 p-4 font-mono flex items-center justify-center">
        <div className="animate-pulse">Loading game state...</div>
      </div>
    );
  }

  // Timer effect
  useEffect(() => {
    if (!gameState || isProcessing || isTimerPaused) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleSkipTurn();
          return TURN_TIME_LIMIT;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isProcessing, isTimerPaused]);

  // Reset timer when player changes
  useEffect(() => {
    if (gameState?.currentPlayer) {
      setTimeRemaining(TURN_TIME_LIMIT);
    }
  }, [gameState?.currentPlayer]);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing || !gameState) return;

    try {
      setIsProcessing(true);
      const currentPlayerName = gameState.players.find(p => p.id === gameState.currentPlayer)?.name || 'Unknown';
      const newHistory = [...gameState.history, `> ${currentPlayerName}: ${input}`];
      
      const result = await processGameAction(input, {
        currentLocation: gameState.currentLocation,
        inventory: gameState.inventory[gameState.currentPlayer],
        history: gameState.history.slice(-3)
      });

      if (result.response.includes("API usage limit has been reached")) {
        setIsApiLimited(true);
      }

      const updatedInventory = {
        ...gameState.inventory,
        [gameState.currentPlayer]: [
          ...gameState.inventory[gameState.currentPlayer].filter(item => !result.removeItems.includes(item)),
          ...result.newItems
        ]
      };

      setCommandCount(prev => prev + 1);

      const currentPlayerIndex = gameState.players.findIndex(p => p.id === gameState.currentPlayer);
      const nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
      const nextPlayerId = gameState.players[nextPlayerIndex].id;

      const updatedGameState = {
        ...gameState,
        currentLocation: result.location || gameState.currentLocation,
        history: [...newHistory, result.response],
        inventory: updatedInventory,
        currentPlayer: nextPlayerId,
        players: gameState.players
      };

      await updateGameState(roomId, updatedGameState);
    } catch (error) {
      console.error('Game processing error:', error);
      const errorMessage = "Something mysterious happened... (The magic seems to be failing)";
      if (gameState) {
        const updatedGameState = {
          ...gameState,
          history: [...gameState.history, `> ${input}`, errorMessage]
        };
        await updateGameState(roomId, updatedGameState);
      }
    } finally {
      setIsProcessing(false);
      setInput('');
    }
  };

  const handleTestApi = async () => {
    setApiTestResult('Testing API connection...');
    const result = await testApiConnection();
    setApiTestResult(result.message);
  };

  const handleSkipTurn = async () => {
    if (!gameState) return;
    
    const currentPlayerName = gameState.players.find(p => p.id === gameState.currentPlayer)?.name || 'Unknown';
    const newHistory = [...gameState.history, `> ${currentPlayerName}'s turn was skipped (time's up)`];
    
    const currentPlayerIndex = gameState.players.findIndex(p => p.id === gameState.currentPlayer);
    const nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
    const nextPlayerId = gameState.players[nextPlayerIndex].id;

    const updatedGameState = {
      ...gameState,
      history: newHistory,
      currentPlayer: nextPlayerId
    };

    await updateGameState(roomId, updatedGameState);
  };

  const handleExtendTime = () => {
    setTimeRemaining(prev => Math.min(prev + 30, TURN_TIME_LIMIT));
  };

  const toggleTimer = () => {
    setIsTimerPaused(prev => !prev);
  };

  const currentPlayerName = gameState.players.find(p => p.id === gameState.currentPlayer)?.name || 'Unknown';

  return (
    <div className="min-h-screen bg-black text-green-400 p-4 font-mono">
      <div className="max-w-2xl mx-auto">
        {isApiLimited && (
          <div className="mb-4 p-2 border border-yellow-400 rounded bg-yellow-400/10 text-yellow-400">
            ⚠️ API limit reached. The game needs to rest for now. Please try again later!
          </div>
        )}
        
        <div className="mb-4 p-2 border border-cyan-400 rounded bg-cyan-400/10">
          <h2 className="text-cyan-400 mb-2">Players</h2>
          <div className="flex gap-4 mb-2">
            {gameState.players.map(player => (
              <div 
                key={player.id} 
                className={`p-2 rounded ${player.id === gameState.currentPlayer ? 'bg-green-400/20 border border-green-400' : ''}`}
              >
                {player.name}
                {player.id === gameState.currentPlayer && ' (Current Turn)'}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={timeRemaining <= 10 ? 'text-red-400' : 'text-green-400'}>
                Time Remaining: {timeRemaining}s
              </span>
              <button
                onClick={toggleTimer}
                className="px-2 py-1 text-xs bg-yellow-400 text-black rounded hover:bg-yellow-500 transition-colors"
              >
                {isTimerPaused ? 'Resume Timer' : 'Pause Timer'}
              </button>
              <button
                onClick={handleExtendTime}
                className="px-2 py-1 text-xs bg-blue-400 text-black rounded hover:bg-blue-500 transition-colors"
              >
                +30s
              </button>
            </div>
            <button
              onClick={handleSkipTurn}
              className="px-2 py-1 text-xs bg-red-400 text-black rounded hover:bg-red-500 transition-colors"
            >
              Skip Turn
            </button>
          </div>
        </div>

        <div className="mb-4">
          <button 
            onClick={handleTestApi}
            className="mb-4 px-4 py-2 bg-green-400 text-black rounded hover:bg-green-500 transition-colors"
          >
            Test API Connection
          </button>
          {apiTestResult && (
            <div className="mb-4 p-2 border border-green-400 rounded">
              {apiTestResult}
            </div>
          )}
          <AsciiArt scene={gameState.currentLocation} commandCount={commandCount} />
        </div>
        
        <div className="game-output mb-4 h-[40vh] overflow-y-auto bg-black/50 p-4 rounded border border-green-400">
          {gameState.history.map((text, i) => (
            <div 
              key={i} 
              className={text.startsWith('> ') ? 'mb-2 text-cyan-400' : 'mb-2 text-green-400'}
            >
              {text}
            </div>
          ))}
          {isProcessing && (
            <div className="animate-pulse">Processing your action...</div>
          )}
        </div>
        
        <form onSubmit={handleCommand} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            className="flex-1 bg-black/50 border border-green-400 p-2 text-green-400 rounded focus:outline-none focus:ring-1 focus:ring-green-400 disabled:opacity-50"
            placeholder={isProcessing ? "Processing..." : `${currentPlayerName}'s turn - What would you like to do?`}
          />
          <button 
            type="submit"
            disabled={isProcessing}
            className="px-4 py-2 bg-green-400 text-black rounded hover:bg-green-500 transition-colors disabled:opacity-50"
          >
            Enter
          </button>
        </form>
        
        <div className="mt-4">
          <h3 className="text-lg mb-2">Inventories:</h3>
          {gameState.players.map(player => (
            <div key={player.id} className="text-sm mb-1">
              {player.name}: {gameState.inventory[player.id].join(', ') || 'Empty'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 