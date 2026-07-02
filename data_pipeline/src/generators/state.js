export const TABLE_NAME = 'State';
export const FILE_NAME = 'State.csv';
export const COLUMNS = [
  { id: 'StateID', title: 'StateID' },
  { id: 'StateName', title: 'StateName' },
  { id: 'NationalityID', title: 'NationalityID' },
  { id: 'Active', title: 'Active' },
];

export async function generate() {
  return [
    { StateID: 1, StateName: 'Karnataka', NationalityID: 1, Active: 'TRUE' },
  ];
}
