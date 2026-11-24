const MODULE_ID = 'dsa5-core';
const HOOK_KEY = `${MODULE_ID}.defense-schip`;
const EFFECT_FLAG = 'defenseSchip';
const DEFENSE_TAB_ID = 'defense';

const openApps = new WeakMap();
const appClassCache = new WeakMap();

const getDSA5 = () => {
    const { apps, concerns } = globalThis.dsa5;
    return {
        DSA5_Utility: apps.DSA5_Utility,
        FateRolls: concerns.Actor.FateRolls,
        UnifiedFateDSA5: apps.UnifiedFateDSA5,
    };
};

function getFateAppClass() {
    const { UnifiedFateDSA5 } = getDSA5();
    const registry = { AppClass: UnifiedFateDSA5 };
    Hooks.callAll('dsa5.getFateSpendApp', registry);
    return { AppClass: registry.AppClass, supportsSpecial: registry.AppClass !== UnifiedFateDSA5 };
}

function getGroupSchips() {
    const [current = 0, max = 0] = (game.settings.get('dsa5', 'groupschips') || '0/0').split('/').map(Number);
    return { current, max };
}

function hasUsableSchip(actor, supportsSpecial) {
    if ((actor.system?.status?.fatePoints?.value || 0) > 0) return true;

    if (getGroupSchips().current > 0) {
        const partyUuid = game.settings.get('dsa5', 'primaryParty');
        const group = (partyUuid ? fromUuidSync(partyUuid) : null) || game.actors.find((a) => a.type === 'group');
        if (Object.values(group?.system?.members ?? {}).some((m) => m.uuid === actor.uuid)) return true;
    }

    if (!supportsSpecial) return false;
    const special = foundry.utils.getProperty(actor, 'flags.dsa5.specialPoints');
    return !!special && Object.values(special).some((p) => (Number(p?.current) || 0) > 0);
}

const hasDefenseEffect = (actor) => actor.effects.some((e) => !e.disabled && e.getFlag(MODULE_ID, EFFECT_FLAG));

function createVirtualMessage(actor, testData) {
    return {
        id: null,
        content: '',
        speaker: ChatMessage.getSpeaker({ actor }),
        author: game.user,
        isOwner: true,
        flags: {
            dsa5: {},
            img: { src: actor.img },
            data: {
                messageMode: game.settings.get('core', 'messageMode'),
                preData: {
                    source: testData?.source ? foundry.utils.deepClone(testData.source) : { name: _loc('Defense'), type: 'dodge' },
                    mode: testData?.mode || 'parry',
                },
                postData: { successLevel: 0 },
            },
        },
        update: async () => {},
    };
}

function getDefenseFateAppClass(BaseClass) {
    if (appClassCache.has(BaseClass)) return appClassCache.get(BaseClass);

    class DefenseFateApp extends BaseClass {
        isStandardFateTab = true;
        #isHandlingConfirm = false;

        constructor(message, actor, { rule, dialog }) {
            super(message, actor);
            this.defenseRule = rule;
            this.rollDialog = dialog;
            this.tabGroups.sheet = DEFENSE_TAB_ID;
        }

        _canSelectPool(pool, key) {
            return pool !== 'master' && super._canSelectPool(pool, key);
        }

        _validateDieSelection() {
            return this.tabGroups.sheet === DEFENSE_TAB_ID || super._validateDieSelection();
        }

        async _buildFateContext(baseContext) {
            const context = await super._buildFateContext(baseContext);
            this.tabGroups.sheet = DEFENSE_TAB_ID;

            const pools = { personal: !!context.hasPersonal, group: !!context.hasGroup, special: !!context.hasSpecial };
            if (!pools[this.selectedPool]) {
                this.selectedPool = ['personal', 'group', 'special'].find((p) => pools[p]) ?? 'personal';
            }
            if (this.selectedPool === 'special' && !this.selectedSpecialKey) {
                const firstFull = context.specialSchips?.find((s) => s.cssClass.includes('fullSchip'));
                if (firstFull) {
                    this.selectedSpecialKey = firstFull.key;
                    context.specialSchips.forEach((s) => { s.isSelected = s.key === firstFull.key; });
                }
            }

            const poolCount = Object.values(pools).filter(Boolean).length;
            return Object.assign(context, {
                activeTab: DEFENSE_TAB_ID,
                tabs: { [DEFENSE_TAB_ID]: { id: DEFENSE_TAB_ID, label: 'CoreDefense.TabLabel', cssClass: 'active' } },
                hasMaster: false,
                masterSchips: [],
                isMasterPool: false,
                activeSpecialTab: null,
                activeSpecialTabs: [],
                xeledonTabs: {},
                regenBlessingTabs: [],
                showActorHeader: false,
                isPersonalPool: this.selectedPool === 'personal',
                isGroupPool: this.selectedPool === 'group',
                isSpecialPool: this.selectedPool === 'special',
                hasMultiplePools: poolCount > 1,
                hasFateAction: poolCount > 0,
            });
        }

        async _onRender(context, options) {
            await super._onRender(context, options);

            const section = document.createElement('section');
            section.className = 'tab active';
            section.dataset.tab = DEFENSE_TAB_ID;
            section.dataset.group = 'sheet';
            section.innerHTML = `
                <div class="dialog-content standard-form">
                    <h4 class="center">${_loc('CoreDefense.Title')}</h4>
                    <div class="description flexcol gap5px center dsa-info-box dsamt-4">
                        <p>${_loc('CoreDefense.Description')}</p>
                    </div>
                </div>`;

            const container = this.element?.querySelector('section.content');
            if (container) return container.replaceChildren(section);

            const tabs = this.element?.querySelectorAll('section.tab[data-group="sheet"]');
            if (tabs?.length) {
                tabs[0].replaceWith(section);
                for (let i = 1; i < tabs.length; i++) tabs[i].remove();
            } else {
                this.element?.querySelector('nav[data-group="sheet"], nav.sheet-tabs')?.insertAdjacentElement('afterend', section);
            }
        }

        async #applyDefenseBonus(bonus) {
            const modName = _loc('CoreDefense.ModifierName');
            const duration = game.combat?.started
                ? { rounds: 1, startRound: game.combat.round, startTurn: 0, combat: game.combat.id }
                : { rounds: 1 };

            await this.dsaActor.createEmbeddedDocuments('ActiveEffect', [{
                name: modName,
                img: 'systems/dsa5/icons/schip.webp',
                description: _loc('CoreDefense.EffectDesc', { bonus }),
                duration,
                changes: [
                    { key: 'system.meleeStats.parry', type: 'add', value: bonus },
                    { key: 'system.status.dodge.gearmodifier', type: 'add', value: bonus },
                ],
                flags: { [MODULE_ID]: { [EFFECT_FLAG]: true } },
            }]);

            if (!this.rollDialog?.rendered) return;
            this.defenseRule.upsertModifier(this.rollDialog, {
                name: modName,
                value: bonus,
                selected: true,
                source: _loc('CoreDefense.Source'),
            });
            this.defenseRule.getSituationalModifiersWidget(this.rollDialog)?.dispatchChange();
        }

        async _executeSheetAction({ cardOptions, avesDouble = false }) {
            if (this.tabGroups.sheet !== DEFENSE_TAB_ID) {
                return super._executeSheetAction?.({ cardOptions, avesDouble });
            }
            if (hasDefenseEffect(this.dsaActor)) {
                ui.notifications.warn(_loc('CoreDefense.AlreadyActive'));
                return null;
            }

            const bonus = avesDouble ? 8 : 4;
            await this.#applyDefenseBonus(bonus);
            cardOptions.skipNativePostFunction = true;
            return {
                chatActionLabel: _loc('CoreDefense.TabLabel'),
                chatRollDetails: `<p>${_loc('CoreDefense.EffectDesc', { bonus })}</p>`,
            };
        }

        async _onConfirm(event, target, isCheat = false) {
            if (this.selectedPool === 'special') return super._onConfirm(event, target, isCheat);

            event?.preventDefault?.();
            if (this.#isHandlingConfirm) return;
            this.#isHandlingConfirm = true;

            try {
                if (!this._validateSelectedPool()) return;
                if (hasDefenseEffect(this.dsaActor)) {
                    ui.notifications.warn(_loc('CoreDefense.AlreadyActive'));
                    return;
                }

                const { DSA5_Utility, FateRolls } = getDSA5();
                const pool = this.selectedPool;
                const isPersonal = pool === 'personal';
                const actor = this.dsaActor;
                const bonus = 4;

                const { current: grpCur, max: grpMax } = isPersonal ? {} : getGroupSchips();
                const max = isPersonal ? (actor.system.status.fatePoints.current || 0) : grpMax;
                const available = Math.max(0, (isPersonal ? (actor.system.status.fatePoints.value || 0) : grpCur) - 1);
                const dots = Array.from({ length: Math.max(0, max) }, (_, i) => `<span class="schip tiny ${i < available ? 'fullSchip' : 'emptySchip'}"></span>`).join('');

                await this.#applyDefenseBonus(bonus);
                await ChatMessage.create(DSA5_Utility.chatDataSetup(`
                    <div class="dsa5 chat-card"><div class="card-content">
                        <h5 class="center"><b>${_loc('CHATFATE.fatepointUsed')}</b></h5>
                        <p class="center">${_loc('CoreDefense.ChatUsed', { name: foundry.utils.escapeHTML(actor.name), bonus })}</p>
                        <div class="row-section center" data-tooltip="${_loc(isPersonal ? 'CHATFATE.PointsRemaining' : 'CHATFATE.GroupPointsRemaining')}">${dots}</div>
                    </div></div>`));

                const source = isPersonal ? FateRolls.SCHIP_SOURCES.PERSONAL : FateRolls.SCHIP_SOURCES.GROUP;
                await FateRolls.reduceSchips(actor, source, { tossCoin: false });
                Hooks.callAll('dsa5.fatePointSpent', { actor, pool, amount: 1 });
                await this.close();
            } finally {
                this.#isHandlingConfirm = false;
            }
        }
    }

    appClassCache.set(BaseClass, DefenseFateApp);
    return DefenseFateApp;
}

Hooks.once('setup', () => {
    const hookRegistry = game.dsa5.dsa5HookRegistry;
    if (hookRegistry?.has(HOOK_KEY)) return;
    hookRegistry?.add(HOOK_KEY);

    class DefenseSchipBurgerMenu extends game.dsa5.api.RollDialogBurgerMenuRule {
        constructor() {
            super({ abilityNameKey: 'CoreDefense.MenuLabel' });
        }

        matches({ testData, actor }) {
            if (!actor) return false;
            const isDefense = testData?.mode === 'parry' || testData?.mode === 'dodge' || testData?.source?.type === 'dodge';
            if (!isDefense) return false;
            return hasUsableSchip(actor, getFateAppClass().supportsSpecial);
        }

        getBurgerMenuItems({ dialog, actor, testData }) {
            return [{
                label: _loc('CoreDefense.MenuLabel'),
                icon: '<i class="schip tiny fullSchip" style="background-image: url(\'systems/dsa5/icons/schip.webp\'); display: inline-block; vertical-align: middle; margin-right: 8px; border: none; box-shadow: none;"></i>',
                onClick: () => {
                    if (hasDefenseEffect(actor)) return ui.notifications.warn(_loc('CoreDefense.AlreadyActive'));
                    const existing = openApps.get(dialog);
                    if (existing?.rendered) return existing.bringToFront();

                    const DefenseFateApp = getDefenseFateAppClass(getFateAppClass().AppClass);
                    const app = new DefenseFateApp(createVirtualMessage(actor, testData), actor, { rule: this, dialog });
                    openApps.set(dialog, app);
                    app.render(true);
                },
            }];
        }
    }

    const menu = new DefenseSchipBurgerMenu();
    Hooks.on('dsa5.getRollDialogContextOptions', (dialogState, menuItems) => {
        if (menu.matches(dialogState)) menuItems.push(...menu.getBurgerMenuItems(dialogState));
    });
});
