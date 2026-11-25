// Summa so'z bilan (rus tilida): 186480000.30 → «Сто восемьдесят шесть миллионов четыреста восемьдесят тысяч сум 30 тийин»
const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
const SCALES: [string, string, string, boolean][] = [
  ["", "", "", false],
  ["тысяча", "тысячи", "тысяч", true],
  ["миллион", "миллиона", "миллионов", false],
  ["миллиард", "миллиарда", "миллиардов", false],
];

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 19) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

function triad(n: number, female: boolean): string[] {
  const out: string[] = [];
  out.push(HUNDREDS[Math.floor(n / 100)]);
  const t = n % 100;
  if (t >= 10 && t < 20) out.push(TEENS[t - 10]);
  else { out.push(TENS[Math.floor(t / 10)]); out.push((female ? ONES_F : ONES_M)[t % 10]); }
  return out.filter(Boolean);
}

export function numberToWordsRu(n: number): string {
  if (n === 0) return "ноль";
  const parts: string[] = [];
  let i = 0;
  while (n > 0) {
    const t = n % 1000;
    if (t) {
      const [one, few, many, female] = SCALES[i];
      const words = triad(t, female);
      if (i > 0) words.push(plural(t, one, few, many));
      parts.unshift(words.join(" "));
    }
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(" ");
}

export function sumInWordsUz(amount: number): string {
  const whole = Math.floor(Math.round(amount * 100) / 100);
  const tiyin = Math.round((amount - whole) * 100);
  const w = numberToWordsRu(whole);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} сум ${String(tiyin).padStart(2, "0")} тийин`;
}
