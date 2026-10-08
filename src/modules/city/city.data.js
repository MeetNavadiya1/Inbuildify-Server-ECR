/**
 * The single source of truth for which countries the app offers and which
 * cities belong to which state.
 *
 * The frontend never carries its own copy: it asks `GET /city` for the list of
 * the state it has selected, and every write of a country / state / city is
 * checked against the same data by `locationGuard`. A list edited here is what
 * both the dropdown shows and the save accepts.
 *
 * Keys are lower-case, matching the `country.name` / `state.name` rows. City
 * names contain only letters and spaces so they satisfy the frontend's
 * CityNameRules.
 *
 * `allowCustomCity` decides what happens to a city that is not in the list:
 *   - true  → accepted as typed (the dropdown offers "Other"). Australia keeps
 *             this: a suburb list can never be complete.
 *   - false → refused. The dropdown only offers the listed cities.
 */

const AUSTRALIA = {
  // ISO 3166 code, as `timezones.country_code` stores it.
  countryCode: "AU",
  allowCustomCity: true,
  postcodeLabel: "postcode",
  // Postcodes are exactly this many digits.
  postcodeLength: 4,
  // Some older rows and forms carry the abbreviation rather than the name.
  stateAliases: {
    nsw: "new south wales",
    qld: "queensland",
    vic: "victoria",
    tas: "tasmania",
    sa: "south australia",
    wa: "western australia",
    act: "australian capital territory",
    nt: "northern territory",
  },
  citiesByState: {
    "new south wales": [
      "Sydney", "Newcastle", "Wollongong", "Central Coast", "Gosford", "Parramatta", "Penrith",
      "Liverpool", "Blacktown", "Campbelltown", "Bankstown", "Castle Hill", "Hornsby", "Chatswood",
      "Bondi", "Manly", "Cronulla", "Maitland", "Cessnock", "Wagga Wagga", "Albury", "Port Macquarie",
      "Tamworth", "Orange", "Dubbo", "Bathurst", "Queanbeyan", "Goulburn", "Bowral", "Coffs Harbour",
      "Lismore", "Ballina", "Byron Bay", "Tweed Heads", "Grafton", "Armidale", "Nowra", "Kiama",
      "Batemans Bay", "Mudgee", "Griffith", "Broken Hill",
    ],
    queensland: [
      "Brisbane", "Gold Coast", "Sunshine Coast", "Cairns", "Townsville", "Toowoomba", "Mackay",
      "Rockhampton", "Bundaberg", "Hervey Bay", "Gladstone", "Ipswich", "Logan", "Redcliffe",
      "Caboolture", "Springfield", "Redland Bay", "Southport", "Surfers Paradise", "Robina",
      "Coolangatta", "Maroochydore", "Caloundra", "Noosa", "Gympie", "Maryborough", "Kingaroy",
      "Dalby", "Warwick", "Stanthorpe", "Emerald", "Mount Isa", "Charters Towers", "Bowen",
      "Airlie Beach", "Innisfail", "Mareeba", "Port Douglas",
    ],
    victoria: [
      "Melbourne", "Geelong", "Ballarat", "Bendigo", "Shepparton", "Mildura", "Warrnambool", "Wodonga",
      "Traralgon", "Morwell", "Moe", "Sale", "Bairnsdale", "Wangaratta", "Horsham", "Echuca",
      "Swan Hill", "Hamilton", "Portland", "Colac", "Castlemaine", "Frankston", "Dandenong",
      "Werribee", "Melton", "Sunbury", "Craigieburn", "Pakenham", "Cranbourne", "Mornington",
      "Box Hill", "Ringwood", "St Kilda", "Torquay", "Ocean Grove",
    ],
    tasmania: [
      "Hobart", "Launceston", "Devonport", "Burnie", "Kingston", "Glenorchy", "Moonah", "Sandy Bay",
      "Bellerive", "Sorell", "New Norfolk", "Huonville", "Ulverstone", "Wynyard", "Latrobe",
      "Deloraine", "Longford", "George Town", "Scottsdale", "Bridport", "St Helens", "Swansea",
      "Smithton", "Queenstown", "Strahan",
    ],
    "south australia": [
      "Adelaide", "Glenelg", "Salisbury", "Elizabeth", "Gawler", "Noarlunga", "Mount Barker",
      "Murray Bridge", "Victor Harbor", "Goolwa", "Strathalbyn", "Nuriootpa", "Tanunda", "Clare",
      "Kadina", "Wallaroo", "Port Pirie", "Port Augusta", "Whyalla", "Port Lincoln", "Mount Gambier",
      "Millicent", "Naracoorte", "Renmark", "Berri", "Loxton", "Roxby Downs", "Coober Pedy",
    ],
    "western australia": [
      "Perth", "Fremantle", "Joondalup", "Rockingham", "Mandurah", "Armadale", "Midland",
      "Scarborough", "Cottesloe", "Bunbury", "Busselton", "Dunsborough", "Margaret River", "Collie",
      "Albany", "Esperance", "Narrogin", "Northam", "Merredin", "Kalgoorlie", "Geraldton",
      "Carnarvon", "Exmouth", "Karratha", "Port Hedland", "Newman", "Tom Price", "Broome",
      "Kununurra",
    ],
    "australian capital territory": [
      "Canberra", "Civic", "Braddon", "Dickson", "Barton", "Kingston", "Belconnen", "Bruce",
      "Gungahlin", "Woden", "Phillip", "Weston Creek", "Molonglo", "Tuggeranong", "Kambah",
      "Fyshwick", "Hall", "Tharwa",
    ],
    "northern territory": [
      "Darwin", "Palmerston", "Casuarina", "Howard Springs", "Humpty Doo", "Coolalinga", "Batchelor",
      "Katherine", "Tennant Creek", "Alice Springs", "Yulara", "Jabiru", "Nhulunbuy", "Wadeye",
      "Borroloola",
    ],
  },
};

// All 28 states and 8 union territories. The state list itself is inserted by
// migration 20260928120000-add-india-country-and-states; keep the two in step.
const INDIA = {
  countryCode: "IN",
  allowCustomCity: false,
  postcodeLabel: "PIN code",
  postcodeLength: 6,
  /*
   * India Post PIN codes: six digits, never starting with 0. The first digit is
   * the postal zone (1–8 geographic, 9 the Army Postal Service), the first two
   * the circle and the first three the sorting district — so the first three
   * digits say which state a PIN belongs to.
   *
   * Ranges of those first three digits, inclusive, per state / UT. Where India
   * Post runs one circle for several states (Bihar and Jharkhand, West Bengal
   * and Sikkim, Punjab and Chandigarh…) each state is given its circle's full
   * span, so a real PIN is never refused; the check still catches a PIN from
   * the wrong part of the country, which is the mistake that happens.
   */
  postcodeRangesByState: {
    "andhra pradesh": [[515, 535]],
    "arunachal pradesh": [[790, 792]],
    assam: [[781, 788]],
    bihar: [[800, 855]],
    chhattisgarh: [[490, 497]],
    goa: [[403, 403]],
    gujarat: [[360, 396]],
    haryana: [[121, 136]],
    "himachal pradesh": [[171, 177]],
    jharkhand: [[813, 835]],
    karnataka: [[560, 591]],
    kerala: [[670, 695]],
    "madhya pradesh": [[450, 488]],
    maharashtra: [[400, 445]],
    manipur: [[795, 795]],
    meghalaya: [[793, 794]],
    mizoram: [[796, 796]],
    nagaland: [[797, 798]],
    odisha: [[751, 770]],
    punjab: [[140, 160]],
    rajasthan: [[301, 345]],
    sikkim: [[737, 737]],
    "tamil nadu": [[600, 643]],
    telangana: [[500, 509]],
    tripura: [[799, 799]],
    "uttar pradesh": [[201, 285]],
    uttarakhand: [[244, 249], [262, 263]],
    "west bengal": [[700, 743]],
    "andaman and nicobar islands": [[744, 744]],
    chandigarh: [[160, 160]],
    "dadra and nagar haveli and daman and diu": [[362, 362], [396, 396]],
    delhi: [[110, 110]],
    "jammu and kashmir": [[180, 194]],
    ladakh: [[194, 194]],
    lakshadweep: [[682, 682]],
    // Puducherry, Karaikal, Mahe and Yanam sit inside three different states.
    puducherry: [[533, 533], [605, 605], [607, 607], [609, 609], [673, 673]],
  },
  stateAliases: {
    "nct of delhi": "delhi",
    "national capital territory of delhi": "delhi",
    orissa: "odisha",
    pondicherry: "puducherry",
    uttaranchal: "uttarakhand",
  },
  citiesByState: {
    // ── States ──────────────────────────────────────────────────────────────
    "andhra pradesh": [
      "Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Rajahmundry", "Kakinada",
      "Tirupati", "Kadapa", "Anantapur", "Eluru", "Ongole", "Vizianagaram", "Srikakulam",
      "Machilipatnam", "Chittoor", "Tenali", "Proddatur", "Hindupur", "Bhimavaram", "Amaravati",
      "Nandyal", "Adoni", "Madanapalle",
    ],
    "arunachal pradesh": [
      "Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro", "Bomdila", "Along", "Tezu", "Roing",
      "Namsai", "Khonsa", "Daporijo", "Seppa", "Changlang",
    ],
    assam: [
      "Guwahati", "Dispur", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur",
      "Bongaigaon", "Karimganj", "Sivasagar", "Goalpara", "Barpeta", "Dhubri", "Diphu",
      "North Lakhimpur", "Golaghat", "Hailakandi", "Mangaldoi", "Kokrajhar",
    ],
    bihar: [
      "Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Arrah", "Begusarai",
      "Katihar", "Munger", "Chhapra", "Bihar Sharif", "Sasaram", "Hajipur", "Dehri", "Siwan",
      "Motihari", "Nawada", "Bettiah", "Buxar", "Kishanganj", "Sitamarhi", "Samastipur", "Aurangabad",
    ],
    chhattisgarh: [
      "Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon", "Jagdalpur", "Raigarh",
      "Ambikapur", "Dhamtari", "Mahasamund", "Chirmiri", "Kanker", "Janjgir", "Nava Raipur",
    ],
    goa: [
      "Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Bicholim", "Curchorem", "Sanquelim",
      "Cuncolim", "Valpoi", "Canacona", "Quepem", "Pernem", "Calangute",
    ],
    gujarat: [
      "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Junagadh", "Gandhinagar",
      "Anand", "Navsari", "Morbi", "Nadiad", "Surendranagar", "Bharuch", "Mehsana", "Bhuj",
      "Porbandar", "Palanpur", "Valsad", "Vapi", "Godhra", "Patan", "Veraval", "Gandhidham",
      "Amreli", "Dahod", "Botad",
    ],
    haryana: [
      "Faridabad", "Gurugram", "Panipat", "Ambala", "Yamunanagar", "Rohtak", "Hisar", "Karnal",
      "Sonipat", "Panchkula", "Bhiwani", "Sirsa", "Bahadurgarh", "Jind", "Thanesar", "Kaithal",
      "Rewari", "Palwal", "Kurukshetra", "Jhajjar", "Narnaul", "Fatehabad",
    ],
    "himachal pradesh": [
      "Shimla", "Dharamshala", "Solan", "Mandi", "Kullu", "Manali", "Hamirpur", "Una", "Bilaspur",
      "Chamba", "Nahan", "Palampur", "Kangra", "Baddi", "Sundarnagar", "Keylong", "Reckong Peo",
      "Dalhousie",
    ],
    jharkhand: [
      "Ranchi", "Jamshedpur", "Dhanbad", "Bokaro Steel City", "Deoghar", "Hazaribagh", "Giridih",
      "Ramgarh", "Phusro", "Medininagar", "Chaibasa", "Dumka", "Sahibganj", "Gumla", "Lohardaga",
      "Pakur", "Godda", "Chatra", "Koderma", "Jamtara",
    ],
    karnataka: [
      "Bengaluru", "Mysuru", "Hubballi", "Dharwad", "Mangaluru", "Belagavi", "Kalaburagi",
      "Davanagere", "Ballari", "Vijayapura", "Shivamogga", "Tumakuru", "Raichur", "Bidar", "Hosapete",
      "Udupi", "Hassan", "Chitradurga", "Mandya", "Kolar", "Chikkamagaluru", "Gadag", "Bagalkot",
      "Karwar", "Madikeri", "Chamarajanagar", "Yadgir", "Haveri", "Koppal", "Ramanagara",
      "Chikkaballapur",
    ],
    kerala: [
      "Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Kannur", "Alappuzha",
      "Palakkad", "Malappuram", "Kottayam", "Kasaragod", "Pathanamthitta", "Idukki", "Kalpetta",
      "Ernakulam", "Guruvayur", "Munnar", "Varkala", "Thalassery", "Ponnani",
    ],
    "madhya pradesh": [
      "Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna", "Ratlam",
      "Rewa", "Katni", "Singrauli", "Burhanpur", "Khandwa", "Bhind", "Chhindwara", "Guna", "Shivpuri",
      "Vidisha", "Chhatarpur", "Damoh", "Mandsaur", "Khargone", "Neemuch", "Pithampur",
      "Narmadapuram", "Itarsi", "Sehore", "Betul", "Seoni", "Datia", "Morena",
    ],
    maharashtra: [
      "Mumbai", "Pune", "Nagpur", "Thane", "Nashik", "Chhatrapati Sambhajinagar", "Aurangabad",
      "Solapur", "Kolhapur", "Amravati", "Navi Mumbai", "Pimpri Chinchwad", "Kalyan", "Vasai Virar",
      "Nanded", "Sangli", "Jalgaon", "Akola", "Latur", "Dhule", "Ahmednagar", "Chandrapur",
      "Parbhani", "Ichalkaranji", "Jalna", "Bhiwandi", "Panvel", "Satara", "Ratnagiri", "Wardha",
      "Yavatmal", "Beed", "Gondia", "Dharashiv", "Nandurbar", "Palghar", "Alibag", "Sindhudurg",
      "Lonavala", "Mira Bhayandar", "Ulhasnagar",
    ],
    manipur: [
      "Imphal", "Thoubal", "Bishnupur", "Churachandpur", "Ukhrul", "Senapati", "Tamenglong",
      "Chandel", "Kakching", "Jiribam", "Moreh", "Kangpokpi",
    ],
    meghalaya: [
      "Shillong", "Tura", "Jowai", "Nongstoin", "Williamnagar", "Baghmara", "Nongpoh", "Resubelpara",
      "Mairang", "Mawkyrwat", "Khliehriat", "Ampati", "Cherrapunji",
    ],
    mizoram: [
      "Aizawl", "Lunglei", "Champhai", "Serchhip", "Kolasib", "Saiha", "Lawngtlai", "Mamit",
      "Khawzawl", "Saitual", "Hnahthial",
    ],
    nagaland: [
      "Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha", "Zunheboto", "Mon", "Phek", "Kiphire",
      "Longleng", "Peren", "Chumukedima",
    ],
    odisha: [
      "Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri", "Balasore", "Bhadrak",
      "Baripada", "Jharsuguda", "Jeypore", "Bargarh", "Rayagada", "Angul", "Dhenkanal", "Kendrapara",
      "Jajpur", "Koraput", "Paradip", "Balangir", "Keonjhar", "Sundargarh", "Phulbani",
      "Bhawanipatna",
    ],
    punjab: [
      "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Hoshiarpur", "Pathankot",
      "Moga", "Batala", "Abohar", "Malerkotla", "Khanna", "Phagwara", "Muktsar", "Barnala",
      "Firozpur", "Kapurthala", "Rajpura", "Faridkot", "Sangrur", "Fazilka", "Gurdaspur", "Rupnagar",
      "Mansa", "Tarn Taran", "Nawanshahr", "Zirakpur",
    ],
    rajasthan: [
      "Jaipur", "Jodhpur", "Kota", "Bikaner", "Ajmer", "Udaipur", "Bhilwara", "Alwar", "Bharatpur",
      "Sikar", "Pali", "Sri Ganganagar", "Tonk", "Kishangarh", "Beawar", "Hanumangarh", "Churu",
      "Jhunjhunu", "Barmer", "Jaisalmer", "Chittorgarh", "Nagaur", "Banswara", "Dungarpur",
      "Sawai Madhopur", "Bundi", "Dholpur", "Karauli", "Jhalawar", "Baran", "Mount Abu", "Pushkar",
    ],
    sikkim: [
      "Gangtok", "Namchi", "Gyalshing", "Mangan", "Rangpo", "Singtam", "Jorethang", "Ravangla",
      "Pakyong", "Soreng", "Lachung",
    ],
    "tamil nadu": [
      "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Tiruppur",
      "Vellore", "Erode", "Thoothukudi", "Dindigul", "Thanjavur", "Ranipet", "Sivakasi", "Karur",
      "Udhagamandalam", "Hosur", "Nagercoil", "Kanchipuram", "Kumbakonam", "Tiruvannamalai",
      "Pollachi", "Rajapalayam", "Pudukkottai", "Namakkal", "Cuddalore", "Villupuram", "Krishnagiri",
      "Dharmapuri", "Nagapattinam", "Ramanathapuram", "Tambaram", "Avadi", "Kodaikanal",
    ],
    telangana: [
      "Hyderabad", "Secunderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Ramagundam",
      "Mahbubnagar", "Nalgonda", "Adilabad", "Suryapet", "Siddipet", "Miryalaguda", "Jagtial",
      "Mancherial", "Kothagudem", "Sangareddy", "Kamareddy", "Nirmal", "Wanaparthy", "Vikarabad",
      "Medak", "Bhongir",
    ],
    tripura: [
      "Agartala", "Udaipur", "Dharmanagar", "Kailashahar", "Belonia", "Ambassa", "Khowai",
      "Teliamura", "Sabroom", "Sonamura", "Bishalgarh", "Kamalpur",
    ],
    "uttar pradesh": [
      "Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut", "Prayagraj", "Bareilly",
      "Aligarh", "Moradabad", "Saharanpur", "Gorakhpur", "Noida", "Greater Noida", "Firozabad",
      "Jhansi", "Muzaffarnagar", "Mathura", "Vrindavan", "Ayodhya", "Rampur", "Shahjahanpur",
      "Farrukhabad", "Mau", "Hapur", "Etawah", "Mirzapur", "Bulandshahr", "Sambhal", "Amroha",
      "Hardoi", "Fatehpur", "Raebareli", "Orai", "Sitapur", "Bahraich", "Unnao", "Jaunpur",
      "Lakhimpur", "Hathras", "Banda", "Pilibhit", "Barabanki", "Gonda", "Azamgarh", "Ballia",
      "Basti", "Deoria", "Sultanpur", "Etah", "Mainpuri", "Budaun", "Lalitpur",
    ],
    uttarakhand: [
      "Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudrapur", "Kashipur", "Rishikesh", "Nainital",
      "Mussoorie", "Almora", "Pithoragarh", "Kotdwar", "Ramnagar", "Pauri", "New Tehri", "Srinagar",
      "Uttarkashi", "Bageshwar", "Champawat", "Gopeshwar", "Rudraprayag", "Kichha", "Sitarganj",
      "Khatima",
    ],
    "west bengal": [
      "Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman", "Malda", "Baharampur",
      "Habra", "Kharagpur", "Shantipur", "Darjeeling", "Haldia", "Krishnanagar", "Jalpaiguri",
      "Cooch Behar", "Bankura", "Purulia", "Medinipur", "Raiganj", "Balurghat", "Bolpur", "Barasat",
      "Serampore", "Chandannagar", "Kalyani", "Tamluk", "Alipurduar", "Kalimpong", "Bidhannagar",
      "Barrackpore",
    ],

    // ── Union territories ───────────────────────────────────────────────────
    "andaman and nicobar islands": [
      "Port Blair", "Garacharma", "Bambooflat", "Prothrapur", "Diglipur", "Mayabunder", "Rangat",
      "Havelock Island", "Neil Island", "Car Nicobar", "Campbell Bay", "Hut Bay",
    ],
    chandigarh: ["Chandigarh", "Manimajra"],
    "dadra and nagar haveli and daman and diu": [
      "Silvassa", "Daman", "Diu", "Amli", "Naroli", "Khanvel", "Moti Daman", "Nani Daman",
    ],
    delhi: [
      "New Delhi", "Delhi", "Dwarka", "Rohini", "Saket", "Karol Bagh", "Janakpuri", "Laxmi Nagar",
      "Pitampura", "Vasant Kunj", "Mayur Vihar", "Connaught Place", "Shahdara", "Narela",
      "Najafgarh", "Chanakyapuri", "Lajpat Nagar", "Rajouri Garden", "Preet Vihar", "Okhla",
    ],
    "jammu and kashmir": [
      "Srinagar", "Jammu", "Anantnag", "Baramulla", "Sopore", "Kathua", "Udhampur", "Poonch",
      "Rajouri", "Kupwara", "Pulwama", "Budgam", "Ganderbal", "Bandipora", "Kulgam", "Shopian",
      "Doda", "Kishtwar", "Ramban", "Reasi", "Samba", "Gulmarg", "Pahalgam", "Katra",
    ],
    ladakh: ["Leh", "Kargil", "Diskit", "Padum", "Nyoma", "Drass", "Khaltse", "Nubra"],
    lakshadweep: [
      "Kavaratti", "Agatti", "Minicoy", "Amini", "Andrott", "Kalpeni", "Kadmat", "Kiltan", "Chetlat",
      "Bitra",
    ],
    puducherry: [
      "Puducherry", "Karaikal", "Mahe", "Yanam", "Ozhukarai", "Villianur", "Ariyankuppam", "Bahour",
    ],
  },
};

const COUNTRIES = {
  australia: AUSTRALIA,
  india: INDIA,
};

/** Countries offered in the Country dropdown, by `country.name`. */
export const SUPPORTED_COUNTRIES = Object.keys(COUNTRIES);

/**
 * The country assumed by forms that have no Country field (suppliers,
 * surveyors, estates, lots…). Those were built for Australia and still are.
 */
export const DEFAULT_COUNTRY = "australia";

export const normalizeLocationName = (value) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const countryData = (countryName) => COUNTRIES[normalizeLocationName(countryName)];

/** The state names seeded for a supported country, e.g. for the seeder. */
export const getStateNames = (countryName) => Object.keys(countryData(countryName)?.citiesByState || {});

/** "NSW" → "new south wales"; unknown names come back normalised but unchanged. */
export const canonicalStateName = (countryName, stateName) => {
  const key = normalizeLocationName(stateName);
  return countryData(countryName)?.stateAliases?.[key] || key;
};

/** False only for a country that restricts cities to its list. */
export const allowsCustomCity = (countryName) => countryData(countryName)?.allowCustomCity ?? true;

/** The cities of one state, or [] when we hold no list for it. */
export const getCityList = (countryName, stateName) =>
  countryData(countryName)?.citiesByState?.[canonicalStateName(countryName, stateName)] || [];

/**
 * Judge a city against its state's list.
 *
 * Returns the city spelled as the list spells it when it matches, the input
 * unchanged when there is no list or the country accepts cities outside it,
 * and `null` when the country restricts cities and this one is not listed.
 */
export const resolveCityName = (countryName, stateName, city) => {
  const cities = getCityList(countryName, stateName);
  const wanted = normalizeLocationName(city);
  const match = cities.find((name) => normalizeLocationName(name) === wanted);

  if (match) {
    return match;
  }
  if (cities.length === 0 || allowsCustomCity(countryName)) {
    return city;
  }
  return null;
};

/** ISO code of the country ("AU", "IN") — what `timezones.country_code` holds — or null. */
export const getCountryCode = (countryName) => countryData(countryName)?.countryCode ?? null;

/**
 * Why `phone` is not a valid Indian phone number, or null when it is (or is empty).
 *
 * India's numbering plan (TRAI): every number is 10 digits — mobiles start 6–9,
 * landlines are an STD code (2–4 digits) plus the subscriber number. People
 * write them with a trunk 0 in front (079 2658 1234, 098765 43210) or the
 * country code (+91 98765 43210), and toll-free numbers are 1800 + 7 digits.
 * Spaces, dashes and brackets are allowed as separators.
 *
 * The frontend applies the same rule (lib/utils/phone.ts).
 */
export const indianPhoneProblem = (phone) => {
  const raw = String(phone ?? "").trim();
  if (!raw) {
    return null;
  }
  if (!/^\+?[\d\s()-]+$/.test(raw)) {
    return "Phone numbers can contain only digits, spaces, dashes, brackets and a leading +.";
  }

  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    if (!digits.startsWith("91")) {
      return "An Indian phone number written with + must start with +91.";
    }
    digits = digits.slice(2);
  } else if (/^1800\d{7}$/.test(digits)) {
    return null;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) {
    return `Indian phone numbers have 10 digits (e.g. 98765 43210), not ${digits.length}.`;
  }
  if (digits.startsWith("0")) {
    return "An Indian phone number is 10 digits not starting with 0 (e.g. 98765 43210), optionally after a 0 or +91.";
  }
  return null;
};

/**
 * Why a number written "+61 …" is not a valid Australian number, or null: after
 * +61 comes the 9-digit national number without its trunk 0, starting 2, 3, 4,
 * 7 or 8 (the lead / contact validation's Australian rule).
 */
const australianPhoneProblem = (phone) => {
  const national = String(phone).replace(/^\s*\+61/, "").replace(/\D/g, "");
  if (national.length !== 9) {
    return `Australian phone numbers have 9 digits after +61 (e.g. 412 345 678), not ${national.length}.`;
  }
  return /^[2-57-8]/.test(national)
    ? null
    : "An Australian phone number after +61 starts with 2, 3, 4, 7 or 8 (e.g. 412 345 678).";
};

/**
 * Why `phone` is not valid, or null.
 *
 * The phone fields save the number with its dial code ("+91 9876543210"), and a
 * number is judged by that code — an Indian supplier may well have an
 * Australian mobile. A number saved before the dial-code picker carries none:
 * for an Indian address it is judged by India's rule, otherwise it keeps the
 * rules its form already had. Mirrored in the frontend's lib/utils/phone.ts.
 */
export const phoneProblem = (countryName, phone) => {
  const value = String(phone ?? "").trim();
  if (value.startsWith("+91")) {
    return indianPhoneProblem(value);
  }
  if (value.startsWith("+61")) {
    return australianPhoneProblem(value);
  }
  return getCountryCode(countryName) === "IN" ? indianPhoneProblem(value) : null;
};

/** How many digits a postcode has in this country, or null when we do not know. */
export const getPostcodeLength = (countryName) => countryData(countryName)?.postcodeLength ?? null;

/** What the country calls it: "postcode" (Australia), "PIN code" (India). */
export const getPostcodeLabel = (countryName) => countryData(countryName)?.postcodeLabel || "postcode";

/**
 * The shape every postcode shares — digits only — for request validation.
 *
 * Deliberately no length: the request cannot tell which country the address is
 * in, so a length check here could only say "4 or 6", which is the wrong message
 * for someone who picked India. The exact rule for the address's own country and
 * state ("India PIN codes are exactly 6 digits", "325001 is a Rajasthan PIN code,
 * not Gujarat") is enforced at save time by `locationGuard`.
 */
export const SUPPORTED_POSTCODE_PATTERN = /^\d{1,10}$/;

export const SUPPORTED_POSTCODE_MESSAGE = "Zip / Postal code must contain digits only.";

/**
 * The ranges of a postcode's first three digits allowed for one state, or []
 * when we hold none (every Australian state, for now).
 */
export const getPostcodeRanges = (countryName, stateName) =>
  countryData(countryName)?.postcodeRangesByState?.[canonicalStateName(countryName, stateName)] || [];

const titleCase = (value) => String(value || "").replace(/\b\w/g, (c) => c.toUpperCase());

const describeRanges = (ranges) =>
  ranges.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join(", ");

/**
 * Why `postcode` is not valid for this country (and state), or null when it is.
 *
 * Checked in order, so the message names the first thing to fix:
 *   1. digits only;
 *   2. the country's length (Australia 4, India 6);
 *   3. India: not starting with 0 — no PIN zone is numbered 0;
 *   4. the first three digits within the state's ranges (India). The message
 *      names the state the postcode does belong to.
 *
 * The frontend applies the same rules (lib/utils/postcode.ts) from the same
 * data, served with the countries and states.
 */
export const postcodeProblem = (countryName, stateName, postcode) => {
  const value = String(postcode ?? "").trim();
  const data = countryData(countryName);
  const label = data?.postcodeLabel || "postcode";

  if (!/^\d+$/.test(value)) {
    return `The ${label} must contain digits only.`;
  }
  if (!data?.postcodeLength) {
    return null;
  }
  if (value.length !== data.postcodeLength) {
    return `${titleCase(countryName)} ${label}s are exactly ${data.postcodeLength} digits.`;
  }
  if (data.postcodeRangesByState && value.startsWith("0")) {
    return `${titleCase(countryName)} ${label}s cannot start with 0.`;
  }

  const ranges = stateName ? getPostcodeRanges(countryName, stateName) : [];
  const prefix = Number(value.slice(0, 3));
  const inRanges = (list) => list.some(([from, to]) => prefix >= from && prefix <= to);

  if (ranges.length > 0 && !inRanges(ranges)) {
    const state = titleCase(canonicalStateName(countryName, stateName));
    const owners = Object.entries(data.postcodeRangesByState || {})
      .filter(([, list]) => inRanges(list))
      .map(([name]) => titleCase(name));
    return `${wrongStateReason(value, label, state, owners)} ${state} ${label}s start with ${describeRanges(ranges)}.`;
  }
  return null;
};

/**
 * The first half of the wrong-state message: where this postcode really belongs, so the
 * user sees whether the postcode or the state is the one to fix.
 */
const wrongStateReason = (value, label, state, owners) => {
  if (owners.length > 0) {
    // Several owners where one circle serves several states (Punjab / Chandigarh…).
    return `${value} is a ${owners.join(" / ")} ${label}, not ${state}.`;
  }
  if (value.startsWith("9")) {
    return `${value} is an Army Postal Service ${label}, not ${state}.`;
  }
  return `${value} does not belong to any state, so it is not a ${state} ${label}.`;
};

export default {
  SUPPORTED_COUNTRIES,
  DEFAULT_COUNTRY,
  SUPPORTED_POSTCODE_PATTERN,
  normalizeLocationName,
  getStateNames,
  canonicalStateName,
  allowsCustomCity,
  getCityList,
  resolveCityName,
  getPostcodeLength,
  getPostcodeRanges,
  postcodeProblem,
};
