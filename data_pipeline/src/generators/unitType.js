export const TABLE_NAME = 'UnitType';
export const FILE_NAME = 'UnitType.csv';
export const COLUMNS = [
  { id: 'UnitTypeID', title: 'UnitTypeID' },
  { id: 'UnitTypeName', title: 'UnitTypeName' },
  { id: 'CityDistState', title: 'CityDistState' },
];

export async function generate() {
  return [
    { UnitTypeID: 1, UnitTypeName: 'Police Station', CityDistState: 'Mumbai City' },
    { UnitTypeID: 2, UnitTypeName: 'Police Commissionerate', CityDistState: 'Pune City' },
    { UnitTypeID: 3, UnitTypeName: 'District Police Office', CityDistState: 'Thane District' },
    { UnitTypeID: 4, UnitTypeName: 'Range Headquarters', CityDistState: 'Konkan Range' },
    { UnitTypeID: 5, UnitTypeName: 'State Headquarters', CityDistState: 'Maharashtra State' },
    { UnitTypeID: 6, UnitTypeName: 'Traffic Police Unit', CityDistState: 'Nagpur City' },
    { UnitTypeID: 7, UnitTypeName: 'Cyber Crime Cell', CityDistState: 'Maharashtra State' },
  ];
}
