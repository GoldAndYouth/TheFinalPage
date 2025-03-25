'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  gameStarted: boolean;
  equippedItems?: { [playerId: string]: string[] };
}

interface GameContext {
  currentLocation: string;
  inventory: string[];
  history: string[];
  equippedItems: string[];
}

interface TextAdventureProps {
  players: Player[];
  roomId: string;
  playerId: string;
}

export default function TextAdventure({ players, roomId, playerId }: TextAdventureProps) {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<string>('');
  const [commandCount, setCommandCount] = useState(0);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isApiLimited, setIsApiLimited] = useState(false);
  const subscriptionRef = useRef<any>(null);
  const previousStateRef = useRef<string>('');

  // Memoize the state update callback
  const handleGameStateUpdate = useCallback((newGameState: GameState) => {
    if (!newGameState) return;
    
    console.log('Received game state update:', {
      currentPlayer: newGameState.currentPlayer,
      players: newGameState.players,
      gameStarted: newGameState.gameStarted,
      history: newGameState.history.slice(-2) // Show last 2 history entries
    });
    
    const newStateString = JSON.stringify(newGameState);
    if (newStateString !== previousStateRef.current) {
      console.log('Game state has changed, updating...');
      previousStateRef.current = newStateString;
      setGameState(newGameState);
    } else {
      console.log('Game state unchanged, skipping update');
    }
  }, []);

  // Subscribe to game state changes
  useEffect(() => {
    let isMounted = true;

    const setupSubscription = async () => {
      try {
        if (subscriptionRef.current) {
          console.log('Cleaning up existing subscription');
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        }

        console.log('Setting up game state subscription for room:', roomId);
        subscriptionRef.current = subscribeToGameRoom(roomId, (newGameState) => {
          if (isMounted && newGameState) {
            handleGameStateUpdate(newGameState);
          }
        });
      } catch (error) {
        console.error('Error setting up subscription:', error);
      }
    };

    setupSubscription();

    return () => {
      isMounted = false;
      if (subscriptionRef.current) {
        console.log('Cleaning up game state subscription');
        try {
          subscriptionRef.current.unsubscribe();
        } catch (error) {
          console.error('Error cleaning up subscription:', error);
        }
        subscriptionRef.current = null;
      }
    };
  }, [roomId, handleGameStateUpdate]);

  // Initialize game state if not set
  useEffect(() => {
    if (!gameState && players.length > 0) {
      const initialGameState: GameState = {
        currentLocation: 'cave',
        inventory: players.reduce((acc, player) => ({ ...acc, [player.id]: [] }), {}),
        history: ['Welcome to the cave! Your adventure begins...'],
        currentPlayer: players[0].id,
        players: players,
        gameStarted: false
      };
      handleGameStateUpdate(initialGameState);
    }
  }, [gameState, players, handleGameStateUpdate]);

  // Show loading state while waiting for initial game state
  if (!gameState) {
    return (
      <div className="min-h-screen bg-black text-green-400 p-4 font-mono flex items-center justify-center">
        <div className="animate-pulse">Loading game state...</div>
      </div>
    );
  }

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing || !gameState) return;

    console.log('Current game state:', {
      currentPlayer: gameState.currentPlayer,
      players: gameState.players,
      inventory: gameState.inventory,
      history: gameState.history
    });

    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    if (!currentPlayer) {
      console.error('Current player not found in game state. Game state:', gameState);
      return;
    }

    console.log('Processing command for player:', {
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      command: input.trim()
    });

    setIsProcessing(true);

    try {
      const command = input.trim();
      setInput('');
      setCommandCount(prev => prev + 1);

      // Add command to history immediately
      const newHistory = [...gameState.history, `> ${currentPlayer.name}: ${command}`];
      const updatedGameState: GameState = {
        ...gameState,
        history: newHistory,
        gameStarted: gameState.gameStarted
      };
      setGameState(updatedGameState);

      // Ensure inventory exists for current player and is properly initialized
      const currentPlayerInventory = gameState.inventory[gameState.currentPlayer] || [];
      console.log('Current player inventory:', {
        playerId: gameState.currentPlayer,
        inventory: currentPlayerInventory
      });

      // Convert multiplayer state to single-player context for LLM
      const gameContext: GameContext = {
        currentLocation: gameState.currentLocation,
        inventory: currentPlayerInventory,
        equippedItems: gameState.equippedItems?.[gameState.currentPlayer] || [],
        history: gameState.history.slice(-3)
      };

      // Process the command
      const result = await processGameAction(command, gameContext);
      
      if (result.response.includes("API usage limit has been reached")) {
        setIsApiLimited(true);
        throw new Error("API usage limit has been reached");
      }

      // Update inventory for current player with safety checks
      const updatedInventory = {
        ...gameState.inventory,
        [gameState.currentPlayer]: [
          ...(currentPlayerInventory || []).filter(item => !(result.removeItems || []).includes(item)),
          ...(result.newItems || [])
        ]
      };

      // Update equipped items
      const updatedEquippedItems = {
        ...gameState.equippedItems,
        [gameState.currentPlayer]: result.equippedItems || []
      };

      // Determine next player
      const currentPlayerIndex = gameState.players.findIndex(p => p.id === gameState.currentPlayer);
      const nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
      const nextPlayerId = gameState.players[nextPlayerIndex].id;

      console.log('Updating game state:', {
        currentPlayer: gameState.currentPlayer,
        nextPlayer: nextPlayerId,
        currentPlayerIndex,
        nextPlayerIndex,
        totalPlayers: gameState.players.length
      });

      // Update game state with the result
      const finalGameState: GameState = {
        ...updatedGameState,
        history: [...newHistory, result.response],
        inventory: updatedInventory,
        equippedItems: updatedEquippedItems,
        currentLocation: result.location || updatedGameState.currentLocation,
        currentPlayer: nextPlayerId,
        gameStarted: updatedGameState.gameStarted
      };

      await updateGameState(roomId, finalGameState);
    } catch (error) {
      console.error('Game processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Something mysterious happened... (The magic seems to be failing)';
      const newHistory = [...gameState.history, `> Error: ${errorMessage}`];
      const errorGameState: GameState = {
        ...gameState,
        history: newHistory,
        gameStarted: gameState.gameStarted
      };
      await updateGameState(roomId, errorGameState);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTestApi = async () => {
    setApiTestResult('Testing API connection...');
    const result = await testApiConnection();
    setApiTestResult(result.message);
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