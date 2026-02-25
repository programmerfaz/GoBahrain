// Non-human avatars: cute robots (DiceBear bottts). Seed-only, no people.
const DICE = 'https://api.dicebear.com/9.x/bottts/png';

function url(seed) {
  return `${DICE}?${new URLSearchParams({ seed }).toString()}`;
}

export const PREDEFINED_AVATARS = [
  url('bahrain1'),
  url('bahrain2'),
  url('gulf1'),
  url('manama1'),
  url('pearl1'),
  url('souq1'),
  url('visit1'),
  url('visit2'),
  url('bahrain3'),
  url('gulf2'),
  url('manama2'),
  url('pearl2'),
];
