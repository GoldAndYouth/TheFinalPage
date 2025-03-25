// Remove the OpenAI import since we're using fetch

interface GameContext {
  currentLocation: string;
  inventory: string[] | { [playerId: string]: string[] };
  equippedItems: string[];
  history: string[];
  helpInfo?: {
    commands: string[];
    locations: string[];
    items: string[];
    tips: string[];
  };
}

// Fallback responses when API is unavailable
const FALLBACK_RESPONSES = {
  cave: [
    {
      response: "The cave entrance looms before you, dark and mysterious. You can make out some glinting objects inside.",
      location: "cave",
      newItems: [],
      removeItems: []
    },
    {
      response: "Cool air wafts from the cave's depths. You hear distant echoes.",
      location: "cave",
      newItems: [],
      removeItems: []
    }
  ],
  forest: [
    {
      response: "Tall trees surround you, their leaves rustling in the breeze. A path leads deeper into the woods.",
      location: "forest",
      newItems: [],
      removeItems: []
    }
  ],
  dragon: [
    {
      response: "The massive dragon regards you with ancient, intelligent eyes. It seems to be waiting for something.",
      location: "dragon",
      newItems: [],
      removeItems: []
    }
  ]
};

// Helper function to get a fallback response
function getFallbackResponse(context: GameContext, action: string) {
  const location = context.currentLocation as keyof typeof FALLBACK_RESPONSES;
  const responses = FALLBACK_RESPONSES[location] || FALLBACK_RESPONSES.cave;
  
  // Add more contextual responses based on action
  if (action.toLowerCase().includes('look')) {
    return {
      response: "You carefully observe your surroundings. " + responses[0].response,
      location: responses[0].location,
      newItems: [],
      removeItems: []
    };
  }
  
  if (action.toLowerCase().includes('take') || action.toLowerCase().includes('pick up')) {
    return {
      response: "You attempt to take something. " + responses[0].response,
      location: responses[0].location,
      newItems: ['mysterious item'],
      removeItems: []
    };
  }
  
  return responses[Math.floor(Math.random() * responses.length)];
}

const SYSTEM_PROMPT = `You are a text adventure game engine. You should respond to player actions in an engaging, descriptive way.
Current game rules:
- Players can freely explore and interact with the environment
- Available locations: cave, forest, and any logical connected areas
- Players can pick up items, use them, and interact with characters
- Keep responses concise (2-3 sentences max)
- Include location hints in your response that match these keywords: cave, forest, sword, dragon
- Make the story engaging but keep the tone appropriate for all ages
- Don't allow obviously harmful or inappropriate actions
- IMPORTANT: Items must be explicitly picked up with commands like "pick up", "take", or "grab"
- When items are found, describe them but DO NOT add them to inventory automatically
- Only add items to inventory when the player explicitly picks them up
- When player uses "help" command, show:
  1. Available commands and their descriptions
  2. Current location and possible destinations
  3. Current inventory and equipped items
  4. Helpful tips for gameplay

Return your response in this JSON format:
{
  "response": "Description of what happens",
  "location": "current location keyword",
  "newItems": ["any new items obtained"],
  "removeItems": ["any items used or lost"],
  "equippedItems": ["any items equipped"]
}`;

const API_LIMIT_MESSAGE = {
  response: "I apologize, but the game needs to rest for now. The API usage limit has been reached. Please try again later!",
  location: "cave",
  newItems: [],
  removeItems: []
};

export async function processGameAction(
  action: string,
  context: GameContext
): Promise<{
  response: string;
  location: string;
  newItems: string[];
  removeItems: string[];
  equippedItems?: string[];
}> {
  try {
    // Convert inventory to string array if it's an object
    const inventoryArray = Array.isArray(context.inventory) 
      ? context.inventory 
      : Object.values(context.inventory).flat();

    const prompt = `
Current location: ${context.currentLocation}
Inventory: ${inventoryArray.join(', ') || 'empty'}
Equipped items: ${context.equippedItems.join(', ') || 'nothing equipped'}
Recent history: ${context.history.slice(-3).join('\n')}
${context.helpInfo ? `
Available commands:
${context.helpInfo.commands.join('\n')}

Possible locations:
${context.helpInfo.locations.join(', ')}

Known items:
${context.helpInfo.items.join(', ')}

Tips:
${context.helpInfo.tips.join('\n')}
` : ''}

Player action: ${action}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData.error?.message?.includes('rate_limit_exceeded')) {
        throw new Error("API usage limit has been reached");
      }
      throw new Error(`API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Special handling for help command
    if (action.toLowerCase() === 'help') {
      return {
        response: `=== Game Help ===\n\nCurrent Location: ${context.currentLocation}\n\nInventory: ${inventoryArray.join(', ') || 'empty'}\n\nEquipped Items: ${context.equippedItems.join(', ') || 'nothing equipped'}\n\nAvailable Commands:\n${context.helpInfo?.commands.join('\n') || ''}\n\nPossible Locations:\n${context.helpInfo?.locations.join(', ') || ''}\n\nKnown Items:\n${context.helpInfo?.items.join(', ') || ''}\n\nTips:\n${context.helpInfo?.tips.join('\n') || ''}`,
        location: context.currentLocation,
        newItems: [],
        removeItems: [],
        equippedItems: context.equippedItems
      };
    }

    // Try to parse the response as JSON
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiResponse);
    } catch (e) {
      // If parsing fails, use the raw response
      parsedResponse = {
        response: aiResponse,
        location: context.currentLocation,
        newItems: [],
        removeItems: [],
        equippedItems: []
      };
    }

    // Extract location changes
    let location = parsedResponse.location || context.currentLocation;

    // Extract item changes
    let newItems = parsedResponse.newItems || [];
    const removeItems = parsedResponse.removeItems || [];
    const equippedItems = parsedResponse.equippedItems || [];

    // Format the response for better readability
    let formattedResponse = parsedResponse.response;
    
    // Add item discovery messages
    if (newItems.length > 0) {
      formattedResponse += `\n\nYou found: ${newItems.join(', ')}`;
      formattedResponse += '\nUse "pick up" or "take" to add items to your inventory.';
      // Clear newItems since they haven't been picked up yet
      newItems = [];
    }
    
    // Add item removal messages
    if (removeItems.length > 0) {
      formattedResponse += `\n\nYou lost: ${removeItems.join(', ')}`;
    }
    
    // Add equipped item messages
    if (equippedItems.length > 0) {
      formattedResponse += `\n\nYou equipped: ${equippedItems.join(', ')}`;
    }

    return {
      response: formattedResponse,
      location,
      newItems,
      removeItems,
      equippedItems
    };
  } catch (error) {
    console.error('LLM Error:', error);
    return getFallbackResponse(context, action);
  }
}

export async function testApiConnection(): Promise<{success: boolean, message: string}> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "user", content: "Say 'API test successful'" }
        ],
        temperature: 0.7,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Test Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return {
        success: false,
        message: `API Error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: data.choices?.[0]?.message?.content || 'Received response but no content'
    };
  } catch (error: any) {
    console.error('API Test Error:', error);
    return {
      success: false,
      message: `Error: ${error?.message || 'Unknown error'}`
    };
  }
} 