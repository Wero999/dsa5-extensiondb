// Schema type: onUseEffect
// Parameters injected by the system:
//   args   {OnUseEffectExecutionArgs} - Execution metadata for this activation.
//   item   {Itemdsa5} - The item that was used.
//   actor  {Actordsa5} - The actor who used the item.
//   this   {OnUseEffect} - Helper instance (socketedConditionAdd, effectDummy, createChatMessage, ...).


const lang = game.i18n.lang == "de" ? "de" : "en"
const dict = {
  de: {
    noActor: "Kein gueltiger Akteur gefunden.",
    noKap: (name) => { return `${name} verfügt nicht über Karmaenergie.` },
    notEnoughKap: (name) => { return `${name} hat nicht genügend Karmaenergie.` },
    onlySingleTarget: "Bitte genau ein Ziel anvisieren.",
    targetNoActor: "Das Ziel ist kein Akteur.",
    healMessage: (user, target) => { return `<p>${user} wendet einen kleinen Heilsegen auf ${target} an.</p>` }
  },
  en: {
    noActor: "No valid actor found.",
    noKap: (name) => { return `${name} does not have karma energy.` },
    notEnoughKap: (name) => { return `${name} does not have enough karma energy.` },
    onlySingleTarget: "Please target exactly one target.",
    targetNoActor: "The target is not an actor.",
    healMessage: (user, target) => { return `<p>${user} casts a small healing blessing on ${target}.</p>` }
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

// 2) 1 KaP (Karmaenergie) abziehen
const kapObject = foundry.utils.getProperty(userActor, "system.status.karmaenergy");
if (!kapObject.max) {
  ui.notifications.warn(dict.noKap(userActor.name));
  return;
}
if (kapObject.value < 1) {
  ui.notifications.warn(dict.notEnoughKap(userActor.name));
  return;
}

// 3) Ziel prüfen und heilen
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

// Heilung anwenden
await userActor.applyMana(1, 'KaP');
const newWounds = Math.min(targetActor.system.status.wounds.value + 1, targetActor.system.status.wounds.max);
await this.socketedActorTransformation([target.id], { "system.status.wounds.value": newWounds });

// Heilungsnachricht
await sendMessage(dict.healMessage(userActor.name, target.name));
