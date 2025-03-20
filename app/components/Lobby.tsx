'use client';

import { useState } from 'react';

interface Player {
  id: string;
  name: string;
  isReady: boolean;
}

interface LobbyProps {
  onStartGame: (players: Player[]) => void;
}

export default function Lobby({ onStartGame }: LobbyProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');

  const addPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim() || players.length >= 4) return;
    
    const newPlayer: Player = {
      id: Math.random().toString(36).substring(7),
      name: newPlayerName.trim(),
      isReady: false
    };
    
    setPlayers([...players, newPlayer]);
    setNewPlayerName('');
  };

  const toggleReady = (playerId: string) => {
    setPlayers(players.map(player => 
      player.id === playerId 
        ? { ...player, isReady: !player.isReady }
        : player
    ));
  };

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter(player => player.id !== playerId));
  };

  const canStartGame = players.length > 0 && players.every(player => player.isReady);

  return (
    <div className="min-h-screen bg-black text-green-400 p-4 font-mono">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl mb-6 text-center">Text Adventure Lobby</h1>
        
        <div className="mb-8">
          <h2 className="text-xl mb-4">Players ({players.length}/4)</h2>
          <div className="space-y-2">
            {players.map(player => (
              <div key={player.id} className="flex items-center justify-between bg-black/50 p-3 rounded border border-green-400">
                <span className={player.isReady ? 'text-green-400' : 'text-yellow-400'}>
                  {player.name} {player.isReady ? '(Ready)' : '(Not Ready)'}
                </span>
                <div className="space-x-2">
                  <button
                    onClick={() => toggleReady(player.id)}
                    className="px-3 py-1 bg-green-400 text-black rounded hover:bg-green-500 transition-colors"
                  >
                    {player.isReady ? 'Unready' : 'Ready'}
                  </button>
                  <button
                    onClick={() => removePlayer(player.id)}
                    className="px-3 py-1 bg-red-400 text-black rounded hover:bg-red-500 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {players.length < 4 && (
          <form onSubmit={addPlayer} className="mb-8">
            <div className="flex gap-2">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Enter player name"
                className="flex-1 bg-black/50 border border-green-400 p-2 text-green-400 rounded focus:outline-none focus:ring-1 focus:ring-green-400"
                maxLength={20}
              />
              <button
                type="submit"
                className="px-4 py-2 bg-green-400 text-black rounded hover:bg-green-500 transition-colors"
              >
                Add Player
              </button>
            </div>
          </form>
        )}

        <button
          onClick={() => onStartGame(players)}
          disabled={!canStartGame}
          className="w-full px-4 py-3 bg-green-400 text-black rounded hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Game ({players.length} {players.length === 1 ? 'Player' : 'Players'})
        </button>

        <div className="mt-4 text-sm text-center text-green-400/70">
          {!canStartGame && players.length > 0 && (
            <p>All players must be ready to start the game</p>
          )}
          {players.length === 0 && (
            <p>Add at least one player to start the game</p>
          )}
        </div>
      </div>
    </div>
  );
} 