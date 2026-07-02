export const TABLE_NAME = 'ReligionMaster';
export const FILE_NAME = 'ReligionMaster.csv';
export const COLUMNS = [
  { id: 'ReligionID', title: 'ReligionID' },
  { id: 'ReligionName', title: 'ReligionName' },
];

export async function generate() {
  return [
    { ReligionID: 1, ReligionName: 'Hindu' },
    { ReligionID: 2, ReligionName: 'Muslim' },
    { ReligionID: 3, ReligionName: 'Christian' },
    { ReligionID: 4, ReligionName: 'Sikh' },
    { ReligionID: 5, ReligionName: 'Jain' },
    { ReligionID: 6, ReligionName: 'Buddhist' },
    { ReligionID: 7, ReligionName: 'Parsi' },
    { ReligionID: 8, ReligionName: 'Other' },
  ];
}
