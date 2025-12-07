// This is a system macro used for automation.

const lang = game.i18n.lang == "de" ? "de" : "en";

const dict = {
  de: {
    noKap: (name) => { return `${name} verfügt nicht über Karmaenergie.` },
    notEnoughKap: (name) => { return `${name} hat nicht genügend Karmaenergie.` },
    onlySingleTarget: "Bitte genau ein Ziel anvisieren.",
    targetNoActor: "Das Ziel ist kein Akteur.",
    gluckMessage: (user, target) => { return `<p>${user} spricht einen Glückssegen für ${target}.</p>` }
  },
  en: {
    noKap: (name) => { return `${name} does not have karma energy.` },
    notEnoughKap: (name) => { return `${name} does not have enough karma energy.` },
    onlySingleTarget: "Please target exactly one target.",
    targetNoActor: "The target is not an actor.",
    gluckMessage: (user, target) => { return `<p>${user} casts a luck blessing on ${target}.</p>` }
  }
}[lang];

const userActor = actor;

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

// 3) Ziel prüfen
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

// KaP abziehen
await userActor.update({ "system.status.karmaenergy.value": kapObject.value - 1 });

// --- DEFINITION AKTIVER EFFEKT ---

const effectData = {
    name: "Glückssegen",          // Name angepasst
    icon: "icons/svg/aura.svg",   // Standard Icon
    duration: {
        seconds: 43200            // 12 Stunden
    },
    changes: [
        {
            key: "system.carryModifier",
            mode: 2,              // ADD
            value: "1, -1"
        }
    ]
};

// Effekt auf dem Ziel-Akteur erstellen
await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);

// Nachricht im Chat posten
ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor: userActor }),
  content: dict.gluckMessage(userActor.name, target.name)
});
