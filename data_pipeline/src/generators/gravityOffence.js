export const TABLE_NAME = 'GravityOffence';
export const FILE_NAME = 'GravityOffence.csv';
export const COLUMNS = [
  { id: 'GravityOffenceID', title: 'GravityOffenceID' },
  { id: 'LookupValue', title: 'LookupValue' },
];

export async function generate() {
  return [
    { GravityOffenceID: 1, LookupValue: 'Cognizable & Bailable' },
    { GravityOffenceID: 2, LookupValue: 'Non-Cognizable & Non-Bailable' },
  ];
}
