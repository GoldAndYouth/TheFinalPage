// Remove the OpenAI import since we're using fetch

interface GameContext {
  currentLocation: string;
  inventory: string[];
  history: string[];
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

Return your response in this JSON format:
{
  "response": "Description of what happens",
  "location": "current location keyword",
  "newItems": ["any new items obtained"],
  "removeItems": ["any items used or lost"]
}`;

export async function processGameAction(
  action: string,
  context: GameContext
): Promise<{
  response: string;
  location: string;
  newItems: string[];
  removeItems: string[];
}> {
  try {
    const prompt = `
Current location: ${context.currentLocation}
Inventory: ${context.inventory.join(', ') || 'empty'}
Recent history: ${context.history.slice(-3).join('\n')}

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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('OpenAI API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      
      // Always use fallback for any API error
      console.log('Using fallback response system');
      return getFallbackResponse(context, action);
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      console.error('Unexpected API response:', data);
      return getFallbackResponse(context, action);
    }

    const result = data.choices[0].message.content;
    
    try {
      const parsed = JSON.parse(result || '{}');
      // Validate the response format
      if (!parsed.response || !parsed.location) {
        console.error('Invalid response format:', parsed);
        return getFallbackResponse(context, action);
      }
      return parsed;
    } catch (e) {
      console.error('JSON Parse Error:', e, 'Raw result:', result);
      return getFallbackResponse(context, action);
    }
  } catch (error: any) {
    console.error('LLM Error:', error);
    return getFallbackResponse(context, action);
  }
} 