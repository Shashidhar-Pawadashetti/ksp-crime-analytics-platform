export const TABLE_NAME = 'Rank';
export const FILE_NAME = 'Rank.csv';
export const COLUMNS = [
  { id: 'RankID', title: 'RankID' },
  { id: 'RankName', title: 'RankName' },
  { id: 'Hierarchy', title: 'Hierarchy' },
  { id: 'Active', title: 'Active' },
];

export async function generate() {
  return [
    { RankID: 1, RankName: 'Police Constable', Hierarchy: 1, Active: 'TRUE' },
    { RankID: 2, RankName: 'Head Constable', Hierarchy: 2, Active: 'TRUE' },
    { RankID: 3, RankName: 'Assistant Sub-Inspector', Hierarchy: 3, Active: 'TRUE' },
    { RankID: 4, RankName: 'Sub-Inspector', Hierarchy: 4, Active: 'TRUE' },
    { RankID: 5, RankName: 'Inspector', Hierarchy: 5, Active: 'TRUE' },
    { RankID: 6, RankName: 'Deputy Superintendent of Police', Hierarchy: 6, Active: 'TRUE' },
    { RankID: 7, RankName: 'Superintendent of Police', Hierarchy: 7, Active: 'TRUE' },
    { RankID: 8, RankName: 'Deputy Commissioner of Police', Hierarchy: 8, Active: 'TRUE' },
    { RankID: 9, RankName: 'Additional Commissioner of Police', Hierarchy: 9, Active: 'TRUE' },
    { RankID: 10, RankName: 'Joint Commissioner of Police', Hierarchy: 10, Active: 'TRUE' },
    { RankID: 11, RankName: 'Commissioner of Police', Hierarchy: 11, Active: 'TRUE' },
    { RankID: 12, RankName: 'Director General of Police', Hierarchy: 12, Active: 'TRUE' },
  ];
}
