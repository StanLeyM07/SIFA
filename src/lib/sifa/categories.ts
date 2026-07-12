// Simple keyword -> category suggestion, kept parallel with the spreadsheet tier.
const RULES: Array<[RegExp, string]> = [
  [/woolworths|checkers|spar|pick\s?n\s?pay|shoprite|food\s?lovers/i, "Groceries"],
  [/uber|bolt|engen|shell|sasol|caltex|taxify|petrol|fuel/i, "Transport"],
  [/netflix|showmax|spotify|apple\s?music|dstv|youtube\s?premium|disney/i, "Subscriptions"],
  [/rent|landlord|bond/i, "Rent"],
  [/eskom|city\s?power|water|municipal|vodacom|mtn|telkom|rain|afrihost/i, "Utilities"],
  [/nandos|kfc|mcdonald|steers|mugg|starbucks|restaurant|cafe|coffee/i, "Eating out"],
  [/dischem|clicks|pharmacy|doctor|hospital/i, "Health"],
  [/takealot|amazon|superbalist|zando|shein/i, "Shopping"],
  [/salary|payroll|wages/i, "Salary"],
  [/invoice|freelance|contract/i, "Freelance"],
  [/movie|cinema|nu\s?metro|showtime|game|steam|playstation/i, "Entertainment"],
];

export function suggestCategory(description: string): string | null {
  const d = description.trim();
  if (!d) return null;
  for (const [re, cat] of RULES) if (re.test(d)) return cat;
  return null;
}
