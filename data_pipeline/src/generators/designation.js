export const TABLE_NAME = 'Designation';
export const FILE_NAME = 'Designation.csv';
export const COLUMNS = [
  { id: 'DesignationID', title: 'DesignationID' },
  { id: 'DesignationName', title: 'DesignationName' },
  { id: 'Active', title: 'Active' },
  { id: 'SortOrder', title: 'SortOrder' },
];

export async function generate() {
  return [
    { DesignationID: 1, DesignationName: 'Police Constable', Active: true, SortOrder: 1 },
    { DesignationID: 2, DesignationName: 'Head Constable', Active: true, SortOrder: 2 },
    { DesignationID: 3, DesignationName: 'Assistant Sub-Inspector', Active: true, SortOrder: 3 },
    { DesignationID: 4, DesignationName: 'Sub-Inspector', Active: true, SortOrder: 4 },
    { DesignationID: 5, DesignationName: 'Inspector of Police', Active: true, SortOrder: 5 },
    { DesignationID: 6, DesignationName: 'Circle Inspector', Active: true, SortOrder: 6 },
    { DesignationID: 7, DesignationName: 'Deputy Superintendent of Police', Active: true, SortOrder: 7 },
    { DesignationID: 8, DesignationName: 'Additional Superintendent of Police', Active: true, SortOrder: 8 },
    { DesignationID: 9, DesignationName: 'Superintendent of Police', Active: true, SortOrder: 9 },
    { DesignationID: 10, DesignationName: 'Deputy Commissioner of Police', Active: true, SortOrder: 10 },
    { DesignationID: 11, DesignationName: 'Additional Commissioner of Police', Active: true, SortOrder: 11 },
    { DesignationID: 12, DesignationName: 'Joint Commissioner of Police', Active: true, SortOrder: 12 },
    { DesignationID: 13, DesignationName: 'Commissioner of Police', Active: true, SortOrder: 13 },
    { DesignationID: 14, DesignationName: 'Director General of Police', Active: true, SortOrder: 14 },
    { DesignationID: 15, DesignationName: 'Station House Officer', Active: false, SortOrder: 15 },
    { DesignationID: 16, DesignationName: 'Investigating Officer', Active: false, SortOrder: 16 },
  ];
}
