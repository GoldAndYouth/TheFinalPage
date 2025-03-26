// Remove the OpenAI import since we're using fetch

// Interface defining the structure of game context data
// This includes current location, inventory (can be array or object), equipped items, and game history
interface GameContext {
  currentLocation: string;
  inventory: { [playerId: string]: string[] };
  equippedItems: string[];
  history: string[];
  foundItems: string[];
  helpInfo?: {
    commands: string[];
    locations: string[];
    items: string[];
    tips: string[];
  };
}

// Fallback responses used when the API is unavailable
// These provide basic responses for different locations to maintain game continuity
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

// Helper function to get fallback responses based on current location and action
// This ensures the game can continue even if the API is unavailable
function getFallbackResponse(context: GameContext, action: string) {
  const location = context.currentLocation as keyof typeof FALLBACK_RESPONSES;
  const responses = FALLBACK_RESPONSES[location] || FALLBACK_RESPONSES.cave;
  
  // Add more contextual responses based on action
  if (action.toLowerCase().includes('look')) {
    return {
      response: "You carefully observe your surroundings. " + responses[0].response,
      location: responses[0].location,
      newItems: [],
      removeItems: [],
      equippedItems: [],
      foundItems: []
    };
  }
  
  if (action.toLowerCase().includes('take') || action.toLowerCase().includes('pick up')) {
    return {
      response: "You attempt to take something. " + responses[0].response,
      location: responses[0].location,
      newItems: ['mysterious item'],
      removeItems: [],
      equippedItems: [],
      foundItems: []
    };
  }
  
  return {
    ...responses[Math.floor(Math.random() * responses.length)],
    equippedItems: [],
    foundItems: []
  };
}

// System prompt that defines the game rules and behavior
// This is sent to the LLM to guide its responses and maintain game consistency
const SYSTEM_PROMPT = `You are a text adventure game AI. Your role is to:
1. Respond to player actions with descriptive text
2. Track the player's location and inventory
3. Handle item interactions (pickup, use, etc.)
4. Maintain game state and progression

Guidelines:
- Keep responses concise and engaging
- Use natural language for descriptions
- Track inventory changes accurately
- Handle item interactions logically
- For found items, describe them but don't automatically add them to inventory
- Use phrases like "you find", "you see", "there is", "you notice", "you spot", "you discover", "you uncover", "appears to be", "looks like", "seems to be" to describe items
- Only items that are explicitly described as movable or portable should be pickable
- Environmental features (walls, floors, fixed furniture, etc.) should not be pickable
- Large or fixed objects should not be pickable
- Only items that make sense to carry should be pickable

Response format:
{
  "response": "Your descriptive text here",
  "location": "current location name",
  "newItems": ["item1", "item2"], // Items to add to inventory
  "removeItems": ["item1", "item2"], // Items to remove from inventory
  "equippedItems": ["item1", "item2"], // Items currently equipped
  "foundItems": ["item1", "item2"] // Items found but not yet picked up
}`;

// Response used when API rate limit is exceeded
const API_LIMIT_MESSAGE = {
  response: "I apologize, but the game needs to rest for now. The API usage limit has been reached. Please try again later!",
  location: "cave",
  newItems: [],
  removeItems: []
};

// Add a function to check if an item is pickable
async function isItemPickable(item: string): Promise<boolean> {
  const prompt = `Is this item pickable/portable in a text adventure game? Answer with just "yes" or "no":
${item}`;
  
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
          {
            role: "system",
            content: `You are a text adventure game item validator. Your job is to determine if an item can be picked up and carried by a player.
Guidelines:
- Only items that are explicitly movable or portable should be pickable
- Environmental features (walls, floors, fixed furniture, etc.) should not be pickable
- Large or fixed objects should not be pickable
- Only items that make sense to carry should be pickable
- Respond with just "yes" or "no"`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('Item Pickable Check Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return false; // Default to not pickable if there's an error
    }

    const data = await response.json();
    const answer = data.choices[0].message.content?.toLowerCase().trim();
    return answer === "yes";
  } catch (error) {
    console.error("Error checking if item is pickable:", error);
    return false; // Default to not pickable if there's an error
  }
}

// Main function to process player actions and generate game responses
export async function processGameAction(
  action: string,
  context: GameContext
): Promise<{
  response: string;
  location: string;
  newItems: string[];
  removeItems: string[];
  equippedItems?: string[];
  foundItems: string[];
}> {
  try {
    // Convert inventory to a flat array if it's an object (multi-player format)
    const inventoryArray = Array.isArray(context.inventory) 
      ? context.inventory 
      : Object.values(context.inventory).flat();

    // Construct the prompt for the LLM with current game state
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

    // Make API call to OpenAI
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

    // Handle API errors, particularly rate limiting
    if (!response.ok) {
      const errorData = await response.json();
      if (errorData.error?.message?.includes('rate_limit_exceeded')) {
        throw new Error("API usage limit has been reached");
      }
      throw new Error(`API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Parse the AI response as JSON, with fallback to raw response if parsing fails
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiResponse);
    } catch (e) {
      parsedResponse = {
        response: aiResponse,
        location: context.currentLocation,
        newItems: [],
        removeItems: [],
        equippedItems: [],
        foundItems: []
      };
    }

    // Special handling for the help command
    if (action.toLowerCase() === 'help') {
      return {
        response: `=== Game Help ===\n\nCurrent Location: ${context.currentLocation}\n\nInventory: ${inventoryArray.join(', ') || 'empty'}\n\nEquipped Items: ${context.equippedItems.join(', ') || 'nothing equipped'}\n\nAvailable Commands:\n${context.helpInfo?.commands.join('\n') || ''}\n\nPossible Locations:\n${context.helpInfo?.locations.join(', ') || ''}\n\nKnown Items:\n${context.helpInfo?.items.join(', ') || ''}\n\nTips:\n${context.helpInfo?.tips.join('\n') || ''}`,
        location: context.currentLocation,
        newItems: [],
        removeItems: [],
        equippedItems: context.equippedItems,
        foundItems: context.foundItems
      };
    }

    // Extract found items from the response
    const foundItems: string[] = [...context.foundItems]; // Start with existing found items
    
    // Look for items in various formats
    const itemPatterns = [
      /You found: (.*?)(?:\n|$)/i,
      /you find (?:a|an|the) ([^.!?]+)/i,
      /you see (?:a|an|the) ([^.!?]+)/i,
      /there is (?:a|an|the) ([^.!?]+)/i,
      /there's (?:a|an|the) ([^.!?]+)/i,
      /you notice (?:a|an|the) ([^.!?]+)/i,
      /you spot (?:a|an|the) ([^.!?]+)/i,
      /you discover (?:a|an|the) ([^.!?]+)/i,
      /you uncover (?:a|an|the) ([^.!?]+)/i,
      /appears to be (?:a|an|the) ([^.!?]+)/i,
      /looks like (?:a|an|the) ([^.!?]+)/i,
      /seems to be (?:a|an|the) ([^.!?]+)/i
    ];

    // Process each pattern and check if items are pickable
    for (const pattern of itemPatterns) {
      const matches = parsedResponse.response.match(pattern);
      if (matches) {
        const item = matches[1].trim();
        // Clean up the item name by removing descriptive text
        const cleanItem = item.split(' ').slice(0, 3).join(' ').toLowerCase();
        
        // Check if the item is pickable
        const isPickable = await isItemPickable(cleanItem);
        console.log('Item pickable check:', { item: cleanItem, isPickable });
        
        if (isPickable && !foundItems.includes(cleanItem)) {
          foundItems.push(cleanItem);
        }
      }
    }

    console.log('Extracted found items:', foundItems);

    // Handle pickup commands
    if (action.toLowerCase().includes('pick up') || action.toLowerCase().includes('take')) {
      const itemToPick = action.toLowerCase().replace(/(?:pick up|take)\s+/, '').trim();
      
      console.log('Processing pickup command:', {
        action,
        itemToPick,
        foundItems,
        currentInventory: context.inventory
      });
      
      // First check if the item was just found
      const foundItem = foundItems.find((item: string) => {
        const itemWords = item.toLowerCase().split(' ');
        const commandWords = itemToPick.toLowerCase().split(' ');
        
        // Check if all words from the command are present in the item name
        const matches = commandWords.every(word => 
          itemWords.some(itemWord => itemWord.includes(word) || word.includes(itemWord))
        );
        
        console.log('Item matching:', {
          item,
          itemWords,
          commandWords,
          matches
        });
        
        return matches;
      });

      if (foundItem) {
        console.log('Found matching item:', foundItem);
        // Remove the item from found items and add it to new items
        const index = foundItems.indexOf(foundItem);
        if (index > -1) {
          foundItems.splice(index, 1);
        }
        console.log('Updated found items:', foundItems);
        
        // Check if the item needs special handling (like opening a chest)
        if (foundItem.toLowerCase().includes('chest') || foundItem.toLowerCase().includes('box')) {
          return {
            response: `You need to open the ${foundItem} first before you can take anything from it. Try using the "open" command.`,
            location: context.currentLocation,
            newItems: [],
            removeItems: [],
            equippedItems: context.equippedItems,
            foundItems: foundItems
          };
        }
        
        return {
          response: `You pick up the ${foundItem}.`,
          location: context.currentLocation,
          newItems: [foundItem],
          removeItems: [],
          equippedItems: context.equippedItems,
          foundItems: foundItems
        };
      }

      // If no specific item mentioned, try to pick up the first found item
      if (!itemToPick && foundItems.length > 0) {
        const item = foundItems[0];
        console.log('No specific item mentioned, picking up first found item:', item);
        
        // Check if the first item needs special handling
        if (item.toLowerCase().includes('chest') || item.toLowerCase().includes('box')) {
          return {
            response: `You need to open the ${item} first before you can take anything from it. Try using the "open" command.`,
            location: context.currentLocation,
            newItems: [],
            removeItems: [],
            equippedItems: context.equippedItems,
            foundItems: foundItems
          };
        }
        
        foundItems.shift(); // Remove the first item
        console.log('Updated found items:', foundItems);
        
        return {
          response: `You pick up the ${item}.`,
          location: context.currentLocation,
          newItems: [item],
          removeItems: [],
          equippedItems: context.equippedItems,
          foundItems: foundItems
        };
      }

      console.log('No matching item found');
      return {
        response: "You don't see that item to pick up.",
        location: context.currentLocation,
        newItems: [],
        removeItems: [],
        equippedItems: context.equippedItems,
        foundItems: foundItems // Keep the found items even if pickup fails
      };
    } else {
      // For non-pickup commands, show found items but don't add them to inventory
      if (foundItems.length > 0) {
        let formattedResponse = parsedResponse.response;
        formattedResponse += `\n\nYou found: ${foundItems.join(', ')}`;
        formattedResponse += '\n\nTo pick up items, use one of these commands:';
        foundItems.forEach(item => {
          formattedResponse += `\n- "take ${item}" or "pick up ${item}"`;
        });
        formattedResponse += '\nOr simply use "take" or "pick up" to pick up the first item.';
        return {
          response: formattedResponse,
          location: context.currentLocation,
          newItems: [],
          removeItems: [],
          equippedItems: context.equippedItems,
          foundItems: foundItems
        };
      }
    }
    
    // Return the final processed response
    return {
      response: parsedResponse.response,
      location: context.currentLocation,
      newItems: [],
      removeItems: [],
      equippedItems: context.equippedItems,
      foundItems: foundItems
    };
  } catch (error) {
    // Handle any errors by falling back to predefined responses
    console.error('LLM Error:', error);
    return getFallbackResponse(context, action);
  }
}

// Function to test the API connection
// Used to verify the API key and connection are working properly
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