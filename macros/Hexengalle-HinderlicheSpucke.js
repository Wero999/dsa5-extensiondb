// Schema type: itemTransformationMacro
// Parameters injected by the system:
//   args    {ItemTransformationArgs} - Caller-provided arguments (includes args.result).
//   source  {Itemdsa5} - The source item that owns the transformation.
//   effect  {DSAActiveEffect} - The ActiveEffect that triggered the transformation.
//   this    {DSA5_Utility} - Static utility class context.

// This is a system macro used for automation. It is disfunctional without the proper context.

const lang = game.i18n.lang == "de" ? "de" : "en";
const dict = {
  de: {
    extensionLabel: "Zaubererweiterung",
    effectName: "Hinderliche Spucke",
  },
  en: {
    extensionLabel: "Spell Extension",
    effectName: "Hindering Spit",
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

const spitScript = `
{
  const effectName = "${dict.effectName}";
  if (actor.effects.some((entry) => entry.name === effectName)) return;
  const helper = new game.dsa5.apps.OnUseEffect(source);
  const condition = helper.effectDummy(effectName, [
    { key: "system.rangeStats.attack", type: "add", value: -1 },
    { key: "system.status.dodge.gearmodifier", type: "add", value: -1 },
    { key: "system.meleeStats.attack", type: "add", value: -1 },
    { key: "system.meleeStats.parry", type: "add", value: -1 },
    { key: "system.skillModifiers.global", type: "custom", value: -1 }
  ], {});
  foundry.utils.mergeObject(condition, {
    img: "icons/svg/aura.svg",
    system: {
      description: effectName,
      visibility: {
        hideOnToken: false,
        hidePlayers: false,
      },
    },
  });
  await helper.socketedConditionAddActor([actor], condition);
}
`;

const macroEffect = source.effects.find((entry) => getMacroCommand(entry));

if (macroEffect) {
  const copy = foundry.utils.duplicate(macroEffect);
  source.effects = source.effects.filter((entry) => entry._id != copy._id);
  setMacroCommand(copy, `${spitScript}\n${getMacroCommand(copy)}`);
  source.effects.push(copy);
} else {
  source.effects.push({
    _id: foundry.utils.randomID(),
    name: `${dict.extensionLabel} (${dict.effectName})`,
    img: "icons/svg/aura.svg",
    transfer: false,
    system: {
      advancedFunction: 2,
      macroArgs: { macro: spitScript },
      changes: [],
    },
  });
}
