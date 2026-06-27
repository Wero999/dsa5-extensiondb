// Schema type: onUseEffect
// Parameters injected by the system:
//   args   {OnUseEffectExecutionArgs} - Execution metadata for this activation.
//   item   {Itemdsa5} - The item that was used.
//   actor  {Actordsa5} - The actor who used the item.
//   this   {OnUseEffect} - Helper instance (socketedConditionAdd, effectDummy, createChatMessage, ...).
// This is a system macro used for automation.

const lang = game.i18n.lang == "de" ? "de" : "en";

const dict = {
  de: {
    noActor: "Kein gueltiger Akteur gefunden.",
    noKap: (name) => { return `${name} verfügt nicht über Karmaenergie.` },
    notEnoughKap: (name) => { return `${name} hat nicht genügend Karmaenergie.` },
    onlySingleTarget: "Bitte genau ein Ziel anvisieren.",
    targetNoActor: "Das Ziel ist kein Akteur.",
    strengthMessage: (user, target) => { return `<p>${user} spricht einen Stärkungssegen auf ${target}.</p>` },
    effectName: "Stärkungssegen",
    skillName: "Selbstbeherrschung"
  },
  en: {
    noActor: "No valid actor found.",
    noKap: (name) => { return `${name} does not have karma energy.` },
    notEnoughKap: (name) => { return `${name} does not have enough karma energy.` },
    onlySingleTarget: "Please target exactly one target.",
    targetNoActor: "The target is not an actor.",
    strengthMessage: (user, target) => { return `<p>${user} casts a strength blessing on ${target}.</p>` },
    effectName: "Strength Blessing",
    skillName: "Self-Control"
  }
}[lang];

const userActor = actor;

if (!userActor) {
  ui.notifications.warn(dict.noActor);
  return;
}

const sendMessage = async (message) => {
  await ChatMessage.create(game.dsa5.apps.DSA5_Utility.chatDataSetup(message, args?.messageMode));
};

const kapObject = foundry.utils.getProperty(userActor, "system.status.karmaenergy");

if (!kapObject.max) {
  ui.notifications.warn(dict.noKap(userActor.name));
  return;
}
if (kapObject.value < 1) {
  ui.notifications.warn(dict.notEnoughKap(userActor.name));
  return;
}

const targets = Array.from(game.user.targets);

if (targets.length !== 1) {
  ui.notifications.warn(dict.onlySingleTarget);
  return;
}

const target = targets[0];
const targetActor = target.actor;

if (!targetActor) {
  ui.notifications.warn(dict.targetNoActor);
  return;
}

await userActor.applyMana(1, "KaP");

const effectData = this.effectDummy(dict.effectName, [
  {
    key: "system.skillModifiers.postRoll.reroll",
    type: "custom",
    value: `${dict.skillName} 1`,
  },
], { value: 43200, units: "seconds" });

foundry.utils.mergeObject(effectData, {
  system: {
    charges: { max: 1, value: 1 },
  },
});

await targetActor.addCondition(effectData);

await sendMessage(dict.strengthMessage(userActor.name, target.name));
