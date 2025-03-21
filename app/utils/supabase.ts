import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface GameRoom {
  id: string;
  created_at: string;
  game_state: {
    currentLocation: string;
    inventory: { [playerId: string]: string[] };
    history: string[];
    currentPlayer: string;
    players: {
      id: string;
      name: string;
      isReady: boolean;
    }[];
  };
  is_active: boolean;
}

export interface GamePlayer {
  id: string;
  name: string;
  room_id: string;
  is_ready: boolean;
  created_at: string;
}

// Function to create a new game room
export async function createGameRoom() {
  const { data, error } = await supabase
    .from('game_rooms')
    .insert([
      {
        game_state: {
          currentLocation: 'cave',
          inventory: {},
          history: ['Welcome to the mysterious cave. The adventure awaits...'],
          currentPlayer: '',
          players: []
        },
        is_active: true
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Function to join a game room
export async function joinGameRoom(roomId: string, playerName: string) {
  const playerId = Math.random().toString(36).substring(7);
  
  const { data: room, error: roomError } = await supabase
    .from('game_rooms')
    .select('game_state')
    .eq('id', roomId)
    .single();

  if (roomError) throw roomError;

  const updatedPlayers = [
    ...room.game_state.players,
    { id: playerId, name: playerName, isReady: false }
  ];

  const { error: updateError } = await supabase
    .from('game_rooms')
    .update({
      game_state: {
        ...room.game_state,
        players: updatedPlayers,
        inventory: {
          ...room.game_state.inventory,
          [playerId]: []
        }
      }
    })
    .eq('id', roomId);

  if (updateError) throw updateError;
  return playerId;
}

// Function to update player ready status
export async function updatePlayerStatus(roomId: string, playerId: string, isReady: boolean) {
  const { data: room, error: roomError } = await supabase
    .from('game_rooms')
    .select('game_state')
    .eq('id', roomId)
    .single();

  if (roomError) throw roomError;

  const updatedPlayers = room.game_state.players.map(player =>
    player.id === playerId ? { ...player, isReady } : player
  );

  const { error: updateError } = await supabase
    .from('game_rooms')
    .update({
      game_state: {
        ...room.game_state,
        players: updatedPlayers
      }
    })
    .eq('id', roomId);

  if (updateError) throw updateError;
}

// Function to update game state
export async function updateGameState(roomId: string, gameState: GameRoom['game_state']) {
  const { error } = await supabase
    .from('game_rooms')
    .update({ game_state: gameState })
    .eq('id', roomId);

  if (error) throw error;
}

// Function to subscribe to game state changes
export function subscribeToGameRoom(roomId: string, callback: (gameState: GameRoom['game_state']) => void) {
  return supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`
      },
      (payload) => {
        callback(payload.new.game_state);
      }
    )
    .subscribe();
} 