import { createClient } from '@supabase/supabase-js';
import { RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

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

export interface Player {
  id: string;
  name: string;
  isReady: boolean;
}

// Function to create a new game room
export async function createGameRoom() {
  try {
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

    if (error) {
      console.error('Error creating room:', error);
      throw error;
    }

    console.log('Room created:', data);
    return data;
  } catch (error) {
    console.error('Error in createGameRoom:', error);
    throw error;
  }
}

// Function to join a game room
export async function joinGameRoom(roomId: string, playerName: string) {
  try {
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select('game_state')
      .eq('id', roomId)
      .single();

    if (roomError) {
      console.error('Error fetching room:', roomError);
      throw roomError;
    }

    const playerId = Math.random().toString(36).substring(7);
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

    if (updateError) {
      console.error('Error updating room:', updateError);
      throw updateError;
    }

    console.log('Joined room:', roomId, 'as player:', playerId);
    return playerId;
  } catch (error) {
    console.error('Error in joinGameRoom:', error);
    throw error;
  }
}

// Function to update player ready status
export async function updatePlayerStatus(roomId: string, playerId: string, isReady: boolean) {
  const { data: room, error: roomError } = await supabase
    .from('game_rooms')
    .select('game_state')
    .eq('id', roomId)
    .single();

  if (roomError) throw roomError;

  const updatedPlayers = room.game_state.players.map((player: Player) =>
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
  console.log('Updating game state for room:', roomId, gameState);
  const { data, error } = await supabase
    .from('game_rooms')
    .update({ game_state: gameState })
    .eq('id', roomId)
    .select()
    .single();

  if (error) {
    console.error('Error updating game state:', error);
    throw error;
  }

  console.log('Successfully updated game state:', data);
  return data;
}

// Function to subscribe to game state changes
export function subscribeToGameRoom(roomId: string, callback: (gameState: GameRoom['game_state']) => void) {
  console.log('Setting up subscription for room:', roomId);
  
  // First, get the initial state
  supabase
    .from('game_rooms')
    .select('game_state')
    .eq('id', roomId)
    .single()
    .then(({ data, error }) => {
      if (!error && data) {
        console.log('Initial game state:', data.game_state);
        callback(data.game_state);
      }
    });

  // Then set up real-time subscription with unique channel name per room
  const channel = supabase.channel(`room_${roomId}`);
  
  return channel
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`
      },
      (payload) => {
        console.log('Received real-time update for room:', roomId, payload);
        const newState = (payload.new as GameRoom).game_state;
        if (newState) {
          console.log('Updating game state with:', newState);
          callback(newState);
        }
      }
    )
    .subscribe((status) => {
      console.log('Subscription status for room:', roomId, status);
    });
} 