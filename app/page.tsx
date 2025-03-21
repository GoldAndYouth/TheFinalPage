'use client';

import { useState } from 'react';
import TextAdventure from './components/TextAdventure';
import Lobby from './components/Lobby';

interface Player {
  id: string;
  name: string;
  isReady: boolean;
}

export default function Home() {
  const [gameStarted, setGameStarted] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomId, setRoomId] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');

  const handleStartGame = (players: Player[], roomId: string, playerId: string) => {
    setPlayers(players);
    setRoomId(roomId);
    setPlayerId(playerId);
    setGameStarted(true);
  };

  if (!gameStarted) {
    return <Lobby onStartGame={handleStartGame} />;
  }

  return <TextAdventure players={players} roomId={roomId} playerId={playerId} />;
}
