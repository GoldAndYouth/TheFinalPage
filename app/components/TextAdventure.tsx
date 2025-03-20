'use client';

import { useState } from 'react';
import AsciiArt from './AsciiArt';
import { processGameAction } from '../utils/llm';

interface GameState {
  currentScene: string;
  currentLocation: string;
  inventory: string[];
  history: string[];
}

export default function TextAdventure() {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [commandCount, setCommandCount] = useState(0);
  const [gameState, setGameState] = useState<GameState>({
    currentScene: 'You stand at the entrance of a mysterious cave. The air is thick with anticipation. What would you like to do?',
    currentLocation: 'cave',
    inventory: [],
    history: []
  });

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    try {
      setIsProcessing(true);
      // Add user input to history
      const newHistory = [...gameState.history, `> ${input}`];
      
      // Process the command through our LLM
      const result = await processGameAction(input, {
        currentLocation: gameState.currentLocation,
        inventory: gameState.inventory,
        history: gameState.history.slice(-3) // Send last 3 interactions for context
      });

      // Update inventory based on LLM response
      const updatedInventory = [
        ...gameState.inventory.filter(item => !result.removeItems.includes(item)),
        ...result.newItems
      ];

      // Increment command count to trigger ASCII art update
      setCommandCount(prev => prev + 1);

      setGameState(prev => ({
        ...prev,
        currentScene: result.response,
        currentLocation: result.location || prev.currentLocation,
        history: [...newHistory, result.response],
        inventory: updatedInventory
      }));
    } catch (error) {
      console.error('Game processing error:', error);
      setGameState(prev => ({
        ...prev,
        currentScene: "Something mysterious happened... (The magic seems to be failing)",
        history: [...gameState.history, `> ${input}`, "Something mysterious happened... (The magic seems to be failing)"]
      }));
    } finally {
      setIsProcessing(false);
      setInput('');
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-400 p-4 font-mono">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <AsciiArt scene={gameState.currentLocation} commandCount={commandCount} />
        </div>
        
        <div className="mb-4 h-[40vh] overflow-y-auto bg-black/50 p-4 rounded border border-green-400">
          {gameState.history.map((text, i) => (
            <div key={i} className="mb-2">
              {text}
            </div>
          ))}
          <div className="mb-2">{gameState.currentScene}</div>
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