// Schema type: itemTransformationMacro
// This is a system macro used for automation. It is disfunctional without the proper context.

const lang = game.i18n.lang == "de" ? "de" : "en";
const dict = {
  de: {
    name: "Angriffslust",
  },
  en: {
    name: "Aggression",
  },
}[lang];

const origEffect = source.effects.find((x) => x.name == dict.name);
if (!origEffect) return;

const copy = foundry.utils.duplicate(origEffect);
source.effects = source.effects.filter((x) => x.name != dict.name);
copy.system ??= {};
copy.system.changes = [
  { key: "system.meleeStats.damage", type: "add", value: "+2" },
  { key: "system.meleeStats.attack", type: "add", value: 3 },
  { key: "system.rangeStats.damage", type: "add", value: "+2" },
  { key: "system.rangeStats.attack", type: "add", value: 3 },
];
source.effects.push(copy);
