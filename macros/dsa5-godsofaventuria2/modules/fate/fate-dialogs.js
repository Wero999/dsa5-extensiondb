import { DSA5GodsMenuConfig } from './config.js';

const { renderTemplate } = foundry.applications.handlebars;
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

function cancelButton(cssClass = '') {
    return {
        action: 'cancel',
        icon: 'fa-solid fa-times',
        label: 'cancel',
        ...(cssClass ? { class: cssClass } : {}),
        callback: () => null,
    };
}

function bindClampedInputs(root, selector, defaultMax = 20) {
    root.addEventListener('input', (e) => {
        if (!e.target.matches(selector)) return;
        const val = parseInt(e.target.value, 10);
        const max = parseInt(e.target.max, 10) || defaultMax;
        if (val > max) e.target.value = max;
        else if (val < 1) e.target.value = 1;
    });
    root.addEventListener('focusout', (e) => {
        if (e.target.matches(selector) && !e.target.value) e.target.value = 1;
    });
}

// Dialog zum Tauschen der Schip-Kosten (Flexibel-Effekt bei den Spezialwürfeln)
export async function promptSchipSwap(actor, selectedSpecialKey, isGod) {
    const optionsData = [{ value: `special_${selectedSpecialKey}`, label: _loc('GodsMenu.FateTab.SwapSchipKeep', { name: selectedSpecialKey }) }];

    const personal = actor.system.status.fatePoints.value || 0;
    if (personal > 0) optionsData.push({ value: 'personal', label: _loc('GodsMenu.FateTab.SwapSchipPersonal', { amount: personal }) });

    const { current: group } = DSA5GodsMenuConfig.getSchipSetting('groupschips');
    if (group > 0) optionsData.push({ value: 'group', label: _loc('GodsMenu.FateTab.SwapSchipGroup', { amount: group }) });

    const specialObj = foundry.utils.getProperty(actor, 'flags.dsa5.specialPoints');
    if (specialObj) {
        for (const [k, sData] of Object.entries(specialObj)) {
            if (k !== selectedSpecialKey && (sData?.current || 0) > 0) {
                const name = DSA5GodsMenuConfig.schipName(k);
                optionsData.push({ value: `special_${k}`, label: _loc('GodsMenu.FateTab.SwapSchipSpecial', { name, amount: sData.current }) });
            }
        }
    }

    const symbol = _loc(isGod ? 'GodsMenu.GodSymbol' : 'GodsMenu.DemonSymbol');
    const content = await renderTemplate(DSA5GodsMenuConfig.templatePath('fate/swap-schip-dialog.hbs'), {
        promptText: _loc('GodsMenu.FateTab.SwapSchipPrompt', { symbol }),
        options: optionsData,
    });

    return DialogV2.wait({
        window: { title: 'GodsMenu.FateTab.SwapSchipTitle', resizable: true },
        classes: ['dsa5'],
        position: { width: 420, height: 'auto' },
        content,
        rejectClose: false,
        buttons: [
            {
                action: 'ok',
                icon: 'fa-solid fa-check',
                label: 'GodsMenu.FateTab.SwapSchipConfirm',
                default: true,
                callback: (_event, _button, dialogApp) => {
                    const val = dialogApp.element.querySelector('#swap-schip-select').value;
                    if (val === 'personal' || val === 'group') return { pool: val, key: null };
                    return { pool: 'special', key: val.slice('special_'.length) };
                },
            },
            cancelButton(),
        ],
    });
}

// Dialog zum manuellen Abbau von Zustandsstufen (Erzdämonen)
export async function promptManualConditions(actor, availableConditions, maxLevels = 3) {
    const content = await renderTemplate(DSA5GodsMenuConfig.templatePath('fate/manual-conditions-dialog.hbs'), {
        descText: _loc('GodsMenu.FateTab.DemonConditionDesc', { name: actor.name }),
        conditions: availableConditions.map((c) => ({
            id: c.id,
            img: c.img,
            name: c.name,
            max: Math.min(maxLevels, c.value),
            hintText: _loc('GodsMenu.FateTab.ConditionCurrentLevel', { val: c.value }),
            tooltipText: _loc('GodsMenu.FateTab.ConditionTooltip', { val: c.value, name: c.name }),
        })),
    });

    let totalSelected = 0;

    return DialogV2.wait({
        window: { title: 'GodsMenu.FateTab.DemonConditionTitle' },
        content,
        position: { width: 420 },
        rejectClose: false,
        render: (_event, dialog) => {
            totalSelected = 0;
            dialog.element.addEventListener('click', (e) => {
                const btn = e.target.closest('.decreaseEffect, .increaseEffect');
                if (!btn) return;

                const span = dialog.element.querySelector(`.cond-val[data-id="${CSS.escape(btn.dataset.id)}"]`);
                if (!span) return;
                const val = parseInt(span.innerText, 10) || 0;

                if (btn.classList.contains('decreaseEffect')) {
                    if (val > 0) {
                        span.innerText = val - 1;
                        totalSelected--;
                    }
                    return;
                }

                const max = parseInt(btn.dataset.max, 10) || 0;
                if (val < max && totalSelected < maxLevels) {
                    span.innerText = val + 1;
                    totalSelected++;
                } else if (totalSelected >= maxLevels) {
                    ui.notifications.warn(_loc('GodsMenu.FateTab.DemonConditionMaxWarn'));
                }
            });
        },
        buttons: [
            {
                action: 'ok',
                label: 'GodsMenu.FateTab.DemonConditionRemoveBtn',
                icon: 'fa-solid fa-check',
                callback: (_event, _button, dialogApp) => {
                    const reductions = {};
                    dialogApp.element.querySelectorAll('.cond-val').forEach((span) => {
                        const val = parseInt(span.innerText, 10);
                        if (val > 0) reductions[span.dataset.id] = val;
                    });
                    return reductions;
                },
            },
            cancelButton(),
        ],
    });
}

// Dialog für den Aves-Münzwurf (SL-Willkür)
export async function promptAvesCheat() {
    return DialogV2.wait({
        window: { title: 'GodsMenu.FateTab.AvesCheatTitle', resizable: false },
        classes: ['dsa5'],
        content: `<p class="gods-aves-cheat-prompt">${_loc('GodsMenu.FateTab.AvesCheatPrompt')}</p>`,
        position: { width: 400, height: 'auto' },
        rejectClose: false,
        buttons: [
            { action: 'success', label: 'GodsMenu.FateTab.AvesCheatSuccess', icon: 'fa-solid fa-check', callback: () => 1 },
            { action: 'failure', label: 'GodsMenu.FateTab.AvesCheatFailure', icon: 'fa-solid fa-times', callback: () => 2 },
        ],
    });
}

// Dialog für den zweiten W20-Wurf bei Aves-Glück
export async function promptAvesReroll(preData, postData) {
    const content = await renderTemplate('systems/dsa5/templates/dialog/fateReroll-dialog.hbs', {
        testData: preData,
        postData,
        singleDie: postData.characteristics?.length === 1,
    });

    return DialogV2.wait({
        window: { title: `${_loc('GodsMenu.FateTab.AvesHeadTitle')} ${_loc('CHATFATE.selectDice')}` },
        classes: ['dsa5'],
        content,
        rejectClose: false,
        render: (_event, dialog) => {
            dialog.element.addEventListener('click', (ev) => {
                ev.target.closest('[data-index]')?.classList.toggle('dieSelected');
            });
        },
        buttons: [
            {
                action: 'yes',
                icon: 'fa-solid fa-check',
                label: 'ok',
                callback: (_ev, _btn, app) => Array.from(app.element.querySelectorAll('.dieSelected'), (el) => Number(el.dataset.index)),
            },
            cancelButton(),
        ],
    });
}

// Dialog für den zweiten Schadenswurf bei Aves-Glück (max. 1 Würfel)
export async function promptAvesDamageReroll(damageDice) {
    const preselectSingle = damageDice.length === 1;
    const content = await renderTemplate(DSA5GodsMenuConfig.templatePath('fate/aves-damage-reroll-dialog.hbs'), {
        damageDice: damageDice.map((d) => ({ ...d, selected: preselectSingle })),
    });

    return DialogV2.wait({
        window: { title: `${_loc('GodsMenu.FateTab.AvesHeadTitle')} – ${_loc('GodsMenu.FateTab.RerollDamage')}` },
        classes: ['dsa5'],
        content,
        rejectClose: false,
        render: (_event, dialog) => {
            const container = dialog.element.querySelector('.roll-result');
            const okButton = dialog.element.querySelector('button[data-action="yes"]');
            const syncOkState = () => {
                if (okButton) okButton.disabled = !container?.querySelector('.dieButton.dieSelected');
            };
            const toggleDie = (btn) => {
                const wasSelected = btn.classList.contains('dieSelected');
                container.querySelectorAll('.dieButton.dieSelected').forEach((other) => {
                    other.classList.remove('dieSelected');
                    other.setAttribute('aria-pressed', 'false');
                });
                if (!wasSelected) {
                    btn.classList.add('dieSelected');
                    btn.setAttribute('aria-pressed', 'true');
                }
                syncOkState();
            };

            syncOkState();
            container?.addEventListener('click', (ev) => {
                const btn = ev.target.closest('.dieButton[data-index]');
                if (btn) toggleDie(btn);
            });
            container?.addEventListener('keydown', (ev) => {
                if (ev.key !== 'Enter' && ev.key !== ' ') return;
                const btn = ev.target.closest('.dieButton[data-index]');
                if (!btn) return;
                ev.preventDefault();
                toggleDie(btn);
            });
        },
        buttons: [
            {
                action: 'yes',
                icon: 'fa-solid fa-check',
                label: 'ok',
                default: true,
                callback: (_ev, _btn, app) => {
                    const selected = app.element.querySelector('.dieButton.dieSelected');
                    return selected ? Number(selected.dataset.index) : null;
                },
            },
            cancelButton(),
        ],
    });
}

// Dialog zur SL-Willkür (Reroll von W20 oder W6)
export async function promptRerollCheat(diceData) {
    const content = await renderTemplate(DSA5GodsMenuConfig.templatePath('fate/rerollCheat-dialog.hbs'), {
        dice: diceData,
    });

    return DialogV2.wait({
        window: { title: 'GodsMenu.FateTab.Reroll', resizable: true },
        classes: ['dsa5', 'gods-cheat-dialog'],
        content,
        position: { width: 400, height: 'auto' },
        rejectClose: false,
        render: (_event, dialog) => bindClampedInputs(dialog.element, 'input.cheat-value', 20),
        buttons: [
            {
                action: 'ok',
                label: 'ok',
                icon: 'fa-solid fa-check',
                class: 'dsadesignbutton',
                callback: (_event, _button, dialogApp) => Array.from(
                    dialogApp.element.querySelectorAll('input.cheat-value'),
                    (input) => Math.clamp(parseInt(input.value, 10) || 1, 1, parseInt(input.max, 10) || 20),
                ),
            },
            cancelButton('dsadesignbutton'),
        ],
    });
}

// Dialog zur SL-Willkür (2W6 Götter-/Dämonenwurf)
export async function promptSpecialRollCheat(title, icon1, tooltip1, icon2, tooltip2) {
    const defaultD1 = Math.floor(Math.random() * 6) + 1;
    const defaultD2 = Math.floor(Math.random() * 6) + 1;

    const content = await renderTemplate(DSA5GodsMenuConfig.templatePath('fate/specialRollCheat-dialog.hbs'), {
        title,
        icon1,
        tooltip1,
        icon2,
        tooltip2,
    });

    return DialogV2.wait({
        window: { title: 'DIALOG.cheat', resizable: true },
        classes: ['dsa5', 'gods-cheat-dialog'],
        content,
        position: { width: 500, height: 'auto' },
        rejectClose: false,
        render: (_event, dialog) => {
            dialog.element.querySelector('#special-cheat-d1').value = defaultD1;
            dialog.element.querySelector('#special-cheat-d2').value = defaultD2;
            bindClampedInputs(dialog.element, 'input[type="number"]', 6);
        },
        buttons: [
            {
                action: 'ok',
                label: 'ok',
                icon: 'fa-solid fa-check',
                class: 'dsadesignbutton',
                callback: (_event, _button, dialogApp) => ({
                    d1: Math.clamp(parseInt(dialogApp.element.querySelector('#special-cheat-d1').value, 10) || defaultD1, 1, 6),
                    d2: Math.clamp(parseInt(dialogApp.element.querySelector('#special-cheat-d2').value, 10) || defaultD2, 1, 6),
                }),
            },
            cancelButton('dsadesignbutton'),
        ],
    });
}

// Dialog zum Verteilen von Regenerationsboni auf Gefährten (Mada / Travia)
class RegenDistributionDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'gods-regen-distribution-app',
        classes: ['dsa5'],
        window: { resizable: true, contentClasses: ['standard-form'] },
        position: { width: 460, height: 'auto' },
        actions: {
            adjustAmount: this.#onAdjustAmount,
            confirm: this.#onConfirm,
        },
    };

    static PARTS = {
        main: { template: DSA5GodsMenuConfig.templatePath('fate/regen-distribution-dialog.hbs') },
    };

    constructor({ key, cfg, companions, resolve }, options = {}) {
        super(options);
        this.key = key;
        this.cfg = cfg;
        this.companions = companions;
        this._resolve = resolve;
        this._settled = false;
        this.allocations = Object.fromEntries(companions.map((a) => [a.id, 0]));
    }

    get title() {
        return DSA5GodsMenuConfig.schipLabel(this.key);
    }

    #totalAllocated(excludeId = null) {
        return Object.entries(this.allocations).reduce(
            (sum, [id, val]) => sum + (id === excludeId ? 0 : val),
            0,
        );
    }

    #clampAllocation(actorId, rawValue) {
        const maxAllowed = Math.min(this.cfg.maxPerTarget, this.cfg.maxTotal - this.#totalAllocated(actorId));
        this.allocations[actorId] = Math.clamp(Math.trunc(Number(rawValue) || 0), 0, maxAllowed);
    }

    async _prepareContext() {
        const totalAllocated = this.#totalAllocated();
        const remaining = this.cfg.maxTotal - totalAllocated;
        return {
            description: DSA5GodsMenuConfig.schipDescription(this.key),
            resource: this.cfg.resource,
            maxTotal: this.cfg.maxTotal,
            remaining,
            canConfirm: totalAllocated > 0,
            targets: this.companions.map((actor) => {
                const amount = this.allocations[actor.id] || 0;
                const maxAllowed = Math.min(this.cfg.maxPerTarget, remaining + amount);
                return {
                    id: actor.id,
                    name: actor.name,
                    img: actor.img,
                    amount,
                    maxAllowed,
                    atMin: amount <= 0,
                    atMax: amount >= maxAllowed,
                };
            }),
        };
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this.element.addEventListener('change', (ev) => {
            if (!ev.target.matches('.fg-cost-input')) return;
            this.#clampAllocation(ev.target.dataset.actorId, ev.target.value);
            this.render();
        });
        this.element.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Enter' || !ev.target.matches('.fg-cost-input')) return;
            ev.preventDefault();
            this.#clampAllocation(ev.target.dataset.actorId, ev.target.value);
            this.render();
        });
    }

    static #onAdjustAmount(_event, target) {
        const actorId = target.dataset.actorId;
        const delta = target.dataset.dir === 'left' ? -1 : 1;
        this.#clampAllocation(actorId, (this.allocations[actorId] || 0) + delta);
        this.render();
    }

    static async #onConfirm() {
        const result = this.companions
            .map((actor) => ({ actorId: actor.id, name: actor.name, amount: this.allocations[actor.id] || 0 }))
            .filter((entry) => entry.amount > 0);
        if (!result.length) return;

        this._settled = true;
        this._resolve(result);
        this.close();
    }

    async _onClose(options) {
        if (!this._settled) {
            this._settled = true;
            this._resolve(null);
        }
        return super._onClose(options);
    }
}

export function promptRegenDistribution({ key, cfg, companions }) {
    return new Promise((resolve) => {
        new RegenDistributionDialog({ key, cfg, companions, resolve }).render(true);
    });
}
