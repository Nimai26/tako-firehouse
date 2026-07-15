/**
 * Dictionnaire de noms Digimon FR/JP ↔ EN
 * 
 * Les fans francophones utilisent majoritairement les noms japonais (issus
 * de l'animé VO/VF) alors que l'API DigimonCard.io utilise les noms anglais
 * localisés. Ce dictionnaire permet la traduction bidirectionnelle.
 * 
 * Clé = nom japonais/français (lowercase), Valeur = nom anglais du jeu de cartes
 * 
 * Usage :
 *   translateDigimonName('Omegamon', 'en') → 'Omnimon'
 *   translateDigimonName('Omnimon', 'fr') → 'Omegamon'
 */

// ─── Dictionnaire JP/FR → EN ────────────────────────────────────────────────
// Organisé par série/catégorie pour faciliter la maintenance
const JP_TO_EN = {

  // ══════════════════════════════════════════════════════════════════════════
  // ROYAL KNIGHTS
  // ══════════════════════════════════════════════════════════════════════════
  'omegamon':          'Omnimon',
  'dukemon':           'Gallantmon',
  'lordknightmon':     'LordKnightmon',     // Même nom EN (pas Crusadermon dans le TCG)
  'duftmon':           'Leopardmon',
  'sleipmon':          'Kentaurosmon',
  'ulforcevdramon':    'UlforceVeedramon',
  'ulforce vdramon':   'UlforceVeedramon',
  'ulforce v-dramon':  'UlforceVeedramon',
  'craniummon':        'Craniamon',

  // ══════════════════════════════════════════════════════════════════════════
  // ADVENTURE 01 — Saison 1
  // ══════════════════════════════════════════════════════════════════════════
  'tailmon':           'Gatomon',
  'plotmon':           'Salamon',
  'nyaromon':          'Nyaromon',          // Même nom
  'vamdemon':          'Myotismon',
  'venomvamdemon':     'VenomMyotismon',
  'venom vamdemon':    'VenomMyotismon',
  'piemon':            'Piedmon',
  'mugendramon':       'Machinedramon',
  'pinocchimon':       'Puppetmon',
  'holyangemon':       'MagnaAngemon',
  'holy angemon':      'MagnaAngemon',
  'tonosamagekomon':   'ShogunGekomon',
  'tonosama gekomon':  'ShogunGekomon',

  // ══════════════════════════════════════════════════════════════════════════
  // ADVENTURE 02
  // ══════════════════════════════════════════════════════════════════════════
  'xv-mon':            'ExVeemon',
  'xvmon':             'ExVeemon',
  'lighdramon':        'Raidramon',
  'fladramon':         'Flamedramon',
  'holsmon':           'Halsemon',
  'belialvamdemon':    'MaloMyotismon',
  'belial vamdemon':   'MaloMyotismon',
  'dinobeemon':        'DinoBeemon',        // Même nom

  // ══════════════════════════════════════════════════════════════════════════
  // TAMERS — Saison 3
  // ══════════════════════════════════════════════════════════════════════════
  'growmon':            'Growlmon',
  'megalogrowmon':     'WarGrowlmon',
  'megalo growmon':    'WarGrowlmon',
  'galgomon':          'Gargomon',
  'saintgalgomon':     'MegaGargomon',
  'saint galgomon':    'MegaGargomon',
  'culumon':           'Calumon',
  'beelzebumon':       'Beelzemon',
  'guilmon':           'Guilmon',           // Même nom

  // ══════════════════════════════════════════════════════════════════════════
  // FRONTIER — Saison 4 (Esprits Légendaires)
  // ══════════════════════════════════════════════════════════════════════════
  'agnimon':           'Agunimon',
  'wolfmon':           'Lobomon',
  'blitzmon':          'Beetlemon',
  'fairymon':          'Kazemon',
  'chackmon':          'Kumamon',
  'vritramon':         'BurningGreymon',
  'garmmon':           'KendoGarurumon',
  'bolgmon':           'MetalKabuterimon',
  'shutumon':          'Zephyrmon',
  'kaisergreymon':     'EmperorGreymon',
  'kaiser greymon':    'EmperorGreymon',
  'aldamon':           'Aldamon',           // Même nom
  'ardhamon':          'Aldamon',           // Variante JP
  'raihimon':          'JetSilphymon',
  'daipenmon':         'Daipenmon',         // Même nom

  // ══════════════════════════════════════════════════════════════════════════
  // SAVERS / DATA SQUAD — Saison 5
  // ══════════════════════════════════════════════════════════════════════════
  'ravmon':            'Ravemon',
  'ravmon burst mode': 'Ravemon: Burst Mode',
  'shinegreymon burst mode': 'ShineGreymon: Burst Mode',
  'miragegaogamon burst mode': 'MirageGaogamon: Burst Mode',
  'rosemon burst mode': 'Rosemon: Burst Mode',

  // ══════════════════════════════════════════════════════════════════════════
  // XROS WARS / FUSION — Saison 6
  // ══════════════════════════════════════════════════════════════════════════
  'omnishoutmon':      'OmniShoutmon',      // Même nom
  'zekegreymon':       'ZekeGreymon',       // Même nom

  // ══════════════════════════════════════════════════════════════════════════
  // GHOST GAME — Saison 8
  // ══════════════════════════════════════════════════════════════════════════
  'gulusgammamon':     'GulusGammamon',     // Même nom
  'canoweissmon':      'Canoweissmon',      // Même nom

  // ══════════════════════════════════════════════════════════════════════════
  // SEPT GRANDS ROIS DÉMONS (Seven Great Demon Lords)
  // ══════════════════════════════════════════════════════════════════════════
  'lucemon':           'Lucemon',           // Même nom
  'demon':             'Daemon',
  'lilithmon':         'Lilithmon',         // Même nom
  'leviamon':          'Leviamon',          // Même nom
  'belphemon':         'Belphemon',         // Même nom
  'barbamon':          'Barbamon',          // Même nom

  // ══════════════════════════════════════════════════════════════════════════
  // DIGIMON POPULAIRES — Noms différents JP/EN
  // ══════════════════════════════════════════════════════════════════════════
  'blackwargreymon':   'BlackWarGreymon',   // Même nom
  'metalgreymon':      'MetalGreymon',      // Même nom
  'wargreymon':        'WarGreymon',        // Même nom
  'metalgarurumon':    'MetalGarurumon',    // Même nom
  'cherubimon':        'Cherubimon',        // Même nom
  'seraphimon':        'Seraphimon',        // Même nom
  'ophanimon':         'Ophanimon',         // Même nom
  'marineangemon':     'MarineAngemon',     // Même nom

  // Noms qui diffèrent vraiment
  'skull greymon':     'SkullGreymon',
  'picodevimon':       'DemiDevimon',
  'pico devimon':      'DemiDevimon',
  'piccolomon':        'Piximon',
  'jyureimon':         'Cherrymon',
  'gerbemon':          'Garbagemon',
  'nanomon':           'Datamon',
  'etemon':            'Etemon',            // Même nom
  'metaletemon':       'MetalEtemon',       // Même nom
  'vademon':           'Vademon',           // Même nom
  'digitamamon':       'Digitamamon',       // Même nom
  'mammothmon':        'Mammothmon',        // Même nom (variante : Mammon)
  'mammon':            'Mammothmon',
  'yukidarumon':       'Frigimon',
  'whamon':            'Whamon',            // Même nom
  'unimon':            'Unimon',            // Même nom
  'wizarmon':          'Wizardmon',
  'pumpmon':           'Pumpkinmon',
  'gotsumon':          'Gotsumon',          // Même nom

  // ══════════════════════════════════════════════════════════════════════════
  // ÉVOLUTIONS POPULAIRES AVEC NOMS DIFFÉRENTS
  // ══════════════════════════════════════════════════════════════════════════
  'omegamon zwart':        'Omnimon Zwart',
  'omegamon alter-s':      'Omnimon Alter-S',
  'omegamon alter-b':      'Omnimon Alter-B',
  'dukemon crimson mode':  'Gallantmon: Crimson Mode',
  'dukemon x':             'Gallantmon X',
  'omegamon x':            'Omnimon X',
  'omegamon merciful mode': 'Omnimon: Merciful Mode',
  'chaos dukemon':         'ChaosGallantmon',
  'chaosdukemon':          'ChaosGallantmon',
  'megidramon':            'Megidramon',    // Même nom
};

// ─── Construire le dictionnaire inverse EN → JP/FR ────────────────────────
// Seuls les noms EN "simples" (sans espace/colon) sont indexés.
// Les variantes composées ("Omnimon Zwart", "Gallantmon: Crimson Mode")
// sont gérées automatiquement par le prefix matching dans translateToFrench().
const EN_TO_JP = {};
for (const [jp, en] of Object.entries(JP_TO_EN)) {
  const enLower = en.toLowerCase();
  // Ignorer les noms EN composés — le prefix matching s'en charge
  if (enLower.includes(' ') || enLower.includes(':')) continue;
  if (!EN_TO_JP[enLower] || !jp.includes(' ')) {
    EN_TO_JP[enLower] = jp.charAt(0).toUpperCase() + jp.slice(1);
  }
}

// Capitalisation correcte des noms JP connus
const JP_DISPLAY_NAMES = {
  'omegamon':          'Omegamon',
  'dukemon':           'Dukemon',
  'duftmon':           'Duftmon',
  'sleipmon':          'Sleipmon',
  'ulforcevdramon':    'UlforceV-dramon',
  'craniummon':        'Craniummon',
  'tailmon':           'Tailmon',
  'plotmon':           'Plotmon',
  'vamdemon':          'Vamdemon',
  'venomvamdemon':     'VenomVamdemon',
  'piemon':            'Piemon',
  'mugendramon':       'Mugendramon',
  'pinocchimon':       'Pinocchimon',
  'holyangemon':       'HolyAngemon',
  'xvmon':             'XV-mon',
  'lighdramon':        'Lighdramon',
  'fladramon':         'Fladramon',
  'holsmon':           'Holsmon',
  'belialvamdemon':    'BelialVamdemon',
  'growmon':           'Growmon',
  'megalogrowmon':     'MegaloGrowmon',
  'galgomon':          'Galgomon',
  'saintgalgomon':     'SaintGalgomon',
  'culumon':           'Culumon',
  'beelzebumon':       'Beelzebumon',
  'agnimon':           'Agnimon',
  'wolfmon':           'Wolfmon',
  'blitzmon':          'Blitzmon',
  'fairymon':          'Fairymon',
  'chackmon':          'Chackmon',
  'vritramon':         'Vritramon',
  'garmmon':           'Garmmon',
  'bolgmon':           'Bolgmon',
  'shutumon':          'Shutumon',
  'kaisergreymon':     'KaiserGreymon',
  'ravmon':            'Ravmon',
  'demon':             'Demon',
  'picodevimon':       'PicoDevimon',
  'piccolomon':        'Piccolomon',
  'jyureimon':         'Jyureimon',
  'gerbemon':          'Gerbemon',
  'nanomon':           'Nanomon',
  'mammon':            'Mammon',
  'yukidarumon':       'Yukidarumon',
  'wizarmon':          'Wizarmon',
  'pumpmon':           'Pumpmon',
  'chaosdukemon':      'ChaosDukemon',
  'ardhamon':          'Ardhamon',
  'raihimon':          'Raihimon',
};

// ─── Fonctions publiques ────────────────────────────────────────────────────

/**
 * Traduire un nom de Digimon
 * @param {string} name - Nom à traduire
 * @param {string} targetLang - Langue cible ('en' ou 'fr')
 * @returns {string} Nom traduit, ou nom original si pas de traduction
 */
export function translateDigimonName(name, targetLang) {
  if (!name || typeof name !== 'string') return name;

  if (targetLang === 'en') {
    return translateToEnglish(name);
  }
  if (targetLang === 'fr') {
    return translateToFrench(name);
  }
  return name;
}

/**
 * Traduire un nom JP/FR → EN pour la recherche API
 * Gère les noms composés : "Omegamon Alter-S" → "Omnimon Alter-S"
 */
function translateToEnglish(name) {
  const nameLower = name.toLowerCase().trim();

  // 1. Correspondance exacte
  if (JP_TO_EN[nameLower]) {
    return JP_TO_EN[nameLower];
  }

  // 2. Correspondance par préfixe (noms composés)
  // Trier les clés par longueur décroissante pour matcher le plus long d'abord
  const sortedKeys = Object.keys(JP_TO_EN).sort((a, b) => b.length - a.length);
  for (const jpKey of sortedKeys) {
    if (nameLower.startsWith(jpKey + ' ') || nameLower.startsWith(jpKey + ':')) {
      const suffix = name.slice(jpKey.length);
      return JP_TO_EN[jpKey] + suffix;
    }
  }

  // 3. Correspondance par suffixe (ex: "BlackTailmon" → "BlackGatomon")
  for (const jpKey of sortedKeys) {
    if (jpKey.length >= 4 && nameLower.endsWith(jpKey)) {
      const prefix = name.slice(0, name.length - jpKey.length);
      return prefix + JP_TO_EN[jpKey];
    }
  }

  return name;
}

/**
 * Traduire un nom EN → JP/FR pour l'affichage
 * Gère les noms composés : "Omnimon Alter-S" → "Omegamon Alter-S"
 */
function translateToFrench(enName) {
  const enLower = enName.toLowerCase().trim();

  // 1. Correspondance exacte
  if (EN_TO_JP[enLower]) {
    return getDisplayName(EN_TO_JP[enLower]);
  }

  // 2. Correspondance par préfixe (noms composés)
  const sortedKeys = Object.keys(EN_TO_JP).sort((a, b) => b.length - a.length);
  for (const enKey of sortedKeys) {
    if (enLower.startsWith(enKey + ' ') || enLower.startsWith(enKey + ':')) {
      const suffix = enName.slice(enKey.length);
      return getDisplayName(EN_TO_JP[enKey]) + suffix;
    }
  }

  // 3. Correspondance par suffixe (ex: "BlackGatomon" → "BlackTailmon")
  for (const enKey of sortedKeys) {
    if (enKey.length >= 4 && enLower.endsWith(enKey)) {
      const prefix = enName.slice(0, enName.length - enKey.length);
      return prefix + getDisplayName(EN_TO_JP[enKey]);
    }
  }

  return enName;
}

/**
 * Obtenir le nom d'affichage correctement capitalisé
 */
function getDisplayName(jpName) {
  const key = jpName.toLowerCase().replace(/[\s-]/g, '');
  return JP_DISPLAY_NAMES[key] || jpName.charAt(0).toUpperCase() + jpName.slice(1);
}

/**
 * Vérifier si un nom a une traduction disponible
 */
export function hasTranslation(name, fromLang) {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  if (fromLang === 'fr') return !!JP_TO_EN[lower];
  if (fromLang === 'en') return !!EN_TO_JP[lower];
  return false;
}
