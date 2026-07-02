export const TABLE_NAME = 'CrimeSubHead';
export const FILE_NAME = 'CrimeSubHead.csv';
export const COLUMNS = [
  { id: 'CrimeSubHeadID', title: 'CrimeSubHeadID' },
  { id: 'CrimeHeadID', title: 'CrimeHeadID' },
  { id: 'CrimeHeadName', title: 'CrimeHeadName' },
  { id: 'SeqID', title: 'SeqID' },
];

const SUB_HEAD_GROUPS = [
  { CrimeHeadID: 1,  names: ['Murder with Deadly Weapon', 'Murder of Government Servant', 'Murder for Gain', 'Attempted Murder', 'Murder by Poison'] },
  { CrimeHeadID: 2,  names: ['Attempt to Murder with Firearm', 'Attempt to Murder by Poison', 'Attempt to Murder by Strangulation'] },
  { CrimeHeadID: 3,  names: ['Culpable Homicide not amounting to Murder', 'Culpable Homicide by Rash Driving', 'Culpable Homicide by Negligence'] },
  { CrimeHeadID: 4,  names: ['Rape of Major', 'Rape of Minor', 'Gang Rape', 'Rape by Relative'] },
  { CrimeHeadID: 5,  names: ['Kidnapping for Ransom', 'Kidnapping of Minor', 'Abduction of Woman', 'Kidnapping for Murder'] },
  { CrimeHeadID: 6,  names: ['Armed Robbery', 'Robbery on Highway', 'Robbery at Residence', 'Robbery of Valuables'] },
  { CrimeHeadID: 7,  names: ['Armed Dacoity', 'Dacoity on Highway', 'Dacoity with Murder', 'Dacoity at Residence'] },
  { CrimeHeadID: 8,  names: ['Burglary at Night', 'Burglary at Residence', 'Burglary of Shop', 'Burglary of Godown'] },
  { CrimeHeadID: 9,  names: ['Theft of Motor Vehicle', 'Theft of Mobile Phone', 'Theft of Valuables', 'Theft from Vehicle'] },
  { CrimeHeadID: 10, names: ['Rioting with Deadly Weapon', 'Rioting causing Hurt', 'Rioting with Destruction of Property', 'Unlawful Assembly'] },
  { CrimeHeadID: 11, names: ['Cheating by Impersonation', 'Cheating by False Pretence', 'Cheating by Ponzi Scheme', 'Online Fraud'] },
  { CrimeHeadID: 12, names: ['Criminal Breach of Trust by Public Servant', 'Criminal Breach of Trust by Agent', 'Criminal Breach of Trust by Bailee'] },
  { CrimeHeadID: 13, names: ['Counterfeiting of Currency', 'Counterfeiting of Stamps', 'Counterfeiting of Documents', 'Possession of Counterfeit Instrument'] },
  { CrimeHeadID: 14, names: ['Mischief by Fire', 'Mischief by Explosive', 'Arson of Dwelling House', 'Arson of Public Building'] },
  { CrimeHeadID: 15, names: ['Grievous Hurt by Weapon', 'Grievous Hurt by Poison', 'Simple Hurt', 'Hurt by Rash Driving'] },
  { CrimeHeadID: 16, names: ['Extortion by Threat', 'Extortion by Public Servant', 'Extortion by Intimidation'] },
  { CrimeHeadID: 17, names: ['House Trespass', 'House Trespass by Night', 'Lurking House Trespass', 'Criminal Trespass by Public Servant'] },
  { CrimeHeadID: 18, names: ['Assault with Intent to Outrage Modesty', 'Sexual Harassment', 'Voyeurism', 'Stalking'] },
  { CrimeHeadID: 19, names: ['Dowry Death by Burning', 'Dowry Death by Poison', 'Dowry Death by Harassment'] },
  { CrimeHeadID: 20, names: ['Hacking', 'Identity Theft', 'Cyber Stalking', 'Data Theft'] },
];

export async function generate() {
  const records = [];
  let id = 1;

  for (const group of SUB_HEAD_GROUPS) {
    group.names.forEach((name, i) => {
      records.push({
        CrimeSubHeadID: id++,
        CrimeHeadID: group.CrimeHeadID,
        CrimeHeadName: name,
        SeqID: i + 1,
      });
    });
  }

  return records;
}
