import type { CATEGORIES } from "../types";

type Category = (typeof CATEGORIES)[number];

export interface MerchantRule {
  /** Canonical merchant name, shown in the UI when explaining a match. */
  merchant: string;
  /** Normalised aliases. Must already be uppercase, alphabetic + "&" only. */
  aliases: string[];
  category: Category;
}

/**
 * South African merchant dictionary.
 *
 * Deliberately data rather than regex: it stays readable, it is cheap to
 * extend from real statements, and it exports directly as labelled training
 * data if we later train a classifier on description -> category.
 *
 * Aliases are matched as consecutive token runs against a normalised
 * description, longest first, so "PICK N PAY" wins over a bare "PAY".
 */
export const MERCHANT_RULES: MerchantRule[] = [
  // ── Groceries ─────────────────────────────────────────────
  { merchant: "Woolworths", aliases: ["WOOLWORTHS", "WOOLIES", "WOOLWTHS", "WW FOOD"], category: "Groceries" },
  { merchant: "Checkers", aliases: ["CHECKERS", "CHECKERS HYPER", "CHECKERS SIXTY", "SIXTY"], category: "Groceries" },
  { merchant: "Pick n Pay", aliases: ["PICK N PAY", "PICKNPAY", "PNP", "PNP CRN", "PNP EXPRESS"], category: "Groceries" },
  { merchant: "Shoprite", aliases: ["SHOPRITE"], category: "Groceries" },
  { merchant: "SPAR", aliases: ["SPAR", "SUPERSPAR", "KWIKSPAR"], category: "Groceries" },
  { merchant: "Food Lover's Market", aliases: ["FOOD LOVERS", "FOOD LOVERS MARKET", "FRUIT & VEG"], category: "Groceries" },
  { merchant: "Makro", aliases: ["MAKRO"], category: "Groceries" },
  { merchant: "Boxer", aliases: ["BOXER"], category: "Groceries" },
  { merchant: "OK Foods", aliases: ["OK FOODS", "OK GROCER"], category: "Groceries" },
  { merchant: "USave", aliases: ["USAVE"], category: "Groceries" },

  // ── Transport ─────────────────────────────────────────────
  { merchant: "Engen", aliases: ["ENGEN"], category: "Transport" },
  { merchant: "Shell", aliases: ["SHELL"], category: "Transport" },
  { merchant: "Sasol", aliases: ["SASOL"], category: "Transport" },
  { merchant: "BP", aliases: ["BP", "BP EXPRESS"], category: "Transport" },
  { merchant: "Total", aliases: ["TOTAL ENERGIES", "TOTALENERGIES"], category: "Transport" },
  { merchant: "Caltex", aliases: ["CALTEX", "ASTRON"], category: "Transport" },
  { merchant: "Uber", aliases: ["UBER", "UBER TRIP"], category: "Transport" },
  { merchant: "Bolt", aliases: ["BOLT", "BOLT REQUEST"], category: "Transport" },
  { merchant: "Gautrain", aliases: ["GAUTRAIN"], category: "Transport" },
  { merchant: "e-Toll / SANRAL", aliases: ["SANRAL", "ETOLL", "E TOLL"], category: "Transport" },
  { merchant: "Parking", aliases: ["PARKING", "PARKADE"], category: "Transport" },

  // ── Utilities ─────────────────────────────────────────────
  { merchant: "Eskom", aliases: ["ESKOM", "PREPAID ELECTRICITY", "ELECTRICITY"], category: "Utilities" },
  { merchant: "City Power", aliases: ["CITY POWER"], category: "Utilities" },
  { merchant: "Municipality", aliases: ["CITY OF JOBURG", "CITY OF CAPE TOWN", "CITY OF TSHWANE", "ETHEKWINI", "MUNICIPAL", "MUNICIPALITY", "JOBURG WATER", "RAND WATER"], category: "Utilities" },
  { merchant: "Vodacom", aliases: ["VODACOM"], category: "Utilities" },
  { merchant: "MTN", aliases: ["MTN"], category: "Utilities" },
  { merchant: "Telkom", aliases: ["TELKOM"], category: "Utilities" },
  { merchant: "Cell C", aliases: ["CELL C", "CELLC"], category: "Utilities" },
  { merchant: "Rain", aliases: ["RAIN NETWORKS", "RAIN MOBILE"], category: "Utilities" },
  { merchant: "Afrihost", aliases: ["AFRIHOST"], category: "Utilities" },
  { merchant: "Vumatel", aliases: ["VUMATEL", "VUMA"], category: "Utilities" },
  { merchant: "Webafrica", aliases: ["WEBAFRICA", "WEB AFRICA"], category: "Utilities" },
  { merchant: "MWEB", aliases: ["MWEB"], category: "Utilities" },
  { merchant: "Openserve", aliases: ["OPENSERVE"], category: "Utilities" },

  // ── Subscriptions ─────────────────────────────────────────
  { merchant: "DStv", aliases: ["DSTV", "MULTICHOICE"], category: "Subscriptions" },
  { merchant: "Showmax", aliases: ["SHOWMAX"], category: "Subscriptions" },
  { merchant: "Netflix", aliases: ["NETFLIX"], category: "Subscriptions" },
  { merchant: "Spotify", aliases: ["SPOTIFY"], category: "Subscriptions" },
  { merchant: "Apple", aliases: ["APPLE COM", "ITUNES", "APPLE MUSIC"], category: "Subscriptions" },
  { merchant: "Google", aliases: ["GOOGLE", "GOOGLE STORAGE", "YOUTUBE PREMIUM"], category: "Subscriptions" },
  { merchant: "Disney+", aliases: ["DISNEY", "DISNEY PLUS"], category: "Subscriptions" },
  { merchant: "Amazon Prime", aliases: ["AMAZON PRIME", "PRIME VIDEO"], category: "Subscriptions" },
  { merchant: "Microsoft", aliases: ["MICROSOFT", "MSFT", "OFFICE"], category: "Subscriptions" },
  { merchant: "Adobe", aliases: ["ADOBE"], category: "Subscriptions" },
  { merchant: "Canva", aliases: ["CANVA"], category: "Subscriptions" },

  // ── Eating out ────────────────────────────────────────────
  { merchant: "Nando's", aliases: ["NANDOS", "NANDO S"], category: "Eating out" },
  { merchant: "KFC", aliases: ["KFC"], category: "Eating out" },
  { merchant: "McDonald's", aliases: ["MCDONALDS", "MCD"], category: "Eating out" },
  { merchant: "Steers", aliases: ["STEERS"], category: "Eating out" },
  { merchant: "Wimpy", aliases: ["WIMPY"], category: "Eating out" },
  { merchant: "Spur", aliases: ["SPUR"], category: "Eating out" },
  { merchant: "Debonairs", aliases: ["DEBONAIRS"], category: "Eating out" },
  { merchant: "Roman's Pizza", aliases: ["ROMANS PIZZA", "ROMANS"], category: "Eating out" },
  { merchant: "Mugg & Bean", aliases: ["MUGG & BEAN", "MUGG BEAN"], category: "Eating out" },
  { merchant: "Vida e Caffè", aliases: ["VIDA E CAFFE", "VIDA"], category: "Eating out" },
  { merchant: "Seattle Coffee", aliases: ["SEATTLE COFFEE"], category: "Eating out" },
  { merchant: "Starbucks", aliases: ["STARBUCKS"], category: "Eating out" },
  { merchant: "Kauai", aliases: ["KAUAI"], category: "Eating out" },
  { merchant: "Ocean Basket", aliases: ["OCEAN BASKET"], category: "Eating out" },
  { merchant: "RocoMamas", aliases: ["ROCOMAMAS"], category: "Eating out" },
  { merchant: "Burger King", aliases: ["BURGER KING"], category: "Eating out" },
  { merchant: "Chicken Licken", aliases: ["CHICKEN LICKEN"], category: "Eating out" },
  { merchant: "Simply Asia", aliases: ["SIMPLY ASIA"], category: "Eating out" },
  { merchant: "Uber Eats", aliases: ["UBER EATS", "UBEREATS"], category: "Eating out" },
  { merchant: "Mr D Food", aliases: ["MR D", "MR D FOOD"], category: "Eating out" },
  { merchant: "Bootlegger", aliases: ["BOOTLEGGER"], category: "Eating out" },

  // ── Health ────────────────────────────────────────────────
  { merchant: "Dis-Chem", aliases: ["DISCHEM", "DIS CHEM"], category: "Health" },
  { merchant: "Clicks", aliases: ["CLICKS"], category: "Health" },
  { merchant: "Discovery Health", aliases: ["DISCOVERY HEALTH", "DISCOVERY"], category: "Health" },
  { merchant: "Momentum Health", aliases: ["MOMENTUM HEALTH"], category: "Health" },
  { merchant: "Bonitas", aliases: ["BONITAS"], category: "Health" },
  { merchant: "Medshield", aliases: ["MEDSHIELD"], category: "Health" },
  { merchant: "Netcare", aliases: ["NETCARE"], category: "Health" },
  { merchant: "Mediclinic", aliases: ["MEDICLINIC"], category: "Health" },
  { merchant: "Life Healthcare", aliases: ["LIFE HEALTHCARE"], category: "Health" },
  { merchant: "Pharmacy", aliases: ["PHARMACY", "APTEEK"], category: "Health" },
  { merchant: "Medical practice", aliases: ["DR ", "DENTIST", "OPTOMETRIST", "HOSPITAL"], category: "Health" },

  // ── Shopping ──────────────────────────────────────────────
  { merchant: "Takealot", aliases: ["TAKEALOT"], category: "Shopping" },
  { merchant: "Superbalist", aliases: ["SUPERBALIST"], category: "Shopping" },
  { merchant: "Zando", aliases: ["ZANDO"], category: "Shopping" },
  { merchant: "Mr Price", aliases: ["MR PRICE", "MRP", "MRPRICE"], category: "Shopping" },
  { merchant: "Truworths", aliases: ["TRUWORTHS"], category: "Shopping" },
  { merchant: "Foschini", aliases: ["FOSCHINI", "TFG"], category: "Shopping" },
  { merchant: "Ackermans", aliases: ["ACKERMANS"], category: "Shopping" },
  { merchant: "PEP", aliases: ["PEP STORES", "PEP"], category: "Shopping" },
  { merchant: "Sportscene", aliases: ["SPORTSCENE", "TOTALSPORTS"], category: "Shopping" },
  { merchant: "Cape Union Mart", aliases: ["CAPE UNION MART"], category: "Shopping" },
  { merchant: "Builders Warehouse", aliases: ["BUILDERS WAREHOUSE", "BUILDERS"], category: "Shopping" },
  { merchant: "Leroy Merlin", aliases: ["LEROY MERLIN"], category: "Shopping" },
  { merchant: "Game", aliases: ["GAME STORES", "GAME"], category: "Shopping" },
  { merchant: "Incredible Connection", aliases: ["INCREDIBLE CONNECTION"], category: "Shopping" },
  { merchant: "Shein", aliases: ["SHEIN"], category: "Shopping" },
  { merchant: "Temu", aliases: ["TEMU"], category: "Shopping" },
  { merchant: "Amazon", aliases: ["AMAZON"], category: "Shopping" },

  // ── Entertainment ─────────────────────────────────────────
  { merchant: "Ster-Kinekor", aliases: ["STER KINEKOR", "STERKINEKOR"], category: "Entertainment" },
  { merchant: "Nu Metro", aliases: ["NU METRO", "NUMETRO"], category: "Entertainment" },
  { merchant: "Computicket", aliases: ["COMPUTICKET"], category: "Entertainment" },
  { merchant: "Steam", aliases: ["STEAM GAMES", "STEAMPOWERED"], category: "Entertainment" },
  { merchant: "PlayStation", aliases: ["PLAYSTATION", "SONY INTERACTIVE"], category: "Entertainment" },
  { merchant: "Xbox", aliases: ["XBOX"], category: "Entertainment" },
  { merchant: "Nintendo", aliases: ["NINTENDO"], category: "Entertainment" },
  { merchant: "Betway", aliases: ["BETWAY"], category: "Entertainment" },
  { merchant: "Hollywoodbets", aliases: ["HOLLYWOODBETS"], category: "Entertainment" },
  { merchant: "Sun International", aliases: ["SUN INTERNATIONAL", "SUNBET"], category: "Entertainment" },

  // ── Rent ──────────────────────────────────────────────────
  { merchant: "Rent", aliases: ["RENT", "RENTAL", "LANDLORD", "HUUR"], category: "Rent" },
  { merchant: "Home loan", aliases: ["BOND REPAYMENT", "HOME LOAN", "SA HOME LOANS", "OOBA"], category: "Rent" },
  { merchant: "Levy", aliases: ["LEVY", "BODY CORPORATE", "HOA"], category: "Rent" },

  // ── Income ────────────────────────────────────────────────
  { merchant: "Salary", aliases: ["SALARY", "SALARIES", "PAYROLL", "WAGES", "SLRY"], category: "Salary" },
  { merchant: "Freelance", aliases: ["FREELANCE", "CONSULTING", "INVOICE PAYMENT", "CONTRACT WORK"], category: "Freelance" },

  // ── Bank charges ──────────────────────────────────────────
  // A third of the rows on a real Standard Bank statement. Every one of these
  // used to land in "Other" and get flagged for review, which buried the
  // genuinely unknown merchants in noise.
  { merchant: "Bank fee", aliases: ["FEE", "FEES", "SERVICE FEE", "MONTHLY MANAGEMENT FEE", "MANAGEMENT FEE", "ADMIN FEE", "TRANSACTION FEE", "DECLINE FEE", "UNPAID FEE", "PENALTY FEE", "CARD FEE"], category: "Bank fees" },
  { merchant: "Interest charged", aliases: ["EXCESS INTEREST", "INTEREST CHARGED", "DEBIT INTEREST", "OVERDRAFT INTEREST"], category: "Bank fees" },
  { merchant: "Bank", aliases: ["STANDARD BANK", "STANDARDBANK", "STANDARDB", "ABSA BANK", "NEDBANK", "FNB", "CAPITEC BANK"], category: "Bank fees" },

  // ── Airtime & data ────────────────────────────────────────
  // "VAS" is the value-added-services prefix SA banks use for airtime/data.
  { merchant: "Airtime / data", aliases: ["VAS VODA", "VAS MTN", "VAS CELLC", "VAS TELKOM", "PREPAID AIRTIME", "AIRTIME", "PREPAID MOBILE", "DATA BUNDLE", "PREPAID DATA", "DATA"], category: "Airtime & data" },

  // ── Cash out ──────────────────────────────────────────────
  // Deliberately not treated as movement: the money left the account and gets
  // spent in the world, so counting it as spending is the closest honest
  // approximation available.
  { merchant: "Cash withdrawal", aliases: ["AUTOBANK CASH WITHDRAWAL", "CASH WITHDRAWAL", "ATM WITHDRAWAL", "AUTOBANK"], category: "Cash" },

  // ── Cash in ───────────────────────────────────────────────
  // Listed before the withdrawal rule matters little (longest alias wins),
  // but kept separate because money arriving is not money leaving.
  { merchant: "Deposit", aliases: ["CASH DEPOSIT", "DEPOSIT", "CASH DEP", "ATM CASH DEPOSIT", "CASH ACCEPTED"], category: "Deposits" },

  // ── Transfers ─────────────────────────────────────────────
  // Money moving between accounts or people — real, but not "spending".
  { merchant: "Transfer", aliases: ["IB TRANSFER", "IB PAYMENT", "CAPITEC", "CREDIT TRANSFER", "IMMEDIATE TRANSFER", "INTERNAL TRANSFER", "PAYSHAP", "PAYSHAP PAYMENT", "INSTANT MONEY", "EWALLET", "E WALLET"], category: "Transfers" },

  // ── Local merchants seen on real SA statements ────────────
  { merchant: "Yoco (card machine)", aliases: ["YOCO"], category: "Shopping" },
  { merchant: "SnapScan", aliases: ["SNAPSCAN"], category: "Shopping" },
  { merchant: "Zapper", aliases: ["ZAPPER"], category: "Shopping" },
  { merchant: "Markham", aliases: ["MARKHAM"], category: "Shopping" },
  { merchant: "Exact", aliases: ["EXACT"], category: "Shopping" },
  { merchant: "Identity", aliases: ["IDENTITY"], category: "Shopping" },
  { merchant: "Butchery", aliases: ["BUTCHERY", "CHOICE BUTCHERY", "BUTCHER"], category: "Groceries" },
  { merchant: "Chickenhub", aliases: ["CHICKENHUB"], category: "Eating out" },
  { merchant: "OpenAI", aliases: ["OPENAI"], category: "Subscriptions" },
];

/** Alias index, pre-tokenised and sorted longest-first so specific beats generic. */
export const ALIAS_INDEX: Array<{
  tokens: string[];
  merchant: string;
  category: Category;
}> = MERCHANT_RULES.flatMap((rule) =>
  rule.aliases.map((alias) => ({
    tokens: alias.trim().split(/\s+/).filter(Boolean),
    merchant: rule.merchant,
    category: rule.category,
  })),
).sort((a, b) => b.tokens.length - a.tokens.length);
