// Schema type: itemTransformationMacro
// This is a system macro used for automation. It is disfunctional without the proper context.

const lang = game.i18n.lang == "de" ? "de" : "en";
const dict = {
  de: {
    extensionLabel: "Zaubererweiterung",
    effectName: "Nachwirkung",
    chatMsg: "{name} erleidet {damage} Schaden durch Nachwirkung.",
  },
  en: {
    extensionLabel: "Spell Extension",
    effectName: "Aftereffect",
    chatMsg: "{name} suffers {damage} damage from Aftereffect.",
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

const afterEffectScript = `
{
  const effectName = "${dict.effectName}";
  if (actor.effects.some((entry) => entry.name === effectName)) return;
  const helper = new game.dsa5.apps.OnUseEffect(source);
  const dmgVal = "1d3 + " + Math.ceil(qs / 2);
  const removeScript = "const damageRoll = await new Roll('" + dmgVal + "').roll(); await actor.applyDamage(damageRoll.total); const msg = '${dict.chatMsg}'.replace('{name}', actor.name).replace('{damage}', damageRoll.total); await ChatMessage.create(game.dsa5.apps.DSA5_Utility.chatDataSetup('<p>' + msg + '</p>'));";
  const condition = helper.effectDummy(effectName, [], { value: 5, units: "seconds" });
  foundry.utils.mergeObject(condition, {
    img: "icons/svg/aura.svg",
    system: {
      description: effectName,
      visibility: { hideOnToken: false, hidePlayers: false },
      macroArgs: { onRemove: removeScript },
    },
  });
  await helper.socketedConditionAddActor([actor], condition);
}
`;

const macroEffect = source.effects.find((entry) => getMacroCommand(entry));

if (macroEffect) {
  const copy = foundry.utils.duplicate(macroEffect);
  source.effects = source.effects.filter((entry) => entry._id != copy._id);
  setMacroCommand(copy, `${afterEffectScript}\n${getMacroCommand(copy)}`);
  source.effects.push(copy);
} else {
  source.effects.push({
    _id: foundry.utils.randomID(),
    name: `${dict.extensionLabel} (${dict.effectName})`,
    img: "icons/svg/aura.svg",
    transfer: false,
    system: {
      advancedFunction: 2,
      macroArgs: { macro: afterEffectScript },
      changes: [],
    },
  });
}
