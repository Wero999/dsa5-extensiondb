// Schema type: onUseEffect
// Parameters injected by the system:
//   args   {OnUseEffectExecutionArgs} - Execution metadata for this activation.
//   item   {Itemdsa5} - The item that was used.
//   actor  {Actordsa5} - The actor who used the item.
//   this   {OnUseEffect} - Helper instance (socketedConditionAdd, effectDummy, createChatMessage, ...).

// Issues:
// - Routes KaP consumption through the Foundry 14 socketed actor transformation helper and updates the generated light effect without setTimeout.


// --- Language switch (de | en) ---
const lang = (game?.i18n?.lang === "en") ? "en" : "de";

// --- Übersetzungs-Dictionary (deutsch/englisch) ---
const dict = {
  de: {
    itemName: "Feuersegen",
    noTokens: (name) => `Der Actor ${name} hat keine aktiven Tokens auf der Szene.`,
    noKap: (name) => `Dein kontrollierter Token (${name}) verfügt nicht über Karmaenergie.`,
    notEnoughKap: (name) => `Nicht genügend Karmaenergie bei ${name}.`,
    socketUnavailable: "Die socketbasierte Actor-Aktualisierung ist nicht verfügbar."
  },
  en: {
    itemName: "Fire Blessing",
    noTokens: (name) => `The actor ${name} has no active tokens on the scene.`,
    noKap: (name) => `Your controlled token (${name}) does not have karma energy.`,
    notEnoughKap: (name) => `Not enough karma energy for ${name}.`,
    socketUnavailable: "The socket-based actor update is not available."
  }
};


const t = dict[lang];

// Einstellungen zum Licht
const lightID = "candle";
const durationSeconds = 300;

// --- Aktive Tokens prüfen ---
const tokens = actor.getActiveTokens();
if (!tokens || tokens.length === 0) {
  ui.notifications.warn(t.noTokens(actor.name));
  return;
}

// --- 1 KaP (Karmaenergie) prüfen und abziehen ---
const kapObject = foundry.utils.getProperty(actor, "system.status.karmaenergy");
if (!kapObject?.max) {
  ui.notifications.warn(t.noKap(actor.name));
  return;
}
if (kapObject.value < 1) {
  ui.notifications.warn(t.notEnoughKap(actor.name));
  return;
}

const updateData = { "system.status.karmaenergy.value": kapObject.value - 1 };

const tokenIds = tokens.map((token) => token.document?.id ?? token.id).filter(Boolean);
if (!this.socketedActorTransformation || !tokenIds.length) {
  ui.notifications.warn(t.socketUnavailable);
  return;
}
await this.socketedActorTransformation(tokenIds, updateData);

// Licht anschalten
const applied = await game.dsa5.apps.LightDialog.applyVisionOrLight(true, lightID, tokens, t.itemName);
const effects = Array.isArray(applied) ? applied : applied ? [applied] : [];
const lightEffects = effects.filter((effect) => effect?.documentName === "ActiveEffect");
const effectToUpdate = lightEffects[0] ?? actor.effects.find((effect) => effect.name === t.itemName);
if (effectToUpdate) {
  await effectToUpdate.update({
    duration: { value: durationSeconds, units: "seconds" },
    start: { time: game.time.worldTime }
  });
}
