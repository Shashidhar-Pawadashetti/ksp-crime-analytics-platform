export const TABLE_NAME = 'Act';
export const FILE_NAME = 'Act.csv';
export const COLUMNS = [
  { id: 'ActCode', title: 'ActCode' },
  { id: 'ActDescription', title: 'ActDescription' },
  { id: 'ShortName', title: 'ShortName' },
  { id: 'Active', title: 'Active' },
];

export async function generate() {
  return [
    { ActCode: 'IPC',   ActDescription: 'Indian Penal Code',                                          ShortName: 'IPC',     Active: 'TRUE' },
    { ActCode: 'CRPC',  ActDescription: 'Code of Criminal Procedure',                                 ShortName: 'CrPC',    Active: 'TRUE' },
    { ActCode: 'IEA',   ActDescription: 'Indian Evidence Act',                                        ShortName: 'IEA',     Active: 'TRUE' },
    { ActCode: 'NDPS',  ActDescription: 'Narcotic Drugs and Psychotropic Substances Act',             ShortName: 'NDPS',    Active: 'TRUE' },
    { ActCode: 'ARMS',  ActDescription: 'Arms Act',                                                   ShortName: 'Arms Act', Active: 'TRUE' },
    { ActCode: 'ITACT', ActDescription: 'Information Technology Act',                                 ShortName: 'IT Act',  Active: 'TRUE' },
  ];
}
