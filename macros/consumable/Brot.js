const lang = game.i18n.lang === 'de' ? 'de' : 'en';

const dict = {
  de: {
    dialogContent: "Möchtest du für 1 Tag 1 Stufe Belastung durch Gepäck oder durch Rüstung ignorieren?",
    btnGear: "Gepäck",
    btnArmor: "Rüstung",
    effectApplied: (name, desc) => `<p><b>${name}</b> ignoriert 1 Stufe Belastung (${desc}).</p>`,
    cancel: "Abgebrochen"
  },
  en: {
    dialogContent: "Do you want to ignore 1 level of gear encumbrance or 1 level of armor encumbrance for 1 day?",
    btnGear: "Gear",
    btnArmor: "Armor",
    effectApplied: (name, desc) => `<p><b>${name}</b> ignores 1 level of encumbrance (${desc}).</p>`,
    cancel: "Cancelled"
  }
}[lang];

const currentQs = typeof qs !== 'undefined' ? qs : (source.system?.qs || 1);

const applyBreadEffect = async (ignoreGear, ignoreArmor, shortName) => {
    const changes = [];
    
    if (ignoreGear) {
        changes.push({
            key: "system.carryModifier",
            value: "4",
            mode: 2
        });
    }
    
    if (ignoreArmor) {
        changes.push({
            key: "@armor.[\\w\\W]+.system.encumbrance.value",
            value: "-1",
            mode: 2 
        });
    }

    const effectData = {
        name: `${source.name} (${shortName})`,
        icon: source.img,
        duration: { seconds: 86400 },
        system: {
            changes: changes,
            visibility: { hideOnToken: false }
        }
    };

    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    return { msg: dict.effectApplied(actor.name, shortName) };
};

if (currentQs <= 3) {
    return await applyBreadEffect(true, false, dict.btnGear);
} else if (currentQs >= 6) {
    return await applyBreadEffect(true, true, `${dict.btnGear} & ${dict.btnArmor}`);
} else {
    return new Promise((resolve) => {
        new Dialog({
            title: source.name,
            content: `<p>${dict.dialogContent}</p>`,
            buttons: {
                gear: {
                    label: dict.btnGear,
                    callback: async () => resolve(await applyBreadEffect(true, false, dict.btnGear))
                },
                armor: {
                    label: dict.btnArmor,
                    callback: async () => resolve(await applyBreadEffect(false, true, dict.btnArmor))
                }
            },
            default: "gear",
            close: () => resolve({ msg: dict.cancel })
        }).render(true);
    });
}
