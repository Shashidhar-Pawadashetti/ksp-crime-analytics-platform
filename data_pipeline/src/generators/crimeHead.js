export const TABLE_NAME = 'CrimeHead';
export const FILE_NAME = 'CrimeHead.csv';
export const COLUMNS = [
  { id: 'CrimeHeadID', title: 'CrimeHeadID' },
  { id: 'CrimeGroupName', title: 'CrimeGroupName' },
  { id: 'Active', title: 'Active' },
];

const CRIME_GROUPS = [
  'Murder',
  'Attempt to Murder',
  'Culpable Homicide',
  'Rape',
  'Kidnapping & Abduction',
  'Robbery',
  'Dacoity',
  'Burglary',
  'Theft',
  'Riots',
  'Cheating',
  'Criminal Breach of Trust',
  'Counterfeiting',
  'Arson',
  'Hurt / Grievous Hurt',
  'Extortion',
  'Criminal Trespass',
  'Assault on Women',
  'Dowry Death',
  'Cyber Crime',
];

export async function generate() {
  return CRIME_GROUPS.map((name, i) => ({
    CrimeHeadID: i + 1,
    CrimeGroupName: name,
    Active: 'TRUE',
  }));
}
