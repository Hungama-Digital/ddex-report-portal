export const audioPartners = [
  { id: 'amazon', name: 'Amazon' },
  { id: 'bytedance', name: 'Bytedance' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'jiosaavn', name: 'Jio Saavn' },
  { id: 'spotify', name: 'Spotify' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'virgin', name: 'Virgin' }
];

export const videoPartners = [
  { id: 'airtelxstream', name: 'Airtel Xstream' },
  { id: 'playboxtv', name: 'Playbox TV' },
  { id: 'tataplaybinge', name: 'Tata Play Binge' },
  { id: 'watcho', name: 'Watcho' }
];

export const generateMockContent = (type = 'audio') => {
  const data = [];
  const statuses = ['Delivered', 'Live', 'Taken Down', 'Processing'];
  const artists = type === 'audio' 
    ? ['Arijit Singh', 'Shreya Ghoshal', 'Badshah', 'Neha Kakkar', 'Jubin Nautiyal', 'Diljit Dosanjh']
    : ['Salman Khan', 'Shah Rukh Khan', 'Deepika Padukone', 'Ranveer Singh', 'Alia Bhatt'];
  
  for (let i = 1; i <= 200; i++) {
    const isLive = Math.random() > 0.3; // 70% live
    const deliveredThisMonth = Math.random() > 0.8; // 20% delivered this month
    const takenDownThisMonth = !isLive && Math.random() > 0.5; // Some taken down
    
    // Assign specific status for current month tracking
    let currentStatus = 'Live';
    let finalIsLive = isLive;
    
    if (takenDownThisMonth) {
      currentStatus = 'Taken Down';
      finalIsLive = false;
    } else if (deliveredThisMonth) {
      currentStatus = 'Delivered';
      finalIsLive = false;
    } else if (!isLive) {
      currentStatus = 'Processing';
    }

    const title = type === 'audio' ? `Track ${i} - Super Hit` : `Video ${i} - Blockbuster`;
    const albumPrefix = type === 'audio' ? 'ALB' : 'VIDALB';
    const resourceXml = type === 'audio' 
      ? `<SoundRecording><ResourceReference>A1</ResourceReference><ReferenceTitle><TitleText>${title}</TitleText></ReferenceTitle><Duration>PT3M45S</Duration></SoundRecording>`
      : `<Video><ResourceReference>V1</ResourceReference><ReferenceTitle><TitleText>${title}</TitleText></ReferenceTitle><Duration>PT5M12S</Duration></Video>`;

    const rawXml = `<?xml version="1.0" encoding="utf-8"?>
<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/382">
  <MessageHeader>
    <MessageThreadId>MSG-${10000 + i}</MessageThreadId>
    <MessageId>ID-${Math.random().toString(36).substring(7)}</MessageId>
    <MessageSender>
      <PartyId>PADPIDA123456</PartyId>
      <PartyName>
        <FullName>Hungama Digital Media Entertainment</FullName>
      </PartyName>
    </MessageSender>
  </MessageHeader>
  <ResourceList>
    ${resourceXml}
  </ResourceList>
</ern:NewReleaseMessage>`;

    const isCurrentMonth = deliveredThisMonth || takenDownThisMonth;
    const year = isCurrentMonth ? '2026' : (Math.random() > 0.5 ? '2025' : '2026');
    const month = isCurrentMonth ? '05' : String(Math.floor(Math.random() * 4) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    const genDate = `${year}-${month}-${day}`;

    data.push({
      id: type === 'video' ? String(100000000 + i) : String(500000000 + i),
      title: title,
      artist: artists[Math.floor(Math.random() * artists.length)],
      album: `${type === 'audio' ? 'Album' : 'Video Album'} ${Math.ceil(i / 10)}`,
      albumId: type === 'audio' ? String(900000000 + Math.ceil(i / 10)) : `${albumPrefix}-${1000 + Math.ceil(i / 10)}`,
      isrc: `IN-HNG-23-${10000 + i}`,
      upc: `890${100000000 + i}`,
      releaseDate: genDate,
      actionDate: isCurrentMonth ? `2026-05-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}` : genDate,
      partner: (type === 'audio' ? audioPartners : videoPartners)[Math.floor(Math.random() * (type === 'audio' ? audioPartners : videoPartners).length)].id,
      status: currentStatus,
      isLive: finalIsLive,
      deliveredThisMonth: deliveredThisMonth,
      takenDownThisMonth: takenDownThisMonth,
      rawXml: rawXml
    });
  }
  return data;
};

export const audioContents = generateMockContent('audio');
export const videoContents = generateMockContent('video');
