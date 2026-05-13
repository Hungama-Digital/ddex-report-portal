import { audioPartners, videoPartners } from '../data/mockData';

const PARTNER_DISPLAY_OVERRIDES = {
  jiosaavn: 'Jio Saavn',
  bytedance: 'Bytedance',
  tiktok: 'TikTok',
  airtelxstream: 'Airtel Xstream',
  playboxtv: 'Playbox TV',
  tataplaybinge: 'Tata Play Binge',
};

const partnerDisplayMap = (() => {
  const map = new Map();
  [...audioPartners, ...videoPartners].forEach((partner) => {
    map.set(String(partner.id || '').toLowerCase(), partner.name);
  });
  Object.entries(PARTNER_DISPLAY_OVERRIDES).forEach(([key, value]) => {
    map.set(key, value);
  });
  return map;
})();

function toReadableName(partnerId) {
  return String(partnerId || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function getPartnerDisplayName(partnerId) {
  const key = String(partnerId || '').trim().toLowerCase();
  if (!key) {
    return '-';
  }

  return partnerDisplayMap.get(key) || toReadableName(key);
}

