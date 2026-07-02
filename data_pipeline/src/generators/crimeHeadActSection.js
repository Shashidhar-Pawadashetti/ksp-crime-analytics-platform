export const TABLE_NAME = 'CrimeHeadActSection';
export const FILE_NAME = 'CrimeHeadActSection.csv';
export const COLUMNS = [
  { id: 'CrimeHeadID', title: 'CrimeHeadID' },
  { id: 'ActCode', title: 'ActCode' },
  { id: 'SectionCode', title: 'SectionCode' },
];

const MAPPINGS = [
  { CrimeHeadID: 1,  ActCode: 'IPC',   SectionCode: '302' },
  { CrimeHeadID: 1,  ActCode: 'IPC',   SectionCode: '304' },
  { CrimeHeadID: 1,  ActCode: 'IPC',   SectionCode: '307' },
  { CrimeHeadID: 2,  ActCode: 'IPC',   SectionCode: '307' },
  { CrimeHeadID: 3,  ActCode: 'IPC',   SectionCode: '304' },
  { CrimeHeadID: 4,  ActCode: 'IPC',   SectionCode: '376' },
  { CrimeHeadID: 4,  ActCode: 'IEA',   SectionCode: '24' },
  { CrimeHeadID: 4,  ActCode: 'IEA',   SectionCode: '25' },
  { CrimeHeadID: 4,  ActCode: 'IEA',   SectionCode: '26' },
  { CrimeHeadID: 4,  ActCode: 'IEA',   SectionCode: '27' },
  { CrimeHeadID: 5,  ActCode: 'IPC',   SectionCode: '363' },
  { CrimeHeadID: 6,  ActCode: 'IPC',   SectionCode: '392' },
  { CrimeHeadID: 7,  ActCode: 'IPC',   SectionCode: '395' },
  { CrimeHeadID: 8,  ActCode: 'IPC',   SectionCode: '380' },
  { CrimeHeadID: 8,  ActCode: 'IPC',   SectionCode: '457' },
  { CrimeHeadID: 9,  ActCode: 'IPC',   SectionCode: '379' },
  { CrimeHeadID: 9,  ActCode: 'IPC',   SectionCode: '380' },
  { CrimeHeadID: 10, ActCode: 'IPC',   SectionCode: '147' },
  { CrimeHeadID: 10, ActCode: 'IPC',   SectionCode: '148' },
  { CrimeHeadID: 11, ActCode: 'IPC',   SectionCode: '420' },
  { CrimeHeadID: 12, ActCode: 'IPC',   SectionCode: '406' },
  { CrimeHeadID: 13, ActCode: 'IPC',   SectionCode: '489A' },
  { CrimeHeadID: 14, ActCode: 'IPC',   SectionCode: '435' },
  { CrimeHeadID: 15, ActCode: 'IPC',   SectionCode: '324' },
  { CrimeHeadID: 16, ActCode: 'IPC',   SectionCode: '384' },
  { CrimeHeadID: 17, ActCode: 'IPC',   SectionCode: '441' },
  { CrimeHeadID: 17, ActCode: 'IPC',   SectionCode: '447' },
  { CrimeHeadID: 18, ActCode: 'IPC',   SectionCode: '354' },
  { CrimeHeadID: 19, ActCode: 'IPC',   SectionCode: '498A' },
  { CrimeHeadID: 20, ActCode: 'IPC',   SectionCode: '420' },
  { CrimeHeadID: 20, ActCode: 'ITACT', SectionCode: '43' },
  { CrimeHeadID: 20, ActCode: 'ITACT', SectionCode: '66' },
];

export async function generate() {
  return MAPPINGS;
}
