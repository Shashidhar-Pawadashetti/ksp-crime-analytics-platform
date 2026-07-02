export const TABLE_NAME = 'District';
export const FILE_NAME = 'District.csv';
export const COLUMNS = [
  { id: 'DistrictID', title: 'DistrictID' },
  { id: 'DistrictName', title: 'DistrictName' },
  { id: 'StateID', title: 'StateID' },
  { id: 'Active', title: 'Active' },
];

export async function generate() {
  return [
    { DistrictID: 1, DistrictName: 'Bagalkot', StateID: 1, Active: 'TRUE' },
    { DistrictID: 2, DistrictName: 'Belagavi', StateID: 1, Active: 'TRUE' },
    { DistrictID: 3, DistrictName: 'Bellary', StateID: 1, Active: 'TRUE' },
    { DistrictID: 4, DistrictName: 'Bengaluru Rural', StateID: 1, Active: 'TRUE' },
    { DistrictID: 5, DistrictName: 'Bengaluru Urban', StateID: 1, Active: 'TRUE' },
    { DistrictID: 6, DistrictName: 'Bidar', StateID: 1, Active: 'TRUE' },
    { DistrictID: 7, DistrictName: 'Chamarajanagar', StateID: 1, Active: 'TRUE' },
    { DistrictID: 8, DistrictName: 'Chikkaballapur', StateID: 1, Active: 'TRUE' },
    { DistrictID: 9, DistrictName: 'Chikkamagaluru', StateID: 1, Active: 'TRUE' },
    { DistrictID: 10, DistrictName: 'Chitradurga', StateID: 1, Active: 'TRUE' },
    { DistrictID: 11, DistrictName: 'Dakshina Kannada', StateID: 1, Active: 'TRUE' },
    { DistrictID: 12, DistrictName: 'Davanagere', StateID: 1, Active: 'TRUE' },
    { DistrictID: 13, DistrictName: 'Dharwad', StateID: 1, Active: 'TRUE' },
    { DistrictID: 14, DistrictName: 'Gadag', StateID: 1, Active: 'TRUE' },
    { DistrictID: 15, DistrictName: 'Hassan', StateID: 1, Active: 'TRUE' },
    { DistrictID: 16, DistrictName: 'Haveri', StateID: 1, Active: 'TRUE' },
    { DistrictID: 17, DistrictName: 'Kalaburagi (Gulbarga)', StateID: 1, Active: 'TRUE' },
    { DistrictID: 18, DistrictName: 'Kodagu', StateID: 1, Active: 'TRUE' },
    { DistrictID: 19, DistrictName: 'Kolar', StateID: 1, Active: 'TRUE' },
    { DistrictID: 20, DistrictName: 'Koppal', StateID: 1, Active: 'TRUE' },
    { DistrictID: 21, DistrictName: 'Mandya', StateID: 1, Active: 'TRUE' },
    { DistrictID: 22, DistrictName: 'Mysuru', StateID: 1, Active: 'TRUE' },
    { DistrictID: 23, DistrictName: 'Raichur', StateID: 1, Active: 'TRUE' },
    { DistrictID: 24, DistrictName: 'Ramanagara', StateID: 1, Active: 'TRUE' },
    { DistrictID: 25, DistrictName: 'Shivamogga', StateID: 1, Active: 'TRUE' },
    { DistrictID: 26, DistrictName: 'Tumakuru', StateID: 1, Active: 'TRUE' },
    { DistrictID: 27, DistrictName: 'Udupi', StateID: 1, Active: 'TRUE' },
    { DistrictID: 28, DistrictName: 'Uttara Kannada', StateID: 1, Active: 'TRUE' },
    { DistrictID: 29, DistrictName: 'Vijayanagara', StateID: 1, Active: 'TRUE' },
    { DistrictID: 30, DistrictName: 'Vijayapura', StateID: 1, Active: 'TRUE' },
    { DistrictID: 31, DistrictName: 'Yadgir', StateID: 1, Active: 'TRUE' },
  ];
}
