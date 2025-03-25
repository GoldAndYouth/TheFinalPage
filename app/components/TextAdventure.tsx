'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AsciiArt from './AsciiArt';
import { processGameAction, testApiConnection } from '../utils/llm';
import { subscribeToGameRoom, updateGameState } from '../utils/supabase';
import type { GameRoom } from '../utils/supabase';
import { supabase } from '../utils/supabase';

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
  equippedItems: { [playerId: string]: string[] };
  foundItems: string[];
  helpInfo?: {
    commands: string[];
    locations: string[];
    items: string[];
    tips: string[];
  };
}

interface GameContext {
  currentLocation: string;
  inventory: string[];
  history: string[];
  equippedItems: string[];
  foundItems: string[];
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
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
        gameStarted: false,
        equippedItems: players.reduce((acc, player) => ({ ...acc, [player.id]: [] }), {}),
        foundItems: [],
        helpInfo: {
          commands: [
            'help - Show this help message',
            'look - Examine your surroundings',
            'inventory - Check your inventory',
            'take/pick up [item] - Pick up an item',
            'drop [item] - Drop an item',
            'wear/equip [item] - Equip an item',
            'remove/unequip [item] - Unequip an item',
            'go [direction] - Move in a direction',
            'examine [item] - Look at an item closely'
          ],
          locations: ['cave', 'forest', 'dragon\'s lair'],
          items: ['sword', 'shield', 'torch', 'key', 'map'],
          tips: [
            'Items must be explicitly picked up with "take" or "pick up"',
            'Use "help" anytime to see available commands',
            'Some items can be equipped for special effects',
            'Pay attention to your surroundings for clues'
          ]
        }
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

  const handleCommand = async (command: string) => {
    if (!command.trim()) return;

    try {
      setIsLoading(true);
      setError(null);

      // Log current state for debugging
      console.log('Processing command:', command);
      console.log('Current game state:', gameState);
      console.log('Current player:', gameState.currentPlayer);
      console.log('Current player inventory:', gameState.inventory[gameState.currentPlayer] || []);
      console.log('Current player equipped items:', gameState.equippedItems[gameState.currentPlayer] || []);
      console.log('Found items:', gameState.foundItems);

      // Process the command through the LLM
      const result = await processGameAction(command, {
        currentLocation: gameState.currentLocation,
        inventory: gameState.inventory,
        equippedItems: gameState.equippedItems[gameState.currentPlayer] || [],
        history: gameState.history,
        foundItems: gameState.foundItems,
        helpInfo: {
          commands: ['look', 'inventory', 'help', 'dig', 'pick up', 'take', 'use'],
          locations: ['cave', 'forest', 'dragon'],
          items: ['sword', 'map', 'key', 'potion'],
          tips: [
            'Use "look" to examine your surroundings',
            'Use "dig" to search for items',
            'Use "pick up" or "take" to collect items',
            'Use "inventory" to check your items',
            'Use "help" for more information'
          ]
        }
      });

      // Log the result for debugging
      console.log('Game action result:', result);

      // Update game state with the result
      const updatedGameState = {
        ...gameState,
        history: [...gameState.history, result.response],
        currentLocation: result.location,
        inventory: {
          ...gameState.inventory,
          [gameState.currentPlayer]: [
            ...(gameState.inventory[gameState.currentPlayer] || []),
            ...result.newItems
          ]
        },
        equippedItems: {
          ...gameState.equippedItems,
          [gameState.currentPlayer]: [
            ...(gameState.equippedItems[gameState.currentPlayer] || []),
            ...(result.equippedItems || [])
          ]
        },
        foundItems: result.foundItems || []
      };

      // Log the updated state
      console.log('Updating game state:', updatedGameState);

      // Update the game state in Supabase
      const { error: updateError } = await supabase
        .from('rooms')
        .update({ game_state: updatedGameState })
        .eq('id', roomId);

      if (updateError) {
        console.error('Error updating game state:', updateError);
        setError('Failed to update game state');
        return;
      }

      // Update local state
      setGameState(updatedGameState);
    } catch (err) {
      console.error('Error processing command:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
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
        
        <form onSubmit={(e) => { e.preventDefault(); handleCommand(input); }} className="flex gap-2">
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