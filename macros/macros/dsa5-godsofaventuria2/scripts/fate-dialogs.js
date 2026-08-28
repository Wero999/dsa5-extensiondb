import { DSA5GodsMenuConfig } from './config.js'; 

const { renderTemplate } = foundry.applications.handlebars;

// Dialog zum Tauschen der Schip-Kosten (Flexibel-Effekt - bei den spezialwürfeln)
export async function promptSchipSwap(actor, selectedSpecialKey, isGod) {
    let optionsData = [{ value: `special_${selectedSpecialKey}`, label: game.i18n.format("FateTab.SwapSchipKeep", {name: selectedSpecialKey}) }];
    
    const personal = actor.system.status.fatePoints.value || 0;
    if (personal > 0) optionsData.push({ value: 'personal', label: game.i18n.format("FateTab.SwapSchipPersonal", {amount: personal}) });

    const group = Number((game.settings.get('dsa5', 'groupschips') || "0/0").split('/')[0]);
    if (group > 0) optionsData.push({ value: 'group', label: game.i18n.format("FateTab.SwapSchipGroup", {amount: group}) });

    const specialObj = foundry.utils.getProperty(actor, "flags.dsa5.specialPoints");
    if (specialObj) {
        for (let [k, sData] of Object.entries(specialObj)) {
            if (k !== selectedSpecialKey && (sData?.current || 0) > 0) {
                let name = game.i18n.localize(DSA5GodsMenuConfig.godListNames.includes(k) ? `God.${k}.Name` : `Demon.${k}.Name`);
                optionsData.push({ value: `special_${k}`, label: game.i18n.format("FateTab.SwapSchipSpecial", {name: name, amount: sData.current}) });
            }
        }
    }

    const symbol = game.i18n.localize(isGod ? "GodSymbol" : "DemonSymbol");
    const content = await renderTemplate('modules/dsa5-godsofaventuria2/templates/swap-schip-dialog.hbs', {
        promptText: game.i18n.format("FateTab.SwapSchipPrompt", {symbol: symbol}),
        options: optionsData
    });

    const result = await foundry.applications.api.DialogV2.wait({
        window: { 
            title: game.i18n.localize("FateTab.SwapSchipTitle"),
            resizable: true
        },
        classes: ["dsa5"],
        position: { width: 420, height: 'auto' },
        content: content,
        rejectClose: false,
        buttons: [
            {
                action: 'ok',
                icon: 'fa-solid fa-check',
                label: game.i18n.localize("FateTab.SwapSchipConfirm"),
                default: true,
                callback: (event, button, dialogApp) => {
                    const val = dialogApp.element.querySelector('#swap-schip-select').value;
                    if (val === 'personal') return { pool: 'personal', key: null };
                    if (val === 'group') return { pool: 'group', key: null };
                    return { pool: 'special', key: val.replace('special_', '') };
                }
            },
            {
                action: 'cancel',
                icon: 'fa-solid fa-times',
                label: game.i18n.localize("Cancel"),
                callback: () => null
            }
        ]
    });

    return result ?? null;
}

// Dialog zum manuellen Abbau von Zustandsstufen (Erzdämonen)
export async function promptManualConditions(actor, availableConditions) {
    const conditionsData = availableConditions.map(c => ({
        id: c.id, 
        img: c.img, 
        name: c.name, 
        max: Math.min(3, c.value),
        hintText: game.i18n.format("FateTab.ConditionCurrentLevel", { val: c.value }),
        tooltipText: game.i18n.format("FateTab.ConditionTooltip", { val: c.value, name: c.name })
    }));

    const contentHtml = await renderTemplate('modules/dsa5-godsofaventuria2/templates/manual-conditions-dialog.hbs', {
        descText: game.i18n.format("FateTab.DemonConditionDesc", { name: actor.name }),
        conditions: conditionsData
    });

    class DemonCondDialog extends foundry.applications.api.DialogV2 {
        constructor(config) {
            super(config);
            this.totalSelected = 0;
        }
        
        _onRender(context, options) {
            super._onRender(context, options);
            const html = this.element;
            
            html.querySelectorAll('.decreaseEffect').forEach(btn => {
                btn.addEventListener('click', e => {
                    const id = e.currentTarget.dataset.id;
                    const span = html.querySelector(`.cond-val[data-id="${id}"]`);
                    let val = parseInt(span.innerText);
                    if (val > 0) {
                        span.innerText = val - 1;
                        this.totalSelected--;
                    }
                });
            });
            
            html.querySelectorAll('.increaseEffect').forEach(btn => {
                btn.addEventListener('click', e => {
                    const id = e.currentTarget.dataset.id;
                    const max = parseInt(e.currentTarget.dataset.max);
                    const span = html.querySelector(`.cond-val[data-id="${id}"]`);
                    let val = parseInt(span.innerText);
                    
                    if (val < max && this.totalSelected < 3) {
                        span.innerText = val + 1;
                        this.totalSelected++;
                    } else if (this.totalSelected >= 3) {
                        ui.notifications.warn(game.i18n.localize("FateTab.DemonConditionMaxWarn"));
                    }
                });
            });
        }
    }

    const result = await DemonCondDialog.wait({
        window: { title: game.i18n.localize("FateTab.DemonConditionTitle") },
        content: contentHtml,
        position: { width: 420 },
        rejectClose: false, 
        buttons: [
            {
                action: "ok",
                label: game.i18n.localize("FateTab.DemonConditionRemoveBtn"),
                icon: "fa-solid fa-check",
                callback: (event, button, dialogApp) => {
                    let reductions = {};
                    dialogApp.element.querySelectorAll('.cond-val').forEach(span => {
                        let val = parseInt(span.innerText);
                        if (val > 0) reductions[span.dataset.id] = val;
                    });
                    return reductions;
                }
            },
            {
                action: "cancel",
                label: game.i18n.localize("Cancel"),
                icon: "fa-solid fa-times",
                callback: () => null
            }
        ]
    });
    
    return result ?? null; 
}

// Dialog für den Aves-Münzwurf (SL-Willkür)
export async function promptAvesCheat() {
    const result = await foundry.applications.api.DialogV2.wait({
        window: { 
            title: game.i18n.localize("FateTab.AvesCheatTitle"),
            resizable: false
        },
        classes: ["dsa5"],
        content: `<p style="text-align: center; font-size: 1.05em; margin: 15px 0;">${game.i18n.localize("FateTab.AvesCheatPrompt")}</p>`,
        position: { width: 400, height: 'auto' },
        rejectClose: false,
        buttons: [
            {
                action: "success",
                label: game.i18n.localize("FateTab.AvesCheatSuccess"),
                icon: "fa-solid fa-check",
                callback: () => 1
            },
            {
                action: "failure",
                label: game.i18n.localize("FateTab.AvesCheatFailure"),
                icon: "fa-solid fa-times",
                callback: () => 2
            }
        ]
    });
    
    return result ?? null;
}

// Öffnet den Dialog zur SL-Willkür (Reroll von W20 oder W6)
export async function promptRerollCheat(diceData) {
    const contentHtml = await renderTemplate('modules/dsa5-godsofaventuria2/templates/rerollCheat-dialog.hbs', {
        dice: diceData
    });

    class RerollCheatDialog extends foundry.applications.api.DialogV2 {
        _onRender(context, options) {
            super._onRender(context, options);
            const html = this.element;
            const footer = html.querySelector('.window-footer') || html.querySelector('footer');
            if (footer) {
                footer.style.justifyContent = 'center';
                footer.style.display = 'flex';
                footer.querySelectorAll('button').forEach(btn => {
                    btn.classList.add('dsadesignbutton');
                    btn.style.flex = '0 0 45%'; 
                });
            }
            
            html.querySelectorAll('input.cheat-value').forEach(input => {
                input.addEventListener('input', (e) => {
                    let val = parseInt(e.target.value);
                    let max = parseInt(e.target.max) || 20;
                    if (val > max) e.target.value = max;
                    if (val < 1) e.target.value = 1;
                });
                input.addEventListener('blur', (e) => {
                    if (!e.target.value) e.target.value = 1;
                });
            });
        }
    }

    const result = await RerollCheatDialog.wait({
        window: { 
            title: game.i18n.localize("FateTab.Reroll"),
            resizable: true
        },
        classes: ["dsa5"],
        content: contentHtml,
        position: { width: 400, height: 'auto' },
        rejectClose: false,
        buttons: [
            {
                action: "ok",
                label: game.i18n.localize("ok"),
                icon: "fa-solid fa-check",
                callback: (event, button, dialogApp) => {
                    const html = dialogApp.element;
                    const results = [];
                    html.querySelectorAll('input.cheat-value').forEach(input => {
                        results.push(parseInt(input.value) || 1);
                    });
                    return results;
                }
            },
            {
                action: "cancel",
                label: game.i18n.localize("Cancel"),
                icon: "fa-solid fa-times",
                callback: () => null
            }
        ]
    });
    
    return result ?? null;
}

// Öffnet den Dialog zur SL-Willkür (2W6 Götter-/Dämonenwurf - haben bei 6 jeweils Spezialeffekte)
export async function promptSpecialRollCheat(title, icon1, tooltip1, icon2, tooltip2) {
    const defaultD1 = Math.floor(Math.random() * 6) + 1;
    const defaultD2 = Math.floor(Math.random() * 6) + 1;

    const contentHtml = await renderTemplate('modules/dsa5-godsofaventuria2/templates/specialRollCheat-dialog.hbs', {
        title: title,
        icon1: icon1,
        tooltip1: tooltip1,
        icon2: icon2,
        tooltip2: tooltip2
    });

    class SpecialCheatDialog extends foundry.applications.api.DialogV2 {
        _onRender(context, options) {
            super._onRender(context, options);
            const html = this.element;
            
            const footer = html.querySelector('.window-footer') || html.querySelector('footer');
            if (footer) {
                footer.style.justifyContent = 'center';
                footer.style.display = 'flex';
                footer.querySelectorAll('button').forEach(btn => {
                    btn.classList.add('dsadesignbutton');
                    btn.style.flex = '0 0 45%'; 
                });
            }
            
            const input1 = html.querySelector('#special-cheat-d1');
            const input2 = html.querySelector('#special-cheat-d2');
            if (input1) input1.value = defaultD1;
            if (input2) input2.value = defaultD2;
            
            html.querySelectorAll('input[type="number"]').forEach(input => {
                input.addEventListener('input', (e) => {
                    let val = parseInt(e.target.value);
                    if (val > 6) e.target.value = 6;
                    if (val < 1) e.target.value = 1;
                });
                
                input.addEventListener('blur', (e) => {
                    if (!e.target.value) e.target.value = 1; 
                });
            });
        }
    }

    const result = await SpecialCheatDialog.wait({
        window: { 
            title: game.i18n.localize("DIALOG.cheat"),
            resizable: true 
        },
        classes: ["dsa5"],
        content: contentHtml,
        position: { width: 500, height: 'auto' }, 
        rejectClose: false,
        buttons: [
            {
                action: "ok",
                label: game.i18n.localize("ok"),
                icon: "fa-solid fa-check",
                callback: (event, button, dialogApp) => {
                    const html = dialogApp.element;
                    const val1 = parseInt(html.querySelector('#special-cheat-d1').value) || defaultD1;
                    const val2 = parseInt(html.querySelector('#special-cheat-d2').value) || defaultD2;
                    return { 
                        d1: Math.max(1, Math.min(6, val1)), 
                        d2: Math.max(1, Math.min(6, val2)) 
                    };
                }
            },
            {
                action: "cancel",
                label: game.i18n.localize("Cancel"),
                icon: "fa-solid fa-times",
                callback: () => null
            }
        ]
    });
    
    return result ?? null;
}
