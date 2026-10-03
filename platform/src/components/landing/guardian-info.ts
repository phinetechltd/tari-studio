/**
 * The five guardians that circle the hero object, in orbit order. Plain data
 * (no three.js) so the caption can render without loading the 3D scene.
 * The meanings are the commonly told symbolism of each animal, offered as
 * decoration, not as claims about any one culture.
 */
export const GUARDIANS = [
  { id: "lion", name: "The Lion", meaning: "Courage", line: "Leads the pride, steps first." },
  { id: "elephant", name: "The Elephant", meaning: "Wisdom", line: "Remembers everything, forgets no one." },
  { id: "giraffe", name: "The Giraffe", meaning: "Vision", line: "Sees the horizon before it arrives." },
  { id: "eagle", name: "The Fish Eagle", meaning: "Freedom", line: "Rides the wind above the lake." },
  { id: "kudu", name: "The Kudu", meaning: "Grace", line: "Watchful, steady, never hurried." },
] as const;

export type GuardianId = (typeof GUARDIANS)[number]["id"];
