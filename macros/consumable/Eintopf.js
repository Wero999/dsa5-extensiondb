const lang = game.i18n.lang === 'de' ? 'de' : 'en';

const dict = {
  de: {
    dialogContent: "Wähle die Wirkung:",
    btnQs1: "Kälte verzögert",
    btnQs4: "Unterkühlung -1",
    btnQs6: "Kälteresistenz",
    appliedQs1: (name) => `<p><b>${name}:</b> Kältestufen bis Stufe 2 wirken sich für 1 Tag nur halb so schnell aus.</p>`,
    appliedQs4: (name) => `<p><b>${name}:</b> 1 Stufe Unterkühlung abgebaut.</p>`,
    appliedQs6: (name) => `<p><b>${name}:</b> Vorteil <i>Kälteresistenz</i> für 1 Tag erlangt.</p>`,
    cancel: "Abgebrochen"
  },
  en: {
    dialogContent: "Choose effect:",
    btnQs1: "Cold delayed",
    btnQs4: "Cold -1",
    btnQs6: "Cold Resistance",
    appliedQs1: (name) => `<p><b>${name}:</b> Cold levels up to 2 are delayed for 1 day.</p>`,
    appliedQs4: (name) => `<p><b>${name}:</b> 1 level of cold reduced.</p>`,
    appliedQs6: (name) => `<p><b>${name}:</b> Gains the advantage <i>Cold Resistance</i> for 1 day.</p>`,
    cancel: "Cancelled"
  }
}[lang];

const currentQs = typeof qs !== 'undefined' ? qs : (source.system?.qs || 1);
const isCriticalCook = source?.flags?.dsa5?.CriticalCook;

const applyQs1 = async () => dict.appliedQs1(actor.name);

const applyQs4 = async () => {
    if (actor.hasCondition("cold")) {
        await actor.removeCondition("cold", 1, false);
    }
    return dict.appliedQs4(actor.name);
};

const applyQs6 = async () => {
    const effectData = {
        name: `${source.name} (Kälteresistenz)`,
        icon: "icons/svg/aura.svg",
        duration: { seconds: 86400 },
        system: { 
            changes: [{ key: "system.temperature.coldProtection", value: "1", mode: 2 }], 
            visibility: { hideOnToken: false } 
        }
    };
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    return dict.appliedQs6(actor.name);
};

if (isCriticalCook) {
    const msg1 = await applyQs1();
    const msg4 = await applyQs4();
    const msg6 = await applyQs6();
    return { msg: msg1 + msg4 + msg6 };
}

if (currentQs <= 3) {
    return { msg: await applyQs1() };
}

const buttons = [
    { action: "qs1", label: dict.btnQs1, callback: async () => await applyQs1() }
];

if (currentQs >= 4) {
    buttons.push({ action: "qs4", label: dict.btnQs4, callback: async () => await applyQs4() });
}

if (currentQs >= 6) {
    buttons.push({ action: "qs6", label: dict.btnQs6, callback: async () => await applyQs6() });
}

try {
    const resultMsg = await foundry.applications.api.DialogV2.wait({
        window: { title: source.name },
        classes: ["dsa5"],
        content: `<p style="text-align: center; margin-bottom: 10px;"><b>${dict.dialogContent}</b></p>`,
        buttons: buttons
    });
    return { msg: resultMsg };
} catch (err) {
    return { msg: `<p><i>${dict.cancel}</i></p>` };
}
