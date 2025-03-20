'use client';

import { useEffect, useState } from 'react';

interface AsciiArtProps {
  scene: string;
  commandCount: number;
}

const asciiScenes = {
  cave: [
    `
    /\\    /\\
   /  \\__/  \\
  /          \\
 /  []    []  \\
/              \\
|     ____     |
|    |    |    |
|    |    |    |
`,
    `
    /\\    /\\
   /  \\__/  \\
  /          \\
 /  ()    ()  \\
/              \\
|     ____     |
|    |    |    |
|    |    |    |
`
  ],
  sword: [
    `
     /\\
     ||
   |====|
     ||
     ||
   \\=====/
    \\||/
     ||
     ||
    /||\\
   //||\\\\
  // || \\\\
     ||
     ||
    ====
`,
    `
     /\\
     ||
   |====|
     ||
     ||
   \\=====/
    \\||/
     ||
     ||
    /||\\
   //||\\\\
  // || \\\\
     ||
     ||
    ====
`
  ],
  forest: [
    `
      /\\
     /  \\
    /    \\
   /\\  /\\  \\
  /  \\/  \\  \\
 /   /\\   \\  \\
/   /  \\   \\  \\
|  |    |  |  |
`,
    `
       /\\
      /  \\
     /    \\
    /\\  /\\  \\
   /  \\/  \\  \\
  /   /\\   \\  \\
 /   /  \\   \\  \\
|  |    |  |  |
`
  ],
  dragon: [
    `
      /\\    /\\
     /  \\__/  \\
    /  ^    ^  \\
   / (  o\\~/o ) \\
  /    \\ ~ /    \\
 /      \\_/      \\
/        |        \\
\\    \\___/\\___/   /
 \\              /
  \\____________/
`,
    `
      /\\    /\\
     /  \\__/  \\
    /  ^    ^  \\
   / (  o\\_/o ) \\
  /    \\ ~ /    \\
 /      \\_/      \\
/        |        \\
\\    \\___/\\___/   /
 \\              /
  \\____________/
`
  ]
};

const generateAsciiArt = (scene: string, frame: number): string => {
  const sceneKey = scene.toLowerCase();
  const frames = 
    (sceneKey.includes('cave') && asciiScenes.cave) ||
    (sceneKey.includes('sword') && asciiScenes.sword) ||
    (sceneKey.includes('forest') && asciiScenes.forest) ||
    (sceneKey.includes('dragon') && asciiScenes.dragon) ||
    asciiScenes.cave;
  
  return frames[frame % frames.length];
};

export default function AsciiArt({ scene, commandCount = 0 }: AsciiArtProps) {
  const [frame, setFrame] = useState(0);
  
  // Update frame only when a command is submitted
  useEffect(() => {
    setFrame(prev => (prev + 1) % 2);
  }, [commandCount]);

  const art = generateAsciiArt(scene, frame);
  
  return (
    <pre className="font-mono text-green-400 text-sm whitespace-pre overflow-x-auto">
      {art}
    </pre>
  );
} 