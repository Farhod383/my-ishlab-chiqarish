// Uzbek Latin ↔ Cyrillic + Russian-friendly transliteration.
// Stored values are never mutated; we only render through these helpers.

const LAT_TO_CYR: [RegExp, string][] = [
  [/o['ʼ`]/g, "ў"], [/O['ʼ`]/g, "Ў"],
  [/g['ʼ`]/g, "ғ"], [/G['ʼ`]/g, "Ғ"],
  [/sh/g, "ш"], [/Sh/g, "Ш"], [/SH/g, "Ш"],
  [/ch/g, "ч"], [/Ch/g, "Ч"], [/CH/g, "Ч"],
  [/yo/g, "ё"], [/Yo/g, "Ё"], [/YO/g, "Ё"],
  [/yu/g, "ю"], [/Yu/g, "Ю"], [/YU/g, "Ю"],
  [/ya/g, "я"], [/Ya/g, "Я"], [/YA/g, "Я"],
  [/ts/g, "ц"], [/Ts/g, "Ц"],
  [/'/g, "ъ"],
];

const SINGLE_LAT_CYR: Record<string, string> = {
  a:"а",b:"б",d:"д",e:"е",f:"ф",g:"г",h:"ҳ",i:"и",j:"ж",k:"к",l:"л",m:"м",
  n:"н",o:"о",p:"п",q:"қ",r:"р",s:"с",t:"т",u:"у",v:"в",x:"х",y:"й",z:"з",
  A:"А",B:"Б",D:"Д",E:"Е",F:"Ф",G:"Г",H:"Ҳ",I:"И",J:"Ж",K:"К",L:"Л",M:"М",
  N:"Н",O:"О",P:"П",Q:"Қ",R:"Р",S:"С",T:"Т",U:"У",V:"В",X:"Х",Y:"Й",Z:"З",
};

export function latinToCyrillic(s: string): string {
  if (!s) return s;
  let out = s;
  for (const [re, rep] of LAT_TO_CYR) out = out.replace(re, rep);
  return out.split("").map(c => SINGLE_LAT_CYR[c] ?? c).join("");
}

const CYR_TO_LAT: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",ғ:"g'",д:"d",е:"e",ё:"yo",ж:"j",з:"z",и:"i",й:"y",
  к:"k",қ:"q",л:"l",м:"m",н:"n",о:"o",ў:"o'",п:"p",р:"r",с:"s",т:"t",у:"u",
  ф:"f",х:"x",ҳ:"h",ц:"ts",ч:"ch",ш:"sh",ъ:"'",ы:"i",э:"e",ю:"yu",я:"ya",ь:"",
  А:"A",Б:"B",В:"V",Г:"G",Ғ:"G'",Д:"D",Е:"E",Ё:"Yo",Ж:"J",З:"Z",И:"I",Й:"Y",
  К:"K",Қ:"Q",Л:"L",М:"M",Н:"N",О:"O",Ў:"O'",П:"P",Р:"R",С:"S",Т:"T",У:"U",
  Ф:"F",Х:"X",Ҳ:"H",Ц:"Ts",Ч:"Ch",Ш:"Sh",Ъ:"'",Ы:"I",Э:"E",Ю:"Yu",Я:"Ya",Ь:"",
};

export function cyrillicToLatin(s: string): string {
  if (!s) return s;
  return s.split("").map(c => CYR_TO_LAT[c] ?? c).join("");
}

const isCyr = (s: string) => /[А-Яа-яЁёҲҳҚқҒғЎў]/.test(s);
const isLat = (s: string) => /[A-Za-z]/.test(s);

/** Render a stored name in the target locale. Accepts 'uz' (latin), 'uzc'/'uz-cyrl', 'ru'. */
export function localizeName(name: string, lang: string): string {
  if (!name) return name;
  if (lang === "uzc" || lang === "uz-cyrl" || lang === "ru") {
    return isCyr(name) ? name : latinToCyrillic(name);
  }
  return isLat(name) ? name : cyrillicToLatin(name);
}

/** Normalize text to latin lowercase for cross-script search matching. */
export function searchNorm(s: string): string {
  if (!s) return "";
  const lat = isCyr(s) ? cyrillicToLatin(s) : s;
  return lat.toLowerCase().replace(/[''`ʼ]/g, "");
}

/** True if needle matches haystack across uz-latin / uz-cyrillic / russian writing. */
export function matchesAcrossScripts(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return searchNorm(haystack).includes(searchNorm(needle));
}
