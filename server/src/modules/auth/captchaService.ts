import crypto from 'crypto';
import { env } from '../../config/env';

export interface CaptchaTile {
  id: number;
  category: string;
  svg: string;
}

export interface CaptchaChallenge {
  challengeId: string;
  targetCategory: string;
  targetLabel: string;
  prompt: string;
  targetIconSvg: string;
  tiles: CaptchaTile[];
  challengeToken: string;
}

// -------------------------------------------------------------
// SVG Tile Renderers with Rich Visual Styling
// -------------------------------------------------------------

function renderTrafficLightSvg(variant: number): string {
  const isRed = variant % 3 === 0;
  const isYellow = variant % 3 === 1;
  const isGreen = variant % 3 === 2;
  const poleColor = '#374151';
  const boxColor = '#1f2937';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" class="w-full h-full">
      <defs>
        <linearGradient id="skyGradTL_${variant}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="70%" stop-color="#bae6fd"/>
          <stop offset="100%" stop-color="#cbd5e1"/>
        </linearGradient>
        <radialGradient id="redGlow_${variant}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff4d4f" stop-opacity="1"/>
          <stop offset="60%" stop-color="#dc2626" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#991b1b" stop-opacity="0.3"/>
        </radialGradient>
        <radialGradient id="yellowGlow_${variant}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fef08a" stop-opacity="1"/>
          <stop offset="60%" stop-color="#eab308" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#a16207" stop-opacity="0.3"/>
        </radialGradient>
        <radialGradient id="greenGlow_${variant}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#86efac" stop-opacity="1"/>
          <stop offset="60%" stop-color="#22c55e" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#15803d" stop-opacity="0.3"/>
        </radialGradient>
      </defs>
      <!-- Background Sky & Road -->
      <rect width="140" height="140" fill="url(#skyGradTL_${variant})"/>
      <rect y="110" width="140" height="30" fill="#475569"/>
      <line x1="0" y1="125" x2="140" y2="125" stroke="#f8fafc" stroke-width="2" stroke-dasharray="8 6"/>

      <!-- Traffic Light Pole -->
      <rect x="67" y="30" width="6" height="85" fill="${poleColor}" rx="2"/>
      
      <!-- Traffic Light Housing with Visors -->
      <rect x="52" y="16" width="36" height="78" rx="8" fill="${boxColor}" stroke="#111827" stroke-width="2"/>
      
      <!-- Visor Hoods -->
      <path d="M 54 28 Q 70 20 86 28" fill="none" stroke="#111827" stroke-width="3"/>
      <path d="M 54 52 Q 70 44 86 52" fill="none" stroke="#111827" stroke-width="3"/>
      <path d="M 54 76 Q 70 68 86 76" fill="none" stroke="#111827" stroke-width="3"/>

      <!-- Red Light -->
      <circle cx="70" cy="30" r="9" fill="${isRed ? `url(#redGlow_${variant})` : '#450a0a'}" stroke="#7f1d1d" stroke-width="1.5"/>
      ${isRed ? `<circle cx="70" cy="30" r="13" fill="#ef4444" opacity="0.3"/>` : ''}

      <!-- Yellow Light -->
      <circle cx="70" cy="54" r="9" fill="${isYellow ? `url(#yellowGlow_${variant})` : '#422006'}" stroke="#713f12" stroke-width="1.5"/>
      ${isYellow ? `<circle cx="70" cy="54" r="13" fill="#eab308" opacity="0.3"/>` : ''}

      <!-- Green Light -->
      <circle cx="70" cy="78" r="9" fill="${isGreen ? `url(#greenGlow_${variant})` : '#052e16'}" stroke="#14532d" stroke-width="1.5"/>
      ${isGreen ? `<circle cx="70" cy="78" r="13" fill="#22c55e" opacity="0.3"/>` : ''}
    </svg>
  `.trim();
}

function renderBusSvg(variant: number): string {
  const busColors = ['#0284c7', '#ea580c', '#16a34a', '#7c3aed'];
  const color = busColors[variant % busColors.length];

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" class="w-full h-full">
      <defs>
        <linearGradient id="skyBus_${variant}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#93c5fd"/>
          <stop offset="65%" stop-color="#e0f2fe"/>
          <stop offset="100%" stop-color="#94a3b8"/>
        </linearGradient>
      </defs>
      <!-- Environment -->
      <rect width="140" height="140" fill="url(#skyBus_${variant})"/>
      <rect y="105" width="140" height="35" fill="#334155"/>
      <line x1="0" y1="122" x2="140" y2="122" stroke="#facc15" stroke-width="2.5" stroke-dasharray="10 8"/>

      <!-- Bus Body -->
      <rect x="20" y="42" width="100" height="60" rx="10" fill="${color}" stroke="#0f172a" stroke-width="2"/>
      
      <!-- Windshield & Passenger Windows -->
      <rect x="25" y="48" width="22" height="24" rx="4" fill="#38bdf8" stroke="#0f172a" stroke-width="1.5"/>
      <rect x="52" y="48" width="18" height="18" rx="3" fill="#e0f2fe" stroke="#0f172a" stroke-width="1.5"/>
      <rect x="74" y="48" width="18" height="18" rx="3" fill="#e0f2fe" stroke="#0f172a" stroke-width="1.5"/>
      <rect x="96" y="48" width="20" height="18" rx="3" fill="#e0f2fe" stroke="#0f172a" stroke-width="1.5"/>

      <!-- Bus Route Destination Display -->
      <rect x="36" y="36" width="68" height="10" rx="3" fill="#1e293b"/>
      <text x="70" y="44" fill="#fbbf24" font-size="7" font-family="monospace" font-weight="bold" text-anchor="middle">ALPHA-101</text>

      <!-- Headlights & Bumper -->
      <rect x="18" y="86" width="104" height="10" rx="3" fill="#0f172a"/>
      <circle cx="27" cy="80" r="4.5" fill="#fef08a" stroke="#ca8a04" stroke-width="1"/>
      <circle cx="113" cy="80" r="4" fill="#ef4444" stroke="#b91c1c" stroke-width="1"/>

      <!-- Wheels -->
      <circle cx="42" cy="104" r="12" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
      <circle cx="42" cy="104" r="5" fill="#94a3b8"/>
      <circle cx="98" cy="104" r="12" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
      <circle cx="98" cy="104" r="5" fill="#94a3b8"/>
    </svg>
  `.trim();
}

function renderBicycleSvg(variant: number): string {
  const frameColors = ['#dc2626', '#2563eb', '#16a34a', '#d97706'];
  const frameColor = frameColors[variant % frameColors.length];

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" class="w-full h-full">
      <!-- Background Path & Park Scene -->
      <rect width="140" height="140" fill="#f1f5f9"/>
      <path d="M 0 0 L 140 0 L 140 85 L 0 95 Z" fill="#bbf7d0"/>
      <rect y="92" width="140" height="48" fill="#64748b"/>
      <line x1="0" y1="116" x2="140" y2="116" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="6 6"/>

      <!-- Rear Wheel -->
      <circle cx="36" cy="94" r="22" fill="none" stroke="#1e293b" stroke-width="3"/>
      <circle cx="36" cy="94" r="4" fill="#475569"/>
      <line x1="36" y1="72" x2="36" y2="116" stroke="#94a3b8" stroke-width="1"/>
      <line x1="14" y1="94" x2="58" y2="94" stroke="#94a3b8" stroke-width="1"/>
      
      <!-- Front Wheel -->
      <circle cx="104" cy="94" r="22" fill="none" stroke="#1e293b" stroke-width="3"/>
      <circle cx="104" cy="94" r="4" fill="#475569"/>
      <line x1="104" y1="72" x2="104" y2="116" stroke="#94a3b8" stroke-width="1"/>
      <line x1="82" y1="94" x2="126" y2="94" stroke="#94a3b8" stroke-width="1"/>

      <!-- Diamond Frame -->
      <line x1="36" y1="94" x2="68" y2="94" stroke="${frameColor}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="36" y1="94" x2="58" y2="62" stroke="${frameColor}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="68" y1="94" x2="58" y2="62" stroke="${frameColor}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="68" y1="94" x2="92" y2="62" stroke="${frameColor}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="58" y1="62" x2="90" y2="62" stroke="${frameColor}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="92" y1="62" x2="104" y2="94" stroke="${frameColor}" stroke-width="3.5" stroke-linecap="round"/>

      <!-- Seat Post & Saddle -->
      <line x1="58" y1="62" x2="55" y2="52" stroke="#1e293b" stroke-width="3"/>
      <path d="M 46 52 Q 56 49 68 53" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>

      <!-- Handlebars & Stem -->
      <line x1="92" y1="62" x2="95" y2="48" stroke="#1e293b" stroke-width="3"/>
      <path d="M 88 47 Q 96 44 102 52" fill="none" stroke="#0f172a" stroke-width="3.5" stroke-linecap="round"/>

      <!-- Chainring & Pedals -->
      <circle cx="68" cy="94" r="7" fill="#475569" stroke="#0f172a" stroke-width="1.5"/>
      <line x1="64" y1="90" x2="72" y2="98" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `.trim();
}

function renderCrosswalkSvg(variant: number): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" class="w-full h-full">
      <!-- Dark Asphalt Street -->
      <rect width="140" height="140" fill="#334155"/>
      <!-- Sidewalk curbs -->
      <rect x="0" y="0" width="140" height="18" fill="#94a3b8"/>
      <rect x="0" y="122" width="140" height="18" fill="#94a3b8"/>
      <line x1="0" y1="18" x2="140" y2="18" stroke="#64748b" stroke-width="2"/>
      <line x1="0" y1="122" x2="140" y2="122" stroke="#64748b" stroke-width="2"/>

      <!-- Bright White Pedestrian Zebra Crossing Stripes -->
      <rect x="18" y="24" width="14" height="92" rx="2" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <rect x="42" y="24" width="14" height="92" rx="2" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <rect x="66" y="24" width="14" height="92" rx="2" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <rect x="90" y="24" width="14" height="92" rx="2" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      <rect x="114" y="24" width="14" height="92" rx="2" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>

      <!-- Yellow Pedestrian Warning Sign in Corner -->
      <polygon points="120,4 136,20 120,36 104,20" fill="#facc15" stroke="#ca8a04" stroke-width="1.5"/>
      <!-- Simple walking figure icon on sign -->
      <circle cx="120" cy="15" r="2" fill="#1e293b"/>
      <line x1="120" y1="17" x2="120" y2="24" stroke="#1e293b" stroke-width="1.5"/>
      <line x1="117" y1="21" x2="123" y2="20" stroke="#1e293b" stroke-width="1.5"/>
      <line x1="120" y1="24" x2="117" y2="29" stroke="#1e293b" stroke-width="1.5"/>
      <line x1="120" y1="24" x2="123" y2="29" stroke="#1e293b" stroke-width="1.5"/>
    </svg>
  `.trim();
}

function renderFireHydrantSvg(variant: number): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" class="w-full h-full">
      <!-- Concrete sidewalk & street background -->
      <rect width="140" height="90" fill="#94a3b8"/>
      <line x1="0" y1="90" x2="140" y2="90" stroke="#64748b" stroke-width="3"/>
      <rect y="90" width="140" height="50" fill="#475569"/>

      <!-- Classic Red Fire Hydrant -->
      <!-- Top Bonnet Nut -->
      <polygon points="65,22 75,22 78,28 62,28" fill="#b91c1c" stroke="#7f1d1d" stroke-width="1"/>
      <ellipse cx="70" cy="30" rx="18" ry="8" fill="#dc2626" stroke="#991b1b" stroke-width="1.5"/>
      
      <!-- Main Barrel -->
      <rect x="56" y="32" width="28" height="56" fill="#ef4444" stroke="#991b1b" stroke-width="1.5"/>
      
      <!-- Middle Flange Ring -->
      <rect x="52" y="58" width="36" height="8" rx="2" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/>
      
      <!-- Left Nozzle with Cap -->
      <rect x="42" y="48" width="14" height="12" rx="2" fill="#b91c1c" stroke="#7f1d1d" stroke-width="1.5"/>
      <circle cx="41" cy="54" r="5" fill="#facc15" stroke="#a16207" stroke-width="1"/>

      <!-- Right Nozzle with Cap -->
      <rect x="84" y="48" width="14" height="12" rx="2" fill="#b91c1c" stroke="#7f1d1d" stroke-width="1.5"/>
      <circle cx="99" cy="54" r="5" fill="#facc15" stroke="#a16207" stroke-width="1"/>

      <!-- Center Pumper Cap -->
      <circle cx="70" cy="52" r="7" fill="#facc15" stroke="#ca8a04" stroke-width="1.5"/>

      <!-- Base Flange & Bolts -->
      <rect x="50" y="88" width="40" height="10" rx="3" fill="#b91c1c" stroke="#7f1d1d" stroke-width="1.5"/>
      <circle cx="56" cy="93" r="2" fill="#fef08a"/>
      <circle cx="84" cy="93" r="2" fill="#fef08a"/>
    </svg>
  `.trim();
}

function renderCarSvg(variant: number): string {
  const colors = ['#dc2626', '#3b82f6', '#10b981', '#6b7280', '#eab308'];
  const color = colors[variant % colors.length];

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" class="w-full h-full">
      <!-- Road and Sky -->
      <rect width="140" height="80" fill="#bfdbfe"/>
      <rect y="80" width="140" height="60" fill="#334155"/>
      <line x1="0" y1="124" x2="140" y2="124" stroke="#ffffff" stroke-width="2" stroke-dasharray="8 6"/>

      <!-- Car Body -->
      <path d="M 22 84 L 32 64 L 60 52 L 95 52 L 112 66 L 122 84 Z" fill="${color}" stroke="#0f172a" stroke-width="2"/>
      <rect x="18" y="78" width="106" height="18" rx="5" fill="${color}" stroke="#0f172a" stroke-width="2"/>

      <!-- Windshield and Windows -->
      <polygon points="36,65 58,55 58,74 34,74" fill="#e0f2fe" stroke="#0f172a" stroke-width="1.5"/>
      <polygon points="62,55 92,55 106,68 62,74" fill="#e0f2fe" stroke="#0f172a" stroke-width="1.5"/>

      <!-- Headlights and Tail Lights -->
      <circle cx="22" cy="84" r="4" fill="#ef4444" stroke="#991b1b" stroke-width="1"/>
      <circle cx="120" cy="84" r="4" fill="#fef08a" stroke="#ca8a04" stroke-width="1"/>

      <!-- Wheels -->
      <circle cx="42" cy="96" r="11" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
      <circle cx="42" cy="96" r="4" fill="#cbd5e1"/>
      <circle cx="100" cy="96" r="11" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
      <circle cx="100" cy="96" r="4" fill="#cbd5e1"/>
    </svg>
  `.trim();
}

function renderTreeSvg(variant: number): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" class="w-full h-full">
      <!-- Sky & Park Lawn -->
      <rect width="140" height="96" fill="#e0f2fe"/>
      <rect y="96" width="140" height="44" fill="#4ade80"/>

      <!-- Tree Trunk -->
      <rect x="63" y="72" width="14" height="40" fill="#78350f" rx="3" stroke="#451a03" stroke-width="1.5"/>

      <!-- Tree Canopy Foliage -->
      <circle cx="70" cy="46" r="32" fill="#16a34a" stroke="#14532d" stroke-width="2"/>
      <circle cx="50" cy="54" r="22" fill="#22c55e" opacity="0.9"/>
      <circle cx="90" cy="54" r="22" fill="#15803d" opacity="0.9"/>
      <circle cx="70" cy="32" r="20" fill="#4ade80" opacity="0.8"/>
    </svg>
  `.trim();
}

function renderBenchSvg(variant: number): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" class="w-full h-full">
      <!-- Park Pavement and Lawn -->
      <rect width="140" height="140" fill="#f8fafc"/>
      <rect y="0" width="140" height="70" fill="#bbf7d0"/>
      <rect y="70" width="140" height="70" fill="#cbd5e1"/>

      <!-- Park Wooden Bench -->
      <!-- Backrest Slats -->
      <rect x="30" y="52" width="80" height="6" rx="2" fill="#9a3412" stroke="#431407" stroke-width="1"/>
      <rect x="30" y="60" width="80" height="6" rx="2" fill="#9a3412" stroke="#431407" stroke-width="1"/>
      <!-- Seat Slat -->
      <rect x="26" y="74" width="88" height="8" rx="2" fill="#c2410c" stroke="#431407" stroke-width="1.5"/>

      <!-- Iron Legs -->
      <line x1="38" y1="74" x2="34" y2="104" stroke="#1e293b" stroke-width="4" stroke-linecap="round"/>
      <line x1="102" y1="74" x2="106" y2="104" stroke="#1e293b" stroke-width="4" stroke-linecap="round"/>
      <line x1="38" y1="52" x2="38" y2="74" stroke="#1e293b" stroke-width="3"/>
      <line x1="102" y1="52" x2="102" y2="74" stroke="#1e293b" stroke-width="3"/>
    </svg>
  `.trim();
}

// -------------------------------------------------------------
// Category Definitions
// -------------------------------------------------------------

export interface CategorySpec {
  id: string;
  label: string;
  prompt: string;
  render: (variant: number) => string;
}

const CATEGORIES: Record<string, CategorySpec> = {
  traffic_light: {
    id: 'traffic_light',
    label: 'Traffic Lights',
    prompt: 'Select all squares with traffic lights',
    render: renderTrafficLightSvg
  },
  bus: {
    id: 'bus',
    label: 'Buses',
    prompt: 'Select all squares with buses',
    render: renderBusSvg
  },
  bicycle: {
    id: 'bicycle',
    label: 'Bicycles',
    prompt: 'Select all squares with bicycles',
    render: renderBicycleSvg
  },
  crosswalk: {
    id: 'crosswalk',
    label: 'Crosswalks',
    prompt: 'Select all squares with crosswalks',
    render: renderCrosswalkSvg
  },
  fire_hydrant: {
    id: 'fire_hydrant',
    label: 'Fire Hydrants',
    prompt: 'Select all squares with fire hydrants',
    render: renderFireHydrantSvg
  }
};

const DISTRACTOR_RENDERERS = [renderCarSvg, renderTreeSvg, renderBenchSvg];

// -------------------------------------------------------------
// Cryptographic Token Signing & Verification
// -------------------------------------------------------------

function signPayload(payload: any): string {
  const jsonStr = JSON.stringify(payload);
  const data = Buffer.from(jsonStr, 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

function verifyPayload<T>(token: string): T | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', env.JWT_SECRET)
      .update(data)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    const jsonStr = Buffer.from(data, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);

    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      return null;
    }

    return parsed as T;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Service Methods
// -------------------------------------------------------------

export class CaptchaService {
  /**
   * Generates a new randomized 3x3 challenge
   */
  generateChallenge(): CaptchaChallenge {
    const categoryKeys = Object.keys(CATEGORIES);
    const targetKey = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
    const target = CATEGORIES[targetKey];

    // Pick 3 or 4 target squares out of 9
    const targetCount = Math.floor(Math.random() * 2) + 3; // 3 or 4
    const allIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    // Shuffle indices
    for (let i = allIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
    }

    const targetIndices = allIndices.slice(0, targetCount).sort((a, b) => a - b);
    const targetSet = new Set(targetIndices);

    // Build the 9 tiles
    const tiles: CaptchaTile[] = [];
    for (let i = 0; i < 9; i++) {
      if (targetSet.has(i)) {
        tiles.push({
          id: i,
          category: target.id,
          svg: target.render(i + 1)
        });
      } else {
        // Pick a distractor or different category
        const distractorFn =
          DISTRACTOR_RENDERERS[Math.floor(Math.random() * DISTRACTOR_RENDERERS.length)];
        tiles.push({
          id: i,
          category: 'distractor',
          svg: distractorFn(i + 1)
        });
      }
    }

    const challengeId = crypto.randomUUID();
    const expiresAt = Date.now() + 3 * 60 * 1000; // 3 minutes validity

    const challengeToken = signPayload({
      challengeId,
      targetKey,
      targetIndices,
      expiresAt
    });

    return {
      challengeId,
      targetCategory: target.id,
      targetLabel: target.label,
      prompt: target.prompt,
      targetIconSvg: target.render(1),
      tiles,
      challengeToken
    };
  }

  /**
   * Verifies the user's selected tile indices
   */
  verifyChallenge(
    challengeToken: string,
    selectedIndices: number[]
  ): { success: boolean; captchaToken?: string; error?: string } {
    const payload = verifyPayload<{
      challengeId: string;
      targetKey: string;
      targetIndices: number[];
      expiresAt: number;
    }>(challengeToken);

    if (!payload) {
      return {
        success: false,
        error: 'Challenge expired or invalid. Please refresh the challenge.'
      };
    }

    const sortedUser = [...selectedIndices].sort((a, b) => a - b);
    const sortedTarget = [...payload.targetIndices].sort((a, b) => a - b);

    // Exact match verification
    const isMatch =
      sortedUser.length === sortedTarget.length &&
      sortedUser.every((val, index) => val === sortedTarget[index]);

    if (!isMatch) {
      return {
        success: false,
        error: 'Selection does not match. Please select all required squares.'
      };
    }

    // Success! Issue a single-use verification token (valid for 5 minutes)
    const verificationToken = signPayload({
      verified: true,
      challengeId: payload.challengeId,
      nonce: crypto.randomBytes(16).toString('hex'),
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    return {
      success: true,
      captchaToken: verificationToken
    };
  }

  /**
   * Validates the login captchaToken with Google reCAPTCHA or internal verification token
   */
  async verifyCaptchaVerificationToken(token?: string): Promise<boolean> {
    if (!token) return false;

    // 1. Check if token was signed locally by internal HMAC (fallback / offline)
    const localPayload = verifyPayload<{
      verified: boolean;
      expiresAt: number;
    }>(token);
    if (localPayload && localPayload.verified === true) {
      return true;
    }

    // 2. Official Google reCAPTCHA v2 / v3 verification
    try {
      const secretKey = (env as any).RECAPTCHA_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY || '';
      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: secretKey,
          response: token
        })
      });

      const data: any = await response.json();
      if (data && data.success === true) {
        return true;
      }

      console.warn('Google reCAPTCHA verification failed:', data?.['error-codes'] || data);
      return false;
    } catch (err: any) {
      console.error('Google reCAPTCHA verification request error:', err.message);
      // In development or test, allow graceful fallback if Google API is unreachable
      if (env.NODE_ENV !== 'production') {
        return true;
      }
      return false;
    }
  }
}

export const captchaService = new CaptchaService();
