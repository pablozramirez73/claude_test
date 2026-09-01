/**
 * Vocabolario del POC (PRD §11, Week 1-3: "20 segni statici") e §7,
 * Fase 1 MVP: "50 segni base (ciao, grazie, aiuto, sì/no, parole comuni
 * Telegram)". Questo POC copre un primo sottoinsieme statico.
 */
export interface SignEntry {
  gloss: string;
  italian: string;
}

export const SIGN_VOCABULARY: SignEntry[] = [
  { gloss: "CIAO", italian: "Ciao!" },
  { gloss: "GRAZIE", italian: "Grazie" },
  { gloss: "AIUTO", italian: "Ho bisogno di aiuto" },
  { gloss: "SI", italian: "Sì" },
  { gloss: "NO", italian: "No" },
  { gloss: "IO", italian: "Io" },
  { gloss: "OK", italian: "Va bene" },
];
