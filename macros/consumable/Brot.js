const { ApplicationV2 } = foundry.applications.api;
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
const isCriticalCook = source?.flags?.dsa5?.CriticalCook;

const applyBreadEffect = async (ignoreGear, ignoreArmor, shortName) => {
    const changes = [];
    
    if (ignoreGear) {
        changes.push({ key: "system.carryModifier", value: "4", mode: 2 });
    }
    if (ignoreArmor) {
        changes.push({ key: "@armor.[\\w\\W]+.system.encumbrance.value", value: "-1", mode: 2 });
    }

    const effectData = {
        name: `${source.name} (${shortName})`,
        icon: source.img,
        duration: { seconds: 86400 },
        system: { changes: changes, visibility: { hideOnToken: false } }
    };

    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    return dict.effectApplied(actor.name, shortName);
};

if (isCriticalCook) {
    const msg1 = await applyBreadEffect(true, false, dict.btnGear);
    const msg2 = await applyBreadEffect(true, true, `${dict.btnGear} & ${dict.btnArmor}`);
    return { msg: msg1 + msg2 };
}

if (currentQs <= 3) {
    return { msg: await applyBreadEffect(true, false, dict.btnGear) };
} else if (currentQs >= 6) {
    return { msg: await applyBreadEffect(true, true, `${dict.btnGear} & ${dict.btnArmor}`) };
}

return new Promise((resolve) => {
    class BrotApp extends ApplicationV2 {
        static DEFAULT_OPTIONS = {
            id: `brot-app-${foundry.utils.randomID()}`,
            classes: ["dsa5"],
            window: { title: source.name, resizable: false },
            position: { width: 380, height: "auto" },
            actions: {
                selectGear: async function() { await this._handleSelection('gear'); },
                selectArmor: async function() { await this._handleSelection('armor'); }
            }
        };

        constructor(resolveFn, options) {
            super(options);
            this.resolvePromise = resolveFn;
            this.isResolved = false;
        }

        async _handleSelection(choice) {
            this.isResolved = true;
            let msgText = "";
            if (choice === 'gear') msgText = await applyBreadEffect(true, false, dict.btnGear);
            if (choice === 'armor') msgText = await applyBreadEffect(false, true, dict.btnArmor);
            this.resolvePromise({ msg: msgText });
            this.close();
        }

        async _renderHTML() {
            return `
                <div class="paddingBox">
                    <p class="center" style="margin-bottom: 10px;"><b>${dict.dialogContent}</b></p>
                    <div class="row-section wrap gap5px">
                        <button type="button" class="col dsa5 button" data-action="selectGear">${dict.btnGear}</button>
                        <button type="button" class="col dsa5 button" data-action="selectArmor">${dict.btnArmor}</button>
                    </div>
                </div>
            `;
        }

        _replaceHTML(result, content) {
            content.innerHTML = result;
        }

        close(options) {
            if (!this.isResolved) {
                this.isResolved = true;
                this.resolvePromise({ msg: `<p><i>${dict.cancel}</i></p>` });
            }
            return super.close(options);
        }
    }

    new BrotApp(resolve).render(true);
});
