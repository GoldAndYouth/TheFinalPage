'use client';

import { useState } from 'react';
import AsciiArt from './AsciiArt';
import { processGameAction, testApiConnection } from '../utils/llm';

interface GameState {
  currentScene: string;
  currentLocation: string;
  inventory: string[];
  history: string[];
}

export default function TextAdventure() {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<string>('');
  const [commandCount, setCommandCount] = useState(0);
  const [gameState, setGameState] = useState<GameState>({
    currentScene: 'You stand at the entrance of a mysterious cave. The air is thick with anticipation. What would you like to do?',
    currentLocation: 'cave',
    inventory: [],
    history: ['You stand at the entrance of a mysterious cave. The air is thick with anticipation. What would you like to do?']
  });
  const [isApiLimited, setIsApiLimited] = useState(false);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    try {
      setIsProcessing(true);
      const newHistory = [...gameState.history, `> ${input}`];
      
      const result = await processGameAction(input, {
        currentLocation: gameState.currentLocation,
        inventory: gameState.inventory,
        history: gameState.history.slice(-3)
      });

      // Check if API limit was reached
      if (result.response.includes("API usage limit has been reached")) {
        setIsApiLimited(true);
      }

      // Update inventory based on LLM response
      const updatedInventory = [
        ...gameState.inventory.filter(item => !result.removeItems.includes(item)),
        ...result.newItems
      ];

      setCommandCount(prev => prev + 1);

      setGameState(prev => ({
        ...prev,
        currentLocation: result.location || prev.currentLocation,
        history: [...newHistory, result.response],
        inventory: updatedInventory
      }));
    } catch (error) {
      console.error('Game processing error:', error);
      const errorMessage = "Something mysterious happened... (The magic seems to be failing)";
      setGameState(prev => ({
        ...prev,
        history: [...gameState.history, `> ${input}`, errorMessage]
      }));
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

  return (
    <div className="min-h-screen bg-black text-green-400 p-4 font-mono">
      <div className="max-w-2xl mx-auto">
        {isApiLimited && (
          <div className="mb-4 p-2 border border-yellow-400 rounded bg-yellow-400/10 text-yellow-400">
            ⚠️ API limit reached. The game needs to rest for now. Please try again later!
          </div>
        )}
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
            placeholder={isProcessing ? "Processing..." : "What would you like to do?"}
          />
          <button 
            type="submit"
            disabled={isProcessing}
            className="px-4 py-2 bg-green-400 text-black rounded hover:bg-green-500 transition-colors disabled:opacity-50"
          >
            Enter
          </button>
        </form>
        
        <div className="mt-4 text-sm">
          <p>Inventory: {gameState.inventory.join(', ') || 'Empty'}</p>
        </div>
      </div>
    </div>
  );
} 