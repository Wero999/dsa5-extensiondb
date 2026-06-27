// Schema type: onUseEffect
// Parameters injected by the system:
//   args   {OnUseEffectExecutionArgs} - Execution metadata for this activation.
//   item   {Itemdsa5} - The item that was used.
//   actor  {Actordsa5} - The actor who used the item.
//   qs     {number} - Quality step of the triggering roll (1-6).
//   this   {OnUseEffect} - Helper instance (socketedConditionAdd, effectDummy, createChatMessage, ...).

// This is a system macro used for automation. It is disfunctional without the proper context.

// Issues:
// - Reworked the consumable into the current temporary thrown-weapon pattern and moved the hit logic into system.macroArgs.macro.
// - The system already handles Burning damage at combat round start; this macro adds the QS ignition gate, Hylailer-specific Body Control penalty, duration, and 5-KR Burning escalation without runtime hooks.

const lang = game.i18n.lang == "de" ? "de" : "en";
const dict = {
  de: {
    noTarget: "Kein Ziel ausgewählt! Bitte ein Token anvisieren.",
    name: "Hylailer Feuer",
    ctxMissing: "Kontext fehlt: Actor nicht gesetzt.",
    qsInvalid: "Qualitätsstufe (QS) fehlt oder ist ungültig (1-6).",
    noToken: "Kein aktives Token des Auslösers gefunden.",
    noItemClass: "Die DSA5-Itemklasse ist nicht verfügbar.",
    burning: game.i18n.localize("CONDITION.burning"),
    transferBlocked: (roll, gate) => `Das Hylailer Feuer zündet nicht (${roll} auf 1W6, Zündung bei 1-${gate}).`,
    transferSuccess: (roll, gate, rounds) => `Das Hylailer Feuer zündet (${roll} auf 1W6, Zündung bei 1-${gate}) und brennt ${rounds} KR.`,
    tickMsg: "Hylailer Feuer breitet sich aus (Brennend +1).",
    tickStopped: "Das Hylailer Feuer endet.",
    extinguishAction: "Hylailer Feuer löschen",
    noBodyControl: "Körperbeherrschung nicht gefunden.",
    extinguishSuccess: "Das Hylailer Feuer wurde gelöscht.",
    extinguishFailure: "Das Hylailer Feuer brennt weiter.",
    description: (rounds) => `Brennend auf kleiner Fläche für ${rounds} KR. Das Löschen ist extrem schwer: Körperbeherrschung -5. Alle 5 KR wächst die betroffene Fläche um eine Stufe. Brennend verursacht den üblichen Feuer-/Säureschaden; Strukturen erleiden entsprechend 1W3 Strukturschaden pro KR.`,
    attackNote: "Dem Granatapfel kann nur ausgewichen oder mit Schild-PA begegnet werden. Gegen Strukturen richtet das Feuer 1W3 Strukturschaden pro KR an.",
  },
  en: {
    noTarget: "No target selected! Please aim at a token.",
    name: "Hylailic Fire",
    ctxMissing: "Context missing: Actor not set.",
    qsInvalid: "Quality level (QL) missing or invalid (1-6).",
    noToken: "No active token of the source actor found.",
    noItemClass: "The DSA5 item class is not available.",
    burning: game.i18n.localize("CONDITION.burning"),
    transferBlocked: (roll, gate) => `The Hylailic Fire does not ignite (${roll} on 1d6, ignition on 1-${gate}).`,
    transferSuccess: (roll, gate, rounds) => `The Hylailic Fire ignites (${roll} on 1d6, ignition on 1-${gate}) and burns for ${rounds} combat rounds.`,
    tickMsg: "Hylailic Fire spreads (Burning +1).",
    tickStopped: "The Hylailic Fire ends.",
    extinguishAction: "Extinguish Hylailic Fire",
    noBodyControl: "Body Control not found.",
    extinguishSuccess: "The Hylailic Fire has been extinguished.",
    extinguishFailure: "The Hylailic Fire keeps burning.",
    description: (rounds) => `Burning on a small area for ${rounds} combat rounds. Extinguishing it is extremely hard: Body Control -5. Every 5 combat rounds, the affected area grows by one level. Burning deals the usual fire/acid damage; structures suffer 1d3 structure damage per combat round accordingly.`,
    attackNote: "The grenade can only be dodged or parried with a shield. Against structures, the fire deals 1d3 structure damage per combat round.",
  },
}[lang];

const localizedId = (key, fallback) => {
  const localized = game.i18n.localize(key);
  return localized == key ? fallback : localized;
};
const combatSkill = localizedId("LocalizedIDs.Throwing Weapons", lang == "de" ? "Wurfwaffen" : "Throwing Weapons");
const bodyControl = localizedId("LocalizedIDs.bodyControl", lang == "de" ? "Körperbeherrschung" : "Body Control");
const macroHelper = this;

const qualityStep = Number(qs) || 0;
if (!actor) {
  ui.notifications.error(dict.ctxMissing);
  return;
}

if (args?.hylailerFireTick) {
  await processHylailerFireTick(args.hylailerFireTick);
  return;
}

if (qualityStep < 1 || qualityStep > 6) {
  ui.notifications.error(dict.qsInvalid);
  return;
}

const target = Array.from(game.user.targets)[0];
if (!target) {
  ui.notifications.error(dict.noTarget);
  return;
}

const Itemdsa5 = game?.dsa5?.entities?.Itemdsa5;
if (!Itemdsa5) {
  ui.notifications.error(dict.noItemClass);
  return;
}

const sourceToken = actor.getActiveTokens?.()[0];
if (!sourceToken?.id) {
  ui.notifications.error(dict.noToken);
  return;
}

const ignitionGates = [2, 3, 3, 4, 4, 5];
const durationFormulas = ["1d6", "1d6+2", "2d6+4", "2d6+6", "3d6+8", "3d6+10"];
const gate = ignitionGates[qualityStep - 1];
const durationFormula = durationFormulas[qualityStep - 1];
const reach = "2/4/8";

function isHylailerEffect(entry, marker) {
  return entry?.parent?.id === actor.id && foundry.utils.getProperty(entry, `flags.dsa5.${marker}`) === true;
}

function isBurningEffect(entry) {
  if (entry?.parent?.id !== actor.id) return false;
  return entry?.statuses?.has?.("burning") || entry?.flags?.core?.statusId === "burning" || entry?.flags?.dsa5?.conditionId === "burning";
}

async function deleteActorEffects(predicate) {
  const ids = actor.effects.filter(predicate).map((entry) => entry.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { noHook: true });
}

function createTimerOnRemoveMacro() {
  return `const state = foundry.utils.deepClone(effect.flags?.dsa5?.hylailerFire ?? {});
const sourceItem = state.sourceItemUuid ? await fromUuid(state.sourceItemUuid) : null;
await game.dsa5.apps.DSAActiveEffectConfig.callMacro("dsa5-core.coremacros", "hylailerfeuer", actor, sourceItem, Number(state.qs) || 0, { hylailerFireTick: state });`;
}

function createTimerEffect(state) {
  const timerEffect = macroHelper.effectDummy(`${state.itemName} (${state.remainingRounds} KR)`, [], { value: 5, units: "seconds" });
  foundry.utils.mergeObject(timerEffect, {
    img: state.itemImg ?? item?.img ?? "icons/svg/fire.svg",
    description: state.description,
    flags: {
      dsa5: {
        hylailerFireTimer: true,
        hylailerFire: state,
      },
    },
    system: {
      visibility: {
        hideOnToken: true,
      },
      macroArgs: {
        onRemove: createTimerOnRemoveMacro(),
      },
    },
  });
  return timerEffect;
}

function createBurningEffect(state, remainingRounds) {
  const statusEffect = duplicate(CONFIG.statusEffects.find((entry) => entry.id === "burning") ?? { id: "burning", name: "CONDITION.burning", img: "icons/svg/fire.svg" });
  foundry.utils.mergeObject(statusEffect, {
    name: state.burningName,
    description: state.description,
    duration: { value: Math.max(5, (Number(remainingRounds) || 1) * 5), units: "seconds" },
    flags: { dsa5: { hylailerFireBurning: true } },
  });
  return statusEffect;
}

function createExtinguishActionMacro() {
  const escaped = {
    skillName: JSON.stringify(bodyControl),
    noBodyControl: JSON.stringify(dict.noBodyControl),
    actionName: JSON.stringify(dict.extinguishAction),
    success: JSON.stringify(dict.extinguishSuccess),
    failure: JSON.stringify(dict.extinguishFailure),
  };

  return `const skillName = ${escaped.skillName};
const skill = actor.items.find((entry) => entry.type == "skill" && entry.name == skillName);
if (!skill) {
  ui.notifications.warn(${escaped.noBodyControl});
  return;
}
const setupData = await actor.setupSkill(skill, {
  subtitle: " (" + ${escaped.actionName} + ")",
}, actor.sheet?.getTokenId?.() ?? actor.token?.id);
setupData.testData.opposable = false;
const result = await actor.basicTest(setupData);
if ((result?.result?.successLevel || 0) < 1) {
  await ChatMessage.create(game.dsa5.apps.DSA5_Utility.chatDataSetup(${escaped.failure}));
  return;
}
const hylailerEffect = (entry, marker) => entry?.parent?.id === actor.id && foundry.utils.getProperty(entry, "flags.dsa5." + marker) === true;
const ids = actor.effects
  .filter((entry) => hylailerEffect(entry, "hylailerFireHelper") || hylailerEffect(entry, "hylailerFireTimer"))
  .map((entry) => entry.id);
if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { noHook: true });
await actor.removeCondition("burning", 99, false);
await ChatMessage.create(game.dsa5.apps.DSA5_Utility.chatDataSetup(${escaped.success}));`;
}

async function processHylailerFireTick(state) {
  const remainingRounds = Math.max(0, Number(state?.remainingRounds ?? 0) - 1);
  const elapsedRounds = Math.max(0, Number(state?.elapsedRounds ?? 0) + 1);
  const activeBurning = actor.effects.some(isBurningEffect);
  if (!activeBurning || remainingRounds <= 0) {
    await deleteActorEffects((entry) => isHylailerEffect(entry, "hylailerFireHelper") || isHylailerEffect(entry, "hylailerFireTimer"));
    if (activeBurning && remainingRounds <= 0) await ChatMessage.create(game.dsa5.apps.DSA5_Utility.chatDataSetup(dict.tickStopped));
    return;
  }

  if (elapsedRounds % 5 === 0) {
    await actor.addCondition(createBurningEffect(state, remainingRounds));
    await ChatMessage.create(game.dsa5.apps.DSA5_Utility.chatDataSetup(dict.tickMsg));
  }

  await actor.createEmbeddedDocuments("ActiveEffect", [createTimerEffect({ ...state, remainingRounds, elapsedRounds })]);
}

function createHitMacro() {
  const escaped = {
    name: JSON.stringify(item?.name ?? dict.name),
    ctxMissing: JSON.stringify(dict.ctxMissing),
    bodyControl: JSON.stringify(bodyControl),
    burningName: JSON.stringify(`${item?.name ?? dict.name} (${dict.burning})`),
    extinguishAction: JSON.stringify(dict.extinguishAction),
    extinguishMacro: JSON.stringify(createExtinguishActionMacro()),
    tickMsg: JSON.stringify(dict.tickMsg),
    tickStopped: JSON.stringify(dict.tickStopped),
    blocked: JSON.stringify(dict.transferBlocked("__GATE_ROLL__", gate)),
    successPrefix: JSON.stringify(dict.transferSuccess("__GATE_ROLL__", gate, "__ROUNDS__")),
    description: JSON.stringify(dict.description("__ROUNDS__")),
  };

  return `// This is a system macro used for automation. It is disfunctional without the proper context.
if (!actor) {
  ui.notifications.error(${escaped.ctxMissing});
  return;
}

const triggerQS = ${qualityStep};
const gate = ${gate};
const durationFormula = ${JSON.stringify(durationFormula)};
const gateRoll = await new Roll("1d6").evaluate();
if (gateRoll.total > gate) {
  await ChatMessage.create(game.dsa5.apps.DSA5_Utility.chatDataSetup(${escaped.blocked}.replace("__GATE_ROLL__", gateRoll.total)));
  return;
}

const durationRoll = await new Roll(durationFormula).evaluate();
const rounds = Number(durationRoll.total) || 0;
await ChatMessage.create(game.dsa5.apps.DSA5_Utility.chatDataSetup(${escaped.successPrefix}.replace("__GATE_ROLL__", gateRoll.total).replace("__ROUNDS__", rounds)));

const description = ${escaped.description}.replace("__ROUNDS__", rounds);
const durationSeconds = Math.max(5, rounds * 5);
const helperEffect = this.effectDummy(${escaped.name}, [
  { key: "system.skillModifiers.step", type: "custom", value: ${escaped.bodyControl} + " -5" },
], { value: durationSeconds, units: "seconds" });
foundry.utils.mergeObject(helperEffect, {
  img: "icons/svg/fire.svg",
  description,
  flags: {
    dsa5: {
      hylailerFireHelper: true,
    },
  },
  system: {
    visibility: {
      hideOnToken: false,
      hidePlayers: false,
    },
    onUseActions: {
      hylailerFireExtinguish: {
        name: ${escaped.extinguishAction},
        img: "icons/svg/fire.svg",
        macro: ${escaped.extinguishMacro},
      },
    },
  },
});
await this.socketedConditionAddActor([actor], helperEffect);

const createBurningEffect = (remainingRounds) => {
  const statusEffect = duplicate(CONFIG.statusEffects.find((entry) => entry.id === "burning") ?? { id: "burning", name: "CONDITION.burning", img: "icons/svg/fire.svg" });
  foundry.utils.mergeObject(statusEffect, {
    name: ${escaped.burningName},
    description,
    duration: { value: Math.max(5, (Number(remainingRounds) || 1) * 5), units: "seconds" },
    flags: { dsa5: { hylailerFireBurning: true } },
  });
  return statusEffect;
};
const addBurningCondition = async (remainingRounds) => {
  await this.socketedConditionAddActor([actor], createBurningEffect(remainingRounds));
};
await addBurningCondition(rounds);
if (rounds > 1) {
  const timerState = {
    qs: triggerQS,
    itemName: ${escaped.name},
    itemImg: ${JSON.stringify(item?.img ?? "icons/svg/fire.svg")},
    sourceItemUuid: ${JSON.stringify(item?.uuid ?? null)},
    burningName: ${escaped.burningName},
    description,
    totalRounds: rounds,
    remainingRounds: rounds,
    elapsedRounds: 0,
  };
  const timerEffect = this.effectDummy(timerState.itemName + " (" + timerState.remainingRounds + " KR)", [], { value: 5, units: "seconds" });
  foundry.utils.mergeObject(timerEffect, {
    img: timerState.itemImg,
    description,
    flags: {
      dsa5: {
        hylailerFireTimer: true,
        hylailerFire: timerState,
      },
    },
    system: {
      visibility: {
        hideOnToken: true,
      },
      macroArgs: {
        onRemove: ${JSON.stringify(createTimerOnRemoveMacro())},
      },
    },
  });
  await this.socketedConditionAddActor([actor], timerEffect);
}`;
}

function createAttackWeapon() {
  return new Itemdsa5({
    name: item?.name ?? dict.name,
    type: "rangeweapon",
    img: item?.img ?? "systems/dsa5/icons/categories/Rangeweapon.webp",
    system: {
      damage: { value: "0" },
      reloadTime: { value: 0, progress: 0 },
      reach: { value: reach },
      ammunitiongroup: { value: "-" },
      combatskill: { value: combatSkill },
      worn: { value: false },
      structure: { max: 0, value: 0 },
      quantity: { value: 1 },
      price: { value: 0 },
      weight: { value: 0 },
      effect: { value: dict.attackNote, attributes: "" },
    },
    effects: [
      {
        name: item?.name ?? dict.name,
        img: item?.img ?? "icons/svg/fire.svg",
        system: {
          specStep: qualityStep,
          advancedFunction: 2,
          macroArgs: {
            macro: createHitMacro(),
          },
        },
      },
    ],
  });
}

const weapon = createAttackWeapon();
const sub = Itemdsa5.getSubClass(weapon.type);
const setupData = await sub.setupDialog(null, { mode: "attack", bypass: false, cheat: false }, weapon, actor, sourceToken.id);
setupData.testData.targets = [target.id];
await actor.basicTest(setupData);
