// Schema type: itemTransformationMacro
// This is a system macro used for automation. It is disfunctional without the proper context.

const lang = game.i18n.lang == "de" ? "de" : "en";
const dict = {
  de: {
    extensionLabel: "Zaubererweiterung",
    effectName: "Brennend",
  },
  en: {
    extensionLabel: "Spell Extension",
    effectName: "Burning",
  },
}[lang];

const getMacroCommand = (entry) =>
  foundry.utils.getProperty(entry, "system.macroArgs.macro")
  ?? foundry.utils.getProperty(entry, "flags.dsa5.args3")
  ?? "";

const setMacroCommand = (entry, command) => {
  entry.system ??= {};
  entry.system.macroArgs ??= {};
  entry.system.advancedFunction = 2;
  entry.system.macroArgs.macro = command;
};

const burnScript = `
{
  const helper = new game.dsa5.apps.OnUseEffect(source);
  await helper.socketedConditionAddActor([actor], "burning");
}
`;

const macroEffect = source.effects.find((entry) => getMacroCommand(entry));

if (macroEffect) {
  const copy = foundry.utils.duplicate(macroEffect);
  source.effects = source.effects.filter((entry) => entry._id != copy._id);
  setMacroCommand(copy, `${burnScript}\n${getMacroCommand(copy)}`);
  source.effects.push(copy);
} else {
  source.effects.push({
    _id: foundry.utils.randomID(),
    name: `${dict.extensionLabel} (${dict.effectName})`,
    img: "icons/svg/fire.svg",
    transfer: false,
    system: {
      advancedFunction: 2,
      macroArgs: { macro: burnScript },
      changes: [],
    },
  });
}
