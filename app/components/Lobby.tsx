'use client';

import { useState, useEffect } from 'react';
import { createGameRoom, joinGameRoom, updatePlayerStatus, subscribeToGameRoom } from '../utils/supabase';

interface Player {
  id: string;
  name: string;
  isReady: boolean;
}

interface LobbyProps {
  onStartGame: (players: Player[], roomId: string, playerId: string) => void;
}

export default function Lobby({ onStartGame }: LobbyProps) {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  useEffect(() => {
    if (roomId && playerId) {
      const subscription = subscribeToGameRoom(roomId, (gameState) => {
        setPlayers(gameState.players);
        
        // Auto-start game if all players are ready
        if (gameState.players.length > 0 && gameState.players.every(p => p.isReady)) {
          onStartGame(gameState.players, roomId, playerId);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [roomId, playerId, onStartGame]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    try {
      setIsCreatingRoom(true);
      setError(null);
      const room = await createGameRoom();
      const newPlayerId = await joinGameRoom(room.id, playerName);
      setRoomId(room.id);
      setPlayerId(newPlayerId);
    } catch (err) {
      setError('Failed to create room. Please try again.');
      console.error('Create room error:', err);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !roomId.trim()) {
      setError('Please enter both your name and the room code');
      return;
    }

    try {
      setError(null);
      const newPlayerId = await joinGameRoom(roomId, playerName);
      setPlayerId(newPlayerId);
    } catch (err) {
      setError('Failed to join room. Please check the room code and try again.');
      console.error('Join room error:', err);
    }
  };

  const toggleReady = async () => {
    if (!roomId || !playerId) return;

    try {
      const isReady = !players.find(p => p.id === playerId)?.isReady;
      await updatePlayerStatus(roomId, playerId, isReady);
    } catch (err) {
      setError('Failed to update ready status. Please try again.');
      console.error('Toggle ready error:', err);
    }
  };

  if (!roomId || !playerId) {
    return (
      <div className="min-h-screen bg-black text-green-400 p-4 font-mono">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl mb-6 text-center">The Last Page</h1>
          
          <div className="mb-8">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full mb-4 bg-black/50 border border-green-400 p-2 text-green-400 rounded focus:outline-none focus:ring-1 focus:ring-green-400"
              maxLength={20}
            />

            <div className="grid grid-cols-2 gap-4">
              <form onSubmit={handleCreateRoom} className="flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isCreatingRoom}
                  className="px-4 py-3 bg-green-400 text-black rounded hover:bg-green-500 transition-colors disabled:opacity-50"
                >
                  {isCreatingRoom ? 'Creating...' : 'Create New Room'}
                </button>
              </form>

              <form onSubmit={handleJoinRoom} className="flex flex-col gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room code"
                  className="w-full mb-2 bg-black/50 border border-green-400 p-2 text-green-400 rounded focus:outline-none focus:ring-1 focus:ring-green-400"
                />
                <button
                  type="submit"
                  className="px-4 py-3 bg-green-400 text-black rounded hover:bg-green-500 transition-colors"
                >
                  Join Room
                </button>
              </form>
            </div>

            {error && (
              <div className="mt-4 p-2 border border-red-400 rounded bg-red-400/10 text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-400 p-4 font-mono">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl mb-6 text-center">Game Room</h1>
        
        <div className="mb-6 p-4 border border-green-400 rounded">
          <h2 className="text-xl mb-2">Room Code</h2>
          <p className="font-bold">{roomId}</p>
          <p className="text-sm mt-2">Share this code with your friends to join!</p>
        </div>

        <div className="mb-6">
          <h2 className="text-xl mb-2">Players</h2>
          <div className="space-y-2">
            {players.map(player => (
              <div 
                key={player.id}
                className="p-2 border border-green-400 rounded flex justify-between items-center"
              >
                <span>{player.name}</span>
                {player.id === playerId && (
                  <button
                    onClick={toggleReady}
                    className={`px-3 py-1 rounded ${
                      player.isReady
                        ? 'bg-yellow-400 hover:bg-yellow-500'
                        : 'bg-green-400 hover:bg-green-500'
                    } text-black transition-colors`}
                  >
                    {player.isReady ? 'Not Ready' : 'Ready'}
                  </button>
                )}
                {player.id !== playerId && (
                  <span className={player.isReady ? 'text-yellow-400' : 'text-gray-400'}>
                    {player.isReady ? 'Ready!' : 'Not Ready'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-2 border border-red-400 rounded bg-red-400/10 text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
} 