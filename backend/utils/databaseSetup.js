const pool = require('../config/database');

async function ensureTable(tableName, createSql) {
  try {
    await pool.execute(`SELECT 1 FROM ${tableName} LIMIT 1`);
    console.log(`Table exists: ${tableName}`);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log(`Creating table: ${tableName}`);
      await pool.execute(createSql);
      console.log(`Table created: ${tableName}`);
    } else {
      throw error;
    }
  }
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function ensureColumn(tableName, columnName, alterSql) {
  const exists = await columnExists(tableName, columnName);
  if (!exists) {
    console.log(`Adding column ${tableName}.${columnName}`);
    await pool.execute(alterSql);
  }
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function ensureIndex(tableName, indexName, createSql) {
  const exists = await indexExists(tableName, indexName);
  if (!exists) {
    console.log(`Adding index ${tableName}.${indexName}`);
    await pool.execute(createSql);
  }
}

async function getColumnType(tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return String(rows[0]?.COLUMN_TYPE || '').trim();
}

async function ensureEnumValue(tableName, columnName, enumValue, alterSql) {
  const columnType = (await getColumnType(tableName, columnName)).toLowerCase();
  if (!columnType) return;
  if (!columnType.includes(`'${String(enumValue || '').toLowerCase()}'`)) {
    console.log(`Updating enum ${tableName}.${columnName} to include "${enumValue}"`);
    await pool.execute(alterSql);
  }
}

async function seedDefaultVenues() {
  const generatedVenueProfiles = {
    conference_hall: {
      suffix: 'Convention Hall',
      description: 'A modern conference venue in {area}, {governorate} built for summits, training days, brand launches, and executive networking with polished AV support and efficient guest flow.',
      baseCapacity: 640,
      standardShare: 0.62,
      specialShare: 0.23,
      pricePerDay: 8600,
      rating: 4.4,
      totalReviews: 46,
      minHours: 4,
      amenities: ['parking', 'ac', 'projector', 'wifi', 'wheelchair', 'security'],
      colors: ['0C4F59', 'F6FBFC']
    },
    wedding_hall: {
      suffix: 'Celebration Hall',
      description: 'A refined wedding venue in {area}, {governorate} with bridal preparation rooms, banquet circulation, warm lighting, and flexible layouts for receptions, engagements, and graduation nights.',
      baseCapacity: 560,
      standardShare: 0.55,
      specialShare: 0.26,
      pricePerDay: 10200,
      rating: 4.6,
      totalReviews: 58,
      minHours: 4,
      amenities: ['parking', 'ac', 'stage', 'catering', 'photography', 'wifi', 'security'],
      colors: ['7A4D20', 'FFF8F0']
    },
    outdoor_garden: {
      suffix: 'Garden Estate',
      description: 'A landscaped outdoor venue in {area}, {governorate} designed for sunset weddings, cultural evenings, and private gatherings with stage access, photo zones, and open-air seating.',
      baseCapacity: 720,
      standardShare: 0.58,
      specialShare: 0.25,
      pricePerDay: 9300,
      rating: 4.5,
      totalReviews: 41,
      minHours: 5,
      amenities: ['parking', 'stage', 'catering', 'photography', 'security'],
      colors: ['22553D', 'F7FBF8']
    },
    rooftop: {
      suffix: 'Skyline Rooftop',
      description: 'A compact rooftop venue in {area}, {governorate} suited for brand previews, engagement dinners, and premium social gatherings with skyline views and lounge-style seating.',
      baseCapacity: 240,
      standardShare: 0.54,
      specialShare: 0.26,
      pricePerDay: 8800,
      rating: 4.4,
      totalReviews: 37,
      minHours: 4,
      amenities: ['ac', 'catering', 'photography', 'wifi', 'security'],
      colors: ['15384F', 'F5FBFD']
    },
    theater: {
      suffix: 'Performance Theater',
      description: 'A seated performance venue in {area}, {governorate} with stage access, strong acoustics, and audience sightlines for concerts, spoken-word programs, and keynote productions.',
      baseCapacity: 840,
      standardShare: 0.66,
      specialShare: 0.2,
      pricePerDay: 9700,
      rating: 4.5,
      totalReviews: 52,
      minHours: 5,
      amenities: ['parking', 'ac', 'stage', 'projector', 'wifi', 'wheelchair', 'security'],
      colors: ['3F1F4F', 'F5FBFD']
    },
    hotel_ballroom: {
      suffix: 'Grand Ballroom',
      description: 'A full-service hotel ballroom in {area}, {governorate} prepared for conferences, formal dinners, weddings, and VIP receptions with coordinated catering and guest services.',
      baseCapacity: 520,
      standardShare: 0.57,
      specialShare: 0.25,
      pricePerDay: 10800,
      rating: 4.5,
      totalReviews: 49,
      minHours: 4,
      amenities: ['parking', 'ac', 'projector', 'catering', 'wifi', 'wheelchair', 'security'],
      colors: ['21435B', 'F7FBFD']
    },
    art_gallery: {
      suffix: 'Art House Gallery',
      description: 'A curated gallery-style venue in {area}, {governorate} suited for launches, private showcases, and boutique networking events with flexible walls and clean ambient lighting.',
      baseCapacity: 210,
      standardShare: 0.56,
      specialShare: 0.24,
      pricePerDay: 7900,
      rating: 4.3,
      totalReviews: 29,
      minHours: 4,
      amenities: ['ac', 'projector', 'photography', 'wifi', 'security'],
      colors: ['4C1D95', 'F9F7FF']
    },
    beach_venue: {
      suffix: 'Coastal Pavilion',
      description: 'A waterfront venue in {area}, {governorate} with open-air seating, premium sunset views, and production support for destination weddings, beach dinners, and branded activations.',
      baseCapacity: 680,
      standardShare: 0.58,
      specialShare: 0.25,
      pricePerDay: 11200,
      rating: 4.6,
      totalReviews: 55,
      minHours: 5,
      amenities: ['parking', 'stage', 'catering', 'photography', 'wifi', 'security'],
      colors: ['0C6E84', 'F8FCFD']
    },
    private_villa: {
      suffix: 'Private Villa',
      description: 'An exclusive villa venue in {area}, {governorate} tailored for intimate celebrations, executive retreats, and private dinners with premium privacy and curated hospitality.',
      baseCapacity: 180,
      standardShare: 0.5,
      specialShare: 0.27,
      pricePerDay: 9600,
      rating: 4.5,
      totalReviews: 33,
      minHours: 4,
      amenities: ['parking', 'ac', 'catering', 'photography', 'wifi', 'security'],
      colors: ['5F4B32', 'FFF9F0']
    }
  };

  const locationSeedPlan = [
    { governorate: 'Cairo', targetCount: 2, baseLat: 30.0444, baseLng: 31.2357, areas: ['Heliopolis', 'Maadi'], brands: ['Heliopolis Crown', 'Maadi Grand'], profiles: ['conference_hall', 'wedding_hall'] },
    { governorate: 'Alexandria', targetCount: 2, baseLat: 31.2001, baseLng: 29.9187, areas: ['Stanley', 'Smouha'], brands: ['Stanley Signature', 'Smouha Forum'], profiles: ['hotel_ballroom', 'conference_hall'] },
    { governorate: 'Giza', targetCount: 2, baseLat: 29.987, baseLng: 31.2118, areas: ['Dokki', '6th of October'], brands: ['Dokki Horizon', 'October Royal'], profiles: ['conference_hall', 'wedding_hall'] },
    { governorate: 'Luxor', targetCount: 2, baseLat: 25.6872, baseLng: 32.6396, areas: ['East Bank', 'Karnak'], brands: ['Luxor Heritage', 'Karnak Royal'], profiles: ['outdoor_garden', 'hotel_ballroom'] },
    { governorate: 'Aswan', targetCount: 2, baseLat: 24.0889, baseLng: 32.8998, areas: ['Elephantine', 'High Dam Road'], brands: ['Philae', 'Nubian Crown'], profiles: ['outdoor_garden', 'private_villa'] },
    { governorate: 'Hurghada', targetCount: 2, baseLat: 27.2579, baseLng: 33.8116, areas: ['Marina', 'Sahl Hasheesh'], brands: ['Marina Pearl', 'Sahl Vista'], profiles: ['hotel_ballroom', 'beach_venue'] },
    { governorate: 'Sharm El Sheikh', targetCount: 2, baseLat: 27.9158, baseLng: 34.3299, areas: ['Naama Bay', 'Nabq'], brands: ['Coral Bay', 'Sinai Pearl'], profiles: ['beach_venue', 'hotel_ballroom'] },
    { governorate: 'Mansoura', targetCount: 2, baseLat: 31.0409, baseLng: 31.3785, areas: ['Toriel', 'University District'], brands: ['Nile Delta', 'University Bridge'], profiles: ['conference_hall', 'wedding_hall'] },
    { governorate: 'Tanta', targetCount: 2, baseLat: 30.7865, baseLng: 31.0004, areas: ['Al Bahr', 'Midtown'], brands: ['Ahmadi Crown', 'Midtown Gala'], profiles: ['conference_hall', 'wedding_hall'] },
    { governorate: 'Asyut', targetCount: 2, baseLat: 27.1809, baseLng: 31.1837, areas: ['Al Hamra', 'Corniche'], brands: ['Upper Nile', 'Hamra Palace'], profiles: ['conference_hall', 'hotel_ballroom'] },
    { governorate: 'Ismailia', targetCount: 2, baseLat: 30.5965, baseLng: 32.2715, areas: ['Canal District', 'El Sheikh Zayed'], brands: ['Canal View', 'Green Palm'], profiles: ['conference_hall', 'outdoor_garden'] },
    { governorate: 'Port Said', targetCount: 2, baseLat: 31.2653, baseLng: 32.3019, areas: ['Harbor Front', 'Al Arab'], brands: ['Harbor Lights', 'Mediterranean Gate'], profiles: ['beach_venue', 'conference_hall'] },
    { governorate: 'Suez', targetCount: 2, baseLat: 29.9668, baseLng: 32.5498, areas: ['Port Tawfik', 'Attaka'], brands: ['Canal Crown', 'Ain Vista'], profiles: ['conference_hall', 'hotel_ballroom'] },
    { governorate: 'Zagazig', targetCount: 2, baseLat: 30.5877, baseLng: 31.502, areas: ['Al Qawmia', 'Railway District'], brands: ['Eastern Pearl', 'Qawmia Grand'], profiles: ['conference_hall', 'wedding_hall'] },
    { governorate: 'Minya', targetCount: 2, baseLat: 28.1099, baseLng: 30.7503, areas: ['New Minya', 'Corniche'], brands: ['White Nile', 'Beni Hassan'], profiles: ['conference_hall', 'outdoor_garden'] },
    { governorate: 'Sohag', targetCount: 2, baseLat: 26.5591, baseLng: 31.6957, areas: ['West District', 'Corniche'], brands: ['Abydos', 'West Bank'], profiles: ['conference_hall', 'wedding_hall'] },
    { governorate: 'Qena', targetCount: 2, baseLat: 26.1551, baseLng: 32.716, areas: ['Dendera Road', 'Corniche'], brands: ['Dendera', 'Corniche Star'], profiles: ['outdoor_garden', 'hotel_ballroom'] },
    { governorate: 'Beni Suef', targetCount: 2, baseLat: 29.0661, baseLng: 31.0994, areas: ['Nile Corniche', 'New Beni Suef'], brands: ['Lotus Crown', 'Beni City'], profiles: ['conference_hall', 'outdoor_garden'] },
    { governorate: 'Fayoum', targetCount: 2, baseLat: 29.3084, baseLng: 30.8428, areas: ['Lake Qarun', 'Abshaway'], brands: ['Qarun Lake', 'Palm Valley'], profiles: ['outdoor_garden', 'private_villa'] },
    { governorate: 'Damietta', targetCount: 2, baseLat: 31.4165, baseLng: 31.8133, areas: ['Ras El Bar', 'New Damietta'], brands: ['Ras Marina', 'Blue Harbor'], profiles: ['beach_venue', 'hotel_ballroom'] },
    { governorate: 'Kafr El Sheikh', targetCount: 2, baseLat: 31.1117, baseLng: 30.9399, areas: ['Downtown', 'Baltim Road'], brands: ['Delta Meadow', 'Baltim Crown'], profiles: ['conference_hall', 'outdoor_garden'] },
    { governorate: 'Monufia', targetCount: 2, baseLat: 30.5549, baseLng: 31.0106, areas: ['Shebin El Kom', 'Quesna'], brands: ['Shebin Royal', 'Delta Hall'], profiles: ['conference_hall', 'wedding_hall'] },
    { governorate: 'Beheira', targetCount: 2, baseLat: 31.0341, baseLng: 30.4682, areas: ['Damanhur', 'Rosetta Road'], brands: ['Damanhur Forum', 'Rosetta Lagoon'], profiles: ['conference_hall', 'outdoor_garden'] },
    { governorate: 'Sharqia', targetCount: 2, baseLat: 30.7326, baseLng: 31.7195, areas: ['10th District', 'Belbeis Road'], brands: ['Eastern Gate', 'Belbeis Crown'], profiles: ['conference_hall', 'wedding_hall'] },
    { governorate: 'Dakahlia', targetCount: 2, baseLat: 31.0409, baseLng: 31.3785, areas: ['Mansoura Riverside', 'Talkha'], brands: ['Dakahlia Capital', 'Talkha Pearl'], profiles: ['conference_hall', 'hotel_ballroom'] },
    { governorate: 'Gharbia', targetCount: 2, baseLat: 30.7865, baseLng: 31.0004, areas: ['El Geish', 'Kafr Essam'], brands: ['Textile City', 'Canal Gate'], profiles: ['conference_hall', 'wedding_hall'] }
  ];

  function buildPlaceholderImage(name, background = '0C4F59', foreground = 'F6FBFC') {
    return `https://placehold.co/1200x800/${background}/${foreground}?text=${encodeURIComponent(name)}`;
  }

  function buildGeneratedSeedVenue(plan, profileKey, index) {
    const profile = generatedVenueProfiles[profileKey] || generatedVenueProfiles.conference_hall;
    const brand = plan.brands[index % plan.brands.length];
    const area = plan.areas[index % plan.areas.length];
    const name = `${brand} ${profile.suffix}`;
    const totalCapacity = profile.baseCapacity + ((index % 3) * 60);
    const standardSeats = Math.round(totalCapacity * profile.standardShare);
    const specialSeats = Math.round(totalCapacity * profile.specialShare);
    const vipSeats = totalCapacity - standardSeats - specialSeats;
    const pricePerDay = profile.pricePerDay + ((index % 3) * 450);
    const minHours = profile.minHours || 4;
    const pricePerHour = Number((pricePerDay / Math.max(minHours, 1)).toFixed(2));
    const rating = Number((profile.rating + ((index % 2) * 0.1)).toFixed(1));
    const totalReviews = profile.totalReviews + (index * 7);
    const latitude = Number((plan.baseLat + (index * 0.012)).toFixed(5));
    const longitude = Number((plan.baseLng + (index * 0.014)).toFixed(5));
    const description = profile.description
      .replace(/\{area\}/g, area)
      .replace(/\{governorate\}/g, plan.governorate);

    return {
      name,
      description,
      governorate: plan.governorate,
      address: `${18 + (index * 5)} ${area}, ${plan.governorate}`,
      latitude,
      longitude,
      category: profileKey,
      totalCapacity,
      standardSeats,
      specialSeats,
      vipSeats,
      pricePerDay,
      rating,
      totalReviews,
      minHours,
      pricePerHour,
      isFeatured: Array.isArray(plan.featuredIndexes) ? plan.featuredIndexes.includes(index) : false,
      amenities: JSON.stringify(profile.amenities),
      images: JSON.stringify([
        buildPlaceholderImage(name, profile.colors[0], profile.colors[1]),
        buildPlaceholderImage(`${brand} Event Suite`, profile.colors[0], profile.colors[1])
      ])
    };
  }

  const sampleVenues = [
    {
      name: 'Nile Crown Conference Center',
      description: 'A polished Garden City conference venue with a grand LED stage, breakout lounges, fast WiFi, and easy downtown access for corporate launches, policy summits, and executive networking nights.',
      governorate: 'Cairo',
      address: '18 Corniche El Nil, Garden City, Cairo',
      latitude: 30.03891,
      longitude: 31.22974,
      category: 'conference_hall',
      totalCapacity: 1400,
      standardSeats: 900,
      specialSeats: 320,
      vipSeats: 180,
      pricePerDay: 12000,
      rating: 4.8,
      totalReviews: 126,
      minHours: 4,
      pricePerHour: 3000,
      isFeatured: true,
      amenities: JSON.stringify(['parking', 'ac', 'stage', 'projector', 'catering', 'wifi', 'wheelchair', 'security', 'metro']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/0C4F59/F6FBFC?text=Nile+Crown+Conference+Center',
        'https://placehold.co/1200x800/0F6973/F6FBFC?text=Executive+Stage'
      ])
    },
    {
      name: 'Al Manial Royal Wedding Hall',
      description: 'An elegant Manial ballroom tailored for luxury weddings, engagement celebrations, and formal family receptions with chandelier lighting, bridal suites, and a dedicated banquet kitchen.',
      governorate: 'Cairo',
      address: '44 Abdel Aziz Al Saud St, Al Manial, Cairo',
      latitude: 30.02341,
      longitude: 31.22668,
      category: 'wedding_hall',
      totalCapacity: 820,
      standardSeats: 430,
      specialSeats: 220,
      vipSeats: 170,
      pricePerDay: 14500,
      rating: 4.9,
      totalReviews: 211,
      minHours: 4,
      pricePerHour: 3625,
      isFeatured: true,
      amenities: JSON.stringify(['parking', 'ac', 'stage', 'catering', 'photography', 'wifi', 'wheelchair', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/134E5E/FFF8F0?text=Al+Manial+Royal+Wedding+Hall',
        'https://placehold.co/1200x800/8F6F3C/FFF8F0?text=Golden+Reception'
      ])
    },
    {
      name: 'Zamalek Skyline Rooftop',
      description: 'A stylish rooftop in Zamalek with Nile-facing terraces, cocktail service, and modular lounge layouts built for sunset weddings, fashion previews, and intimate private launches.',
      governorate: 'Cairo',
      address: '11 Brazil St, Zamalek, Cairo',
      latitude: 30.06154,
      longitude: 31.22014,
      category: 'rooftop',
      totalCapacity: 220,
      standardSeats: 120,
      specialSeats: 60,
      vipSeats: 40,
      pricePerDay: 9000,
      rating: 4.6,
      totalReviews: 88,
      minHours: 4,
      pricePerHour: 2250,
      isFeatured: false,
      amenities: JSON.stringify(['ac', 'catering', 'photography', 'wifi', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/11384B/F5FBFD?text=Zamalek+Skyline+Rooftop',
        'https://placehold.co/1200x800/1B6375/F5FBFD?text=Rooftop+Lounge'
      ])
    },
    {
      name: 'Downtown Opera Theater',
      description: 'A classic proscenium theater near Downtown Cairo with strong acoustics, dressing rooms, stage rigging, and tiered seating for concerts, cultural performances, and keynote productions.',
      governorate: 'Cairo',
      address: '7 Talaat Harb Sq, Downtown, Cairo',
      latitude: 30.04789,
      longitude: 31.23846,
      category: 'theater',
      totalCapacity: 1600,
      standardSeats: 1100,
      specialSeats: 300,
      vipSeats: 200,
      pricePerDay: 11000,
      rating: 4.7,
      totalReviews: 154,
      minHours: 5,
      pricePerHour: 2200,
      isFeatured: true,
      amenities: JSON.stringify(['parking', 'ac', 'stage', 'projector', 'wifi', 'wheelchair', 'security', 'metro']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/0B4051/F5FBFD?text=Downtown+Opera+Theater',
        'https://placehold.co/1200x800/1A5F72/F5FBFD?text=Performance+Hall'
      ])
    },
    {
      name: 'Montaza Pearl Beach Club',
      description: 'A premium Alexandria beachfront venue with sea-breeze terraces, private shoreline access, and evening lighting packages suited for destination weddings, beach concerts, and summer galas.',
      governorate: 'Alexandria',
      address: 'Montaza Corniche, Alexandria',
      latitude: 31.28996,
      longitude: 30.03175,
      category: 'beach_venue',
      totalCapacity: 620,
      standardSeats: 340,
      specialSeats: 180,
      vipSeats: 100,
      pricePerDay: 13000,
      rating: 4.8,
      totalReviews: 137,
      minHours: 4,
      pricePerHour: 3250,
      isFeatured: true,
      amenities: JSON.stringify(['parking', 'ac', 'stage', 'catering', 'photography', 'wifi', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/0E6073/F8FCFD?text=Montaza+Pearl+Beach+Club',
        'https://placehold.co/1200x800/17A1B5/F8FCFD?text=Sea+Terrace'
      ])
    },
    {
      name: 'Corniche Palace Ballroom',
      description: 'A refined hotel ballroom on the Alexandria Corniche offering polished service, flexible round-table layouts, and integrated banquet support for conferences, weddings, and awards dinners.',
      governorate: 'Alexandria',
      address: '55 El Geish Rd, Sidi Gaber, Alexandria',
      latitude: 31.22888,
      longitude: 29.94492,
      category: 'hotel_ballroom',
      totalCapacity: 700,
      standardSeats: 380,
      specialSeats: 200,
      vipSeats: 120,
      pricePerDay: 12500,
      rating: 4.5,
      totalReviews: 94,
      minHours: 4,
      pricePerHour: 3125,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'ac', 'stage', 'projector', 'catering', 'wifi', 'wheelchair', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/14495E/F7FBFD?text=Corniche+Palace+Ballroom',
        'https://placehold.co/1200x800/0F6B79/F7FBFD?text=Grand+Banquet+Hall'
      ])
    },
    {
      name: 'Alexandria Business Forum',
      description: 'A practical Smouha venue with conference seating, exhibition corners, and strong presentation infrastructure designed for training days, industry panels, and startup demo sessions.',
      governorate: 'Alexandria',
      address: '12 Victor Emmanuel Sq, Smouha, Alexandria',
      latitude: 31.21554,
      longitude: 29.95573,
      category: 'conference_hall',
      totalCapacity: 500,
      standardSeats: 280,
      specialSeats: 140,
      vipSeats: 80,
      pricePerDay: 8500,
      rating: 4.4,
      totalReviews: 72,
      minHours: 4,
      pricePerHour: 2125,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'ac', 'projector', 'wifi', 'wheelchair', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/184A57/F5FBFD?text=Alexandria+Business+Forum',
        'https://placehold.co/1200x800/11808C/F5FBFD?text=Conference+Suite'
      ])
    },
    {
      name: 'Pyramids Oasis Garden',
      description: 'A large open-air garden with pyramid-facing backdrops, landscaped walkways, and outdoor stage infrastructure for weddings, festivals, and large cultural evenings.',
      governorate: 'Giza',
      address: 'King Faisal Rd, Nazlet El Semman, Giza',
      latitude: 29.98024,
      longitude: 31.13657,
      category: 'outdoor_garden',
      totalCapacity: 980,
      standardSeats: 540,
      specialSeats: 270,
      vipSeats: 170,
      pricePerDay: 10500,
      rating: 4.7,
      totalReviews: 109,
      minHours: 5,
      pricePerHour: 2100,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'stage', 'catering', 'photography', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/1D5A46/F7FBF9?text=Pyramids+Oasis+Garden',
        'https://placehold.co/1200x800/2F7D57/F7FBF9?text=Garden+Stage'
      ])
    },
    {
      name: 'Royal Horizon Wedding Hall',
      description: 'A bright 6th of October wedding venue with valet reception, bridal prep areas, and flexible banqueting layouts that work equally well for weddings, engagements, and graduation nights.',
      governorate: 'Giza',
      address: 'Central Axis, 6th of October, Giza',
      latitude: 29.97741,
      longitude: 30.94316,
      category: 'wedding_hall',
      totalCapacity: 650,
      standardSeats: 340,
      specialSeats: 190,
      vipSeats: 120,
      pricePerDay: 11500,
      rating: 4.6,
      totalReviews: 121,
      minHours: 4,
      pricePerHour: 2875,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'ac', 'stage', 'catering', 'photography', 'wifi', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/674224/FFF7F1?text=Royal+Horizon+Wedding+Hall',
        'https://placehold.co/1200x800/9C6532/FFF7F1?text=Celebration+Ballroom'
      ])
    },
    {
      name: 'Karnak Palm Garden',
      description: 'A tranquil Luxor garden framed by palms and warm lighting, ideal for heritage weddings, boutique festivals, and private dinners with Nile-inspired staging.',
      governorate: 'Luxor',
      address: 'Kornish Al Nile, East Bank, Luxor',
      latitude: 25.69984,
      longitude: 32.63952,
      category: 'outdoor_garden',
      totalCapacity: 460,
      standardSeats: 250,
      specialSeats: 130,
      vipSeats: 80,
      pricePerDay: 7800,
      rating: 4.5,
      totalReviews: 58,
      minHours: 4,
      pricePerHour: 1950,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'stage', 'catering', 'photography', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/22553D/F7FBF8?text=Karnak+Palm+Garden',
        'https://placehold.co/1200x800/3D845B/F7FBF8?text=Palm+Walkway'
      ])
    },
    {
      name: 'Luxor Palace Ballroom',
      description: 'A full-service ballroom in central Luxor with polished service teams, banquet staging, and comfortable guest circulation for destination conferences and celebratory receptions.',
      governorate: 'Luxor',
      address: 'Khaled Ibn El Walid St, Luxor',
      latitude: 25.69231,
      longitude: 32.6427,
      category: 'hotel_ballroom',
      totalCapacity: 520,
      standardSeats: 290,
      specialSeats: 150,
      vipSeats: 80,
      pricePerDay: 9800,
      rating: 4.4,
      totalReviews: 63,
      minHours: 4,
      pricePerHour: 2450,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'ac', 'projector', 'catering', 'wifi', 'wheelchair', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/21435B/F7FBFD?text=Luxor+Palace+Ballroom',
        'https://placehold.co/1200x800/2B6C8D/F7FBFD?text=Banquet+Setup'
      ])
    },
    {
      name: 'Nubia River Beach Venue',
      description: 'An intimate Aswan waterfront setting with open terraces, Nubian-inspired decor, and sunset-facing event zones for cultural nights, private weddings, and riverside dinners.',
      governorate: 'Aswan',
      address: 'Corniche El Nil, Aswan',
      latitude: 24.08992,
      longitude: 32.89885,
      category: 'beach_venue',
      totalCapacity: 280,
      standardSeats: 150,
      specialSeats: 80,
      vipSeats: 50,
      pricePerDay: 7200,
      rating: 4.5,
      totalReviews: 49,
      minHours: 4,
      pricePerHour: 1800,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'stage', 'catering', 'photography', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/145A5C/F7FCFC?text=Nubia+River+Beach+Venue',
        'https://placehold.co/1200x800/1E8B8E/F7FCFC?text=Riverfront+Deck'
      ])
    },
    {
      name: 'Red Sea Breeze Beach Venue',
      description: 'A wide open beachfront in Hurghada with production staging, premium cabanas, and event logistics for corporate retreats, beach concerts, and upscale destination weddings.',
      governorate: 'Hurghada',
      address: 'Sahl Hasheesh Bay, Hurghada',
      latitude: 27.00524,
      longitude: 33.8922,
      category: 'beach_venue',
      totalCapacity: 920,
      standardSeats: 530,
      specialSeats: 250,
      vipSeats: 140,
      pricePerDay: 14000,
      rating: 4.8,
      totalReviews: 146,
      minHours: 5,
      pricePerHour: 2800,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'stage', 'catering', 'photography', 'wifi', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/0C6E84/F8FCFD?text=Red+Sea+Breeze+Beach+Venue',
        'https://placehold.co/1200x800/1CB4C9/F8FCFD?text=Beachfront+Stage'
      ])
    },
    {
      name: 'Marina Vista Ballroom',
      description: 'A marina-adjacent Hurghada ballroom with modern lighting, banquet support, and hotel guest services that suit indoor conferences, receptions, and travel-industry events.',
      governorate: 'Hurghada',
      address: 'Hurghada Marina Blvd, Hurghada',
      latitude: 27.23184,
      longitude: 33.84374,
      category: 'hotel_ballroom',
      totalCapacity: 560,
      standardSeats: 310,
      specialSeats: 150,
      vipSeats: 100,
      pricePerDay: 11800,
      rating: 4.6,
      totalReviews: 77,
      minHours: 4,
      pricePerHour: 2950,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'ac', 'projector', 'catering', 'wifi', 'wheelchair', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/124661/F8FCFD?text=Marina+Vista+Ballroom',
        'https://placehold.co/1200x800/1A7BA1/F8FCFD?text=Marina+Reception'
      ])
    },
    {
      name: 'Sinai Star Garden Resort',
      description: 'A landscaped open-air resort venue in Sharm El Sheikh with palm-lined aisles, resort access, and sunset lighting designed for destination weddings, gala dinners, and branded activations.',
      governorate: 'Sharm El Sheikh',
      address: 'Nabq Bay, Sharm El Sheikh',
      latitude: 27.91894,
      longitude: 34.33071,
      category: 'outdoor_garden',
      totalCapacity: 760,
      standardSeats: 430,
      specialSeats: 200,
      vipSeats: 130,
      pricePerDay: 13200,
      rating: 4.7,
      totalReviews: 101,
      minHours: 5,
      pricePerHour: 2640,
      isFeatured: false,
      amenities: JSON.stringify(['parking', 'stage', 'catering', 'photography', 'wifi', 'security']),
      images: JSON.stringify([
        'https://placehold.co/1200x800/1F5A45/F7FBF9?text=Sinai+Star+Garden+Resort',
        'https://placehold.co/1200x800/36996C/F7FBF9?text=Resort+Garden'
      ])
    }
  ];

  const venueCountsByGovernorate = sampleVenues.reduce((map, venue) => {
    const key = String(venue.governorate || '').trim().toLowerCase();
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());

  const generatedVenues = locationSeedPlan.flatMap((plan) => {
    const existingCount = venueCountsByGovernorate.get(plan.governorate.toLowerCase()) || 0;
    const countNeeded = Math.max(0, plan.targetCount - existingCount);
    return Array.from({ length: countNeeded }, (_, index) => (
      buildGeneratedSeedVenue(plan, plan.profiles[index % plan.profiles.length], index)
    ));
  });

  sampleVenues.push(...generatedVenues);

  const governorateAliases = [
    ['Faiyum', 'Fayoum'],
    ['Red Sea', 'Hurghada'],
    ['South Sinai', 'Sharm El Sheikh'],
    ['Sharqiya', 'Sharqia'],
    ['Monofia', 'Monufia'],
    ['Menoufia', 'Monufia'],
    ['Portsaid', 'Port Said']
  ];

  for (const [legacyValue, canonicalValue] of governorateAliases) {
    await pool.execute(
      'UPDATE venues SET governorate = ? WHERE LOWER(TRIM(governorate)) = LOWER(TRIM(?))',
      [canonicalValue, legacyValue]
    );
  }

  for (const venue of sampleVenues) {
    const [rows] = await pool.execute(
      'SELECT id FROM venues WHERE name = ? LIMIT 1',
      [venue.name]
    );

    if (rows.length > 0) {
      await pool.execute(
        `UPDATE venues
         SET description = ?, governorate = ?, address = ?, latitude = ?, longitude = ?, category = ?,
             total_capacity = ?, standard_seats = ?, special_seats = ?, vip_seats = ?,
             price_per_day = ?, rating = ?, total_reviews = ?, min_hours = ?, price_per_hour = ?,
             amenities = ?, images = ?, is_featured = ?, is_available = TRUE
         WHERE id = ?`,
        [
          venue.description,
          venue.governorate,
          venue.address,
          venue.latitude,
          venue.longitude,
          venue.category,
          venue.totalCapacity,
          venue.standardSeats,
          venue.specialSeats,
          venue.vipSeats,
          venue.pricePerDay,
          venue.rating,
          venue.totalReviews,
          venue.minHours,
          venue.pricePerHour,
          venue.amenities,
          venue.images,
          venue.isFeatured ? 1 : 0,
          rows[0].id
        ]
      );
      continue;
    }

    await pool.execute(
      `INSERT INTO venues (
        name, description, governorate, address, latitude, longitude, category,
        total_capacity, standard_seats, special_seats, vip_seats,
        price_per_day, rating, total_reviews, min_hours, price_per_hour,
        amenities, images, is_featured, is_available
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        venue.name,
        venue.description,
        venue.governorate,
        venue.address,
        venue.latitude,
        venue.longitude,
        venue.category,
        venue.totalCapacity,
        venue.standardSeats,
        venue.specialSeats,
        venue.vipSeats,
        venue.pricePerDay,
        venue.rating,
        venue.totalReviews,
        venue.minHours,
        venue.pricePerHour,
        venue.amenities,
        venue.images,
        venue.isFeatured ? 1 : 0
      ]
    );
  }
}

async function setupDatabase() {
  try {
    console.log('Checking database tables...');

    await ensureTable('favorites', `
      CREATE TABLE favorites (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        event_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_event (user_id, event_id),
        INDEX idx_user (user_id),
        INDEX idx_event (event_id)
      )
    `);

    await ensureTable('notifications', `
      CREATE TABLE notifications (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user (user_id),
        INDEX idx_read (is_read),
        INDEX idx_created (created_at)
      )
    `);

    await ensureTable('event_views', `
      CREATE TABLE event_views (
        id VARCHAR(36) PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL,
        viewer_user_id VARCHAR(36) NULL,
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_event_views_event_created (event_id, created_at),
        INDEX idx_event_views_user (viewer_user_id)
      )
    `);

    await ensureTable('followers', `
      CREATE TABLE followers (
        follower_id VARCHAR(36) NOT NULL,
        following_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (follower_id, following_id),
        FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_followers_follower (follower_id),
        INDEX idx_followers_following (following_id)
      )
    `);

    await ensureTable('user_notification_preferences', `
      CREATE TABLE user_notification_preferences (
        user_id VARCHAR(36) PRIMARY KEY,
        event_reminders BOOLEAN NOT NULL DEFAULT TRUE,
        booking_confirmations BOOLEAN NOT NULL DEFAULT TRUE,
        refund_notifications BOOLEAN NOT NULL DEFAULT TRUE,
        event_cancellation_alerts BOOLEAN NOT NULL DEFAULT TRUE,
        new_events_matching_interests BOOLEAN NOT NULL DEFAULT TRUE,
        wallet_topup_confirmations BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await ensureTable('payments', `
      CREATE TABLE payments (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        event_id VARCHAR(36),
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50),
        status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
        transaction_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
        INDEX idx_user (user_id),
        INDEX idx_status (status)
      )
    `);

    await ensureTable('wallet_transactions', `
      CREATE TABLE wallet_transactions (
        transaction_id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        type ENUM('credit', 'debit') NOT NULL,
        source ENUM('refund', 'top-up', 'payment', 'event-payout', 'withdrawal') NOT NULL,
        description VARCHAR(500) NULL,
        related_event_id VARCHAR(36) NULL,
        related_booking_id VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (related_event_id) REFERENCES events(id) ON DELETE SET NULL,
        FOREIGN KEY (related_booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
        INDEX idx_wallet_user_created (user_id, created_at),
        INDEX idx_wallet_source (source)
      )
    `);

    await ensureTable('wallet_withdrawals', `
      CREATE TABLE wallet_withdrawals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        card_last_four VARCHAR(4) NOT NULL,
        card_holder VARCHAR(255) NOT NULL,
        status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP NULL,
        reference_id VARCHAR(255) UNIQUE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_wallet_withdrawals_user_requested (user_id, requested_at),
        INDEX idx_wallet_withdrawals_status (status),
        INDEX idx_wallet_withdrawals_reference (reference_id)
      )
    `);

    await ensureTable('event_vaults', `
      CREATE TABLE event_vaults (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL UNIQUE,
        balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        total_collected DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        total_refunded DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        total_withdrawn DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        status ENUM('active', 'locked', 'released', 'withdrawn') NOT NULL DEFAULT 'active',
        withdrawal_requested_at TIMESTAMP NULL,
        withdrawn_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        INDEX idx_event_vault_status (status)
      )
    `);

    await ensureTable('event_vault_transactions', `
      CREATE TABLE event_vault_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL,
        booking_id VARCHAR(36) NULL,
        amount DECIMAL(12,2) NOT NULL,
        type ENUM('booking_payment', 'refund', 'withdrawal') NOT NULL,
        description VARCHAR(500) NULL,
        balance_after DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
        INDEX idx_vault_tx_event_created (event_id, created_at),
        INDEX idx_vault_tx_type (type)
      )
    `);

    await ensureTable('event_reviews', `
      CREATE TABLE event_reviews (
        id VARCHAR(36) PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        rating INT NOT NULL,
        review TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_event_user_review (event_id, user_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await ensureTable('event_chat_messages', `
      CREATE TABLE event_chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        username VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_host BOOLEAN DEFAULT FALSE,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        INDEX idx_event_chat_created (event_id, created_at),
        INDEX idx_event_chat_user (event_id, user_id)
      )
    `);

    await ensureTable('event_chat_read_state', `
      CREATE TABLE event_chat_read_state (
        user_id VARCHAR(36) NOT NULL,
        event_id VARCHAR(36) NOT NULL,
        last_read_at TIMESTAMP NULL,
        PRIMARY KEY (user_id, event_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        INDEX idx_chat_read_event (event_id)
      )
    `);

    await ensureTable('direct_chats', `
      CREATE TABLE direct_chats (
        id VARCHAR(36) PRIMARY KEY,
        venue_booking_id INT NOT NULL,
        host_user_id VARCHAR(36) NOT NULL,
        venue_owner_user_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_booking_chat (venue_booking_id),
        FOREIGN KEY (venue_booking_id) REFERENCES venue_bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (venue_owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_host_user (host_user_id),
        INDEX idx_owner_user (venue_owner_user_id)
      )
    `);

    await ensureTable('direct_chat_messages', `
      CREATE TABLE direct_chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id VARCHAR(36) NOT NULL,
        sender_id VARCHAR(36) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES direct_chats(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_direct_chat_created (chat_id, created_at)
      )
    `);

    await ensureTable('direct_chat_read_state', `
      CREATE TABLE direct_chat_read_state (
        chat_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        last_read_at TIMESTAMP NULL,
        PRIMARY KEY (chat_id, user_id),
        FOREIGN KEY (chat_id) REFERENCES direct_chats(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await ensureTable('admin_wallet_transactions', `
      CREATE TABLE admin_wallet_transactions (
        id VARCHAR(36) PRIMARY KEY,
        amount DECIMAL(10, 2) NOT NULL,
        source VARCHAR(50) NOT NULL,
        event_id VARCHAR(36) NULL,
        venue_booking_id INT NULL,
        description VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
        FOREIGN KEY (venue_booking_id) REFERENCES venue_bookings(id) ON DELETE SET NULL
      )
    `);


    await ensureTable('event_waitlist', `
      CREATE TABLE event_waitlist (
        id VARCHAR(36) PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        status ENUM('waiting', 'notified', 'joined', 'expired') DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notified_at TIMESTAMP NULL,
        UNIQUE KEY uniq_event_user_waitlist (event_id, user_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await ensureTable('promo_codes', `
      CREATE TABLE promo_codes (
        id VARCHAR(36) PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL,
        organizer_id VARCHAR(36) NOT NULL,
        code VARCHAR(50) NOT NULL,
        discount_type ENUM('percent', 'fixed') NOT NULL,
        discount_value DECIMAL(10,2) NOT NULL,
        max_uses INT DEFAULT NULL,
        used_count INT DEFAULT 0,
        expires_at DATETIME NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_event_code (event_id, code),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await ensureTable('event_checkins', `
      CREATE TABLE event_checkins (
        id VARCHAR(36) PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL,
        booking_id VARCHAR(36) NOT NULL,
        checked_in_by VARCHAR(36) NOT NULL,
        checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_booking_checkin (booking_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await ensureTable('booking_ticket_checkins', `
      CREATE TABLE booking_ticket_checkins (
        id VARCHAR(36) PRIMARY KEY,
        booking_id VARCHAR(36) NOT NULL,
        event_id VARCHAR(36) NOT NULL,
        seat_number INT NOT NULL,
        ticket_code VARCHAR(64) NOT NULL,
        checked_in_by VARCHAR(36) NOT NULL,
        checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_booking_seat_checkin (booking_id, seat_number),
        UNIQUE KEY uniq_ticket_code_checkin (ticket_code),
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_event (event_id)
      )
    `);

    await ensureTable('email_outbox', `
      CREATE TABLE email_outbox (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NULL,
        email_to VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        status ENUM('queued', 'sent', 'failed') DEFAULT 'queued',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await ensureTable('event_marketing_setups', `
      CREATE TABLE event_marketing_setups (
        id VARCHAR(36) PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL,
        organizer_id VARCHAR(36) NOT NULL,
        marketing_budget DECIMAL(12,2) NOT NULL,
        primary_goal ENUM('profit','brand_awareness','community_building','lead_generation','product_launch') NOT NULL,
        income_level ENUM('low','medium','high') NOT NULL,
        audience_interests TEXT NOT NULL,
        expected_ticket_sales INT NOT NULL,
        estimated_event_cost DECIMAL(12,2) NOT NULL,
        instagram_url VARCHAR(255) NULL,
        facebook_url VARCHAR(255) NULL,
        is_first_event BOOLEAN NOT NULL,
        average_previous_attendance INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_event_marketing_setup (event_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await ensureTable('venues', `
      CREATE TABLE venues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        governorate VARCHAR(100) NOT NULL,
        address VARCHAR(500) NOT NULL,
        latitude DECIMAL(10,8) NULL,
        longitude DECIMAL(11,8) NULL,
        category ENUM(
          'conference_hall',
          'wedding_hall',
          'outdoor_garden',
          'rooftop',
          'theater',
          'sports_hall',
          'hotel_ballroom',
          'art_gallery',
          'beach_venue',
          'private_villa'
        ) NOT NULL DEFAULT 'conference_hall',
        total_capacity INT NOT NULL,
        standard_seats INT NOT NULL,
        special_seats INT NOT NULL,
        vip_seats INT NOT NULL,
        price_per_day DECIMAL(10,2) NOT NULL,
        rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
        total_reviews INT NOT NULL DEFAULT 0,
        min_hours INT NOT NULL DEFAULT 4,
        price_per_hour DECIMAL(10,2) NULL,
        amenities TEXT,
        images TEXT,
        is_featured BOOLEAN DEFAULT FALSE,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_venues_governorate (governorate)
      )
    `);

    await ensureTable('venue_bookings', `
      CREATE TABLE venue_bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        venue_id INT NOT NULL,
        event_id VARCHAR(36) NULL,
        host_id VARCHAR(36) NOT NULL,
        event_date DATE NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
        payment_status ENUM('unpaid', 'paid', 'refunded') DEFAULT 'unpaid',
        review_prompt_sent_at DATETIME NULL,
        booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
        FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_confirmed_booking_guard (id, venue_id),
        INDEX idx_venue_bookings_lookup (venue_id, event_date, status),
        INDEX idx_venue_bookings_host (host_id, booked_at),
        INDEX idx_venue_bookings_event (event_id)
      )
    `);

    await ensureTable('venue_wishlist', `
      CREATE TABLE venue_wishlist (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        venue_id INT NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_wishlist (user_id, venue_id),
        INDEX idx_venue_wishlist_user (user_id, added_at),
        INDEX idx_venue_wishlist_venue (venue_id, added_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
      )
    `);

    await ensureTable('venue_reviews', `
      CREATE TABLE venue_reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        venue_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        event_id VARCHAR(36) NOT NULL,
        rating INT NOT NULL,
        review_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY one_review_per_booking (venue_id, user_id, event_id),
        INDEX idx_venue_reviews_venue (venue_id, created_at),
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);

    await pool.execute('DROP TABLE IF EXISTS venue_availability_blocks'); // Drop to recreate with new schema
    await ensureTable('venue_availability_blocks', `
      CREATE TABLE venue_availability_blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        venue_id INT NOT NULL,
        block_type ENUM('specific_date', 'recurring_weekday') NOT NULL,
        date DATE NULL,
        weekday TINYINT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        reason VARCHAR(255) NULL,
        created_by VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_venue_blocks_lookup (venue_id, is_active),
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
      )
    `);

    // event_team: LOC / event crew members attached to an event
    await ensureTable('event_team', `
      CREATE TABLE event_team (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        contact_info VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_event_team_event (event_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);

    await ensureColumn(
      'venues',
      'category',
      `ALTER TABLE venues ADD COLUMN category ENUM(
        'conference_hall',
        'wedding_hall',
        'outdoor_garden',
        'rooftop',
        'theater',
        'sports_hall',
        'hotel_ballroom',
        'art_gallery',
        'beach_venue',
        'private_villa'
      ) NOT NULL DEFAULT 'conference_hall' AFTER longitude`
    );
    await ensureColumn(
      'venues',
      'rating',
      'ALTER TABLE venues ADD COLUMN rating DECIMAL(3,2) NOT NULL DEFAULT 0.00 AFTER price_per_day'
    );
    await ensureColumn(
      'venues',
      'total_reviews',
      'ALTER TABLE venues ADD COLUMN total_reviews INT NOT NULL DEFAULT 0 AFTER rating'
    );
    await ensureColumn(
      'venues',
      'min_hours',
      'ALTER TABLE venues ADD COLUMN min_hours INT NOT NULL DEFAULT 4 AFTER total_reviews'
    );
    await ensureColumn(
      'venues',
      'price_per_hour',
      'ALTER TABLE venues ADD COLUMN price_per_hour DECIMAL(10,2) NULL AFTER min_hours'
    );
    await ensureColumn(
      'venues',
      'is_featured',
      'ALTER TABLE venues ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE AFTER images'
    );
    await ensureIndex(
      'venues',
      'idx_venues_governorate',
      'CREATE INDEX idx_venues_governorate ON venues (governorate)'
    );
    await ensureColumn(
      'venue_bookings',
      'review_prompt_sent_at',
      'ALTER TABLE venue_bookings ADD COLUMN review_prompt_sent_at DATETIME NULL AFTER payment_status'
    );
    await pool.execute(
      `UPDATE venues
       SET category = COALESCE(NULLIF(category, ''), 'conference_hall'),
           rating = COALESCE(rating, 0),
           total_reviews = COALESCE(total_reviews, 0),
           min_hours = CASE WHEN COALESCE(min_hours, 0) <= 0 THEN 4 ELSE min_hours END,
           price_per_hour = COALESCE(price_per_hour, ROUND(price_per_day / GREATEST(COALESCE(min_hours, 4), 1), 2)),
           is_featured = COALESCE(is_featured, FALSE)`
    );

    await ensureColumn(
      'users',
      'profile_image_url',
      'ALTER TABLE users ADD COLUMN profile_image_url VARCHAR(500) NULL'
    );
    await ensureColumn(
      'users',
      'phone_number',
      'ALTER TABLE users ADD COLUMN phone_number VARCHAR(30) NULL'
    );
    await ensureColumn(
      'users',
      'date_of_birth',
      'ALTER TABLE users ADD COLUMN date_of_birth DATE NULL'
    );
    await ensureColumn(
      'users',
      'gender',
      "ALTER TABLE users ADD COLUMN gender ENUM('Male','Female','Prefer not to say') NULL"
    );
    await ensureColumn(
      'users',
      'governorate',
      'ALTER TABLE users ADD COLUMN governorate VARCHAR(100) NULL'
    );
    await ensureColumn(
      'users',
      'wallet_balance',
      'ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00'
    );
    await ensureColumn(
      'users',
      'last_login_at',
      'ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL'
    );

    await ensureColumn(
      'events',
      'standard_seats',
      'ALTER TABLE events ADD COLUMN standard_seats INT NOT NULL DEFAULT 0'
    );
    await ensureColumn(
      'events',
      'special_seats',
      'ALTER TABLE events ADD COLUMN special_seats INT NOT NULL DEFAULT 0'
    );
    await ensureColumn(
      'events',
      'vip_seats',
      'ALTER TABLE events ADD COLUMN vip_seats INT NOT NULL DEFAULT 0'
    );
    await ensureColumn(
      'events',
      'venue_type',
      "ALTER TABLE events ADD COLUMN venue_type ENUM('host_owned','platform_booked') NOT NULL DEFAULT 'host_owned'"
    );
    await ensureColumn(
      'events',
      'venue_id',
      'ALTER TABLE events ADD COLUMN venue_id INT NULL'
    );
    await ensureColumn(
      'events',
      'venue_booking_id',
      'ALTER TABLE events ADD COLUMN venue_booking_id INT NULL'
    );
    await ensureColumn(
      'events',
      'listing_fee',
      'ALTER TABLE events ADD COLUMN listing_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00'
    );
    await ensureColumn(
      'events',
      'event_status',
      "ALTER TABLE events ADD COLUMN event_status ENUM('pending','approved','rejected') DEFAULT 'approved'"
    );
    await ensureColumn(
      'events',
      'lifecycle_status',
      "ALTER TABLE events ADD COLUMN lifecycle_status ENUM('active','expired') NOT NULL DEFAULT 'active'"
    );
    await ensureColumn(
      'events',
      'chat_locked',
      'ALTER TABLE events ADD COLUMN chat_locked BOOLEAN NOT NULL DEFAULT FALSE'
    );
    await ensureColumn(
      'events',
      'ai_marketing_requested',
      'ALTER TABLE events ADD COLUMN ai_marketing_requested BOOLEAN NOT NULL DEFAULT FALSE'
    );
    await ensureColumn(
      'events',
      'payment_status',
      "ALTER TABLE events ADD COLUMN payment_status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid'"
    );
    await ensureColumn(
      'events',
      'expired_at',
      'ALTER TABLE events ADD COLUMN expired_at DATETIME NULL'
    );
    await pool.execute(
      `UPDATE events
       SET lifecycle_status = CASE WHEN event_date <= NOW() THEN 'expired' ELSE 'active' END,
           expired_at = CASE WHEN event_date <= NOW() THEN COALESCE(expired_at, event_date) ELSE NULL END`
    );
    await pool.execute(
      `UPDATE events
       SET standard_seats = CASE
             WHEN COALESCE(standard_seats, 0) > 0 OR COALESCE(special_seats, 0) > 0 OR COALESCE(vip_seats, 0) > 0
               THEN standard_seats
             ELSE FLOOR(COALESCE(max_seats, 0) * 0.5)
           END,
           special_seats = CASE
             WHEN COALESCE(standard_seats, 0) > 0 OR COALESCE(special_seats, 0) > 0 OR COALESCE(vip_seats, 0) > 0
               THEN special_seats
             ELSE FLOOR(COALESCE(max_seats, 0) * (2 / 6))
           END,
           vip_seats = CASE
             WHEN COALESCE(standard_seats, 0) > 0 OR COALESCE(special_seats, 0) > 0 OR COALESCE(vip_seats, 0) > 0
               THEN vip_seats
             ELSE GREATEST(
               COALESCE(max_seats, 0)
               - FLOOR(COALESCE(max_seats, 0) * 0.5)
               - FLOOR(COALESCE(max_seats, 0) * (2 / 6)),
               0
             )
           END`
    );
    await pool.execute(
      `UPDATE events e
       SET e.payment_status = 'paid'
       WHERE EXISTS (
         SELECT 1
         FROM payments p
         WHERE p.event_id = e.id
           AND p.status = 'completed'
       )`
    );

    await ensureColumn(
      'bookings',
      'seat_numbers',
      "ALTER TABLE bookings ADD COLUMN seat_numbers VARCHAR(500) NULL COMMENT 'Comma-separated seat numbers e.g. 1,3,5'"
    );
    await ensureColumn(
      'bookings',
      'attended',
      'ALTER TABLE bookings ADD COLUMN attended BOOLEAN NOT NULL DEFAULT FALSE'
    );
    await ensureColumn(
      'bookings',
      'reminder_sent_at',
      'ALTER TABLE bookings ADD COLUMN reminder_sent_at DATETIME NULL'
    );
    await ensureColumn(
      'bookings',
      'review_prompt_sent_at',
      'ALTER TABLE bookings ADD COLUMN review_prompt_sent_at DATETIME NULL'
    );
    await ensureColumn(
      'bookings',
      'amount_paid',
      'ALTER TABLE bookings ADD COLUMN amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00'
    );
    await ensureColumn(
      'bookings',
      'payment_method',
      "ALTER TABLE bookings ADD COLUMN payment_method ENUM('wallet','card','split') NULL"
    );
    await ensureColumn(
      'bookings',
      'wallet_amount_used',
      'ALTER TABLE bookings ADD COLUMN wallet_amount_used DECIMAL(12,2) NOT NULL DEFAULT 0.00'
    );
    await ensureColumn(
      'event_chat_messages',
      'is_read',
      'ALTER TABLE event_chat_messages ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE'
    );

    await ensureEnumValue(
      'wallet_transactions',
      'source',
      'event-payout',
      "ALTER TABLE wallet_transactions MODIFY COLUMN source ENUM('refund', 'top-up', 'payment', 'event-payout', 'withdrawal') NOT NULL"
    );
    await ensureEnumValue(
      'wallet_transactions',
      'source',
      'withdrawal',
      "ALTER TABLE wallet_transactions MODIFY COLUMN source ENUM('refund', 'top-up', 'payment', 'event-payout', 'withdrawal') NOT NULL"
    );
    await pool.execute(
      `UPDATE bookings b
       INNER JOIN event_checkins c ON c.booking_id = b.id
       SET b.attended = TRUE
       WHERE b.attended = FALSE`
    );

    await seedDefaultVenues();

    // ── Venue Owner Feature Migrations ──────────────────────────────────
    // users: add role column
    await ensureColumn(
      'users',
      'role',
      "ALTER TABLE users ADD COLUMN role ENUM('user','venue_owner') NOT NULL DEFAULT 'user'"
    );
    // users: add frozen_balance for escrow display
    await ensureColumn(
      'users',
      'frozen_balance',
      'ALTER TABLE users ADD COLUMN frozen_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00'
    );

    // venues: add owner_id for host-submitted venues
    await ensureColumn(
      'venues',
      'owner_id',
      'ALTER TABLE venues ADD COLUMN owner_id VARCHAR(36) NULL'
    );
    // venues: add approval status
    await ensureColumn(
      'venues',
      'status',
      "ALTER TABLE venues ADD COLUMN status ENUM('pending_review','approved','rejected','changes_requested','suspended') NOT NULL DEFAULT 'approved'"
    );
    // venues: add venue_type to distinguish platform vs host-owned
    await ensureColumn(
      'venues',
      'venue_type',
      "ALTER TABLE venues ADD COLUMN venue_type ENUM('platform','host_owned') NOT NULL DEFAULT 'platform'"
    );
    // venues: contact info and cancellation policy for owner-submitted venues
    await ensureColumn(
      'venues',
      'contact_phone',
      'ALTER TABLE venues ADD COLUMN contact_phone VARCHAR(50) NULL'
    );
    await ensureColumn(
      'venues',
      'contact_email',
      'ALTER TABLE venues ADD COLUMN contact_email VARCHAR(255) NULL'
    );
    await ensureColumn(
      'venues',
      'cancellation_policy',
      'ALTER TABLE venues ADD COLUMN cancellation_policy TEXT NULL'
    );
    await ensureColumn(
      'venues',
      'admin_notes',
      'ALTER TABLE venues ADD COLUMN admin_notes TEXT NULL'
    );

    // venue_bookings: extend status enum with escrow states
    await ensureEnumValue(
      'venue_bookings',
      'status',
      'awaiting_event_approval',
      "ALTER TABLE venue_bookings MODIFY COLUMN status ENUM('pending','confirmed','cancelled','awaiting_event_approval','pending_venue_response','accepted','declined','declined_auto_expired','awaiting_dual_approval','accepted_by_owner') NOT NULL DEFAULT 'pending'"
    );
    await ensureEnumValue(
      'venue_bookings',
      'status',
      'awaiting_dual_approval',
      "ALTER TABLE venue_bookings MODIFY COLUMN status ENUM('pending','confirmed','cancelled','awaiting_event_approval','pending_venue_response','accepted','declined','declined_auto_expired','awaiting_dual_approval','accepted_by_owner') NOT NULL DEFAULT 'pending'"
    );
    await ensureEnumValue(
      'venue_bookings',
      'status',
      'accepted_by_owner',
      "ALTER TABLE venue_bookings MODIFY COLUMN status ENUM('pending','confirmed','cancelled','awaiting_event_approval','pending_venue_response','accepted','declined','declined_auto_expired','awaiting_dual_approval','accepted_by_owner') NOT NULL DEFAULT 'pending'"
    );

    // venue_bookings: extend payment_status enum with transferred state
    await ensureEnumValue(
      'venue_bookings',
      'payment_status',
      'transferred',
      "ALTER TABLE venue_bookings MODIFY COLUMN payment_status ENUM('unpaid', 'paid', 'refunded', 'transferred') DEFAULT 'unpaid'"
    );

    // venue_bookings: add pending fees columns
    await ensureColumn(
      'venue_bookings',
      'pending_venue_fee',
      'ALTER TABLE venue_bookings ADD COLUMN pending_venue_fee DECIMAL(10, 2) DEFAULT 0.00'
    );
    await ensureColumn(
      'venue_bookings',
      'pending_platform_fee',
      'ALTER TABLE venue_bookings ADD COLUMN pending_platform_fee DECIMAL(10, 2) DEFAULT 0.00'
    );

    // events: extend status enum with pending_admin_approval state
    await ensureEnumValue(
      'events',
      'event_status',
      'pending_admin_approval',
      "ALTER TABLE events MODIFY COLUMN event_status ENUM('pending', 'approved', 'rejected', 'pending_admin_approval', 'pending_venue') DEFAULT 'approved'"
    );

    // events: extend status enum with pending_venue state
    await ensureEnumValue(
      'events',
      'event_status',
      'pending_venue',
      "ALTER TABLE events MODIFY COLUMN event_status ENUM('pending', 'approved', 'rejected', 'pending_admin_approval', 'pending_venue') DEFAULT 'approved'"
    );

    // venue_bookings: track when owner responded
    await ensureColumn(
      'venue_bookings',
      'responded_at',
      'ALTER TABLE venue_bookings ADD COLUMN responded_at DATETIME NULL'
    );
    // venue_bookings: optional notes from owner when declining
    await ensureColumn(
      'venue_bookings',
      'owner_notes',
      'ALTER TABLE venue_bookings ADD COLUMN owner_notes TEXT NULL'
    );

    // wallet_transactions: add status for held/available/refunded
    await ensureColumn(
      'wallet_transactions',
      'status',
      "ALTER TABLE wallet_transactions ADD COLUMN status ENUM('available','held','released','refunded') NOT NULL DEFAULT 'available'"
    );
    // wallet_transactions: link to venue booking for escrow tracing
    await ensureColumn(
      'wallet_transactions',
      'related_venue_booking_id',
      'ALTER TABLE wallet_transactions ADD COLUMN related_venue_booking_id INT NULL'
    );
    // wallet_transactions: extend source enum to include venue-booking and event-creation
    await ensureEnumValue(
      'wallet_transactions',
      'source',
      'event-creation',
      "ALTER TABLE wallet_transactions MODIFY COLUMN source ENUM('refund','top-up','payment','event-payout','withdrawal','venue-booking','event-creation') NOT NULL"
    );

    // ── End Venue Owner Migrations ──────────────────────────────────────

    // venues: Expanded venue profiles migrations
    await ensureColumn('venues', 'rules', 'ALTER TABLE venues ADD COLUMN rules TEXT NULL');
    await ensureColumn('venues', 'parking_details', 'ALTER TABLE venues ADD COLUMN parking_details TEXT NULL');
    await ensureColumn('venues', 'catering_policy', "ALTER TABLE venues ADD COLUMN catering_policy ENUM('allowed', 'not_allowed', 'provided_only') DEFAULT 'allowed'");
    await ensureColumn('venues', 'decoration_policy', "ALTER TABLE venues ADD COLUMN decoration_policy ENUM('allowed', 'not_allowed', 'approval_required') DEFAULT 'allowed'");
    await ensureColumn('venues', 'music_policy', "ALTER TABLE venues ADD COLUMN music_policy ENUM('allowed', 'not_allowed', 'until_midnight', 'until_10pm') DEFAULT 'allowed'");
    await ensureColumn('venues', 'setup_time_hours', 'ALTER TABLE venues ADD COLUMN setup_time_hours TINYINT DEFAULT 1');
    await ensureColumn('venues', 'cleanup_time_hours', 'ALTER TABLE venues ADD COLUMN cleanup_time_hours TINYINT DEFAULT 1');
    await ensureColumn('venues', 'min_booking_hours', 'ALTER TABLE venues ADD COLUMN min_booking_hours TINYINT DEFAULT 4');
    await ensureColumn('venues', 'max_consecutive_days', 'ALTER TABLE venues ADD COLUMN max_consecutive_days TINYINT DEFAULT 1');
    await ensureColumn('venues', 'floor_plan_image', 'ALTER TABLE venues ADD COLUMN floor_plan_image VARCHAR(500) NULL');
    await ensureColumn('venues', 'virtual_tour_url', 'ALTER TABLE venues ADD COLUMN virtual_tour_url VARCHAR(500) NULL');

    // ── Platform Wallet ───────────────────────────────────────────────────────
    // Single-row table that holds the admin platform wallet balance.
    // id is always 1 (singleton). Credits are added when admin approves an event;
    // debits are added on admin withdrawals. Platform fee is NOT refunded on rejection
    // (that is handled separately in venueOwnerEscrowService).
    await ensureTable('platform_wallet', `
      CREATE TABLE platform_wallet (
        id TINYINT UNSIGNED NOT NULL DEFAULT 1,
        balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT chk_platform_wallet_singleton CHECK (id = 1),
        CONSTRAINT chk_platform_wallet_balance CHECK (balance >= 0)
      )
    `);

    // Transaction log for the platform wallet.
    // type: 'credit' = fee collected on event approval; 'debit' = admin withdrawal.
    await ensureTable('platform_wallet_transactions', `
      CREATE TABLE platform_wallet_transactions (
        id VARCHAR(36) NOT NULL,
        type ENUM('credit', 'debit') NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        event_id VARCHAR(36) NULL,
        venue_booking_id INT NULL,
        description VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_pwt_type (type),
        INDEX idx_pwt_event (event_id),
        INDEX idx_pwt_created (created_at),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
        FOREIGN KEY (venue_booking_id) REFERENCES venue_bookings(id) ON DELETE SET NULL
      )
    `);

    // ── Venue Owner Notification Logs ────────────────────────────────────────
    await ensureTable('venue_owner_notification_logs', `
      CREATE TABLE venue_owner_notification_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        venue_owner_id VARCHAR(36) NOT NULL,
        venue_id INT NOT NULL,
        venue_name VARCHAR(255) NOT NULL DEFAULT '',
        target_type ENUM('single', 'all') NOT NULL,
        host_ids_json JSON NOT NULL,
        title VARCHAR(100) NOT NULL,
        message VARCHAR(500) NOT NULL,
        type ENUM('info', 'warning', 'success') NOT NULL DEFAULT 'info',
        sent_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_vonl_owner (venue_owner_id),
        INDEX idx_vonl_venue (venue_id),
        INDEX idx_vonl_created (created_at)
      )
    `);

    console.log('Database setup complete!');
    return true;
  } catch (error) {
    console.error('Database setup error:', error.message);
    return false;
  }
}

module.exports = { setupDatabase };
