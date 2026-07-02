export const TABLE_NAME = 'OccupationMaster';
export const FILE_NAME = 'OccupationMaster.csv';
export const COLUMNS = [
  { id: 'OccupationID', title: 'OccupationID' },
  { id: 'OccupationName', title: 'OccupationName' },
];

const OCCUPATIONS = [
  'Farmer', 'Teacher', 'Doctor', 'Engineer', 'Lawyer',
  'Shopkeeper', 'Driver', 'Laborer', 'Government Employee',
  'Private Employee', 'Business Owner', 'Housewife',
  'Student', 'Retired', 'Self Employed',
  'Police Officer', 'Nurse', 'Accountant', 'Tailor', 'Barber',
  'Cook', 'Sweeper', 'Watchman', 'Electrician', 'Plumber',
  'Carpenter', 'Painter', 'Auto Rickshaw Driver', 'Milk Vendor', 'Newspaper Vendor',
];

export async function generate() {
  return OCCUPATIONS.map((name, i) => ({
    OccupationID: i + 1,
    OccupationName: name,
  }));
}
