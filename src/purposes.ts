export interface PurposeMember {
  char: string;
  note: string;
}

export interface Purpose {
  id: string;
  title: string;
  description: string;
  members: PurposeMember[];
}

export const PURPOSES: Purpose[] = [
  {
    id: 'numeric',
    title: 'Numeric values and conversions',
    description: 'ECMA-262 distinguishes numeric kinds with subscripts: a value written with no subscript is a mathematical value, the subscript 𝔽 marks a Number, and ℤ marks a BigInt. The same letters name the operations that convert between those kinds.',
    members: [
      { char: '𝔽', note: '𝔽(x): the Number value for a mathematical value x. Also the subscript that marks a value as a Number.' },
      { char: 'ℝ', note: 'ℝ(x): the mathematical value of a Number or BigInt x.' },
      { char: 'ℤ', note: 'ℤ(x): the BigInt value for an integer x. Also the subscript that marks a value as a BigInt.' },
      { char: 'ℕ', note: 'The natural numbers; occasionally names a mathematical-value domain.' },
    ],
  },
  {
    id: 'arithmetic',
    title: 'Arithmetic',
    description: 'Operators and constants over mathematical values. These are the typographic forms - e.g. U+2212 MINUS SIGN, not the ASCII hyphen-minus.',
    members: [
      { char: '×', note: 'Multiplication of mathematical values.' },
      { char: '÷', note: 'Division of mathematical values.' },
      { char: '−', note: 'Minus / negation (U+2212 MINUS SIGN, distinct from the ASCII "-").' },
      { char: '±', note: 'Plus-or-minus.' },
      { char: '∞', note: 'Infinity; the extended mathematical values +∞ and -∞.' },
      { char: 'π', note: 'The mathematical constant π.' },
      { char: '√', note: 'Square root.' },
    ],
  },
  {
    id: 'comparison',
    title: 'Comparisons and relations',
    description: 'Relations between mathematical values. "=", "<", and ">" are written with their ASCII forms; the rest need typographic characters.',
    members: [
      { char: '≤', note: 'Less than or equal to.' },
      { char: '≥', note: 'Greater than or equal to.' },
      { char: '≠', note: 'Not equal to.' },
      { char: '≈', note: 'Approximately equal to.' },
    ],
  },
  {
    id: 'sets',
    title: 'Sets and membership',
    description: 'Set-theoretic notation used when describing collections of values.',
    members: [
      { char: '∈', note: 'Is an element of.' },
      { char: '∉', note: 'Is not an element of.' },
      { char: '⊆', note: 'Is a subset of (or equal to).' },
      { char: '∪', note: 'Set union.' },
      { char: '∩', note: 'Set intersection.' },
      { char: '∅', note: 'The empty set.' },
    ],
  },
  {
    id: 'lists',
    title: 'Lists and sequences',
    description: 'ECMA-262 List values use guillemet literal syntax: « 1, 2 » is a two-element List, and « » is the empty List.',
    members: [
      { char: '«', note: 'Opens a List literal, e.g. « 1, 2 ».' },
      { char: '»', note: 'Closes a List literal; « » is the empty List.' },
      { char: '→', note: 'Maps-to / yields, used in some mappings and tables.' },
      { char: '…', note: 'Ellipsis: elision, or "and so on".' },
    ],
  },
  {
    id: 'prose',
    title: 'Quotation and prose typography',
    description: 'Typographic punctuation for specification prose. Running emu-format turns straight quotes and double/triple hyphens into these forms.',
    members: [
      { char: '“', note: 'Opening double quotation mark.' },
      { char: '”', note: 'Closing double quotation mark.' },
      { char: '‘', note: 'Opening single quotation mark.' },
      { char: '’', note: 'Closing single quotation mark / apostrophe.' },
      { char: '—', note: 'Em dash, for parenthetical breaks in prose.' },
      { char: '–', note: 'En dash, for ranges such as 0–9.' },
    ],
  },
];
